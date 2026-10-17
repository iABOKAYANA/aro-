'use client'

import { useMemo, useState } from 'react'
import { Landmark, Percent, Calendar, Wallet, Info } from 'lucide-react'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

type Inputs = {
  price: number
  downPct: number
  years: number
  rate: number
  feesPct: number
  devDownPct: number
  devYears: number
}

/** Annuity formula — fixed monthly payment for a reducing-balance loan. */
export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = Math.round(years * 12)
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

export function amortisation(
  principal: number,
  annualRatePct: number,
  years: number
): { period: number; payment: number; interest: number; principal: number; balance: number }[] {
  const rows: ReturnType<typeof amortisation> = []
  const r = annualRatePct / 100 / 12
  const n = Math.max(1, Math.round(years * 12))
  const pay = monthlyPayment(principal, annualRatePct, years)
  let balance = principal
  for (let i = 1; i <= n && balance > 0.005; i++) {
    const interest = balance * r
    const toPrincipal = Math.min(pay - interest, balance)
    balance = Math.max(0, balance - toPrincipal)
    rows.push({ period: i, payment: interest + toPrincipal, interest, principal: toPrincipal, balance })
  }
  return rows
}

type CbeKey = 'free' | 'cbe3' | 'cbe8'

/** CBE mortgage-initiative shortcuts — rate+term only, the annuity math below is untouched. */
const CBE_PRESETS: { key: CbeKey; label: string; labelAr: string; rate: number | null; years: number | null; hint: string; hintAr: string }[] = [
  { key: 'free', label: 'Custom', labelAr: 'مخصص', rate: null, years: null, hint: 'Your own rate and term — edit freely.', hintAr: 'فايدتك ومدتك اللي انت كاتبها — عدّل براحتك.' },
  { key: 'cbe3', label: '3% · 30 yrs', labelAr: '3% · 30 سنة', rate: 3, years: 30, hint: '3% reducing for low income, within the initiative price caps — indicative terms, your bank confirms.', hintAr: 'مبادرة الـ3% لمحدودي الدخل لحد سعر وشروط المبادرة — شروط استرشادية، البنك يأكد.' },
  { key: 'cbe8', label: '8% · 25 yrs', labelAr: '8% · 25 سنة', rate: 8, years: 25, hint: '8% reducing for middle income, within the initiative price caps — indicative terms, your bank confirms.', hintAr: 'مبادرة الـ8% لمتوسطي الدخل لحد سعر وشروط المبادرة — شروط استرشادية، البنك يأكد.' },
]

