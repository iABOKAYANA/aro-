import { describe, it, expect } from 'vitest'
import {
  parseHotspots,
  parseFloors,
  validateModel3DInput,
  MODEL3D_SOURCE_TYPES,
  MODEL3D_KINDS,
} from './models3d'

describe('models3d hotspots validation', () => {
  it('keeps well-formed hotspots and drops garbage positions/labels', () => {
    const raw = [
      { id: 'a', position: [1.5, 2, -3.25], labelAr: 'المعيشة', labelEn: 'Living', area: 30.5, dimsAr: '٥×٦' },
      { id: 'bad-pos', position: ['x', 2, 3], labelAr: 'نقطة', labelEn: 'P' },
      { id: 'bad-label', position: [1, 2, 3] },
      'garbage',
    ]
    const out = parseHotspots(raw)
    expect(out).toHaveLength(1)
    expect(out[0].labelAr).toBe('المعيشة')
    expect(out[0].position[2]).toBeCloseTo(-3.25)
  })
  it('parses JSON strings and survives poisoned JSON', () => {
    expect(parseHotspots(JSON.stringify([{ position: [1, 2, 3], labelAr: 'د' }]))).toHaveLength(1)
    expect(parseHotspots('{invalid json!!!')).toHaveLength(0)
  })
  it('caps the hotspot count', () => {
    const raw = Array.from({ length: 80 }, (_, i) => ({ position: [i, i, i], labelAr: `ها${i}` }))
    expect(parseHotspots(raw)).toHaveLength(40)
  })
})

describe('models3d floors validation', () => {
  it('accepts labeled floors with valid unit statuses only', () => {
    const floors = parseFloors([
      {
        id: 'f1',
        nameAr: 'الدور الأول',
        nameEn: 'First floor',
        y: 3,
        units: [
          { id: 'u1', label: '101', status: 'AVAILABLE', price: 4500000, area: 120, rooms: 2 },
          { id: 'u2', label: '102', status: 'WEIRD' },
          { id: 'u3', label: '', status: 'SOLD' },
        ],
      },
      { position: [1, 2, 3] },
    ])
    expect(floors).toHaveLength(1)
    expect(floors[0].units).toHaveLength(1)
    expect(floors[0].units[0].price).toBe(4500000)
  })
  it('caps floor count', () => {
    const raw = Array.from({ length: 90 }, (_, i) => ({ nameAr: `د${i}` }))
    expect(parseFloors(raw)).toHaveLength(60)
  })
})

describe('models3d input validation', () => {
  it('accepts known source types and kinds', () => {
    expect(validateModel3DInput({ sourceType: 'PROJECT', sourceId: 'abc', kind: 'BUILDING' })).toMatchObject({ sourceType: 'PROJECT', kind: 'BUILDING' })
    expect(MODEL3D_SOURCE_TYPES).toEqual(['PROJECT', 'UNIT'])
    expect(MODEL3D_KINDS).toEqual(['EXTERIOR', 'INTERIOR', 'BUILDING'])
  })
  it('rejects junk source type / kind / missing id', () => {
    expect(validateModel3DInput({ sourceType: 'JSON', sourceId: 'x' }).error).toBeTruthy()
    expect(validateModel3DInput({ sourceType: 'PROJECT', sourceId: 'x', kind: 'TOWER' }).error).toBeTruthy()
    expect(validateModel3DInput({ sourceType: 'PROJECT' }).error).toBeTruthy()
  })
  it('sanitizes labels and fallback image', () => {
    expect(validateModel3DInput({ sourceType: 'UNIT', sourceId: 'u1', labelAr: 'شقة رئيسية' })).toMatchObject({ labelAr: 'شقة رئيسية' })
    expect(validateModel3DInput({ sourceType: 'UNIT', sourceId: 'u1', fallbackImageUrl: 'javascript:alert(1)' })).toMatchObject({ fallbackImageUrl: null })
    expect(validateModel3DInput({ sourceType: 'UNIT', sourceId: 'u1', fallbackImageUrl: '/images/uploads/a.webp' })).toMatchObject({ fallbackImageUrl: '/images/uploads/a.webp' })
  })
})
