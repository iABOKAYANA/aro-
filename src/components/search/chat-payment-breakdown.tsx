'use client'

import { useLanguage } from '@/lib/language-context'

interface ChatPaymentBreakdownProps {
  title: string
  calculation: {
    unitPrice: number
    downPaymentPct: number
    downPaymentAmount: number
    financedAmount: number
    installmentYears: number
    totalInstallments: number
    semiAnnualPayment: number
    monthlyPayment: number
    pricePerSqm: number
    area: number
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

export function ChatPaymentBreakdown({ title, calculation }: ChatPaymentBreakdownProps) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const c = calculation
  const cur = ar ? 'ج.م' : 'EGP'
  return (
    <div className="mt-1 overflow-hidden rounded-2xl border border-gray-100 dark:border-[#262626] dark:bg-[#0A0A0A]">
      {title && <div className="bg-gray-50 px-3 py-1.5 text-[11px] font-semibold text-gray-500 dark:bg-black dark:text-gray-400">{title}</div>}
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 px-3 py-2 min-[480px]:grid-cols-2">
        <Row label={ar ? 'السعر' : 'Price'} value={`${fmt(c.unitPrice)} ${cur}`} accent />
        <Row label={ar ? `مقدم ${c.downPaymentPct}%` : `${c.downPaymentPct}% down`} value={`${fmt(c.downPaymentAmount)} ${cur}`} />
        <Row label={ar ? 'الممول' : 'Financed'} value={`${fmt(c.financedAmount)} ${cur}`} />
        <Row label={ar ? `${c.installmentYears} سنة` : `${c.installmentYears} yrs`} value={ar ? `${fmt(c.semiAnnualPayment)} / نصف سنوي` : `${fmt(c.semiAnnualPayment)} / semi-annual`} highlight />
        <Row label={ar ? 'شهري تقريبي' : 'Approx. monthly'} value={`~${fmt(c.monthlyPayment)} ${cur}`} />
        {c.area > 0 && <Row label={ar ? 'سعر المتر' : 'Per m²'} value={`${fmt(c.pricePerSqm)} ${cur}`} />}
      </div>
    </div>
  )
}

function Row({ label, value, accent, highlight }: { label: string; value: string; accent?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-400 dark:text-gray-400">{label}</span>
      <span className={`text-[11px] font-semibold ${accent ? 'text-[#D4A843]' : highlight ? 'text-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{value}</span>
    </div>
  )
}
