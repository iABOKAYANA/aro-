import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireCEOApi } from '@/lib/permissions'
import { CTA_STORAGE_KEY, normalizeCtaPhone } from '@/lib/contact-cta'

export const dynamic = 'force-dynamic'

const DEFAULTS: Record<string, Record<string, unknown>> = {
  company: {
    name: 'GHAYA',
    email: 'info@estateai.com',
    phone: '+20 100 000 0000',
    address: 'Cairo, Egypt',
    website: 'https://estateai.com',
  },
  platform: {
    currency: 'EGP',
    // Display-only conversion rates: EGP per 1 unit. Drives the navbar
    // currency switcher across the whole site.
    currencyRates: { EGP: 1, USD: 48.5, SAR: 12.9 },
    language: 'English',
    maintenanceMode: false,
    registrationEnabled: true,
  },
  ai: {
    searchEnabled: true,
    recommendationsEnabled: true, // F2: AI Auto-Matching master switch (now wired)
    priceEstimation: false,
    dnaEnabled: true,             // F1: Client DNA extraction from interactions
    anomalyDetectionEnabled: true,// F3: price anomaly scanning
    anomalyThresholdPct: 15,      // F3: % deviation vs comparables to flag
    journeyTrackingEnabled: true, // F6: buyer journey events
    watchAlertsEnabled: true,     // F7: watchlist notifications
    dataFreshnessDays: 90,        // F10: freshness window before STALE
  },
  notifications: {
    email: true,
    sms: false,
    newLead: true,
    newInquiry: true,
    weeklyReport: false,
  },
  // Global WhatsApp CTA bubble (floating button on every public page).
  // whatsappNumber = bare digits (e.g. 201000000000); empty hides the bubble.
  // phone/whatsapp = floating contact numbers (stored as `cta_phone` /
  // `cta_whatsapp` so `phone` never collides with company.phone); empty hides
  // their buttons.
  cta: {
    enabled: true,
    whatsappNumber: '',
    messageEn: "Hi GHAYA! I'm interested in your properties.",
    messageAr: 'أهلاً غاية! مهتم بالعقارات اللي عندكم.',
    labelEn: 'Chat with us on WhatsApp',
    labelAr: 'كلّمنا على واتساب',
    phone: '',
    whatsapp: '',
  },
}

// Whitelist of storable keys per section — anything else is rejected so a
// stray client key can never pollute the settings table. Covers every key
// the site reads (currency/currencyRates/theme-adjacent platform keys, AI
// switches, notification prefs) so legitimate reads never break.
const ALLOWED_KEYS: Record<string, string[]> = {
  company: ['name', 'email', 'phone', 'address', 'website'],
  platform: ['currency', 'currencyRates', 'language', 'theme', 'maintenanceMode', 'registrationEnabled'],
  ai: ['searchEnabled', 'recommendationsEnabled', 'priceEstimation', 'dnaEnabled', 'anomalyDetectionEnabled', 'anomalyThresholdPct', 'journeyTrackingEnabled', 'watchAlertsEnabled', 'dataFreshnessDays'],
  notifications: ['email', 'sms', 'newLead', 'newInquiry', 'weeklyReport'],
  cta: ['enabled', 'whatsappNumber', 'messageEn', 'messageAr', 'labelEn', 'labelAr', 'phone', 'whatsapp'],
}

export async function GET() {
  try {
    const session = await auth()
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const settings = await db.systemSetting.findMany()
    const grouped: Record<string, Record<string, unknown>> = {
      company: { ...DEFAULTS.company },
      platform: { ...DEFAULTS.platform },
      ai: { ...DEFAULTS.ai },
      notifications: { ...DEFAULTS.notifications },
      cta: { ...DEFAULTS.cta },
    }

    // Only whitelisted sections/keys are ever returned. Internal categories
    // (routing, growth, …) must never leak to non-CEO callers — the public
    // currency provider reads data.platform.currencyRates from this shape,
    // which keeps working; anything outside ALLOWED_KEYS is dropped.
    for (const setting of settings) {
      // Floating contact numbers live under storage keys cta_phone /
      // cta_whatsapp (category 'cta') so `phone` never collides with
      // company.phone.
      if (
        setting.category === 'cta' &&
        (setting.key === CTA_STORAGE_KEY.phone || setting.key === CTA_STORAGE_KEY.whatsapp)
      ) {
        let parsed: unknown = setting.value
        try {
          parsed = JSON.parse(setting.value)
        } catch {
          /* keep raw string */
        }
        if (typeof parsed !== 'string') continue
        if (setting.key === CTA_STORAGE_KEY.phone) grouped.cta.phone = parsed
        else grouped.cta.whatsapp = parsed
        continue
      }
      const cat = setting.category || 'platform'
      const allowed = ALLOWED_KEYS[cat]
      if (!allowed || !grouped[cat] || !allowed.includes(setting.key)) continue
      try {
        grouped[cat][setting.key] = JSON.parse(setting.value)
      } catch {
        grouped[cat][setting.key] = setting.value
      }
    }

    return NextResponse.json(grouped)
  } catch (error) {
    console.error('Fetch settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const body = await request.json()
    const { section, data } = body

    if (!section || !data) {
      return NextResponse.json({ error: 'section and data are required' }, { status: 400 })
    }

    const validSections = ['company', 'platform', 'ai', 'notifications', 'cta']
    if (!validSections.includes(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return NextResponse.json({ error: 'data must be an object' }, { status: 400 })
    }

    const allowed = ALLOWED_KEYS[section] ?? []
    const entries = Object.entries(data).filter(([key]) => allowed.includes(key))
    if (entries.length === 0) {
      return NextResponse.json({ error: 'No valid settings keys provided' }, { status: 400 })
    }
    // CTA contact numbers: digits/+/spaces only, max 20 chars — empty clears.
    // 400 otherwise. Only the phone/whatsapp fields are validated this way;
    // the rest of the section keeps the generic size cap below.
    if (section === 'cta') {
      for (const [key, value] of entries) {
        if (
          (key === 'phone' || key === 'whatsapp') &&
          normalizeCtaPhone(value) === null
        ) {
          return NextResponse.json(
            { error: `Invalid cta.${key}: digits, + and spaces only (max 20 chars)` },
            { status: 400 }
          )
        }
      }
    }
    // Cap stored value size so one oversized payload cannot bloat the table.
    for (const [key, value] of entries) {
      let size = 0
      try {
        size = JSON.stringify(value)?.length ?? 0
      } catch {
        return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 })
      }
      if (size > 10_000) {
        return NextResponse.json({ error: `Value for ${key} is too large` }, { status: 400 })
      }
    }

    const upserts = entries.map(([key, value]) => {
      const storeKey =
        section === 'cta' ? (CTA_STORAGE_KEY[key as keyof typeof CTA_STORAGE_KEY] ?? key) : key
      const storeValue =
        section === 'cta' && (key === 'phone' || key === 'whatsapp')
          ? (normalizeCtaPhone(value) as string)
          : value
      return db.systemSetting.upsert({
        where: { key: storeKey },
        update: { value: JSON.stringify(storeValue), category: section },
        create: { key: storeKey, value: JSON.stringify(storeValue), category: section },
      })
    })

    await Promise.all(upserts)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save settings error:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
