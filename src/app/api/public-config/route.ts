import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { CTA_STORAGE_KEY } from '@/lib/contact-cta'

// No public config endpoint existed (every SystemSetting reader was
// auth-gated), so this is new — intentionally minimal. ONLY safe,
// whitelisted keys are ever returned: the WhatsApp CTA block + the
// floating call/WhatsApp numbers (`cta.phone` / `cta.whatsapp`, empty until
// the CEO sets them) + the display-only currency info the whole site
// already treats as public.
// Never add secrets here.
export const dynamic = 'force-dynamic'

const CTA_DEFAULTS = {
  enabled: true,
  whatsappNumber: '',
  messageEn: "Hi GHAYA! I'm interested in your properties.",
  messageAr: 'أهلاً غاية! مهتم بالعقارات اللي عندكم.',
  labelEn: 'Chat with us on WhatsApp',
  labelAr: 'كلّمنا على واتساب',
} as const

const CTA_KEYS = ['enabled', 'whatsappNumber', 'messageEn', 'messageAr', 'labelEn', 'labelAr'] as const
const CURRENCY_KEYS = ['currency', 'currencyRates'] as const
const CURRENCY_DEFAULT = 'EGP'
const RATES_DEFAULT = { EGP: 1, USD: 48.5, SAR: 12.9 } as const

function parse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export async function GET() {
  const cta: Record<string, unknown> = { ...CTA_DEFAULTS }
  let currency: unknown = CURRENCY_DEFAULT
  let currencyRates: unknown = { ...RATES_DEFAULT }
  // Floating contact numbers (SystemSetting rows `cta_phone` / `cta_whatsapp`,
  // category 'cta'). '' until the CEO sets them — the public buttons stay
  // hidden while empty.
  let phone = ''
  let whatsapp = ''

  try {
    const rows = await db.systemSetting.findMany({
      where: { key: { in: [...CTA_KEYS, ...CURRENCY_KEYS, CTA_STORAGE_KEY.phone, CTA_STORAGE_KEY.whatsapp] } },
    })
    for (const row of rows) {
      const v = parse(row.value)
      if ((CTA_KEYS as readonly string[]).includes(row.key)) {
        cta[row.key] = v
      } else if (row.key === CTA_STORAGE_KEY.phone && typeof v === 'string') {
        phone = v.trim().slice(0, 20)
      } else if (row.key === CTA_STORAGE_KEY.whatsapp && typeof v === 'string') {
        whatsapp = v.trim().slice(0, 20)
      } else if (row.key === 'currency' && typeof v === 'string') {
        currency = v
      } else if (row.key === 'currencyRates' && v && typeof v === 'object') {
        currencyRates = v
      }
    }
  } catch (e) {
    // Fail-soft: serve defaults rather than breaking every public page.
    console.error('[public-config] read failed, serving defaults:', e)
  }

  // Sanitise: digits-only number, hard caps so a bad stored value can
  // never produce a broken wa.me link.
  const digits = String(cta.whatsappNumber ?? '').replace(/\D/g, '').slice(0, 15)

  return NextResponse.json(
    {
      currency,
      currencyRates,
      cta: {
        enabled: cta.enabled === true,
        whatsappNumber: digits,
        messageEn: String(cta.messageEn ?? CTA_DEFAULTS.messageEn).slice(0, 500),
        messageAr: String(cta.messageAr ?? CTA_DEFAULTS.messageAr).slice(0, 500),
        labelEn: String(cta.labelEn ?? CTA_DEFAULTS.labelEn).slice(0, 120),
        labelAr: String(cta.labelAr ?? CTA_DEFAULTS.labelAr).slice(0, 120),
        // Floating contact CTAs (phone-call button + WhatsApp bubble).
        // Same hidden-until-set rule for both: '' while the CEO hasn't set them.
        phone,
        whatsapp,
      },
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
