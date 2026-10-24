'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { formatEGP } from '@/lib/utils'
import type { ComparisonData } from '@/lib/ai-tools'

interface ChatComparisonTableProps {
  title: string
  data: ComparisonData
}

export function ChatComparisonTable({ title, data }: ChatComparisonTableProps) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { projects } = data
  if (projects.length < 2) return null

  const priceRange = (min: number | null, max: number | null) => {
    if (min == null) return 'N/A'
    if (max != null && max > min) return `${formatEGP(min)} – ${formatEGP(max)}`
    return formatEGP(min)
  }
  const areaRange = (min: number | null, max: number | null) => {
    if (min == null) return 'N/A'
    const first = new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US').format(min)
    if (max != null && max > min) return `${first}–${new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US').format(max)} ${ar ? 'م²' : 'm²'}`
    return `${first} ${ar ? 'م²' : 'm²'}`
  }
  const typeLabelsAr: Record<string, string> = {
    APARTMENT: 'شقق', VILLA: 'فلل', TOWNHOUSE: 'تاون هاوس', PENTHOUSE: 'بنتهاوس',
    STUDIO: 'استوديو', DUPLEX: 'دوبلكس', CHALET: 'شاليه', COMMERCIAL: 'تجاري',
    ADMINISTRATIVE: 'إداري', MEDICAL: 'طبي', LAND: 'أرض',
  }

  const rows = [
    { label: 'المطوّر', labelEn: 'Developer', values: projects.map(p => (ar ? p.developerArabic || p.developer : p.developer) || 'N/A') },
    { label: 'الموقع', labelEn: 'Location', values: projects.map(p => [ar ? p.cityArabic || p.city : p.city, ar ? p.districtArabic || p.district : p.district].filter(Boolean).join(' — ') || 'N/A') },
    { label: 'السعر المسجل للمشروع', labelEn: 'Recorded project price', values: projects.map(p => priceRange(p.startPrice, p.endPrice)) },
    { label: 'الأنواع', labelEn: 'Types', values: projects.map(p => (p.propertyTypes || []).slice(0, 3).map((type) => ar ? typeLabelsAr[type] || type.replace(/_/g, ' ') : type.replace(/_/g, ' ')).join('، ') || 'N/A') },
    { label: 'وحدات متاحة مسجلة', labelEn: 'Priced available units', values: projects.map(p => p.availableUnitCount.toLocaleString(ar ? 'ar-EG' : 'en-US')) },
    { label: 'أسعار الوحدات المتاحة', labelEn: 'Available unit prices', values: projects.map(p => priceRange(p.availablePriceMin, p.availablePriceMax)) },
    { label: 'مساحة الوحدات المتاحة', labelEn: 'Available unit areas', values: projects.map(p => areaRange(p.availableAreaMin, p.availableAreaMax)) },
    { label: 'الإنجاز', labelEn: 'Completion', values: projects.map(p => p.completionPercent != null ? `${p.completionPercent}%` : 'N/A') },
    { label: 'مواعيد التسليم المسجلة', labelEn: 'Recorded delivery dates', values: projects.map(p => {
        const dates = p.deliveryDates?.length ? p.deliveryDates : (p.deliveryDate ? [p.deliveryDate] : [])
        const years = [...new Set(dates.map((value) => new Date(value).getFullYear()).filter(Number.isFinite))]
        return years.length ? years.slice(0, 3).join(' / ') : 'N/A'
      }) },
    { label: 'المقدم', labelEn: 'Down Payment', values: projects.map(p => p.downPaymentMin ? `${p.downPaymentMin}%` : 'N/A') },
    { label: 'التقسيط', labelEn: 'Installments', values: projects.map(p => p.installmentYears ? (ar ? `${p.installmentYears} سنة` : `${p.installmentYears} yrs`) : 'N/A') },
    { label: 'خطط السداد النشطة', labelEn: 'Active payment plans', values: projects.map(p => {
      if (!p.paymentPlans.length) return 'N/A'
      return p.paymentPlans.slice(0, 2).map((plan) => {
        const planName = ar ? plan.nameArabic || plan.name : plan.name
        const years = ar ? `${plan.installmentYears} سنة` : `${plan.installmentYears} yrs`
        const cash = plan.cashDiscount ? (ar ? ` · خصم كاش ${plan.cashDiscount}%` : ` · ${plan.cashDiscount}% cash discount`) : ''
        return `${planName}: ${plan.downPaymentPct}% / ${years}${cash}`
      }).join(' | ')
    }) },
  ]

  return (
    <div className="mt-1 overflow-x-auto rounded-2xl border border-gray-100 [-webkit-overflow-scrolling:touch] dark:border-[#262626] dark:bg-[#0A0A0A]">
      <table className="w-full min-w-[22rem] text-[11px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 dark:border-[#262626] dark:bg-black">
            <th scope="col" aria-label={ar ? 'خاصية المقارنة' : 'Comparison field'} className="px-2.5 py-1.5 text-right font-medium text-gray-400 w-20"></th>
            {projects.map((p, i) => {
              const name = ar && p.nameArabic ? p.nameArabic : p.name
              return (
                <th key={i} scope="col" className="px-2.5 py-1.5 text-right font-semibold text-gray-700 dark:text-white">
                  <Link href={`/projects/${p.slug}`} className="text-estate-gold underline-offset-2 hover:underline">{name}</Link>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0 dark:border-[#262626]">
              <th scope="row" className="px-2.5 py-1.5 text-right text-gray-400 font-medium dark:text-gray-400">{ar ? row.label : row.labelEn}</th>
              {row.values.map((val, j) => (
                <td key={j} className="px-2.5 py-1.5 text-gray-600 dark:text-gray-300">{val}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
