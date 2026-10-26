import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

/**
 * Home-hero showcase — the arched image on the homepage, fully CEO-controlled
 * through SystemSetting (category 'home_hero'). The CEO can:
 *   • swap the arch image (uploaded via /api/ceo/upload — public path or an
 *     https blob URL, both work under the existing next/image remote rules)
 *   • override the floating caption pill (Arabic / English)
 *   • choose the mode: 'none' → image-only showcase exactly like today, or
 *     'project' → the whole arch links into /projects/<slug>
 * Anything left as '' keeps the built-in default so the homepage can never
 * render an empty hero. Stored values are sanitized on read — a poisoned
 * settings row degrades to the default, never breaks the page.
 */

export type HeroShowcaseLinkMode = 'none' | 'project'

export interface HeroShowcase {
  imageUrl: string
  captionAr: string
  captionEn: string
  linkMode: HeroShowcaseLinkMode
  projectSlug: string
  projectNameAr: string
  projectNameEn: string
}

export const HERO_SHOWCASE_CATEGORY = 'home_hero'

export const HERO_SHOWCASE_DEFAULTS: HeroShowcase = {
  imageUrl: '',
  captionAr: '',
  captionEn: '',
  linkMode: 'none',
  projectSlug: '',
  projectNameAr: '',
  projectNameEn: '',
}

export function sanitizeHeroShowcase(input: Partial<
  Record<keyof HeroShowcase, unknown>
>): HeroShowcase {
  const cleanStr = (v: unknown, max: number): string => {
    if (typeof v !== 'string') return ''
    const s = v.trim().slice(0, max)
    return s
  }
  const rawMode = typeof input.linkMode === 'string' ? input.linkMode : ''
  const slug = /^[a-z0-9-]{1,120}$/.test(cleanStr(input.projectSlug, 120))
    ? (cleanStr(input.projectSlug, 120) as string)
    : ''
  // The image must live on our own static path or be an https URL (blob CDN);
  // anything else (data:, javascript:, relative ../) falls back to default.
  const imgRaw = cleanStr(input.imageUrl, 600)
  const imageUrl =
    imgRaw === '' || imgRaw.startsWith('/') || imgRaw.startsWith('https://')
      ? imgRaw
      : ''
  return {
    imageUrl,
    captionAr: cleanStr(input.captionAr, 160),
    captionEn: cleanStr(input.captionEn, 160),
    linkMode:
      rawMode === 'project' && slug !== ''
        ? ('project' as HeroShowcaseLinkMode)
        : ('none' as HeroShowcaseLinkMode),
    projectSlug: rawMode === 'project' ? slug : '',
    projectNameAr: cleanStr(input.projectNameAr, 160),
    projectNameEn: cleanStr(input.projectNameEn, 160),
  }
}

export async function readHeroShowcase(): Promise<HeroShowcase> {
  try {
    const rows = await db.systemSetting.findMany({
      where: { category: HERO_SHOWCASE_CATEGORY },
      select: { key: true, value: true },
    })
    if (!rows.length) return { ...HERO_SHOWCASE_DEFAULTS }
    const raw: Partial<Record<keyof HeroShowcase, unknown>> = {}
    for (const row of rows) {
      try {
        raw[row.key as keyof HeroShowcase] = JSON.parse(row.value)
      } catch {
        raw[row.key as keyof HeroShowcase] = row.value
      }
    }
    const config = sanitizeHeroShowcase(raw)
    // Link-target integrity: if the stored project is no longer publicly
    // visible (unapproved/inactive/price-less — the same rules every public
    // listing follows), the hero falls back to image-only instead of
    // advertising a 404 on the homepage. One indexed lookup on an already
    // force-dynamic page.
    if (config.linkMode === 'project' && config.projectSlug) {
      const project = await db.project.findFirst({
        where: { ...PUBLIC_PROJECT_WHERE, slug: config.projectSlug },
        select: { name: true, nameArabic: true },
      })
      if (!project) {
        return { ...config, linkMode: 'none', projectSlug: '' }
      }
      // Display names always come from the live catalog row — never stale.
      config.projectNameAr = project.nameArabic ?? project.name
      config.projectNameEn = project.name
    }
    return config
  } catch {
    // Settings store unavailable → homepage hero still renders with defaults.
    return { ...HERO_SHOWCASE_DEFAULTS }
  }
}
