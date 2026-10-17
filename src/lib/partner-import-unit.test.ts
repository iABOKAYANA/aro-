/**
 * Partner importer — UNIT destination (target:'unit') regression tests.
 *
 * Guarantees covered:
 *  1. unit feed row maps onto a Unit row (documented feed shape)
 *  2. strict required set: a row missing project/unitType/listingType/area/
 *     price is an ERROR row — never a partial row
 *  3. preview (sample + feed) reports unknown project slugs with ZERO
 *     writes — read-only findMany lookups, no project/unit/user creates
 *  4. import writes Unit rows only onto an EXISTING project — unknown slug
 *     rejects the row, projects are never created implicitly
 *  5. project target stays the default and behaves exactly as before
 *
 * DB is fully mocked — no live probes, no writes, no network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    project: { findMany: vi.fn(), create: vi.fn() },
    unit: { findMany: vi.fn(), create: vi.fn() },
    developerProfile: { findFirst: vi.fn() },
    user: { create: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import {
  DEFAULT_FIELD_MAP,
  PARTNER_SAMPLE_ROWS,
  UNIT_DEFAULT_FIELD_MAP,
  importPartnerUnitRows,
  mapPartnerRow,
  previewPartnerFeed,
  previewPartnerSample,
} from '@/lib/partner-import'

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as unknown as ReturnType<typeof vi.fn>

// Exact unit feed row shape (see partner-import.ts header).
const unitRow: Record<string, unknown> = {
  project: 'palm-oasis-new-cairo',
  name: 'A-101 Apartment',
  unitType: 'Apartment',
  listingType: 'SALE',
  area: '145',
  price: '8,500,000',
  bedrooms: '3',
  bathrooms: '2',
  unitNumber: 'A-101',
  floor: '1',
  status: 'reserved',
  images: 'https://example.com/a.jpg|https://example.com/b.jpg',
}

beforeEach(() => {
  vi.clearAllMocks()
  asMock(db.project.findMany).mockResolvedValue([])
  asMock(db.unit.findMany).mockResolvedValue([])
  asMock(db.unit.create).mockResolvedValue({})
  asMock(db.project.create).mockResolvedValue({})
})

describe('partner-import target:unit', () => {
  it('maps a feed row onto a Unit row (defaults status to AVAILABLE)', () => {
    const m = mapPartnerRow(unitRow, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(m.error).toBeNull()
    expect(m.warnings).toEqual([])
    expect(m.row).toMatchObject({
      name: 'A-101 Apartment',
      project: 'palm-oasis-new-cairo',
      unitType: 'Apartment', // pass-through trimmed, no vocab coercion
      listingType: 'SALE',
      area: 145, // feed column `area` → our numeric size → Unit.area
      price: 8500000,
      bedrooms: 3,
      bathrooms: 2,
      unitNumber: 'A-101',
      floor: 1,
      finishingType: null,
      status: 'RESERVED',
      images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    })

    // status omitted → AVAILABLE (Unit schema default)
    const { status: _omitted, ...withoutStatus } = unitRow
    void _omitted
    const def = mapPartnerRow(withoutStatus, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(def.error).toBeNull()
    expect(def.row?.status).toBe('AVAILABLE')
  })

  it('rejects rows missing a required field (project/unitType/listingType/area/price)', () => {
    const project = mapPartnerRow({ ...unitRow, project: '' }, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(project.row).toBeNull()
    expect(project.error).toContain('missing required "project"')

    const type = mapPartnerRow({ ...unitRow, unitType: '  ' }, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(type.row).toBeNull()
    expect(type.error).toContain('missing required "unitType"')

    // no implicit SALE default: schema vocab is free-form with no @default
    const listing = mapPartnerRow({ ...unitRow, listingType: '' }, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(listing.row).toBeNull()
    expect(listing.error).toContain('missing required "listingType"')

    const area = mapPartnerRow({ ...unitRow, area: '' }, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(area.row).toBeNull()
    expect(area.error).toContain('missing required "area"')

    const price = mapPartnerRow({ ...unitRow, price: 'not-a-price' }, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(price.row).toBeNull()
    expect(price.error).toContain('invalid "price"')
  })

  it('preview reports unknown project slugs with zero writes (sample + feed)', async () => {
    const preview = await previewPartnerSample(UNIT_DEFAULT_FIELD_MAP, 20, 'unit')
    expect(preview.target).toBe('unit')
    expect(preview.rows).toHaveLength(5)

    // rows 0,1,3 map fine but reference fake slugs → row errors
    expect(preview.rows[0].error).toContain('unknown project slug "sample-palm-oasis"')
    expect(preview.rows[0].mapped).toBeNull()
    expect(preview.rows[1].error).toContain('unknown project slug')
    expect(preview.rows[3].error).toContain('unknown project slug')
    // rows 2 (no listingType) and 4 (no area) fail mapping before any lookup
    expect(preview.rows[2].error).toContain('missing required "listingType"')
    expect(preview.rows[4].error).toContain('missing required "area"')

    // read-only guarantee: one project lookup, NO creates anywhere
    expect(db.project.findMany).toHaveBeenCalledTimes(1)
    expect(db.project.create).not.toHaveBeenCalled()
    expect(db.unit.create).not.toHaveBeenCalled()
    expect(db.user.create).not.toHaveBeenCalled()
    expect(db.developerProfile.findFirst).not.toHaveBeenCalled()

    // live-feed preview path (stubbed fetch, still read-only)
    const csv = 'project,name,unitType,listingType,area,price\npalm-oasis,A-1,Apartment,SALE,120,4000000\n'
    const fetchMock = vi.fn(async () => new Response(csv, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const feedPreview = await previewPartnerFeed(
        { kind: 'csv', url: 'https://feed.example.com/units.csv', auth: null, dataPath: '', fieldMap: {} },
        { limit: 20, fieldMapOverride: UNIT_DEFAULT_FIELD_MAP, target: 'unit' }
      )
      expect(feedPreview.target).toBe('unit')
      expect(feedPreview.rows).toHaveLength(1)
      expect(feedPreview.rows[0].error).toContain('unknown project slug "palm-oasis"')
      expect(feedPreview.rows[0].mapped).toBeNull()
      expect(db.unit.create).not.toHaveBeenCalled()
      expect(db.project.create).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('import writes units only onto an existing project (never creates one)', async () => {
    const mapped = mapPartnerRow(unitRow, UNIT_DEFAULT_FIELD_MAP, 'unit')
    expect(mapped.error).toBeNull()
    const row = mapped.row!

    // unknown slug → row error, zero writes
    const rejected = await importPartnerUnitRows([row])
    expect(rejected.imported).toEqual([])
    expect(rejected.errors).toHaveLength(1)
    expect(rejected.errors[0].error).toContain('unknown project slug "palm-oasis-new-cairo"')
    expect(db.unit.create).not.toHaveBeenCalled()
    expect(db.project.create).not.toHaveBeenCalled()
    expect(db.user.create).not.toHaveBeenCalled()

    // existing project → Unit rows created on it (duplicate base → -2)
    asMock(db.project.findMany).mockResolvedValue([{ id: 'proj_1', slug: 'palm-oasis-new-cairo' }])
    asMock(db.unit.create).mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'unit_1',
      ...args.data,
    }))
    const ok = await importPartnerUnitRows([row, row])
    expect(ok.errors).toEqual([])
    expect(ok.imported).toEqual([
      { slug: 'palm-oasis-new-cairo-a-101-apartment', name: 'A-101 Apartment' },
      { slug: 'palm-oasis-new-cairo-a-101-apartment-2', name: 'A-101 Apartment' },
    ])

    const created = asMock(db.unit.create).mock.calls.at(-1)?.[0]?.data as Record<string, unknown>
    expect(created).toMatchObject({
      projectId: 'proj_1',
      isSample: false,
      unitType: 'Apartment',
      listingType: 'SALE',
      status: 'RESERVED', // feed value, uppercased (AVAILABLE default tested above)
      area: 145,
      price: 8500000,
    })
    expect(JSON.parse(created.gallery as string)).toEqual([
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
    ])
    // no implicit project/developer/user creation in unit mode
    expect(db.project.create).not.toHaveBeenCalled()
    expect(db.developerProfile.findFirst).not.toHaveBeenCalled()
  })
})

describe('partner-import target:project (legacy default)', () => {
  it('is unchanged when target is omitted — same row, same warnings, no db access', async () => {
    const legacy = mapPartnerRow(PARTNER_SAMPLE_ROWS[0], DEFAULT_FIELD_MAP)
    expect(legacy.error).toBeNull()
    expect(legacy.warnings).toEqual([])
    expect(legacy.row).toEqual({
      name: 'SAMPLE Project Palm Oasis',
      area: 'SAMPLE District, New Cairo',
      price: 8500000,
      type: 'APARTMENT',
      bedrooms: 3,
      size: 145,
      images: ['https://example.com/sample1a.jpg', 'https://example.com/sample1b.jpg'],
      status: 'AVAILABLE',
    })
    // new unit-only fields never leak into project-mode warnings
    for (const f of ['"project"', '"bathrooms"', '"unitType"', '"listingType"']) {
      expect(legacy.warnings.some((w) => w.includes(f))).toBe(false)
    }

    const implicit = await previewPartnerSample(DEFAULT_FIELD_MAP)
    const explicit = await previewPartnerSample(DEFAULT_FIELD_MAP, PARTNER_SAMPLE_ROWS.length, 'project')
    expect(implicit.target).toBe('project')
    expect(implicit.rows).toEqual(explicit.rows)
    expect(implicit.rows).toHaveLength(5)
    expect(implicit.rows[0].error).toBeNull()
    // legacy behaviour: an unparseable price is a WARNING + null, not an error
    expect(implicit.rows[4].error).toBeNull()
    expect(implicit.rows[4].warnings.some((w) => w.includes('unparseable "price"'))).toBe(true)

    // project-mode preview performs no db reads at all
    expect(db.project.findMany).not.toHaveBeenCalled()
    expect(db.unit.findMany).not.toHaveBeenCalled()
  })
})
