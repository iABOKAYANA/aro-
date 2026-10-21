// Catalog health audit — every live project gets checked for:
//  1. Cover images: reachable? real image content-type? duplicated across
//     projects (logo-share problem)? tiny file?
//  2. Prices: startPrice vs cheapest AVAILABLE unit (mismatch), zero/null
//     start prices on live projects, absurd price-per-sqm.
//  3. Units: duplicate (projectId+unitNumber), AVAILABLE with no price,
//     UNKNOWN unit types, units pointing to phases of other projects.
// Read-only: writes deploy/catalog-health-report.json only.
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')

const p = new PrismaClient()
const LIVE = ['APPROVED', 'PUBLISHED', 'PENDING', 'DRAFT', 'HIDDEN']

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:3000'
async function probeUrl(url) {
  try {
    const abs = url.startsWith('http') ? url : BASE + url
    const res = await fetch(abs, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) })
    const ct = res.headers.get('content-type') || ''
    const len = parseInt(res.headers.get('content-length') || '0', 10)
    return { status: res.status, ct, len }
  } catch (e) {
    return { status: 0, err: (e && e.message) || String(e) }
  }
}

async function main() {
  const projects = await p.project.findMany({
    where: { approvalStatus: { in: LIVE } },
    select: { id: true, name: true, slug: true, approvalStatus: true, coverImage: true, gallery: true, startPrice: true, endPrice: true, pricePerSqm: true, propertyTypes: true },
    orderBy: { name: 'asc' },
  })
  const report = { generatedAt: new Date().toISOString(), projects: [], unitsAggregate: {} }

  // ── cover/gallery probes (batches of 8) ──
  const pending = []
  for (const pr of projects) {
    const urls = [pr.coverImage].filter(Boolean)
    try {
      const g = JSON.parse(pr.gallery || '[]')
      if (Array.isArray(g)) urls.push(...g.filter((u) => typeof u === 'string').slice(0, 2))
    } catch (_) { /* gallery JSON malformed */ }
    for (const url of urls) pending.push({ pr, url })
  }
  const batches = []
  for (let i = 0; i < pending.length; i += 8) batches.push(pending.slice(i, i + 8))
  const mediaResults = new Map()
  for (const batch of batches) {
    await Promise.all(batch.map(async ({ pr, url }) => {
      const r = await probeUrl(url)
      mediaResults.set(pr.id + '|' + url, r)
    }))
  }
  const coverByProject = new Map()
  for (const pr of projects) {
    const coverUrl = pr.coverImage || ''
    const cover = coverUrl ? mediaResults.get(pr.id + '|' + coverUrl) : null
    coverByProject.set(pr.id, coverUrl)
    if (!coverUrl) {
      report.projects.push({ slug: pr.slug, name: pr.name, status: pr.approvalStatus, issue: 'NO_COVER' })
      continue
    }
    if (!cover) continue
    if (cover.status !== 200) {
      report.projects.push({ slug: pr.slug, name: pr.name, status: pr.approvalStatus, issue: 'COVER_HTTP_' + (cover.status || 'ERR'), cover: coverUrl, detail: cover.err })
    } else if (!/^image\//.test(cover.ct)) {
      report.projects.push({ slug: pr.slug, name: pr.name, status: pr.approvalStatus, issue: 'COVER_NOT_IMAGE', cover: coverUrl, ct: cover.ct })
    } else if (cover.len && cover.len < 12000) {
      report.projects.push({ slug: pr.slug, name: pr.name, status: pr.approvalStatus, issue: 'COVER_TINY_KB', cover: coverUrl, bytes: cover.len })
    }
  }
  // duplicate covers shared by distinct projects (logo/placholder sharing)
  const coverCount = {}
  for (const pr of projects) {
    if (!pr.coverImage) continue
    coverCount[pr.coverImage] = (coverCount[pr.coverImage] || 0) + 1
  }
  for (const [cover, n] of Object.entries(coverCount)) {
    if (n > 1) {
      const who = projects.filter((x) => x.coverImage === cover).map((x) => x.name)
      report.projects.push({ issue: 'SHARES_COVER', cover, projects: who })
    }
  }

  // ── units + prices ──
  const projects_with_units = await p.project.findMany({
    where: { approvalStatus: { in: LIVE } },
    select: { id: true, name: true, slug: true, approvalStatus: true, startPrice: true, endPrice: true, pricePerSqm: true, propertyTypes: true },
  })
  const unitGroups = await p.unit.groupBy({
    by: ['projectId', 'unitNumber'],
    where: { unitNumber: { not: null }, project: { approvalStatus: { in: LIVE } } },
    _count: { _all: true },
    having: { unitNumber: { _count: { gt: 1 } } },
  })
  const unitsNoPrice = await p.unit.count({ where: { project: { approvalStatus: { in: LIVE } }, status: 'AVAILABLE', price: { lte: 0 } } })
  const unknownType = await p.unit.groupBy({ by: ['unitType'], where: { project: { approvalStatus: { in: LIVE } } }, _count: { _all: true } })

  for (const pr of projects_with_units) {
    const units = await p.unit.aggregate({
      where: { projectId: pr.id, status: 'AVAILABLE' },
      _min: { price: true }, _max: { price: true }, _count: { _all: true },
    })
    const available = units._count._all
    const minUnit = units._min.price
    const issues = []
    if (pr.propertyTypes && pr.propertyTypes.includes('UNKNOWN')) issues.push('PROPERTY_TYPES_HAS_UNKNOWN')
    if (available > 0 && (pr.startPrice == null || pr.startPrice <= 0)) issues.push('LIVE_WITH_NO_START_PRICE')
    if (minUnit != null && pr.startPrice != null && pr.startPrice > 0 && Math.abs(minUnit - pr.startPrice) / Math.max(minUnit, pr.startPrice) > 0.35) {
      issues.push('START_PRICE_MISMATCH_' + Math.round((minUnit - pr.startPrice) / Math.max(minUnit, pr.startPrice) * 100) + '%')
    }
    if (pr.startPrice != null && pr.startPrice >= 100000000) issues.push('START_PRICE_GE_100M')
    if (pr.pricePerSqm != null && (pr.pricePerSqm < 2000 || pr.pricePerSqm > 400000)) issues.push('PSQM_SUSPECT_' + pr.pricePerSqm)
    if (issues.length) report.projects.push({ slug: pr.slug, name: pr.name, status: pr.approvalStatus, issues, startPrice: pr.startPrice, minUnitPrice: minUnit, availableUnits: available })

    report.unitsAggregate[pr.slug] = { available, minUnitPrice: minUnit, maxUnitPrice: units._max.price }
  }

  report.unitsAggregate.__duplicates = unitGroups.map((g) => ({ projectId: g.projectId, unitNumber: g.unitNumber, count: g._count._all }))
  report.unitsAggregate.__availableWithoutPrice = unitsNoPrice
  report.unitsAggregate.__unitTypes = unknownType.map((t) => ({ type: t.unitType, count: t._count._all }))

  fs.writeFileSync('/opt/ghaya/deploy/catalog-health-report.json', JSON.stringify(report, null, 2))
  const issueCounts = {}
  report.projects.forEach((r) => { const k = r.issue ? r.issue.split('_')[0] + '_' + (r.issues ? 'multi' : r.issue) : 'ok'; issueCounts[r.issue || (r.issues || []).join('+')] = (issueCounts[r.issue || (r.issues || []).join('+')] || 0) + 1 })
  console.log('projects probed:', projects_with_units.length)
  console.log('issues:', JSON.stringify(issueCounts, null, 2))
  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
