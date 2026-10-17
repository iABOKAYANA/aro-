import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { nawyImportBodySchema } from '@/lib/validations'
import {
  fetchNawyCatalog,
  previewCompounds,
  importCompounds,
} from '@/lib/nawy-import'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/import/nawy — catalog + import stats ──────────
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const [catalog, imported, total] = await Promise.all([
      fetchNawyCatalog(),
      db.project.count({ where: { keywords: { contains: 'nawy.com/compound/' } } }),
      db.project.count(),
    ])

    return NextResponse.json({
      catalog: { count: catalog.length, items: catalog },
      stats: { imported, total },
    })
  } catch (err) {
    console.error('Nawy import catalog error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch catalog' },
      { status: 502 }
    )
  }
}

// ─── POST /api/ceo/import/nawy — PREVIEW / IMPORT batches ───────
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const parsed = nawyImportBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 }
      )
    }
    const { mode, urls, publish, includeAr } = parsed.data

    // resolve requested URLs against the live sitemap catalog
    const catalog = await fetchNawyCatalog()
    const byUrl = new Map(catalog.map((c) => [c.enUrl, c]))
    const items = urls.map((u) => byUrl.get(u)).filter(Boolean) as typeof catalog
    if (items.length !== urls.length) {
      const unknown = urls.filter((u) => !byUrl.has(u))
      return NextResponse.json(
        { error: `URLs not in Nawy catalog: ${unknown.slice(0, 3).join(', ')}` },
        { status: 400 }
      )
    }

    if (mode === 'PREVIEW') {
      const entries = await previewCompounds(items, { includeAr })
      return NextResponse.json({ entries })
    }

    const result = await importCompounds(items, { publish, includeAr })
    await logAudit({
      userId: session!.user?.id,
      action: 'NAWY_IMPORT',
      entity: 'Project',
      changes: {
        mode: 'IMPORT',
        requested: items.length,
        imported: result.imported.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
        publish,
      },
    })

    // F12: city follows — bulk imports land visible when `publish` is set, so
    // fan out per imported project (the helper gates on visibility + dedupes).
    // Fail-soft: the import response never depends on notifications.
    if (publish && result.imported.length > 0) {
      try {
        const { notifyCityWatchersForProject } = await import('@/lib/price-alerts')
        const rows = await db.project.findMany({
          where: { slug: { in: result.imported.map((p) => p.slug) } },
          select: { id: true },
        })
        for (const row of rows) {
          await notifyCityWatchersForProject(row.id)
        }
      } catch (e) {
        console.error('[city-alerts] nawy import hook failed:', e)
      }
    }

    return NextResponse.json({
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    })
  } catch (err) {
    console.error('Nawy import error:', err)
    return NextResponse.json(
      { error: 'Import failed' },
      { status: 500 }
    )
  }
}
