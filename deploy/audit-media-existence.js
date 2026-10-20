// Audit: every coverImage / gallery / logo / floorPlan file path stored in the
// DB must exist on disk under public/ (local-path entries only). Hotlinked
// http(s) URLs are just counted, not fetched.
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')
const p = new PrismaClient()

function isLocalPath(v) {
  return typeof v === 'string' && v.startsWith('/')
}

function collectGalleries(json) {
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string' && isLocalPath(x))
  } catch {}
  return []
}

async function main() {
  const missing = []
  let localCount = 0
  let hotlinkCount = 0

  const projects = await p.project.findMany({
    select: {
      slug: true, isActive: true, coverImage: true, gallery: true,
      videoUrl: true, panoramaImages: true,
    },
  })
  for (const pr of projects) {
    const fields = { coverImage: pr.coverImage, videoUrl: pr.videoUrl, panoramaImages: pr.panoramaImages }
    for (const [k, v] of Object.entries(fields)) {
      if (!v) continue
      if (/^https?:\/\//.test(v)) { hotlinkCount++; continue }
      if (!isLocalPath(v)) continue
      localCount++
      const f = path.join('/opt/ghaya/public', v)
      if (!fs.existsSync(f)) missing.push({ kind: 'project.' + k, slug: pr.slug, active: pr.isActive, v })
    }
    for (const g of collectGalleries(pr.gallery)) {
      localCount++
      const f = path.join('/opt/ghaya/public', g)
      if (!fs.existsSync(f)) missing.push({ kind: 'project.gallery', slug: pr.slug, active: pr.isActive, v: g })
    }
    for (const g of collectGalleries(pr.panoramaImages)) {
      localCount++
      const f = path.join('/opt/ghaya/public', g)
      if (!fs.existsSync(f)) missing.push({ kind: 'project.panoramaImages', slug: pr.slug, active: pr.isActive, v: g })
    }
  }

  const devs = await p.developerProfile.findMany({ select: { companyName: true, logo: true } })
  for (const d of devs) {
    if (!d.logo) continue
    if (/^https?:\/\//.test(d.logo)) { hotlinkCount++; continue }
    if (!isLocalPath(d.logo)) continue
    localCount++
    const f = path.join('/opt/ghaya/public', d.logo)
    if (!fs.existsSync(f)) missing.push({ kind: 'developer.logo', name: d.companyName, v: d.logo })
  }

  // ProjectPhase has no media columns in the schema (verified via PRAGMA) —
  // nothing to audit there.


  console.log(JSON.stringify({ localPathsChecked: localCount, hotlinkUrls: hotlinkCount, missingCount: missing.length, missingSample: missing.slice(0, 40) }, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
