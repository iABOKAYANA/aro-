'use client'

import dynamic from 'next/dynamic'
import { Calculator, Landmark, TrendingUp } from 'lucide-react'
// Amortisation calculator + schedule table splits out; header/info cards
// above stay in the initial chunk, calculator still SSR'd by default.
const MortgageCalculator = dynamic(() => import('@/components/tools/mortgage-calculator'))
import { useLanguage } from '@/lib/language-context'

export default function MortgageView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center sm:mb-10">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
            <Calculator className="h-3 w-3" /> {ar ? 'التمويل' : 'Financing'}
          </span>
          <h1 className="text-2xl font-bold sm:text-4xl">{ar ? 'حاسبة التمويل والأقساط' : 'Mortgage & Installment Calculator'}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {ar
              ? 'شوف كل طريق للتملك بيكلف كام بجد — قرض البنك ولا تقسيط المطور ولا الكاش — وادخل في تفاصيل كل قسط في جدول الأقساط.'
              : 'See what each route to ownership really costs — bank loan, developer plan, or cash — and drill into every payment of the amortisation schedule.'}
          </p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <InfoCard
            icon={<Landmark className="h-5 w-5" />}
            title={ar ? 'قسط متناقص' : 'Reducing balance'}
            body={ar ? 'حسبة قسط حقيقية مش تقدير فايدة ثابتة — الفايدة بتقل كل ما أصل القرض بيقل.' : 'Real annuity math, not a flat-rate estimate — interest shrinks as the principal does.'}
          />
          <InfoCard
            icon={<TrendingUp className="h-5 w-5" />}
            title={ar ? 'مقارنة جنب بعض' : 'Side-by-side'}
            body={ar ? 'الكاش قصاد تقسيط المطور قصاد قرض البنك، والأرخص متعلم عليه.' : 'Cash vs developer plan vs bank mortgage, with the cheapest option highlighted.'}
          />
          <InfoCard
            icon={<Calculator className="h-5 w-5" />}
            title={ar ? 'الجدول كامل' : 'Full schedule'}
            body={ar ? 'افتح جدول الأقساط وشوف أصل القرض والفايدة والرصيد لكل شهر.' : 'Expand the amortisation table to see principal, interest and balance for every month.'}
          />
        </div>

        <MortgageCalculator />
      </div>
    </div>
  )
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 dark:border-[#262626] dark:bg-[#0A0A0A]">
      <div className="mb-2 text-estate-gold">{icon}</div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">{body}</p>
    </div>
  )
}
