'use client'

/**
 * Visit-source capture (first-touch attribution).
 *
 * A tiny one-shot module mounted once in the root layout: the FIRST page
 * visit in a session stores utm_* params + referrer + landing path into
 * localStorage. Inquiry surfaces (contact form, unit "احجز معاينة", AI
 * chat lead capture) then read it and attach the attribution string, so
 * GHAYA's team can see WHERE each lead actually came from.
 */
const KEY = 'gh_visit_source'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30-day attribution window

export type VisitSource = {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  referrer?: string
  landing?: string
  savedAt: number
}

export function readVisitSource(): VisitSource | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as VisitSource
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Record first-touch if nothing stored yet. Called once per page load. */
export function captureVisitSource(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(KEY)) return
    const params = new URLSearchParams(window.location.search)
    const utmSource = params.get('utm_source') || undefined
    const utmMedium = params.get('utm_medium') || undefined
    const utmCampaign = params.get('utm_campaign') || undefined
    let referrer: string | undefined
    try {
      if (document.referrer && !document.referrer.includes(window.location.hostname)) {
        referrer = new URL(document.referrer).hostname.slice(0, 100)
      }
    } catch { /* cross-origin oddities — ignore */ }
    if (!utmSource && !utmMedium && !utmCampaign && !referrer) return
    const source: VisitSource = {
      ...(utmSource ? { utmSource } : {}),
      ...(utmMedium ? { utmMedium } : {}),
      ...(utmCampaign ? { utmCampaign } : {}),
      ...(referrer ? { referrer } : {}),
      landing: window.location.pathname.slice(0, 200),
      savedAt: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(source))
  } catch { /* storage unavailable — attribution is a nicety */ }
}

/** Compact human-readable attribution line for Inquiry.source. */
export function visitSourceLine(base = 'WEBSITE'): string {
  const s = readVisitSource()
  if (!s) return base
  const parts = [base]
  if (s.utmSource) parts.push(`utm:${s.utmSource}`)
  if (s.utmMedium) parts.push(`med:${s.utmMedium}`)
  if (s.utmCampaign) parts.push(`cmp:${s.utmCampaign}`.slice(0, 80))
  if (s.referrer) parts.push(`ref:${s.referrer}`)
  if (s.landing) parts.push(`land:${s.landing}`)
  return parts.join('|').slice(0, 300)
}
