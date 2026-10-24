import { describe, expect, it } from 'vitest'
import { projectSearchUnderstanding } from '@/lib/ai-page-search'

const mentions = [
  { project: { id: 'hyde', name: 'Hyde Park' }, score: 10010 },
  { project: { id: 'sodic-east', name: 'SODIC East' }, score: 10009 },
  { project: { id: 'archived-one', name: 'مشروع قديم مسجل بس مش منشور', archived: true }, score: 10010 },
]

describe('projectSearchUnderstanding (عين على /projects)', () => {
  it('resolved public mentions drive the results directly, never the raw phrase', () => {
    const ai = projectSearchUnderstanding('شقة في هايد بارک؟', {}, [mentions[0]])
    expect(ai.ids).toEqual(['hyde'])
    expect(ai.dropQ).toBe(true)
    expect(ai.chips).toEqual([{ field: 'project', value: 'Hyde Park' }])
    expect(ai.patch).toEqual({})
  })

  it('several acknowledged projects list together', () => {
    const ai = projectSearchUnderstanding('هايد بارك وسوديك?', {}, [mentions[0], mentions[1]])
    expect(ai.ids).toEqual(['hyde', 'sodic-east'])
    expect(ai.chips.map((c) => c.value)).toEqual(['Hyde Park', 'SODIC East'])
  })

  it('low-evidence name hits are refused — a unit noun is not a compound', () => {
    // "شاله" inside "Mazarine Chalet Extension" scored as a single partial
    // token: re-ranking all of /projects around it would gaslight the search.
    const ai = projectSearchUnderstanding('شاله في الساحل تحت 10 مليون', {}, [
      { project: { id: 'mazarine', name: 'Mazarine Chalet Extension' }, score: 196 },
    ])
    expect(ai.ids).toBeUndefined()
    expect(ai.chips.every((c) => c.field !== 'project')).toBe(true)
  })

  it('an archived name is not publicly listable — falls through honestly', () => {
    const ai = projectSearchUnderstanding('مشروع قديم مسجل بس مش منشور', {}, [mentions[2]])
    expect(ai.ids).toBeUndefined()
    // No catalog filter words either → nothing claimed, plain keyword search.
    expect(ai.chips).toEqual([])
    expect(ai.dropQ).toBe(false)
  })

  it('colloquial price/location/type is structured like the chat turn', () => {
    const ai = projectSearchUnderstanding('شاليه في الساحل تحت 10 مليون', {}, [])
    expect(ai.dropQ).toBe(true)
    expect(ai.patch.maxPrice).toBe(10_000_000)
    expect(ai.patch.propertyType).toBeTruthy()
    expect(ai.patch.city || ai.patch.governorate).toBeTruthy()
    const fields = ai.chips.map((c) => c.field)
    expect(fields).toContain('maxPrice')
    expect(fields).toContain('propertyType')
  })

  it('URL filter params beat parses: عين refines, never overrides', () => {
    const ai = projectSearchUnderstanding('شقة في التجمع تحت 8 مليون', { propertyType: 'VILLA' }, [])
    expect(ai.patch.propertyType).toBeUndefined()
    expect(ai.patch.maxPrice).toBe(8_000_000)
    expect(ai.chips.every((c) => c.field !== 'propertyType')).toBe(true)
  })

  it("ununderstandable text keeps today's plain keyword behavior", () => {
    const ai = projectSearchUnderstanding('نص مش مفهوم مفيهوش دلالات', {}, [])
    expect(ai.chips).toEqual([])
    expect(ai.patch).toEqual({})
    expect(ai.dropQ).toBe(false)
  })
})
