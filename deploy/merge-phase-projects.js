// Merge standalone phase-named projects (ARCHIVED shells) into their real
// parent projects as ProjectPhase rows — the owner's rule: a phase ALWAYS
// lives INSIDE its parent project, never as a standalone project.
//
// Dry run by default; pass RUN=1 (or --run) to actually write.
// Carries, per shell: phase identity (EN+AR names cleaned), construction
// status, start/end price, deliveryDate, totalUnits, amenities (deduped),
// brochures + master-plan images (deduped by URL, labelled with the phase).
// The shell itself stays ARCHIVED (reversible tombstone) — nothing deleted.
const fs = require('fs')
const prismaMod = require('@prisma/client')
const PrismaClient = prismaMod.PrismaClient

const RUN = process.argv.includes('--run') || process.env.RUN === '1'

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064a]+/g, '')

// Explicit aliases for a parent whose catalog title includes a geographic
// qualifier while the standalone phase titles use the shorter brand name.
// Keep this list narrow: fuzzy cross-developer merges are never acceptable.
const PARENT_ALIASES = {
  midtownwest: ['midtownnewzayedwest'],
}

// Arabic ordinal step for a sensible phase ordering inside the parent.
const AR_ORDINAL = { 'الاولي': 1, 'الاولى': 1, 'الأولى': 1, 'الثانيه': 2, 'الثانية': 2, 'الثانبة': 2, 'الثالثه': 3, 'الثالثة': 3, 'الرابعة': 4, 'الرابعه': 4, 'الخامسة': 5, 'الخامسه': 5 }

function parseShell(name, nameArabic) {
  let base, label
  // EN: cut at the LAST /phase/i token; the remainder after it is the label.
  const m = /(.*?)([\s\-_,]*(?:phase|المرحلة)[\s\S]*)$/i.exec(name)
  if (m) {
    base = (m[1] || '').trim()
    label = (m[2] || '').replace(/^[\s\-_,]+/, '').trim()
  } else {
    base = name
    label = ''
  }
  if (/^phase$/i.test(label)) label = 'New Phase'
  else if (label) label = label.replace(/\bphase\b/i, 'Phase')
  if (/^المرحلة$/.test(label)) label = 'المرحلة الجديدة'

  // Candidates: the base itself, and each comma-separated fragment of it
  // (e.g. "Sky Condos, Villette").
  const candidates = [base, ...base.split(',').map((x) => x.trim())]
    .map((c) => c.replace(/[\s\-_,]+$/, '').trim())
    .filter((c) => c.length >= 2)

  // Order: EN digits → 'two'→2 → Arabic ordinal words.
  let step = null
  const digit = /(?:phase|المرحلة)\s*(\d)/i.exec(name) || /(?:phase)\s*(\d)/i.exec(nameArabic || '')
  if (digit) step = parseInt(digit[1], 10)
  else {
    const word = /phase\s+(one|two|three|four|five)/i.exec(name)
    if (word) step = { one: 1, two: 2, three: 3, four: 4, five: 5 }[word[1].toLowerCase()]
  }
  if (!step) {
    for (const key of Object.keys(AR_ORDINAL)) {
      if ((nameArabic || '').includes(key) || name.includes('ال' + key.replace('ال', ''))) { step = AR_ORDINAL[key]; break }
    }
  }
  // Arabic phase label: text from "المرحلة..." onward.
  const arLabel = (nameArabic || '').split('المرحلة').length > 1
    ? 'المرحلة' + (nameArabic || '').split('المرحلة')[1]
    : null
  return { base, label, candidates, step: step || 0, arLabel }
}

function findParent(candidates, projects, developerId) {
  const seen = []
  // Never join phases across developers, even when project names overlap.
  const sameDeveloper = projects.filter((p) => p.developerId === developerId)
  for (const cand of candidates) {
    const cn = norm(cand)
    if (!cn) continue
    const exact = sameDeveloper.find((p) => norm(p.name) === cn || norm(p.nameArabic) === cn)
    const partial = sameDeveloper.filter(
      (p) => (norm(p.name).includes(cn) || cn.includes(norm(p.name))) && norm(p.name).length >= 3
    )
    const aliases = PARENT_ALIASES[cn] || []
    const aliasMatches = sameDeveloper.filter((p) => aliases.includes(norm(p.name)) || aliases.includes(norm(p.nameArabic)))
    const pool = exact ? [exact] : [...partial, ...aliasMatches]
    for (const p of pool) if (!seen.find((s) => s.id === p.id)) seen.push(p)
  }
  if (seen.length === 1) return { parent: seen[0], ambiguity: null, pool: seen }
  if (seen.length === 0) return { parent: null, ambiguity: 'NO_PARENT', pool: [] }
  return { parent: null, ambiguity: 'MULTIPLE', pool: seen }
}

