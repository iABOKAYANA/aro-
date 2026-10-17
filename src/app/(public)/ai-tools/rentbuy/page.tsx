'use client'

import { useMemo, useState } from 'react'
import { Calculator, Home, Info, Scale, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

/** Mortgage defaults — same as the mortgage calculator's opening values. */
const DEFAULT_RATE = 19
const DEFAULT_YEARS = 15
/** Cairo-guess defaults for the two growth inputs. */
const DEFAULT_RENT_GROWTH = 10
const DEFAULT_APPRECIATION = 15
/** Verdict ties when the gap is at most this share of the bigger side. */
const TIE_PCT = 1

/** Annuity formula — the identical one the mortgage calculator uses. */
function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = Math.round(years * 12)
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

export default function RentBuyPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [rent, setRent] = useState('')
  const [price, setPrice] = useState('')
  const [down, setDown] = useState('')
  const [years, setYears] = useState(String(DEFAULT_YEARS))
  const [rate, setRate] = useState(String(DEFAULT_RATE))
  const [rentGrowth, setRentGrowth] = useState(String(DEFAULT_RENT_GROWTH))
  const [appreciation, setAppreciation] = useState(String(DEFAULT_APPRECIATION))

  const calc = useMemo(() => {
    const rentNum = Number(rent) || 0
    const priceNum = Number(price) || 0
    // A down payment above the price is just capped — the loan cannot go negative.
    const downNum = Math.min(Number(down) || 0, Math.max(0, priceNum))
    const horizon = Math.min(30, Math.max(1, Number(years) || DEFAULT_YEARS))
    const annual = Math.min(35, Math.max(0, Number(rate) || 0))
    const growth = Math.min(50, Math.max(0, Number(rentGrowth) || 0)) / 100
    const appr = Math.min(50, Math.max(0, Number(appreciation) || 0)) / 100

    const hasInputs = rentNum > 0 && priceNum > 0
    const loan = Math.max(0, priceNum - downNum)
    const monthly = monthlyPayment(loan, annual, horizon)

    let rentCum = 0
    let breakeven: number | null = null
    for (let y = 1; y <= Math.round(horizon); y++) {
      rentCum += rentNum * 12 * Math.pow(1 + growth, y - 1)
      if (breakeven === null && downNum + monthly * 12 * y <= rentCum) breakeven = y
    }
    const outOfPocket = downNum + monthly * 12 * Math.round(horizon)
    const homeValue = priceNum * Math.pow(1 + appr, horizon)
    const gap = rentCum - outOfPocket
    const tied = Math.abs(gap) <= (TIE_PCT / 100) * Math.max(rentCum, outOfPocket)
    const verdict: 'buy' | 'rent' | 'tie' = tied ? 'tie' : gap > 0 ? 'buy' : 'rent'

    return { hasInputs, horizon, monthly, rentCum, outOfPocket, homeValue, gap, verdict, breakeven }
  }, [rent, price, down, years, rate, rentGrowth, appreciation])

  const verdictText =
    calc.verdict === 'buy'
      ? (ar ? 'الشراء هو الكسبان — فلوس أقل بتخرج من جيبك' : 'Buying wins — less money leaves your pocket')
      : calc.verdict === 'rent'
        ? (ar ? 'الإيجار هو الكسبان — فلوس أقل بتخرج من جيبك' : 'Renting wins — less money leaves your pocket')
        : (ar ? 'تقريبًا متعادلين — الفرق فكة' : 'Almost tied — the difference is pocket change')

  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-8">
          <Badge variant="gold" className="mb-3"><Scale className="me-1 h-3 w-3" /> {ar ? 'أداة ذكية' : 'AI Tool'}</Badge>
          <h1 className="text-2xl font-bold sm:text-3xl">{ar ? 'أأجر ولا أشتري؟' : 'Rent or buy?'}</h1>
          <p className="mt-2 text-muted-foreground">
            {ar
              ? 'اكتب اللي بتدفعه إيجار وسعر الشقة — وهنقارن إجمالي الإيجار بتكلفة الشراء على نفس السنين ونقولك مين الكسبان.'
              : 'Type what you pay in rent and what the home costs — we compare total rent against buying costs over the same years and tell you which wins.'}
          </p>
        </div>

        <Card className="mb-6 sm:mb-8">
          <CardHeader>
            <CardTitle>{ar ? 'أرقامك' : 'Your numbers'}</CardTitle>
            <CardDescription>{ar ? 'اللي خارج من جيبك قصاد اللي خارج من جيبك — قيمة الشقة تحت للمعلومة بس.' : 'Out of pocket against out of pocket — the home value below is info only.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الإيجار الشهري دلوقتي (جنيه)' : 'Monthly rent now (EGP)'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'مثال: 25000' : 'e.g. 25000'} value={rent} onChange={(e) => setRent(e.target.value)} />
                <p className="text-xs text-muted-foreground">{ar ? 'اللي بتدفعه كل شهر النهاردة.' : 'What you pay per month today.'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'سعر الشقة (جنيه)' : 'Home price (EGP)'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'مثال: 8500000' : 'e.g. 8500000'} value={price} onChange={(e) => setPrice(e.target.value)} />
                <p className="text-xs text-muted-foreground">{ar ? 'السعر الكامل للشقة اللي هتشتريها.' : 'Full price of the home you would buy.'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'المقدم كاش (جنيه)' : 'Down payment, cash (EGP)'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'مثال: 1700000' : 'e.g. 1700000'} value={down} onChange={(e) => setDown(e.target.value)} />
                <p className="text-xs text-muted-foreground">{ar ? 'الكاش اللي بتدفعه أول يوم — القرض بيغطي الباقي ومش العكس.' : 'Cash you pay on day one — the loan covers the rest, never the other way round.'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{ar ? 'نقارن على كام سنة' : 'Compare over (years)'}</label>
                  <Input className="text-base" type="number" value={years} onChange={(e) => setYears(e.target.value)} />
                  <p className="text-xs text-muted-foreground">{ar ? 'القرض شغال نفس السنين — نفس بداية حاسبة التمويل: 15.' : 'The loan runs the same years — same starting point as the mortgage calculator: 15.'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{ar ? 'الفايدة (%)' : 'Rate (%)'}</label>
                  <Input className="text-base" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
                  <p className="text-xs text-muted-foreground">{ar ? 'نفس بداية حاسبة التمويل: 19%.' : 'Same starting point as the mortgage calculator: 19%.'}</p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'زيادة الإيجار السنوية (%)' : 'Yearly rent increase (%)'}</label>
                <Input className="text-base" type="number" value={rentGrowth} onChange={(e) => setRentGrowth(e.target.value)} />
                <p className="text-xs text-muted-foreground">{ar ? 'الإيجار بيزيد قد إيه كل سنة — 10% تخمين حذر للقاهرة.' : 'How much your rent climbs each year — 10% is a cautious Cairo guess.'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'زيادة سعر الشقة السنوية (%)' : 'Yearly home price increase (%)'}</label>
                <Input className="text-base" type="number" value={appreciation} onChange={(e) => setAppreciation(e.target.value)} />
                <p className="text-xs text-muted-foreground">{ar ? 'للمعلومة بس — مش بتتخصم من اللي بتدفعه.' : 'Shown for info only — never subtracted from what you pay.'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {!calc.hasInputs ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="font-medium">{ar ? 'دخل الإيجار والسعر عشان تشوف الحكم' : 'Enter rent and price to see the verdict'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{ar ? 'المقارنة هتظهر هنا أول ما تدخل الإيجار الشهري وسعر الشقة.' : 'The comparison appears here as soon as monthly rent and home price are filled in.'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="border-estate-gold/20 bg-estate-gold/5">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">{verdictText}</p>
                <p className="mt-2 text-3xl font-bold sm:text-4xl text-estate-gold">
                  {calc.breakeven === null ? (ar ? 'الإيجار' : 'Renting') : calc.verdict === 'tie' ? (ar ? 'تعادل' : 'Tied') : (ar ? 'الشراء' : 'Buying')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {calc.breakeven === null
                    ? (ar ? 'مفيش نقطة تعادل في السنين دي — الإيجار هيفضل أرخص للآخر' : 'No breakeven inside these years — renting stays cheaper to the end')
                    : (ar ? `التعادل في السنة ${calc.breakeven}` : `Breakeven in year ${calc.breakeven}`)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{ar ? 'أول سنة الشراء يبقى أرخص من الإيجار — محسوبة من النهاردة.' : 'The first year buying gets cheaper than renting — counted from today.'}</p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { title: ar ? 'إجمالي الإيجار المدفوع' : 'Total rent paid', value: formatEGP(Math.round(calc.rentCum)), hint: ar ? 'كل شهور الإيجار متجمعة وبتزيد حبة كل سنة.' : 'Every month of rent added up, growing a little each year.', icon: Wallet },
                { title: ar ? 'إجمالي اللي هتدفعه في الشراء' : 'Total buying out of pocket', value: formatEGP(Math.round(calc.outOfPocket)), hint: ar ? 'المقدم زائد كل الأقساط في السنين دي — من غير ما نخصم حاجة.' : 'Down payment plus every installment inside these years — nothing subtracted.', icon: Home },
                { title: ar ? 'قيمة الشقة المتوقعة في الآخر' : 'Est. home value at the end', value: formatEGP(Math.round(calc.homeValue)), hint: ar ? 'الشقة ممكن تبقى بكام — لعينيك بس ومش داخلة في الحكم.' : 'What the home could be worth — for your eyes only, not part of the verdict.', icon: Calculator },
              ].map((item) => (
                <Card key={item.title}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <item.icon className="h-4 w-4" />
                      {item.title}
                    </div>
                    <p className="mt-1 text-xl font-bold text-estate-gold">{item.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {calc.verdict !== 'tie' && (
              <p className="flex items-start gap-2 rounded-2xl border border-estate-gold/20 bg-estate-gold/[0.07] px-4 py-3 text-xs leading-relaxed text-gray-300">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-estate-gold" />
                {calc.verdict === 'buy'
                  ? (ar ? `هتوفر حوالي ${formatEGP(Math.round(Math.abs(calc.gap)))} لو اشتريت بدل ما تأجر على مدار ${calc.horizon} سنين.` : `You keep about ${formatEGP(Math.round(Math.abs(calc.gap)))} by buying instead of renting over ${calc.horizon} years.`)
                  : (ar ? `هتوفر حوالي ${formatEGP(Math.round(Math.abs(calc.gap)))} لو أجرت بدل ما تشتري على مدار ${calc.horizon} سنين.` : `You keep about ${formatEGP(Math.round(Math.abs(calc.gap)))} by renting instead of buying over ${calc.horizon} years.`)}
              </p>
            )}

            <p className="flex items-start gap-2 rounded-2xl border border-estate-gold/20 bg-estate-gold/[0.07] px-4 py-3 text-xs leading-relaxed text-gray-300">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-estate-gold" />
              {ar
                ? 'حسبة استرشادية بس — الصيانة والضرايب والمصاريف والنقل مش محسوبين على أي ناحية.'
                : 'Estimate only — maintenance, taxes, fees and moving costs are not counted on either side.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