export default function MortgageCalculator() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [price, setPrice] = useState(8_500_000)
  const [downPct, setDownPct] = useState(20)
  const [years, setYears] = useState(15)
  const [rate, setRate] = useState(19)
  const [feesPct, setFeesPct] = useState(2)
  const [devDownPct, setDevDownPct] = useState(10)
  const [devYears, setDevYears] = useState(8)
  const [showSchedule, setShowSchedule] = useState(false)
  // One-tap CBE initiative shortcut — 'free' is the current custom-input behaviour.
  const [cbe, setCbe] = useState<CbeKey>('free')

  const activeCbe = CBE_PRESETS.find((p) => p.key === cbe) ?? CBE_PRESETS[0]

  const calc = useMemo(() => {
    const p = Math.max(0, price)
    const down = p * (downPct / 100)
    const loan = Math.max(0, p - down)
    const fees = loan * (feesPct / 100)
    const monthly = monthlyPayment(loan, rate, years)
    const totalPaid = monthly * Math.round(years * 12)
    const totalInterest = Math.max(0, totalPaid - loan)
    const totalCost = down + fees + totalPaid

    const devDown = p * (devDownPct / 100)
    const devRemaining = Math.max(0, p - devDown)
    const devMonthly = devYears > 0 ? devRemaining / (devYears * 12) : 0
    const devTotal = devDown + devRemaining

    const schedule = loan > 0 && years > 0 ? amortisation(loan, rate, years) : []

    return {
      down,
      loan,
      fees,
      monthly,
      totalPaid,
      totalInterest,
      totalCost,
      devDown,
      devMonthly,
      devTotal,
      ltv: p > 0 ? (loan / p) * 100 : 0,
      schedule,
      bankTotal: down + fees + totalPaid,
      cashTotal: p,
    }
  }, [price, downPct, years, rate, feesPct, devDownPct, devYears])

  const cheapest: 'cash' | 'developer' | 'bank' =
    calc.cashTotal <= calc.devTotal && calc.cashTotal <= calc.bankTotal
      ? 'cash'
      : calc.devTotal <= calc.bankTotal
        ? 'developer'
        : 'bank'

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* ── Inputs ─────────────────────────────────── */}
      <div className="space-y-6">
        <Field
          label={ar ? 'سعر العقار' : 'Property price'}
          icon={<Wallet className="h-4 w-4" />}
          value={price}
          onChange={setPrice}
          min={100_000}
          max={200_000_000}
          step={100_000}
          format={(v) => formatEGP(v)}
        />

        <Slider label={ar ? 'المقدم' : 'Down payment'} value={downPct} onChange={setDownPct} min={0} max={90} suffix="%" />

        <Slider label={ar ? 'مدة القرض' : 'Loan term'} value={years} onChange={(v) => { setYears(v); setCbe('free') }} min={1} max={30} suffix={ar ? ' سنة' : ' yrs'} />

        <div>
          <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label={ar ? 'مبادرات البنك المركزي' : 'Central Bank initiatives'}>
            {CBE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setCbe(preset.key)
                  if (preset.rate !== null) setRate(preset.rate)
                  if (preset.years !== null) setYears(preset.years)
                }}
                aria-pressed={cbe === preset.key}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  cbe === preset.key
                    ? 'bg-estate-gold text-[#0F1A2C]'
                    : 'border border-white/10 dark:border-[#262626] bg-white/[0.04] dark:bg-[#0A0A0A] text-gray-300 hover:border-estate-gold/40'
                }`}
              >
                {ar ? preset.labelAr : preset.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">{ar ? activeCbe.hintAr : activeCbe.hint}</p>
        </div>

        <Slider
          label={ar ? 'الفايدة السنوية' : 'Annual interest rate'}
          icon={<Percent className="h-3.5 w-3.5" />}
          value={rate}
          onChange={(v) => { setRate(v); setCbe('free') }}
          min={0}
          max={35}
          step={0.25}
          suffix="%"
        />

        <Slider label={ar ? 'مصاريف القرض (إدارية + تأمين)' : 'Loan fees (admin + insurance)'} value={feesPct} onChange={setFeesPct} min={0} max={10} step={0.25} suffix="%" />

        <div className="rounded-2xl border border-white/10 dark:border-[#262626] bg-white/[0.04] dark:bg-[#0A0A0A] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-estate-gold">
            <Landmark className="h-3.5 w-3.5" /> {ar ? 'خطة المطور (0% فايدة)' : 'Developer plan (0% interest)'}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Slider label={ar ? 'المقدم' : 'Down'} value={devDownPct} onChange={setDevDownPct} min={0} max={90} suffix="%" />
            <Slider label={ar ? 'المدة' : 'Over'} value={devYears} onChange={setDevYears} min={1} max={15} suffix={ar ? ' سنة' : ' yrs'} />
          </div>
        </div>
      </div>

      {/* ── Results ────────────────────────────────── */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-estate-gold/20 bg-estate-gold/[0.07] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-estate-gold">
            <Landmark className="h-3.5 w-3.5" /> {ar ? 'مبادرات البنك المركزي للتمويل العقاري' : 'Central Bank mortgage initiatives'}
          </div>
          <p className="text-xs leading-relaxed text-gray-300">
            {ar
              ? 'مبادرة الـ3% المتناقصة على 30 سنة لشقق محدودي الدخل اللي داخلة في المبادرة.'
              : '3% reducing rate over 30 years for low-income units inside the initiative.'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-300">
            {ar
              ? 'ومبادرة الـ8% المتناقصة على 25 سنة لشقق متوسطي الدخل اللي داخلة في المبادرة.'
              : '8% reducing rate over 25 years for middle-income units inside the initiative.'}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-gray-400">
            {ar
              ? 'شروط استرشادية — اسأل البنك عن الشروط النهائية.'
              : 'Indicative terms — ask your bank about the final conditions.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={ar ? 'القسط الشهري' : 'Monthly installment'} value={formatEGP(Math.round(calc.monthly))} accent />
          <Stat label={ar ? 'إجمالي الفوايد' : 'Total interest'} value={formatEGP(Math.round(calc.totalInterest))} />
          <Stat label={ar ? 'القرض لسعر الشقة' : 'Loan-to-value'} value={`${calc.ltv.toFixed(0)}%`} />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 dark:border-[#262626]">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-white/[0.05] text-start text-xs uppercase tracking-wide text-gray-400 dark:bg-[#0A0A0A]">
              <tr>
                <th className="px-3 py-3 font-medium sm:px-4">{ar ? 'الاختيار' : 'Option'}</th>
                <th className="px-3 py-3 font-medium sm:px-4">{ar ? 'المدفوع مقدمًا' : 'Upfront'}</th>
                <th className="px-3 py-3 font-medium sm:px-4">{ar ? 'الشهري' : 'Monthly'}</th>
                <th className="px-3 py-3 text-end font-medium sm:px-4">{ar ? 'إجمالي التكلفة' : 'Total cost'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <Row
                name={ar ? 'شراء كاش' : 'Cash purchase'}
                note={ar ? 'ادفع السعر كله' : 'Pay the full price'}
                upfront={formatEGP(0)}
                monthly="—"
                total={formatEGP(Math.round(calc.cashTotal))}
                best={cheapest === 'cash'}
              />
              <Row
                name={ar ? 'تقسيط المطور' : 'Developer plan'}
                note={ar ? `مقدم ${devDownPct}% على ${devYears} سنين، 0% فايدة` : `${devDownPct}% down over ${devYears} years, 0% interest`}
                upfront={formatEGP(Math.round(calc.devDown))}
                monthly={formatEGP(Math.round(calc.devMonthly))}
                total={formatEGP(Math.round(calc.devTotal))}
                best={cheapest === 'developer'}
              />
              <Row
                name={ar ? 'قرض البنك' : 'Bank mortgage'}
                note={ar ? `مقدم ${downPct}% · فايدة ${rate}% · ${years} سنة` : `${downPct}% down · ${rate}% · ${years} years`}
                upfront={formatEGP(Math.round(calc.down + calc.fees))}
                monthly={formatEGP(Math.round(calc.monthly))}
                total={formatEGP(Math.round(calc.bankTotal))}
                best={cheapest === 'bank'}
              />
            </tbody>
          </table>
        </div>

        <p className="flex items-start gap-2 rounded-2xl border border-estate-gold/20 bg-estate-gold/[0.07] px-4 py-3 text-xs leading-relaxed text-gray-300">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-estate-gold" />
          {ar
            ? 'أرقام استرشادية بس — الفايدة والتأمين والمصاريف بتختلف من بنك للتاني ومن عميل للتاني. أكد العرض النهائي مع البنك قبل ما تمضي.'
            : 'Estimates only — bank rates, insurance and fees vary by lender and by applicant. Confirm the final offer with your bank before signing.'}
        </p>

        <div>
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-estate-gold transition-colors hover:text-estate-gold/80"
          >
            <Calendar className="h-4 w-4" />
            {ar ? (showSchedule ? 'اخفي جدول الأقساط' : 'اعرض جدول الأقساط') : <>{showSchedule ? 'Hide' : 'Show'} amortisation schedule</>}
          </button>

          {showSchedule && (
            <div className="mt-3 max-h-96 overflow-auto rounded-2xl border border-white/10 dark:border-[#262626]">
              <table className="w-full min-w-[30rem] text-xs">
                <thead className="sticky top-0 bg-[#101a30] text-start uppercase text-gray-400 dark:bg-black">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">{ar ? 'القسط' : 'Payment'}</th>
                    <th className="px-3 py-2 font-medium">{ar ? 'الفايدة' : 'Interest'}</th>
                    <th className="px-3 py-2 font-medium">{ar ? 'الأصل' : 'Principal'}</th>
                    <th className="px-3 py-2 text-end font-medium">{ar ? 'الرصيد' : 'Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {calc.schedule.map((row) => (
                    <tr key={row.period}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-gray-400">{row.period}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{formatEGP(Math.round(row.payment))}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-amber-400">{formatEGP(Math.round(row.interest))}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-emerald-400">{formatEGP(Math.round(row.principal))}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-end text-gray-300">{formatEGP(Math.round(row.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 dark:border-[#262626] bg-white/[0.04] dark:bg-[#0A0A0A] p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? 'text-estate-gold' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function Row({
  name,
  note,
  upfront,
  monthly,
  total,
  best,
}: {
  name: string
  note: string
  upfront: string
  monthly: string
  total: string
  best?: boolean
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  return (
    <tr className={best ? 'bg-estate-gold/[0.06]' : 'bg-white/[0.02]'}>
      <td className="px-3 py-3 sm:px-4">
        <p className="font-medium text-white">
          {name} {best && <span className="ms-1 rounded-full bg-estate-gold px-1.5 py-0.5 text-[10px] font-bold text-[#0F1A2C]">{ar ? 'الأرخص' : 'CHEAPEST'}</span>}
        </p>
        <p className="text-xs text-gray-500">{note}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-gray-300 sm:px-4">{upfront}</td>
      <td className="whitespace-nowrap px-3 py-3 text-gray-300 sm:px-4">{monthly}</td>
      <td className="whitespace-nowrap px-3 py-3 text-end font-semibold text-white sm:px-4">{total}</td>
    </tr>
  )
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  icon,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
  icon?: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          {icon}
          {label}
        </label>
        <span className="text-sm font-semibold text-white">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-estate-gold"
      />
    </div>
  )
}

function Field({
  label,
  icon,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string
  icon: React.ReactNode
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format: (v: number) => string
}) {
  return (
    <div className="rounded-2xl border border-white/10 dark:border-[#262626] bg-white/[0.04] dark:bg-[#0A0A0A] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
        <span className="text-estate-gold">{icon}</span>
        {label}
      </div>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-lg font-semibold text-gray-900 focus:border-estate-gold-dark focus:outline-none dark:border-[#262626] dark:bg-black/30 dark:text-white dark:focus:border-estate-gold/60"
      />
      <p className="mt-1.5 text-xs text-gray-500">{format(value)}</p>
    </div>
  )
}
