'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { useFeatureFlag } from '@/components/flags/flags-provider'
import { BrandLogo } from '@/components/layout/brand-logo'
import type { AppType } from '@/lib/app-type'

const footerLinks = {
  properties: [
    { type: 'apartment', href: '/projects?propertyType=APARTMENT' },
    { type: 'villa', href: '/projects?propertyType=VILLA' },
    { type: 'townhouse', href: '/projects?propertyType=TOWNHOUSE' },
    { type: 'penthouse', href: '/projects?propertyType=PENTHOUSE' },
    { type: 'commercial', href: '/projects?propertyType=COMMERCIAL' },
  ],
  locations: [
    { key: 'new-cairo', label: 'New Cairo', href: '/projects?city=new-cairo' },
    { key: 'sheikh-zayed', label: 'Sheikh Zayed', href: '/projects?city=sheikh-zayed' },
    { key: 'new-capital', label: 'New Capital', href: '/projects?city=new-capital' },
    { key: '6th-october', label: '6th October', href: '/projects?city=6th-october' },
    { key: 'north-coast', label: 'North Coast', href: '/projects?city=north-coast' },
  ],
  company: [
    { key: 'about', href: '/about' },
    { key: 'faq', href: '/faq' },
    { key: 'contact', href: '/contact' },
    { key: 'careers', href: '/careers' },
    { key: 'blog', href: '/blog' },
    { key: 'press', href: '/press' },
    // Makes the comparison tool reachable without having added a project first.
    { key: 'compare', href: '/compare' },
  ],
  tools: [
    { key: 'aiSearch', href: '/ai-tools/search' },
    { key: 'priceEstimator', href: '/ai-tools/price-estimator' },
    { key: 'investmentCalc', href: '/ai-tools/investment' },
    { key: 'prices', href: '/prices' },
    { key: 'buyingGuide', href: '/guides/buying-offplan' },
  ],
  legal: [
    { key: 'privacy', href: '/privacy' },
    { key: 'terms', href: '/terms' },
    { key: 'cookies', href: '/cookies' },
  ],
}

const propertyLabels: Record<string, Record<string, string>> = {
  en: { apartment: 'Apartments', villa: 'Villas', townhouse: 'Townhouses', penthouse: 'Penthouses', commercial: 'Commercial' },
  ar: { apartment: 'شقق', villa: 'فلل', townhouse: 'تاون هاوس', penthouse: 'بنتهاوس', commercial: 'تجاري' },
}

const companyLabels: Record<string, Record<string, string>> = {
  en: { about: 'About Us', faq: 'FAQ', contact: 'Contact', careers: 'Careers', blog: 'Blog', press: 'Press', compare: 'Compare Projects' },
  ar: { about: 'من نحن', faq: 'الأسئلة الشائعة', contact: 'تواصل معنا', careers: 'وظائف', blog: 'المدونة', press: 'الصحافة', compare: 'قارن المشاريع' },
}

const legalLabels: Record<string, Record<string, string>> = {
  en: { privacy: 'Privacy Policy', terms: 'Terms of Service', cookies: 'Cookie Policy' },
  ar: { privacy: 'سياسة الخصوصية', terms: 'شروط الخدمة', cookies: 'سياسة الكوكيز' },
}

const toolLabels: Record<string, Record<string, string>> = {
  en: { aiSearch: 'AI Property Search', priceEstimator: 'Price Estimator', investmentCalc: 'Investment Calculator', prices: 'Price-per-sqm Explorer', buyingGuide: 'Buying Off-plan Safely' },
  ar: { aiSearch: 'بحث بالذكاء', priceEstimator: 'مقيّم الأسعار', investmentCalc: 'حاسبة الاستثمار', prices: 'أسعار المتر بالسوق', buyingGuide: 'دليل الشراء الآمن' },
}

