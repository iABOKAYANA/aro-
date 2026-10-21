import { db } from '@/lib/db'

/**
 * Customer-facing feature flags — the CEO can toggle each one on/off from
 * /ceo/features without a deploy. Stored in SystemSetting (key
 * `feature_flags`, value = JSON {flagKey: boolean}).
 *
 * Contract:
 *  - A flag missing from the stored map defaults to true (ship-on).
 *  - A flag the code doesn't know is ignored.
 *  - Server reads are cached 30s (cheap + fresh enough for toggles).
 */

export const FLAG_DEFS: Array<{ key: string; ar: string; en: string; descAr: string }> = [
  {
    key: 'share_whatsapp',
    ar: 'مشاركة واتساب',
    en: 'WhatsApp share buttons',
    descAr: 'زرار شير واتساب على الوحدات والمشاريع',
  },
  {
    key: 'affordability_units',
    ar: 'قد إيه أقدر أدفع؟',
    en: 'Affordability → real units',
    descAr: 'حاسبة الميزانية تعرض وحدات حقيقية من الكتالوج',
  },
  {
    key: 'inquiry_tracking',
    ar: 'تتبع الاستفسار',
    en: 'Inquiry tracking link',
    descAr: 'لينك تتبع للعميل بعد ما يسيب استفسار',
  },
  {
    key: 'viewing_booking',
    ar: 'حجز معاينة',
    en: 'Viewing booking',
    descAr: 'زرار حجز معاينة على صفحات الوحدات',
  },
  {
    key: 'price_explorer',
    ar: 'مستكشف سعر المتر',
    en: 'Price explorer',
    descAr: 'صفحة أسعار المتر حسب المنطقة والنوع من الداتا الحقيقية',
  },
  {
    key: 'project_qa',
    ar: 'أسئلة وأجوبة المشاريع',
    en: 'Project Q&A',
    descAr: 'الزوار يسألوا عن المشروع والإجابات تنشر بعد مراجعتك',
  },
  {
    key: 'price_alerts',
    ar: 'تنبيهات نزول السعر',
    en: 'Price-drop alerts',
    descAr: 'إيميل للعميل لما سعر وحدة حافظ عليها ينزل',
  },
  {
    key: 'unit_card_pdf',
    ar: 'بطاقة الوحدة (PDF)',
    en: 'Unit one-pager',
    descAr: 'صفحة طباعة أنيقة للوحدة العميل يحملها PDF',
  },
  {
    key: 'nl_search',
    ar: 'البحث بالعربي الطبيعي',
    en: 'Natural-language search',
    descAr: 'صندوق يترجم طلب العميل بالعربي لفلاتر بحث',
  },
  {
    key: 'buying_guide',
    ar: 'دليل الشراء الآمن',
    en: 'Buying-off-plan guide',
    descAr: 'صفحة إرشادات أمان الشراء على الخريطة',
  },
  {
    key: 'pwa_install',
    ar: 'تسطيب التطبيق (PWA)',
    en: 'PWA install banner',
    descAr: 'بانر «أضف للشاشة الرئيسية» للموبايل',
  },
]

export type FeatureFlags = Record<string, boolean>

const SETTING_KEY = 'feature_flags'
const CACHE_MS = 30_000

let cache: { at: number; flags: FeatureFlags } | null = null

export function defaultFlags(): FeatureFlags {
  const flags: FeatureFlags = {}
  for (const d of FLAG_DEFS) flags[d.key] = true
  return flags
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.flags
  let flags = defaultFlags()
  try {
    const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } })
    if (row) {
      const stored = JSON.parse(row.value) as FeatureFlags
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const d of FLAG_DEFS) {
          if (typeof stored[d.key] === 'boolean') flags[d.key] = stored[d.key]
        }
      }
    }
  } catch {
    // fail-open: DB hiccup should never blank the whole site's features
  }
  cache = { at: Date.now(), flags }
  return flags
}

export async function setFeatureFlag(key: string, enabled: boolean): Promise<FeatureFlags> {
  const flags = await getFeatureFlags()
  if (!FLAG_DEFS.some((d) => d.key === key)) {
    throw new Error(`Unknown feature flag: ${key}`)
  }
  flags[key] = enabled
  await db.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(flags) },
    create: { key: SETTING_KEY, value: JSON.stringify(flags), category: 'FEATURES' },
  })
  cache = { at: Date.now(), flags: { ...flags } }
  return flags
}