async function main() {
  const p = new PrismaClient()

  const shells = await p.project.findMany({
    where: { AND: [{ approvalStatus: 'ARCHIVED' }, { OR: [{ name: { contains: 'Phase' } }, { nameArabic: { contains: 'مرحلة' } }] }] },
  })
  const shellIds = new Set(shells.map((s) => s.id))
  // Parent candidates NEVER include the phase shells themselves — a shell
  // must not become another shell's parent.
  const projects = await p.project.findMany({ select: { id: true, name: true, nameArabic: true, approvalStatus: true, developerId: true } }).then((ps) => ps.filter((p2) => !shellIds.has(p2.id)))

  const report = []
  for (const shell of shells) {
    const parsed = parseShell(shell.name, shell.nameArabic)
    const { parent, ambiguity, pool } = findParent(parsed.candidates, projects, shell.developerId)

    let phaseLabel = parsed.label || shell.name
    const arLabel = parsed.arLabel || shell.nameArabic

    let outcome
    if (!parent) {
      outcome = ambiguity
    } else {
      const existing = await p.projectPhase.findMany({ where: { projectId: parent.id }, select: { id: true, name: true, nameArabic: true } })
      const dup = existing.find(
        (e) => norm(e.name) === norm(phaseLabel) || norm(e.name) === norm(shell.name) || (arLabel && norm(e.nameArabic) === norm(arLabel))
      )
      if (dup) outcome = 'ALREADY_IN_PARENT'
      else if (RUN) {
        const created = await p.projectPhase.create({
          data: {
            projectId: parent.id,
            name: phaseLabel,
            nameArabic: arLabel || null,
            status: shell.status,
            deliveryDate: shell.deliveryDate || null,
            // Unit totals on standalone catalog shells are not proof of the
            // actual phase inventory; live counts are derived from Unit rows.
            totalUnits: null,
            startPrice: shell.startPrice || null,
            endPrice: shell.endPrice || null,
            sortOrder: parsed.step,
          },
        })
        // Amenities → dedupe onto parent (@@unique projectId+amenityId).
        let amenMoved = 0
        const shellAmen = await p.projectAmenity.findMany({ where: { projectId: shell.id } })
        for (const a of shellAmen) {
          await p.projectAmenity.upsert({
            where: { projectId_amenityId: { projectId: parent.id, amenityId: a.amenityId } },
            update: {},
            create: { projectId: parent.id, amenityId: a.amenityId, isPremium: a.isPremium, notes: a.notes },
          })
          amenMoved++
        }
        // Brochures → parent, labelled with the phase, deduped by URL.
        let broMoved = 0
        const shellBros = await p.projectBrochure.findMany({ where: { projectId: shell.id } })
        for (const b of shellBros) {
          const clash = await p.projectBrochure.findFirst({ where: { projectId: parent.id, url: b.url } })
          if (!clash) {
            await p.projectBrochure.create({ data: { projectId: parent.id, url: b.url, name: `[${phaseLabel}] ${b.name}`, fileSize: b.fileSize, pageCount: b.pageCount } })
            broMoved++
          }
        }
        // Master-plan images → parent, captioned with the phase, deduped by URL.
        let mpMoved = 0
        const shellMps = await p.masterPlanImage.findMany({ where: { projectId: shell.id } })
        for (const m of shellMps) {
          const clash = await p.masterPlanImage.findFirst({ where: { projectId: parent.id, url: m.url } })
          if (!clash) {
            await p.masterPlanImage.create({ data: { projectId: parent.id, url: m.url, caption: m.caption ? `[${phaseLabel}] ${m.caption}` : `[${phaseLabel}]`, sortOrder: m.sortOrder } })
            mpMoved++
          }
        }
        outcome = `CREATED → ${parent.name} (+${amenMoved}|${broMoved}|${mpMoved}) id=${created.id}`
      } else {
        outcome = `WOULD_CREATE → ${parent.name}`
      }
    }

    const price = shell.startPrice || shell.endPrice
    report.push({ shell: shell.name, base: parsed.base, label: phaseLabel, ar: arLabel, unitCount: shell.totalUnits, price, outcome, parentStatus: parent ? parent.approvalStatus : null, matched: parent ? [parent.name] : pool.map((x) => x.name) })
    console.log(
      `[${outcome.split(' ')[0]}] ${shell.name} → ${outcome}${price && (shell.startPrice || 0) >= 100000000 ? '  ⚠️ PRICE-CHECK' : ''}`
    )
  }

  fs.writeFileSync(`/opt/ghaya/deploy/phase-merge-report-${RUN ? 'run' : 'dry'}.json`, JSON.stringify(report, null, 2))
  const counts = {}
  report.forEach((r) => { const k = r.outcome.split(' ')[0] === 'CREATED' || r.outcome.split(' ')[0] === 'WOULD_CREATE' ? r.outcome.split(' ')[0] : r.outcome.split(' ')[0]; counts[k] = (counts[k] || 0) + 1 })
  console.log('\n=== SUMMARY ===')
  Object.entries(counts).forEach(([k, v]) => console.log(k, v))
  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
