// ─────────────────────────────────────────────────────────────────────────────
// train-ai-catalog.js — "train" عين on the CURRENT GHAYA catalog.
//
// Generates AIKnowledge chunks directly from the prod DB — VERIFIED facts
// only, never invented:
//   1) per-project   (source 'ghaya-catalog') — every PUBLIC project: name
//      (+Arabic), developer, city, delivery terms VERBATIM, property types,
//      starting price (as the public card shows), price ranges per unit type
//      (AVAILABLE && isSample:false only), phases.
//   2) aggregates    (source 'ghaya-catalog-agg') — per-CITY, per-DEVELOPER
//      and one market OVERVIEW chunk, answering "أرخص؟ / كام مشروع؟ /
//      مشاريع فلان؟ / أنهي منطقة؟" questions. URLs point at the real public
//      pages they summarize (/projects?city=, /developers/<slug>).
//   3) unit inventory  (source 'ghaya-catalog-units') — per PUBLIC project
//      with verified stock: price + area ranges, bedrooms, finishing, views
//      and verbatim delivery terms per unit type (AVAILABLE && isSample:false
//      only). Answers "المساحات؟ / أوض شوية كام؟ / تشطيب؟ / إطلالة؟".
//   4) archive register (source 'ghaya-catalog-archive') — EVERY archived
//      project in the DB (name · developer · city · verified stock).
//      Internal chunks with no public page: content explicitly says the
//      project is not listed on the site and no link may be cited, so عين
//      recognizes every project name the catalog holds — without dead links
//      or made-up data.
// Re-running refreshes chunks, so every import/price fix is one run away.
// Idempotent: upsert keyed by the chunk URL.
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const PUBLIC = ['APPROVED', 'PUBLISHED']
const MAX_CONTENT = 1500
const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n))
const trimWords = (s, max) =>
  !s ? '' : s.length <= max ? s : s.slice(0, s.lastIndexOf(' ', max)) + '…'

// Leading-alef normalization so keyword recall matches: the retriever
// normalizes user tokens إ/أ → ا, so stored Arabic must match too
// (ألرفنتيس → الرفنتيس).
const normAr = (s) => (s ? s.replace(/[إأٱ]/g, 'ا') : s)

