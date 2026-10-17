import { readSetting } from '@/lib/system-settings'

// ─── Floating contact CTAs (WhatsApp bubble + phone-call button) ───
// Storage: SystemSetting rows `cta_phone` / `cta_whatsapp` (category 'cta'),
// written by the CEO console via POST /api/settings { section: 'cta' }.
// Public shape: GET /api/public-config → { cta: { phone, whatsapp } }.
// Hidden-until-set: both default to '' and the floating buttons render only
// when their number is non-empty.

export const CTA_PHONE_STORAGE_KEY = 'cta_phone'
export const CTA_WHATSAPP_STORAGE_KEY = 'cta_whatsapp'

/** Field → storage-key map (keeps `phone` from colliding with company.phone). */
export const CTA_STORAGE_KEY: Record<'phone' | 'whatsapp', string> = {
  phone: CTA_PHONE_STORAGE_KEY,
  whatsapp: CTA_WHATSAPP_STORAGE_KEY,
}

/**
 * E.164-ish validation: digits, a leading + and spaces only, max 20 chars.
 * Returns the trimmed value, '' for empty (clears the setting), or null when
 * invalid (caller responds 400).
 */
export function normalizeCtaPhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed === '') return ''
  if (trimmed.length > 20) return null
  if (!/^(?=.*\d)[+\d][\d\s]*$/.test(trimmed)) return null
  return trimmed
}

/** `tel:` href for the call button — same strip-spaces pattern as project detail. Null when unset. */
export function toTelHref(phone: string): string | null {
  const t = (phone || '').trim()
  if (!t) return null
  return `tel:${t.replace(/\s+/g, '')}`
}

/** wa.me needs digits only (no +, no spaces). Null when unset. */
export function toWhatsAppHref(number: string): string | null {
  const digits = (number || '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}`
}

/** Fail-soft read — the public site must never break on this. */
export async function readContactCtas(): Promise<{ phone: string; whatsapp: string }> {
  const [phone, whatsapp] = await Promise.all([
    readSetting<string>(CTA_PHONE_STORAGE_KEY, ''),
    readSetting<string>(CTA_WHATSAPP_STORAGE_KEY, ''),
  ])
  return {
    phone: typeof phone === 'string' ? phone.trim() : '',
    whatsapp: typeof whatsapp === 'string' ? whatsapp.trim() : '',
  }
}
