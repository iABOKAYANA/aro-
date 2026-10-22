// Merge pass 2: stage-named standalone shells (zero units, ARCHIVED) whose
// name is a segment of a same-developer sibling project — e.g. "Hyde Park
// Views" → Hyde Park, "Mazarine Ria" → Mazarine. Owner rule: every stage
// lives INSIDE its parent project. Shell name suffix becomes the phase
// label. Dry run by default; --run / RUN=1 writes.
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')

const RUN = process.argv.includes('--run') || process.env.RUN === '1'
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0621-\u064a]+/g, '')
// This archived parent already owns Cluster 23. Keep the alias explicit so
// it is not accidentally attached to the broader live "Hyde Park" project.
const PARENT_OVERRIDES = { 'hyde-park-greens-cluster-23': 'hyde-park-greens' }

function parseNumericStep(text) {
  const m = /(\d+)/.exec(text)
  return m ? parseInt(m[1], 10) : 0
}

async function main() {
  const p = new PrismaClient()

  const zeroUnit = await p.project.findMany({
    where: { units: { none: {} } },
    select: { id: true, name: true, nameArabic: true, slug: true, approvalStatus: true, developerId: true, status: true, deliveryDate: true, startPrice: true, endPrice: true, totalUnits: true },
    orderBy: { name: 'asc' },
  })
  const shellSeeds = zeroUnit.filter((r) => r.approvalStatus === 'ARCHIVED')
  const all = await p.project.findMany({
    select: { id: true, name: true, nameArabic: true, slug: true, approvalStatus: true, developerId: true },
  })

  const report = []
  for (const shell of shellSeeds) {
    // Pass 1 already handled explicit phase names — skip them here.
    if (/phase|مرحلة/i.test(shell.name + ' ' + (shell.nameArabic || ''))) continue
    const sn = norm(shell.name)
    const cands = all.filter((pr) => {
      if (pr.id === shell.id) return false
      if (pr.approvalStatus === 'ARCHIVED') return false
      const pn = norm(pr.name)
      if (pn.length < 4 || sn.length <= pn.length || !sn.startsWith(pn)) return false
      if (pr.developerId !== shell.developerId && shell.developerId !== pr.developerId) return false
      return true
    })
    const overrideSlug = PARENT_OVERRIDES[shell.slug]
    const overrideParent = overrideSlug
      ? all.find((pr) => pr.slug === overrideSlug && pr.developerId === shell.developerId)
      : null
    if (!cands.length && !overrideParent) continue
    const best = overrideParent || cands.sort((a, b) => norm(b.name).length - norm(a.name).length)[0]
    const idx = shell.name.toLowerCase().indexOf(best.name.toLowerCase())
    const rawSuffix = idx === 0 ? shell.name.slice(best.name.length).trim() : shell.name
    const label = (rawSuffix || '').replace(/^[-_,\s]+/, '').replace(/[\s\-_,]+$/, '').trim() || 'Extra'
    const labelCap = label.charAt(0).toUpperCase() + label.slice(1)
    const step = parseNumericStep(label)
    // Short all-caps suffixes like "SIDE" become "Side" (not shouting caps).
    const labelFinal = labelCap.length <= 6 && labelCap === labelCap.toUpperCase() && !/\d/.test(labelCap)
      ? labelCap.charAt(0) + labelCap.slice(1).toLowerCase()
      : labelCap

    // Arabic label: strip the parent's Arabic name prefix when present.
    let arLabel = (shell.nameArabic || '').trim()
    if (best.nameArabic) {
      const bn = norm(best.nameArabic)
      if (bn && norm(arLabel).startsWith(bn)) {
        arLabel = arLabel.replace(best.nameArabic, '').replace(/^[\s\-–—,:،]+\s*/, '').trim()
      }
    }
    if (!arLabel) arLabel = null

    const existing = await p.projectPhase.findMany({ where: { projectId: best.id }, select: { id: true, name: true } })
    const dup = existing.find((e) => norm(e.name) === norm(labelCap))
    if (dup) {
      report.push({ shell: shell.name, parent: best.name, outcome: 'ALREADY_IN_PARENT', label: labelCap })
      console.log(`[ALREADY] ${shell.name} → ${best.name} (${labelCap})`)
      continue
    }
    if (RUN) {
      const created = await p.projectPhase.create({
        data: {
          projectId: best.id,
          name: labelFinal,
          nameArabic: arLabel,
          status: shell.status,
          deliveryDate: shell.deliveryDate || null,
          totalUnits: shell.totalUnits || null,
          startPrice: shell.startPrice || null,
          endPrice: shell.endPrice || null,
          sortOrder: step || 90 + step,
        },
      })
      let amenMoved = 0, broMoved = 0, mpMoved = 0
      const shellAmen = await p.projectAmenity.findMany({ where: { projectId: shell.id } })
      for (const a of shellAmen) {
        await p.projectAmenity.upsert({
          where: { projectId_amenityId: { projectId: best.id, amenityId: a.amenityId } },
          update: {},
          create: { projectId: best.id, amenityId: a.amenityId, isPremium: a.isPremium, notes: a.notes },
        })
        amenMoved++
      }
      const shellBros = await p.projectBrochure.findMany({ where: { projectId: shell.id } })
      for (const b of shellBros) {
        const clash = await p.projectBrochure.findFirst({ where: { projectId: best.id, url: b.url } })
        if (!clash) {
          await p.projectBrochure.create({ data: { projectId: best.id, url: b.url, name: `[${labelCap}] ${b.name}`, fileSize: b.fileSize, pageCount: b.pageCount } })
          broMoved++
        }
      }
      const shellMps = await p.masterPlanImage.findMany({ where: { projectId: shell.id } })
      for (const m of shellMps) {
        const clash = await p.masterPlanImage.findFirst({ where: { projectId: best.id, url: m.url } })
        if (!clash) {
          await p.masterPlanImage.create({ data: { projectId: best.id, url: m.url, caption: m.caption ? `[${labelCap}] ${m.caption}` : `[${labelCap}]`, sortOrder: m.sortOrder } })
          mpMoved++
        }
      }
      report.push({ shell: shell.name, parent: best.name, outcome: 'CREATED', label: labelCap, id: created.id })
      console.log(`[CREATED] ${shell.name} → ${best.name} (${labelCap}) +${amenMoved}|${broMoved}|${mpMoved} id=${created.id}`)
    } else {
      report.push({ shell: shell.name, parent: best.name, outcome: 'WOULD_CREATE', label: labelCap })
      console.log(`[WOULD_CREATE] ${shell.name} → ${best.name} (${labelCap}) ar=${arLabel}`)
    }
  }
  fs.writeFileSync(`/opt/ghaya/deploy/stage-merge-report-${RUN ? 'run' : 'dry'}.json`, JSON.stringify(report, null, 2))
  console.log('\n=== SUMMARY ===', report.filter((r) => r.outcome === 'CREATED').length, report.filter((r) => r.outcome === 'WOULD_CREATE').length, report.filter((r) => r.outcome === 'ALREADY_IN_PARENT').length)
  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