const locationLabels: Record<string, Record<string, string>> = {
  en: { 'new-cairo': 'New Cairo', 'sheikh-zayed': 'Sheikh Zayed', 'new-capital': 'New Capital', '6th-october': '6th October', 'north-coast': 'North Coast' },
  ar: { 'new-cairo': 'القاهرة الجديدة', 'sheikh-zayed': 'الشيخ زايد', 'new-capital': 'العاصمة الإدارية', '6th-october': 'السادس من أكتوبر', 'north-coast': 'الساحل الشمالي' },
}

export function Footer({ appType = 'all' }: { appType?: AppType }) {
  const { lang, t } = useLanguage()
  // Feature switches: tools the CEO turned OFF vanish from the footer too.
  const pricesOn = useFeatureFlag('price_explorer')
  const guideOn = useFeatureFlag('buying_guide')
  const visibleTools = footerLinks.tools.filter((l) => {
    if (l.key === 'prices' && pricesOn === false) return false
    if (l.key === 'buyingGuide' && guideOn === false) return false
    return true
  })

  // Chrome split: the footer holds zero staff entries (all links are public
  // marketing/product pages), so it renders identically on every host — when
  // in doubt KEEP. `appType` is still threaded through (and exposed as
  // data-app-type for host assertions) so a future staff-only footer entry
  // can branch here without re-plumbing. Nothing hidden on 'console'.
  return (
    <footer data-app-type={appType} className="relative overflow-hidden border-t border-estate-gold/25 bg-estate-navy text-white dark:border-[rgba(212,168,67,0.25)] dark:bg-black">
      <div className="mashrabiya pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="container relative px-4 py-10 sm:py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Link href="/" className="mb-4 flex items-center gap-2">
              <BrandLogo wordmarkClassName="[&>span:last-child]:!text-gray-400" />
            </Link>
            <p className="text-sm text-gray-400">
              {lang === 'ar'
                ? 'استكشف المشاريع والوحدات العقارية في مصر، وقارن الأسعار والمساحات وخطط السداد.'
                : 'Explore Egyptian real estate projects and available units, and compare prices, areas, and payment plans.'}
            </p>
          </div>

          <div>
            <h2 className="section-kicker font-display mb-4">{t('footer.properties')}</h2>
            <ul className="space-y-2">
              {footerLinks.properties.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="-my-1 inline-flex min-h-[36px] max-sm:min-h-11 items-center text-sm max-sm:text-base text-gray-400 underline-offset-4 transition-colors hover:text-[#E8C56D] hover:underline hover:decoration-estate-gold/50">
                    {propertyLabels[lang][link.type]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="section-kicker font-display mb-4">{t('footer.locations')}</h2>
            <ul className="space-y-2">
              {footerLinks.locations.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="-my-1 inline-flex min-h-[36px] max-sm:min-h-11 items-center text-sm max-sm:text-base text-gray-400 underline-offset-4 transition-colors hover:text-[#E8C56D] hover:underline hover:decoration-estate-gold/50">
                    {locationLabels[lang][link.key]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="section-kicker font-display mb-4">{t('footer.aiTools')}</h2>
            <ul className="space-y-2">
              {visibleTools.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="-my-1 inline-flex min-h-[36px] max-sm:min-h-11 items-center text-sm max-sm:text-base text-gray-400 underline-offset-4 transition-colors hover:text-[#E8C56D] hover:underline hover:decoration-estate-gold/50">
                    {toolLabels[lang][link.key]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="section-kicker font-display mb-4">{t('footer.company')}</h2>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="-my-1 inline-flex min-h-[36px] max-sm:min-h-11 items-center text-sm max-sm:text-base text-gray-400 underline-offset-4 transition-colors hover:text-[#E8C56D] hover:underline hover:decoration-estate-gold/50">
                {companyLabels[lang][link.key]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <hr className="gold-hairline mt-8" />
        <div className="flex flex-col items-center justify-between gap-4 pt-8 sm:flex-row">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} GHAYA REAL ESTATE. {t('footer.rights')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {footerLinks.legal.map((link) => (
              <Link key={link.href} href={link.href} className="-my-1.5 inline-flex min-h-[36px] max-sm:min-h-11 items-center text-xs max-sm:text-sm text-gray-500 transition-colors hover:text-gray-300">
                {legalLabels[lang][link.key]}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
