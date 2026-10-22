// ─────────────────────────────────────────────────────────────────────────────
// train-ai-catalog.js — "train" عين on the CURRENT GHAYA catalog.
//
// Generates one AIKnowledge chunk per PUBLIC project directly from the prod
// DB (source 'ghaya-catalog'), with VERIFIED facts only — prices come from
// the project's own startPrice/ACTIVE inventory, never invented:
//   - name (+Arabic), developer, city, delivery terms VERBATIM
//   - property types, starting price (as the public card shows)
//   - price ranges per unit type (AVAILABLE && isSample:false only)
//   - phases: names + delivery + launch spotlights
// Re-running refreshes every chunk, so every new import/price fix is one
// run away from the assistant knowing it ("الأسعار الجديدة والمشاريع الجديدة").
// Idempotent: upsert keyed by the canonical project-page URL.
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const PUBLIC = ['APPROVED', 'PUBLISHED']
const MAX_CONTENT = 1500
const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n))
const trimWords = (s, max) =>
  !s ? '' : s.length <= max ? s : s.slice(0, s.lastIndexOf(' ', max)) + '…'

async function main() {
  const projects = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: PUBLIC } },
    select: {
      id: true, name: true, nameArabic: true, slug: true,
      address: true,
      startPrice: true, endPrice: true, pricePerSqm: true,
      propertyTypes: true, deliveryTerms: true,
      city: { select: { name: true, nameArabic: true } },
      developer: { select: { companyName: true, companyNameArabic: true } },
    },
    orderBy: { name: 'asc' },
  })

  let added = 0, updated = 0, same = 0
  const today = new Date().toISOString().slice(0, 10)

  for (const pr of projects) {
    const types = (() => {
      try {
        const arr = typeof pr.propertyTypes === 'string' ? JSON.parse(pr.propertyTypes) : pr.propertyTypes || []
        return Array.isArray(arr) ? arr.filter((t) => t && t !== 'UNKNOWN').slice(0, 8) : []
      } catch { return [] }
    })()

    const agg = await p.unit.aggregate({
      where: { projectId: pr.id, status: 'AVAILABLE', isSample: false },
      _min: { price: true, area: true }, _max: { price: true, area: true },
      _count: { _all: true },
    })
    const stock = agg._count._all
    const phLines = []
    if (stock > 0 && agg._min.price != null) {
      const range = agg._max.price != null && agg._max.price > agg._min.price ? ` to EGP ${fmt(agg._max.price)}` : ''
      const areaRange = agg._min.area != null && agg._max.area != null && agg._max.area > agg._min.area
        ? `, areas ${fmt(agg._min.area)}–${fmt(agg._max.area)} sqm` : ''
      phLines.push(`Stock: ${stock} AVAILABLE units, EGP ${fmt(agg._min.price)}${range}${areaRange}.`)
      const perType = await p.unit.groupBy({
        by: ['unitType'],
        where: { projectId: pr.id, status: 'AVAILABLE', isSample: false, unitType: { not: 'UNKNOWN' } },
        _min: { price: true }, _count: { _all: true },
        orderBy: { _count: { unitType: 'desc' } },
        take: 5,
      })
      for (const t of perType) {
        if (t._min.price == null) continue
        phLines.push(`${(t.unitType || '').replace(/_/g, ' ').toLowerCase()}: from EGP ${fmt(t._min.price)} (${t._count._all} available).`)
      }
    }

    const phases = await p.projectPhase.findMany({
      where: { projectId: pr.id },
      select: { name: true, deliveryDate: true, startPrice: true, totalUnits: true, isLaunch: true, launchDate: true, status: true },
      orderBy: { name: 'asc' },
      take: 10,
    })
    const phaseLines = phases.map((ph) => {
      const bits = [ph.name]
      if (ph.startPrice && ph.startPrice > 0) bits.push(`from EGP ${fmt(ph.startPrice)}`)
      if (ph.totalUnits && ph.totalUnits > 0) bits.push(`${fmt(ph.totalUnits)} units`)
      if (ph.deliveryDate) bits.push(`delivery ${new Date(ph.deliveryDate).toISOString().slice(0, 10)}`)
      if (ph.isLaunch) bits.push(`🚀 launch spotlight${ph.launchDate ? ' ' + new Date(ph.launchDate).toISOString().slice(0, 10) : ''}`)
      return `- ${bits.join(' · ')}`
    })

    const content = trimWords([
      `GHAYA catalog facts for ${pr.name}${pr.nameArabic ? ` (${pr.nameArabic})` : ''} — verified ${today}.`,
      `Developer: ${pr.developer?.companyName || '—'}.`,
      pr.city?.name ? `City/area: ${pr.city.name}.` : null,
      pr.address ? `Location: ${trimWords(pr.address, 120)}.` : null,
      types.length ? `Property types: ${types.join(', ').replace(/_/g, ' ')}.` : null,
      pr.startPrice && pr.startPrice > 0 ? `Starting from EGP ${fmt(pr.startPrice)}${pr.endPrice && pr.endPrice > pr.startPrice ? ` up to EGP ${fmt(pr.endPrice)}` : ''}.` : null,
      pr.pricePerSqm ? `Price per sqm from EGP ${fmt(pr.pricePerSqm)}.` : null,
      pr.deliveryTerms ? `Delivery terms (verbatim): ${trimWords(pr.deliveryTerms, 320)}` : null,
      stock > 0 ? null : 'No AVAILABLE units in stock right now (check back or ask about upcoming phases).',
      ...phLines,
      phaseLines.length ? 'Phases:' : null,
      ...phaseLines,
    ].filter(Boolean).join('\n'), MAX_CONTENT)

    const url = `https://ghayaestate.com/projects/${pr.slug}`
    const title = `${pr.name} — GHAYA catalog`
    const existing = await p.aIKnowledge.findUnique({ where: { url }, select: { id: true, content: true } })
    if (existing) {
      if (existing.content !== content) {
        await p.aIKnowledge.update({ where: { id: existing.id }, data: { title, content, wordCount: content.split(/\s+/).length, updatedAt: new Date() } })
        updated++
      } else same++
    } else {
      await p.aIKnowledge.create({
        data: { source: 'ghaya-catalog', url, title, content, chunkIdx: 0, wordCount: content.split(/\s+/).length },
      })
      added++
    }
  }

  const stale = await p.aIKnowledge.deleteMany({
    where: { source: 'ghaya-catalog', url: { startsWith: 'https://ghayaestate.com/projects/' }, NOT: { url: { in: projects.map((x) => `https://ghayaestate.com/projects/${x.slug}`) } } },
  })
  const total = await p.aIKnowledge.count({ where: { isActive: true } })
  console.log(JSON.stringify({ publicProjects: projects.length, chunksAdded: added, chunksUpdated: updated, unchanged: same, staleArchivedRemoved: stale.count, totalActiveChunks: total }, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
