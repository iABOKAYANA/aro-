import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

// ─── NearbyPlace.type → category mapping ────────────────────────────
// `NearbyPlace.type` is a free-text column (seed data uses values like
// 'school', 'hospital', 'mall', 'highway'). Matching is case-insensitive
// substring, first bucket wins; anything unrecognised lands in `other` so
// no place is silently dropped. Order matters: e.g. 'small clinic' must
// read as a hospital, not a mall.
const SCHOOL_KEYS = [
  'school',
  'university',
  'college',
  'academy',
  'institute',
  'nursery',
  'kindergarten',
  'education',
]
const HOSPITAL_KEYS = [
  'hospital',
  'clinic',
  'medical',
  'pharmacy',
  'health',
  'doctor',
  'dental',
]
const TRANSPORT_KEYS = [
  'transport',
  'metro',
  'monorail',
  'station',
  'highway',
  'road',
  'bus',
  'rail',
  'airport',
  'bridge',
  'transit',
  'commute',
]
const MALL_KEYS = [
  'mall',
  'market',
  'shop',
  'retail',
  'store',
  'supermarket',
  'hypermarket',
  'bazaar',
  'plaza',
]

export type AreaCategory = 'schools' | 'hospitals' | 'transport' | 'malls' | 'other'

function bucketizeNearbyType(rawType: unknown): AreaCategory {
  const t = String(rawType ?? '').toLowerCase()
  if (SCHOOL_KEYS.some((k) => t.includes(k))) return 'schools'
  if (HOSPITAL_KEYS.some((k) => t.includes(k))) return 'hospitals'
  if (TRANSPORT_KEYS.some((k) => t.includes(k))) return 'transport'
  if (MALL_KEYS.some((k) => t.includes(k))) return 'malls'
  return 'other'
}

// ─── Curated landmark art (upload.wikimedia.org originals) ──────────
// Five URLs are long-proven in the codebase; red-sea + cairo were found
// via the Commons API (list=search, srnamespace=6) and confirmed via
// prop=imageinfo on 2026-10-07:
//   red-sea → File:El Gouna WV banner.jpg ("El Gouna (Red Sea, Egypt): lagoon")
//   cairo   → File:Cairotower.jpg ("Cairo Tower at Night")
const ART = {
  northCoast:
    'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  eastCairo: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/AUC_New_Campus.jpg',
  westCairo:
    'https://upload.wikimedia.org/wikipedia/commons/1/14/Telecom_Egypt_Smart_Village_building_2.jpg',
  newCapital:
    'https://upload.wikimedia.org/wikipedia/commons/8/81/Iconic_Tower_Egypt%2818-6-2023%29%28cropped%29.jpg',
  sokhna: 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  redSea: 'https://upload.wikimedia.org/wikipedia/commons/9/99/El_Gouna_WV_banner.jpg',
  cairo: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Cairotower.jpg',
} as const

// City slug → curated landmark fallback, keyed ONLY by real slugs
// observed in the City table. Used when City.image is NULL.
const CITY_ART: Record<string, string> = {
  'ras-el-hekma': ART.northCoast,
  'sidi-abdel-rahman': ART.northCoast,
  'al-alamein': ART.northCoast,
  'sidi-heneish': ART.northCoast,
  'al-dabaa': ART.northCoast,
  'el-hamam': ART.northCoast,
  'el-gouna': ART.redSea,
  somabay: ART.redSea,
  makadi: ART.redSea,
  'sahl-hasheesh': ART.redSea,
  'sheikh-zayed': ART.westCairo,
  'new-zayed': ART.westCairo,
  '6th-of-october-city': ART.westCairo,
  'new-cairo': ART.eastCairo,
  cairo: ART.cairo,
  'el-shorouk': ART.eastCairo,
  'new-capital-city': ART.newCapital,
  'ain-sokhna': ART.sokhna,
  'ras-sudr': ART.sokhna,
}

export type RegionDef = {
  key: string
  name: string
  nameArabic: string
  image: string | null
  citySlugs: string[]
}

// Curated umbrella regions. Fixed mapping; membership is by real city
// slug only — never by name keyword matching.
const REGIONS: RegionDef[] = [
  {
    key: 'north-coast',
    name: 'North Coast',
    nameArabic: 'الساحل الشمالي',
    image: ART.northCoast,
    citySlugs: [
      'ras-el-hekma',
      'sidi-abdel-rahman',
      'al-alamein',
      'sidi-heneish',
      'al-dabaa',
      'el-hamam',
    ],
  },
  {
    key: 'red-sea',
    name: 'Red Sea',
    nameArabic: 'البحر الأحمر',
    image: ART.redSea,
    citySlugs: ['el-gouna', 'somabay', 'makadi', 'sahl-hasheesh'],
  },
  {
    key: 'west-cairo',
    name: 'West Cairo',
    nameArabic: 'غرب القاهرة',
    image: ART.westCairo,
    citySlugs: ['sheikh-zayed', 'new-zayed', '6th-of-october-city'],
  },
  {
    key: 'east-cairo',
    name: 'East Cairo',
    nameArabic: 'شرق القاهرة',
    image: ART.eastCairo,
    citySlugs: ['new-cairo', 'cairo', 'el-shorouk'],
  },
  {
    key: 'new-capital',
    name: 'New Administrative Capital',
    nameArabic: 'العاصمة الإدارية الجديدة',
    image: ART.newCapital,
    citySlugs: ['new-capital-city'],
  },
  {
    key: 'sokhna',
    name: 'Ain Sokhna',
    nameArabic: 'العين السخنة',
    image: ART.sokhna,
    citySlugs: ['ain-sokhna', 'ras-sudr'],
  },
]

