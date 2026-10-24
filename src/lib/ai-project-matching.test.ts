import { describe, expect, it } from 'vitest'
import { normalizeProjectName, resolveProjectName, type ProjectNameCandidate } from '@/lib/ai-project-matching'
import { classifySiteIntent } from '@/lib/ai-site-knowledge'

const projects: ProjectNameCandidate[] = [
  { id: 'hyde', slug: 'hyde-park', name: 'Hyde Park', nameArabic: 'هايد بارك' },
  { id: 'mivida', slug: 'mivida-new-cairo', name: 'Mivida New Cairo', nameArabic: 'ميفيدا القاهرة الجديدة' },
  { id: 'cfc', slug: 'cairo-festival-city', name: 'Cairo Festival City', nameArabic: 'كايرو فستيفال سيتي' },
  { id: 'eastown', slug: 'sodic-eastown', name: 'SODIC Eastown New Cairo', nameArabic: 'سوديك إيستاون' },
  { id: 'jirian-a', slug: 'jirian', name: 'Jirian', nameArabic: 'جيريان' },
  { id: 'jirian-b', slug: 'jirian-phase-one', name: 'Jirian', nameArabic: 'جيريان' },
]

describe('AI catalog project-name matching', () => {
  it('normalizes Arabic spelling variants and project slugs', () => {
    expect(normalizeProjectName('هَايْد—بَارْك')).toBe('هايد بارك')
    expect(resolveProjectName('hyde-park', projects).map((m) => m.project.id)).toEqual(['hyde'])
  })

  it('understands colloquial Arabic and English spellings of known projects', () => {
    expect(resolveProjectName('هايد بارك', projects).map((m) => m.project.id)).toEqual(['hyde'])
    expect(resolveProjectName('ميفيدا', projects).map((m) => m.project.id)).toEqual(['mivida'])
    expect(resolveProjectName('Eastown', projects).map((m) => m.project.id)).toEqual(['eastown'])
    expect(resolveProjectName('CFC', projects).map((m) => m.project.id)).toEqual(['cfc'])
  })

  it('tolerates a one-character typo without guessing among tied names', () => {
    expect(resolveProjectName('Mivda', projects).map((m) => m.project.id)).toEqual(['mivida'])
    expect(resolveProjectName('Jirian', projects).map((m) => m.project.id)).toEqual(['jirian-a', 'jirian-b'])
    const similarNames = [...projects, { id: 'mivida-east', slug: 'mivida-east', name: 'Mivida East', nameArabic: null }]
    expect(resolveProjectName('Mivda', similarNames).map((m) => m.project.id)).toContain('mivida-east')
    expect(resolveProjectName('Mivda', similarNames)).toHaveLength(2)
  })

  it('does not turn generic location words into project names', () => {
    expect(resolveProjectName('New Cairo', projects)).toEqual([])
    expect(resolveProjectName('شقة في التجمع', projects)).toEqual([])
  })

  it('strips Arabic question marks so trailing punctuation does not break typo tolerance', () => {
    expect(resolveProjectName('بكام شقة في هايد بارک؟', projects).map((m) => m.project.id)).toEqual(['hyde'])
  })

  it('ranks the bare family name above its suffixed variants', () => {
    const family = [
      ...projects,
      { id: 'hp-terraces', slug: 'hyde-park-terraces', name: 'Hyde Park Terraces', nameArabic: 'هايد بارك تيراسيس' },
      { id: 'hp-parkway', slug: 'parkway-hyde-park', name: 'Parkway Residence - Hyde Park', nameArabic: 'بارك واي ريزيدنس - هايد بارك' },
    ]
    expect(resolveProjectName('بكام شقة في هايد بارک؟', family).map((m) => m.project.id)).toEqual(['hyde'])
  })

  it('routes casual “which is better between…” wording to the compare flow', () => {
    expect(classifySiteIntent('ايه احسن بين هايد بارك وميفيدا؟')).toBe('COMPARISON')
    expect(classifySiteIntent('محتار بين Hyde Park و Mivida')).toBe('COMPARISON')
    expect(classifySiteIntent('ازاي اقارن بين مشروعين؟')).toBe('SITE_HELP')
  })
})
