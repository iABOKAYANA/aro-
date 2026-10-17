import { describe, expect, it } from 'vitest'
import { translations } from '@/lib/translations'

describe('i18n dictionary parity', () => {
  const enKeys = Object.keys(translations.en)
  const arKeys = Object.keys(translations.ar)

  it('has substantial coverage in both locales', () => {
    expect(enKeys.length).toBeGreaterThan(50)
    expect(arKeys.length).toBeGreaterThan(50)
  })

  it('every English key exists in Arabic', () => {
    const missing = enKeys.filter((k) => !(k in translations.ar))
    expect(missing).toEqual([])
  })

  it('every Arabic key exists in English (no orphans)', () => {
    const orphans = arKeys.filter((k) => !(k in translations.en))
    expect(orphans).toEqual([])
  })

  it('both dicts hold the same key set', () => {
    expect([...arKeys].sort()).toEqual([...enKeys].sort())
  })

  it('no value is an empty string', () => {
    for (const k of enKeys) {
      expect(translations.en[k as keyof typeof translations.en].length).toBeGreaterThan(0)
      expect(translations.ar[k as keyof typeof translations.ar].length).toBeGreaterThan(0)
    }
  })

  it('spot-checks known translations', () => {
    expect(translations.ar['nav.projects']).toBe('المشاريع')
    expect(translations.en['nav.projects']).toBe('Projects')
    expect(translations.ar['common.save']).toBe('حفظ')
  })
})