// ─── Shape ──────────────────────────────────────────────────────────
// GET /api/areas → { areas, regions, unassigned }
//   AreaSummary = {
//     city: { name, nameArabic, nameSlug },
//     projectCount: number,          // active projects in this city
//     minPrice: number | null,       // min non-null startPrice, null when none listed
//     image: string | null,          // City.image, else curated landmark by slug, else null
//     categories: {                  // NearbyPlace counts across the city's
//       schools: number,             // active projects, bucketed by the
//       hospitals: number,           // mapping above
//       transport: number,
//       malls: number,
//       other: number,
//     },
//   }
//   RegionSummary = {
//     key, name, nameArabic,          // curated umbrella region
//     projectCount: number,          // SUM of member cities
//     minPrice: number | null,       // MIN of member cities, null-safe
//     image: string | null,          // curated region art
//     citySlugs: string[],           // member city slugs
//   }
//   unassigned = {
//     count: number,                 // active projects with NULL city
//     projects: [{ id, slug, name }],// capped at 50, shown honestly —
//                                    // never keyword-matched into regions
//   }
// Facts only: raw counts and the observed minimum price. No scores,
// no rankings, no averages presented as advice.

export async function GET() {
  try {
    // Area stats count public projects only — non-approved never shape counts.
    // Bounded: the corpus is ~1.9k public projects today, so take: 5000
    // keeps results identical while capping memory/serialization if the
    // table ever grows unboundedly. Excluded beyond the bound: oldest
    // projects first (orderBy createdAt desc) — newest inventory shapes
    // the counts. NearbyPlace bucketing stays in-JS (substring mapping
    // can't be expressed in-DB); the select stays light (no blobs).
    const projects = await db.project.findMany({
      where: { ...PUBLIC_PROJECT_WHERE, cityId: { not: null } },
      select: {
        startPrice: true,
        city: { select: { name: true, nameArabic: true, nameSlug: true, image: true } },
        nearbyPlaces: { select: { type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    const grouped = new Map<
      string,
      {
        city: { name: string; nameArabic: string | null; nameSlug: string }
        projectCount: number
        minPrice: number | null
        image: string | null
        categories: Record<AreaCategory, number>
      }
    >()

    for (const project of projects) {
      const city = project.city
      if (!city?.name) continue
      const slug = city.nameSlug || city.name.toLowerCase().replace(/\s+/g, '-')

      let entry = grouped.get(slug)
      if (!entry) {
        entry = {
          city: { name: city.name, nameArabic: city.nameArabic ?? null, nameSlug: slug },
          projectCount: 0,
          minPrice: null,
          image: city.image ?? CITY_ART[slug] ?? null,
          categories: { schools: 0, hospitals: 0, transport: 0, malls: 0, other: 0 },
        }
        grouped.set(slug, entry)
      } else if (entry.image === null && city.image) {
        entry.image = city.image
      }

      entry.projectCount += 1

      if (typeof project.startPrice === 'number' && Number.isFinite(project.startPrice)) {
        entry.minPrice = entry.minPrice === null ? project.startPrice : Math.min(entry.minPrice, project.startPrice)
      }

      for (const place of project.nearbyPlaces ?? []) {
        entry.categories[bucketizeNearbyType(place.type)] += 1
      }
    }

    const areas = [...grouped.values()].sort((a, b) => b.projectCount - a.projectCount)

    const regions = REGIONS.map((def) => {
      let projectCount = 0
      let minPrice: number | null = null
      for (const slug of def.citySlugs) {
        const member = grouped.get(slug)
        if (!member) continue
        projectCount += member.projectCount
        if (member.minPrice !== null) {
          minPrice = minPrice === null ? member.minPrice : Math.min(minPrice, member.minPrice)
        }
      }
      return {
        key: def.key,
        name: def.name,
        nameArabic: def.nameArabic,
        projectCount,
        minPrice,
        image: def.image,
        citySlugs: def.citySlugs,
      }
    })

    const unassignedWhere = { ...PUBLIC_PROJECT_WHERE, cityId: null }
    const [unassignedCount, unassignedProjects] = await Promise.all([
      db.project.count({ where: unassignedWhere }),
      db.project.findMany({
        where: unassignedWhere,
        select: { id: true, slug: true, name: true },
        orderBy: { name: 'asc' },
        take: 50,
      }),
    ])

    return NextResponse.json(
      {
        areas,
        regions,
        unassigned: { count: unassignedCount, projects: unassignedProjects },
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Fetch areas error:', error)
    return NextResponse.json({ error: 'Failed to fetch areas' }, { status: 500 })
  }
}
