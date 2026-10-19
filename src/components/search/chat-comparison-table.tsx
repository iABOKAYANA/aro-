'use client'

import { useLanguage } from '@/lib/language-context'

interface ChatComparisonTableProps {
  title: string
  data: { projects: any[] }
}

export function ChatComparisonTable({ title, data }: ChatComparisonTableProps) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { projects } = data
  if (projects.length < 2) return null

  const rows = [
    { label: 'المطوّر', labelEn: 'Developer', values: projects.map(p => p.developer || 'N/A') },
    { label: 'الموقع', labelEn: 'Location', values: projects.map(p => [p.city, p.district].filter(Boolean).join(' — ') || 'N/A') },
    { label: 'السعر', labelEn: 'Price', values: projects.map(p => {
        const from = p.startPrice ? `${(p.startPrice / 1_000_000).toFixed(1)}M` : null
        if (!from) return 'N/A'
        return p.endPrice && p.endPrice > p.startPrice ? `${from} – ${(p.endPrice / 1_000_000).toFixed(1)}M` : from
      }) },
    { label: 'الأنواع', labelEn: 'Types', values: projects.map(p => (p.propertyTypes || []).slice(0, 2).join(', ').replace(/_/g, ' ') || 'N/A') },
    { label: 'الوحدات', labelEn: 'Units', values: projects.map(p => (p.unitCount || p.totalUnits || 'N/A').toString()) },
    { label: 'الإنجاز', labelEn: 'Completion', values: projects.map(p => p.completionPercent != null ? `${p.completionPercent}%` : 'N/A') },
    { label: 'التسليم', labelEn: 'Delivery', values: projects.map(p => {
        if (!p.deliveryDate) return 'N/A'
        const d = new Date(p.deliveryDate)
        return Number.isNaN(d.getTime()) ? 'N/A' : d.getFullYear().toString()
      }) },
    { label: 'المقدم', labelEn: 'Down Payment', values: projects.map(p => p.downPaymentMin ? `${p.downPaymentMin}%` : 'N/A') },
    { label: 'التقسيط', labelEn: 'Installments', values: projects.map(p => p.installmentYears ? (ar ? `${p.installmentYears} سنة` : `${p.installmentYears} yrs`) : 'N/A') },
    { label: 'خطط السداد', labelEn: 'Plans', values: projects.map(p => p.paymentPlansCount ? (ar ? `${p.paymentPlansCount} خطط` : `${p.paymentPlansCount} plans`) : 'N/A') },
  ]

  return (
    <div className="mt-1 overflow-x-auto rounded-2xl border border-gray-100 [-webkit-overflow-scrolling:touch] dark:border-[#262626] dark:bg-[#0A0A0A]">
      <table className="w-full min-w-[22rem] text-[11px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 dark:border-[#262626] dark:bg-black">
            <th className="px-2.5 py-1.5 text-right font-medium text-gray-400 w-20"></th>
            {projects.map((p, i) => (
              <th key={i} className="px-2.5 py-1.5 text-right font-semibold text-gray-700 dark:text-white">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0 dark:border-[#262626]">
              <td className="px-2.5 py-1.5 text-gray-400 font-medium dark:text-gray-400">{ar ? row.label : row.labelEn}</td>
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