async function upsertChunk(url, title, source, content) {
  const existing = await p.aIKnowledge.findUnique({ where: { url }, select: { id: true, content: true } })
  if (existing) {
    if (existing.content !== content) {
      await p.aIKnowledge.update({ where: { id: existing.id }, data: { title, content, wordCount: content.split(/\s+/).length, updatedAt: new Date() } })
      return 'updated'
    }
    return 'same'
  }
  await p.aIKnowledge.create({
    data: { source, url, title, content, chunkIdx: 0, wordCount: content.split(/\s+/).length },
  })
  return 'added'
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const tally = { chunksAdded: 0, chunksUpdated: 0, unchanged: 0 }
  const bump = (r) => { tally[r === 'added' ? 'chunksAdded' : r === 'updated' ? 'chunksUpdated' : 'unchanged']++ }
  const seenUrls = new Set()

  // ── 1) per-project chunks (public catalog) ────────────────────────────────
  const projects = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: PUBLIC } },
    select: {
      id: true, name: true, nameArabic: true, slug: true,
      address: true,
      startPrice: true, endPrice: true, pricePerSqm: true,
      propertyTypes: true, deliveryTerms: true,
      city: { select: { name: true, nameArabic: true, nameSlug: true } },
      developer: { select: { companyName: true, companyNameArabic: true, slug: true } },
    },
    orderBy: { name: 'asc' },
  })

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
    seenUrls.add(url)
    bump(await upsertChunk(url, `${pr.name} — GHAYA catalog`, 'ghaya-catalog', content))
  }

  // stale per-project cleanup (public slugs that vanished)
  const stale = await p.aIKnowledge.deleteMany({
    where: { source: 'ghaya-catalog', url: { startsWith: 'https://ghayaestate.com/projects/' }, NOT: { url: { in: projects.map((x) => `https://ghayaestate.com/projects/${x.slug}`) } } },
  })
  tally.staleArchivedRemoved = stale.count

  // Verified availability table for the aggregate chunks below: per public
  // project — count of AVAILABLE non-sample units + their cheapest price.
  const stockAgg = await p.unit.groupBy({
    by: ['projectId'],
    where: { status: 'AVAILABLE', isSample: false, project: { isActive: true } },
    _count: { _all: true },
    _min: { price: true },
  })
  const stockByProject = new Map(stockAgg.map((r) => [r.projectId, { count: r._count._all, min: r._min.price }]))
  const catalogTypeStock = await p.unit.groupBy({
    by: ['unitType'],
    where: { status: 'AVAILABLE', isSample: false, project: { isActive: true }, unitType: { not: 'UNKNOWN' } },
    _count: { _all: true },
    _min: { price: true },
    orderBy: [{ _count: { unitType: 'desc' } }],
  })

  // ── 2) aggregate chunks: per-city, per-developer, market overview ─────────
  const cities = new Map() // nameSlug → {key,name,ar,items,devs}
  const devs = new Map()   // companyName → {name,ar,slug,items}
  for (const pr of projects) {
    const ckey = pr.city?.nameSlug || 'other'
    if (!cities.has(ckey)) cities.set(ckey, { key: ckey, name: pr.city?.name || 'Other locations', ar: pr.city?.nameArabic || '', items: [], devs: new Set() })
    const c = cities.get(ckey)
    c.items.push(pr)
    if (pr.developer?.companyName) c.devs.add(pr.developer.companyName)
    const dkey = pr.developer?.companyName || 'unknown'
    if (!devs.has(dkey)) devs.set(dkey, { name: dkey, ar: pr.developer?.companyNameArabic || '', slug: pr.developer?.slug || null, items: [] })
    devs.get(dkey).items.push(pr)
  }
  const priced = (arr) => arr.filter((x) => x.startPrice > 0).sort((a, b) => a.startPrice - b.startPrice)

  for (const c of cities.values()) {
    const ps = priced(c.items)
    // verified availability facts for this area (catalog-derived only)
    const avail = c.items
      .map((x) => ({ pr: x, s: stockByProject.get(x.id) }))
      .filter((r) => r.s && r.s.count > 0 && r.s.min != null)
      .sort((a, b) => a.s.min - b.s.min)
    const availLine = avail.length
      ? `AVAILABLE right now (verified): ${avail.reduce((n, r) => n + r.s.count, 0)} units — cheapest ${avail[0].pr.name} from EGP ${fmt(avail[0].s.min)}.`
      : `AVAILABLE right now: 0 verified units in this area's catalog.`
    const lines = [
      `GHAYA catalog facts for area ${c.name} (${c.ar}) — verified ${today}.`,
      `Public projects in ${c.name}: ${c.items.length}, from ${c.devs.size} developer(s).`,
      ps.length ? `Cheapest in ${c.name}: ${ps[0].name} from EGP ${fmt(ps[0].startPrice)} (${ps[0].developer?.companyName || '—'}).` : null,
      ps.length > 1 ? `Highest start price: ${ps[ps.length - 1].name} at EGP ${fmt(ps[ps.length - 1].startPrice)}.` : null,
      availLine,
      ps.length ? 'Projects (cheapest first):' : 'Projects:',
      ...c.items.map((x) => {
        const s = stockByProject.get(x.id)
        return `- ${x.name}${x.nameArabic ? ` / ${x.nameArabic}` : ''} · ${x.developer?.companyName || '—'}${x.startPrice > 0 ? ` · from EGP ${fmt(x.startPrice)}` : ' · price on request'}${s && s.count > 0 ? ` · ${s.count} available` : ''}`
      }),
      `Keywords: أسعار ${c.ar}، أرخص مشروع في ${c.ar}، مشاريع ${c.ar}، كمبوندات ${c.ar}، متاح في ${c.ar}، وحدات متاحة ${c.ar}، ${c.name}`,
    ].filter(Boolean).join('\n')
    const url = `https://ghayaestate.com/projects?city=${c.key}`
    seenUrls.add(url)
    bump(await upsertChunk(url, `${c.name} — GHAYA area facts`, 'ghaya-catalog-agg', trimWords(lines, MAX_CONTENT)))
  }

  for (const d of devs.values()) {
    const ps = priced(d.items)
    const avail = d.items
      .map((x) => ({ pr: x, s: stockByProject.get(x.id) }))
      .filter((r) => r.s && r.s.count > 0 && r.s.min != null)
      .sort((a, b) => a.s.min - b.s.min)
    const availLine = avail.length
      ? `AVAILABLE right now (verified): ${avail.reduce((n, r) => n + r.s.count, 0)} units in the catalog — cheapest ${avail[0].pr.name} from EGP ${fmt(avail[0].s.min)}.`
      : `AVAILABLE right now: 0 verified units in the catalog for this developer's projects.`
    const lines = [
      `GHAYA catalog facts for developer ${d.name}${d.ar ? ` (${d.ar})` : ''} — verified ${today}.`,
      `Public projects by ${d.name}: ${d.items.length} across ${new Set(d.items.map((x) => x.city?.name).filter(Boolean)).size} area(s).`,
      ps.length ? `Starting prices range EGP ${fmt(ps[0].startPrice)} – ${fmt(ps[ps.length - 1].startPrice)}.` : null,
      availLine,
      'Projects:',
      ...d.items.map((x) => `- ${x.name}${x.nameArabic ? ` / ${x.nameArabic}` : ''} · ${x.city?.name || '—'} · ${x.startPrice > 0 ? `from EGP ${fmt(x.startPrice)}` : 'price on request'}`),
      `Keywords: مشاريع ${d.ar || d.name}، أسعار ${d.ar || d.name}، ${d.name} projects`,
    ].filter(Boolean).join('\n')
    // real public developer page when the slug exists; key must still be unique
    const url = d.slug ? `https://ghayaestate.com/developers/${d.slug}` : `https://ghayaestate.com/projects?dev=${encodeURIComponent(d.name).replace(/%20/g, '-')}`
    seenUrls.add(url)
    bump(await upsertChunk(url, `${d.name} — GHAYA developer facts`, 'ghaya-catalog-agg', trimWords(lines, MAX_CONTENT)))
  }

  {
    const ps = priced(projects)
    const cityLines = [...cities.values()].filter((c) => priced(c.items).length)
      .sort((a, b) => priced(a.items)[0].startPrice - priced(b.items)[0].startPrice)
      .map((c) => `- ${c.name} (${c.ar}): ${c.items.length} projects from EGP ${fmt(priced(c.items)[0].startPrice)}`)
    const lines = [
      `GHAYA catalog overview — verified ${today}.`,
      `Public projects: ${projects.length}, from ${devs.size} developers, across ${[...cities.values()].filter((c) => priced(c.items).length).length} areas.`,
      ps.length ? `Cheapest projects overall (top 10): ${ps.slice(0, 10).map((x) => `${x.name} from EGP ${fmt(x.startPrice)}`).join('; ')}.` : null,
      catalogTypeStock.length
        ? `AVAILABLE stock catalog-wide (verified): ${catalogTypeStock.reduce((n, t) => n + t._count._all, 0)} units — ${catalogTypeStock.slice(0, 8).map((t) => `${t.unitType.replace(/_/g, ' ').toLowerCase()} (${t._count._all}, from EGP ${fmt(t._min.price)})`).join(', ')}.`
        : 'AVAILABLE stock catalog-wide: 0 verified units.',
      'Start-price entry point per area (cheapest first):',
      ...cityLines,
      'Keywords: أرخص منطقة، أرخص مشروع في مصر، أسعار السوق، كم مشروع عندكم، كل المشاريع',
    ].filter(Boolean).join('\n')
    const url = 'https://ghayaestate.com/projects'
    seenUrls.add(url)
    bump(await upsertChunk(url, 'GHAYA catalog overview', 'ghaya-catalog-agg', trimWords(lines, MAX_CONTENT)))
  }

  // ── 2b) unit inventory: per PUBLIC project with verified stock — the deep
  // per-type facts (price/area ranges, bedrooms, finishing, views, verbatim
  // delivery terms). Source of "المساحات كام؟ / فيه 3 أوض؟ / التشطيب؟ /
  // فيو بحر؟ / شروط السداد؟" answers. NO invented data: catalog only.
  {
    // per (project, type) aggregate over verified AVAILABLE units
    const typesAgg = await p.unit.groupBy({
      by: ['projectId', 'unitType'],
      where: { status: 'AVAILABLE', isSample: false, project: { isActive: true, approvalStatus: { in: PUBLIC } } },
      _count: { _all: true },
      _min: { price: true, area: true, bedrooms: true },
      _max: { price: true, area: true, bedrooms: true },
    })
    // per (project, type, bedrooms) counts to state bedroom mix precisely
    const bedsAgg = await p.unit.groupBy({
      by: ['projectId', 'unitType', 'bedrooms'],
      where: { status: 'AVAILABLE', isSample: false, project: { isActive: true, approvalStatus: { in: PUBLIC } }, bedrooms: { gt: 0 } },
      _count: { _all: true },
    })
    // per (project, type, finishing) counts (non-null only)
    const finishAgg = await p.unit.groupBy({
      by: ['projectId', 'unitType', 'finishingType'],
      where: { status: 'AVAILABLE', isSample: false, project: { isActive: true, approvalStatus: { in: PUBLIC } }, finishingType: { not: null } },
      _count: { _all: true },
    })
    // per (project, type, view) counts (non-null, non-empty only)
    const viewAgg = await p.unit.groupBy({
      by: ['projectId', 'unitType', 'view'],
      where: { status: 'AVAILABLE', isSample: false, project: { isActive: true, approvalStatus: { in: PUBLIC } }, view: { not: null, notIn: [''] } },
      _count: { _all: true },
    })
    // verbatim unit-level delivery terms (top 2 per project)
    const termsAgg = await p.unit.groupBy({
      by: ['projectId', 'deliveryTerms'],
      where: { status: 'AVAILABLE', isSample: false, project: { isActive: true, approvalStatus: { in: PUBLIC } }, deliveryTerms: { not: null, notIn: [''] } },
      _count: { _all: true },
    })
    const bedsKey = (id, t) => `${id}:${t}`
    const bedsMap = new Map()
    for (const r of bedsAgg) {
      const k = bedsKey(r.projectId, r.unitType)
      if (!bedsMap.has(k)) bedsMap.set(k, [])
      bedsMap.get(k).push(`${r.bedrooms}BR×${r._count._all}`)
    }
    const topMap = (agg, field) => {
      const m = new Map()
      for (const r of agg) {
        const k = bedsKey(r.projectId, r.unitType)
        if (!m.has(k)) m.set(k, [])
        m.get(k).push(`${(r[field] || '').toString().replace(/_/g, ' ')}×${r._count._all}`)
      }
      // keep the 3 most common variants per (project, type)
      for (const v of m.values()) v.sort((a, b) => parseInt(b.match(/×(\d+)$/)[1], 10) - parseInt(a.match(/×(\d+)$/)[1], 10))
      return m
    }
    const finishMap = topMap(finishAgg, 'finishingType')
    const viewMap = topMap(viewAgg, 'view')
    const termsMap = new Map()
    for (const r of termsAgg) {
      const k = bedsKey(r.projectId, r.unitType)
      if (!termsMap.has(k)) termsMap.set(k, [])
      termsMap.get(k).push(r.deliveryTerms)
    }

    const projectById = new Map(projects.map((x) => [x.id, x]))
    // group type-rows per project, keep projects that actually have stock
    const rowsPerProject = new Map()
    for (const r of typesAgg) {
      if (!rowsPerProject.has(r.projectId)) rowsPerProject.set(r.projectId, [])
      rowsPerProject.get(r.projectId).push(r)
    }
    const typeAr = { APARTMENT: 'شقق', VILLA: 'فلل', CHALET: 'شاليهات', TOWNHOUSE: 'تاون هاوس', DUPLEX: 'دوبلكس', PENTHOUSE: 'بنتهاوس', STUDIO: 'ستوديوهات', ADMINISTRATIVE: 'إداري', COMMERCIAL: 'تجاري/محلات', MEDICAL: 'عيادات/طبي', CABIN: 'أكواخ', FACTORY: 'مصانع', LAND: 'أراضي', OFFICE: 'مكاتب' }

    for (const [projectId, rows] of rowsPerProject) {
      const pr = projectById.get(projectId)
      if (!pr) continue
      const total = rows.reduce((n, r) => n + r._count._all, 0)
      const lines = [
        `Unit inventory for ${pr.name}${pr.nameArabic ? ` (${pr.nameArabic})` : ''} — verified ${today} (AVAILABLE units only, ${total} total).`,
        pr.city?.name ? `Area: ${pr.city.name}.` : null,
      ]
      for (const r of rows.sort((a, b) => b._count._all - a._count._all)) {
        const t = r.unitType || 'UNSPECIFIED'
        const k = bedsKey(projectId, t)
        const bits = [`${t.replace(/_/g, ' ').toLowerCase()}: ${r._count._all} available`]
        if (r._min.price != null) bits.push(`EGP ${fmt(r._min.price)}${r._max.price > r._min.price ? `–${fmt(r._max.price)}` : ''}`)
        if (r._min.area != null) bits.push(`areas ${fmt(r._min.area)}${r._max.area > r._min.area ? `–${fmt(r._max.area)}` : ''} sqm`)
        const beds = bedsMap.get(k)
        if (beds) bits.push(`bedrooms: ${beds.slice(0, 5).join(', ')}`)
        const fin = finishMap.get(k)
        if (fin) bits.push(`finishing: ${fin.slice(0, 3).join(', ')}`)
        const vw = viewMap.get(k)
        if (vw) bits.push(`views: ${vw.slice(0, 3).join(', ')}`)
        const terms = termsMap.get(k)
        if (terms) bits.push(`delivery terms (verbatim): ${trimWords(terms[0], 110)}`)
        lines.push(`- ${bits.join(' · ')}`)
      }
      const arWords = rows.map((r) => typeAr[r.unitType]).filter(Boolean)
      lines.push(`Keywords: وحدات متاحة في ${pr.name}${pr.nameArabic ? ` (${pr.nameArabic})` : ''}${arWords.length ? ' — ' + arWords.join('، ') : ''}، المساحات، أوض، تشطيب، إطلالة، ${pr.name} units`)
      const url = `internal://ghaya-units/${pr.slug}`
      seenUrls.add(url)
      bump(await upsertChunk(url, `${pr.name} — unit inventory`, 'ghaya-catalog-units', trimWords(lines.filter(Boolean).join('\n'), MAX_CONTENT)))
    }
  }

  // ── 3) archive register: EVERY archived project in the catalog ────────────
  const archived = await p.project.findMany({
    where: { isActive: false },
    select: {
      id: true, name: true, nameArabic: true,
      city: { select: { name: true, nameArabic: true, nameSlug: true } },
      developer: { select: { companyName: true } },
    },
    orderBy: { name: 'asc' },
  })
  // verified stock per archived project (AVAILABLE & non-sample only)
  const archUnits = await p.unit.groupBy({
    by: ['projectId'],
    where: { status: 'AVAILABLE', isSample: false, project: { isActive: false } },
    _min: { price: true }, _max: { price: true }, _count: { _all: true },
  })
  const unitMap = new Map(archUnits.map((u) => [u.projectId, u]))

  const byCity = new Map()
  for (const pr of archived) {
    const k = pr.city?.nameSlug || 'other'
    if (!byCity.has(k)) byCity.set(k, { key: k, name: pr.city?.name || 'Other locations', ar: pr.city?.nameArabic || '', items: [] })
    byCity.get(k).items.push(pr)
  }

  for (const g of byCity.values()) {
    let part = 0
    let buf = []
    let len = 0
    const flush = async () => {
      if (!buf.length) return
      part++
      const url = `internal://ghaya-archive/${g.key}-${part}`
      const header = [
        `GHAYA internal archive register — ${g.name}${g.ar ? ` (${g.ar})` : ''} — part ${part} — verified ${today}.`,
        `مشاريع ${g.ar} المسجلة في قاعدة بيانات غيا (أرشيف داخلي — غير معروضة حالياً على الموقع).`,
        `These projects EXIST in the GHAYA catalog but are NOT publicly listed right now — there is no /projects/ page for them. Recorded by name / developer / city / verified stock only. If a client asks about one, say the GHAYA team can share availability and details on request — never cite a website link for an archived project.`,
      ].join('\n')
      const content = trimWords(`${header}\n${buf.join('\n')}`, MAX_CONTENT)
      seenUrls.add(url)
      bump(await upsertChunk(url, `GHAYA archive register — ${g.name} (${part})`, 'ghaya-catalog-archive', content))
      buf = []
      len = 0
    }
    for (const pr of g.items) {
      const u = unitMap.get(pr.id)
      const bits = [
        `${normAr(pr.name)}${pr.nameArabic ? ` / ${normAr(pr.nameArabic)}` : ''}`,
        pr.developer?.companyName || '—',
      ]
      if (u && u._count._all > 0) {
        bits.push(`${u._count._all} verified AVAILABLE units${u._min.price != null ? ` EGP ${fmt(u._min.price)}${u._max.price > u._min.price ? `–${fmt(u._max.price)}` : ''}` : ''}`)
      }
      const line = `- ${bits.join(' · ')}`
      if (len + line.length > 1150) await flush()
      buf.push(line)
      len += line.length
    }
    await flush()
  }

  // stale aggregate/archive cleanup for keys not regenerated this run
  const staleAgg = await p.aIKnowledge.deleteMany({
    where: { source: 'ghaya-catalog-agg', url: { notIn: [...seenUrls] } },
  })
  const staleUnits = await p.aIKnowledge.deleteMany({
    where: { source: 'ghaya-catalog-units', url: { notIn: [...seenUrls] } },
  })
  const staleArch = await p.aIKnowledge.deleteMany({
    where: { source: 'ghaya-catalog-archive', url: { notIn: [...seenUrls] } },
  })

  const total = await p.aIKnowledge.count({ where: { isActive: true } })
  const bySource = await p.aIKnowledge.groupBy({ by: ['source'], _count: { _all: true } })
  console.log(JSON.stringify({
    publicProjects: projects.length,
    archivedProjectsRegistered: archived.length,
    ...tally,
    staleAggRemoved: staleAgg.count,
    staleUnitChunksRemoved: staleUnits.count,
    staleArchiveRemoved: staleArch.count,
    totalActiveChunks: total,
    bySource: bySource.map((b) => ({ source: b.source, chunks: b._count._all })),
  }, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
