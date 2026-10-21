import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { sendMailToUser, mailHtml } from '@/lib/mailer'
import { matchesFilters, type SavedFilters, type SearchCandidate } from '@/lib/saved-searches'
import { PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const LAST_RUN_KEY = 'savedSearchUnits.lastRun'
const MAX_UNITS_PER_USER_EMAIL = 10

function authorised(req: NextRequest): boolean {
  const envToken = process.env.CRON_TOKEN
  if (!envToken) return false
  const header = req.headers.get('x-cron-token')
  const param = req.nextUrl.searchParams.get('token')
  return header === envToken || param === envToken
}

/**
 * Sweep saved searches against NEW visible units since the last run:
 * in-app notification for every match + (consented) email digest.
 * Cron: curl -X POST -H "x-cron-token: …" /api/cron/saved-search-alerts
 */
export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const lastRow = await db.systemSetting.findUnique({ where: { key: LAST_RUN_KEY } })
  let since = new Date(0)
  if (lastRow) {
    try { since = new Date(JSON.parse(lastRow.value).iso) } catch { /* first run */ }
  }
  if (Number.isNaN(since.getTime())) since = new Date(0)

  const newUnits = await db.unit.findMany({
    where: {
      isSample: false,
      status: { not: 'SOLD_OUT' },
      price: { not: 0 },
      createdAt: { gt: since },
      project: PUBLIC_UNIT_PROJECT_WHERE,
    },
    select: {
      id: true, name: true, unitType: true, listingType: true,
      bedrooms: true, bathrooms: true, area: true, price: true,
      project: {
        select: {
          id: true, slug: true, name: true, nameArabic: true, tagline: true,
          governorate: { select: { name: true } },
          city: { select: { name: true } },
          district: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
  })

  const saved = await db.savedSearch.findMany({
    where: { notifyNew: true },
    select: { id: true, userId: true, name: true, filters: true },
    take: 2000,
  })

  const search: Record<string, SavedFilters | null> = {}
  for (const s of saved) {
    try { search[s.id] = JSON.parse(s.filters) as SavedFilters } catch { search[s.id] = null }
  }

  const byUser = new Map<string, Array<{ unitName: string; projectSlug: string | null; projectName: string }>>()
  let notified = 0

  for (const s of saved) {
    const filters = search[s.id]
    if (!filters) continue
    for (const u of newUnits) {
      // One in-app notification per (search, project); email digest is per user.
      const candidate: SearchCandidate = {
        name: `${u.project.name} — ${u.name}`,
        tagline: u.project.tagline ?? null,
        governorate: u.project.governorate?.name ?? null,
        city: u.project.city?.name ?? null,
        district: u.project.district?.name ?? null,
        propertyTypes: [u.unitType],
        listingTypes: [u.listingType],
        startPrice: u.price,
        minBedrooms: u.bedrooms ?? null,
        minBathrooms: u.bathrooms ?? null,
        minArea: u.area > 0 ? u.area : null,
      }
      if (!matchesFilters(filters, candidate)) continue

      await notifyUser(s.userId, {
        type: 'SAVED_SEARCH_MATCH',
        title: 'وحدة جديدة تطابق بحثك المحفوظ',
        message: `${u.project.name} — ${u.name} تطابق "${s.name}"`,
        link: u.project.slug ? `/projects/${u.project.slug}` : '/projects',
        metadata: { projectId: u.project.id, unitId: u.id, savedSearchId: s.id },
      })
      notified++

      const list = byUser.get(s.userId) ?? []
      if (list.length < MAX_UNITS_PER_USER_EMAIL &&
          !list.some((x) => x.unitName === `${u.project.name} — ${u.name}`)) {
        list.push({ unitName: `${u.project.name} — ${u.name}`, projectSlug: u.project.slug, projectName: u.project.name })
      }
      byUser.set(s.userId, list)
    }
  }

  let emailed = 0
  for (const [userId, units] of byUser) {
    if (!units.length) continue
    const rows = units
      .map((u) => `<li><a href="https://ghayaestate.com${u.projectSlug ? `/projects/${u.projectSlug}` : '/projects'}">${escapeHtml(u.projectName)}</a> — ${escapeHtml(u.unitName)}</li>`)
      .join('')
    const res = await sendMailToUser(userId, 'emailMarketing', {
      subject: `وحدات جديدة تطابق بحثك المحفوظ (${units.length})`,
      text: `وحدات جديدة على غاية تطابق بحثك المحفوظ:\n${units.map((u) => `- ${u.unitName}`).join('\n')}`,
      html: mailHtml({
        heading: 'وحدات جديدة على غاية',
        body: `<p>الوحدات دي اتضافت جديدًا وبتطابق بحثك المحفوظ:</p><ul>${rows}</ul>`,
        cta: { label: 'شوف المشاريع', href: 'https://ghayaestate.com/projects' },
      }),
    })
    if (res?.ok) emailed++
  }

  await db.systemSetting.upsert({
    where: { key: LAST_RUN_KEY },
    update: { value: JSON.stringify({ iso: now.toISOString() }) },
    create: { key: LAST_RUN_KEY, value: JSON.stringify({ iso: now.toISOString() }), category: 'CRON' },
  })

  return NextResponse.json({
    ok: true,
    at: now.toISOString(),
    since: since.toISOString(),
    newUnits: newUnits.length,
    searches: saved.length,
    notified,
    emailed,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

export async function GET(req: NextRequest) {
  return POST(req)
}
