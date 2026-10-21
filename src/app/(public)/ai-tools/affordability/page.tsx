'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calculator, Wallet, Percent, Building2, Info, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { useFeatureFlag } from '@/components/flags/flags-provider'

/** Mortgage defaults — same as the mortgage calculator's opening values. */
const DEFAULT_RATE = 19
const DEFAULT_YEARS = 15

/** Inverse of the mortgage annuity formula: the loan a monthly payment supports. */
function maxLoanForInstallment(installment: number, annualRatePct: number, years: number): number {
  if (installment <= 0 || years <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = Math.round(years * 12)
  if (r === 0) return installment * n
  return (installment * (1 - Math.pow(1 + r, -n))) / r
}

type MatchProject = {
  id: string
  slug: string
  name: string
  startPrice: number | null
}

/** Real Unit rows (flag affordability_units) — raw /api/search?type=units shape. */
type MatchUnit = {
  id: string
  slug?: string | null
  name: string
  unitType: string
  price: number
  area: number
  bedrooms?: number | null
  project: { name: string; slug?: string | null }
}

export default function AffordabilityPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const unitsOn = useFeatureFlag('affordability_units')
  const [income, setIncome] = useState('')
  const [commitments, setCommitments] = useState('')
  const [down, setDown] = useState('')
  const [years, setYears] = useState(String(DEFAULT_YEARS))
  const [rate, setRate] = useState(String(DEFAULT_RATE))
  const [matches, setMatches] = useState<MatchProject[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesError, setMatchesError] = useState(false)
  const [unitMatches, setUnitMatches] = useState<MatchUnit[]>([])

  const calc = useMemo(() => {
    const rawIncome = Number(income)
    const incomeNum = Number.isFinite(rawIncome) ? Math.max(0, rawIncome) : 0
    const incomeInvalid = income !== '' && (!Number.isFinite(rawIncome) || rawIncome < 0)
    const commitmentsNum = Number(commitments) || 0
    const downNum = Number(down) || 0
    const term = Math.min(30, Math.max(1, Number(years) || DEFAULT_YEARS))
    const annual = Math.min(35, Math.max(0, Number(rate) || 0))
    const hasInputs = incomeNum > 0 || downNum > 0
    // Banks lend up to 40% of net income (income minus commitments), floored at 0.
    const installment = Math.max(0, 0.4 * (incomeNum - commitmentsNum))
    const loan = maxLoanForInstallment(installment, annual, term)
    const maxPrice = downNum + loan
    return {
      hasInputs,
      incomeInvalid,
      installment,
      loan,
      downNum,
      maxPrice,
      downPct: maxPrice > 0 ? (downNum / maxPrice) * 100 : 0,
    }
  }, [income, commitments, down, years, rate])

  useEffect(() => {
    if (!calc.hasInputs || calc.maxPrice <= 0) {
      setMatches([])
      setMatchesError(false)
      return
    }
    const controller = new AbortController()
    setMatchesLoading(true)
    setMatchesError(false)
    const params = new URLSearchParams({
      type: 'projects',
      maxPrice: String(Math.floor(calc.maxPrice)),
      limit: '6',
      sortBy: 'price_desc',
    })
    const unitParams = new URLSearchParams({
      type: 'units',
      maxPrice: String(Math.floor(calc.maxPrice)),
      limit: '8',
      sortBy: 'price_desc',
      status: 'AVAILABLE',
    })
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!controller.signal.aborted) setMatches(d.items ?? [])
      })
      .catch(() => {
        if (!controller.signal.aborted) setMatchesError(true)
      })
    // Real unit rows too: concrete inventory the budget covers (render-gated).
    fetch(`/api/search?${unitParams.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!controller.signal.aborted) setUnitMatches(d.items ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setMatchesLoading(false)
      })
    return () => controller.abort()
  }, [calc.hasInputs, calc.maxPrice])

  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-8">
          <Badge variant="gold" className="mb-3"><Wallet className="me-1 h-3 w-3" /> {ar ? 'أداة ذكية' : 'AI Tool'}</Badge>
          <h1 className="text-2xl font-bold sm:text-3xl">{ar ? 'أقدر أشتري إيه؟' : 'What can I afford?'}</h1>
          <p className="mt-2 text-muted-foreground">
            {ar
              ? 'قولنا مرتبك والتزاماتك وهنحسبلك بالعكس أغلى شقة البنك ممكن يمولهالك.'
              : 'Tell us your salary and current commitments and we work backwards to the most expensive home a bank would finance for you.'}
          </p>
        </div>

        <Card className="mb-6 sm:mb-8">
          <CardHeader>
            <CardTitle>{ar ? 'أرقامك' : 'Your numbers'}</CardTitle>
            <CardDescription>{ar ? 'البنوك بتمول لحد 40% من صافي دخلك (الدخل ناقص الالتزامات).' : 'Banks lend up to 40% of your net income (income minus commitments).'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الدخل الشهري (جنيه)' : 'Monthly income (EGP)'}</label>
                <Input className="text-base" type="number" min={0} placeholder={ar ? 'مثال: 50000' : 'e.g. 50000'} value={income} onChange={(e) => setIncome(e.target.value)} />
                {calc.incomeInvalid ? (
                  <p className="text-xs text-red-500">{ar ? 'الدخل مينفعش يبقى بالسالب — دخل رقم موجب' : 'Income can\u2019t be negative — enter a positive number'}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{ar ? 'صافي اللي بتقبضه كل شهر قبل ما يتخصم منه أي قرض.' : 'Your total take-home pay per month, before any loan deductions.'}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الالتزامات الشهرية (جنيه)' : 'Monthly commitments (EGP)'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'مثال: 5000' : 'e.g. 5000'} value={commitments} onChange={(e) => setCommitments(e.target.value)} />
                <p className="text-xs text-muted-foreground">{ar ? 'كل قسط ثابت بتدفعه كل شهر — قروض وكروت وقسط العربية.' : 'Every fixed payment you already owe each month — loans, cards, car installments.'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'المقدم المتاح (جنيه)' : 'Available down payment (EGP)'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'مثال: 500000' : 'e.g. 500000'} value={down} onChange={(e) => setDown(e.target.value)} />
                <p className="text-xs text-muted-foreground">{ar ? 'الكاش اللي بتدفعه أول يوم — بيتحط فوق القرض ومش بيتسلف.' : 'Cash you pay on day one — added on top of the loan, never borrowed.'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{ar ? 'أقصى مدة (سنين)' : 'Max years'}</label>
                  <Input className="text-base" type="number" value={years} onChange={(e) => setYears(e.target.value)} />
                  <p className="text-xs text-muted-foreground">{ar ? 'مدة أطول يعني قرض أكبر بس فايدة أكتر.' : 'Longer means a bigger loan but more interest.'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{ar ? 'الفايدة (%)' : 'Rate (%)'}</label>
                  <Input className="text-base" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
                  <p className="text-xs text-muted-foreground">{ar ? 'نفس البداية بتاعة حاسبة التمويل.' : 'Same starting point as the mortgage calculator.'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!calc.hasInputs ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="font-medium">{ar ? 'دخل أرقامك عشان تشوف ميزانيتك' : 'Enter your numbers to see your budget'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{ar ? 'أقصى سعر هيظهر هنا أول ما تدخل الدخل والمقدم.' : 'Your max price appears here as soon as income and down payment are filled in.'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="border-estate-gold/20 bg-estate-gold/5">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">{ar ? 'أقصى سعر تقدر عليه' : 'Max affordable price'}</p>
                <p className="mt-2 text-3xl font-bold sm:text-4xl text-estate-gold">{formatEGP(Math.round(calc.maxPrice))}</p>
                <p className="mt-1 text-sm text-muted-foreground">{ar ? 'المقدم بتاعك زائد أكبر قرض القسط الشهري بتاعك يقدر يشيله.' : 'Your down payment plus the biggest loan your monthly installment can support.'}</p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { title: ar ? 'القسط الشهري' : 'Monthly installment', value: formatEGP(Math.round(calc.installment)), hint: ar ? '40% من اللي بيفضل بعد التزاماتك — الرقم اللي البنك بيبص عليه.' : '40% of what is left after your commitments — the number the bank looks at.', icon: Calculator },
                { title: ar ? 'المقدم' : 'Down payment', value: formatEGP(Math.round(calc.downNum)), hint: ar ? `${calc.downPct.toFixed(0)}% من أقصى سعر — البنوك غالبًا بتطلب 10–20% على الأقل.` : `${calc.downPct.toFixed(0)}% of the max price — banks usually want at least 10–20%.`, icon: Percent },
                { title: ar ? 'أقصى قرض' : 'Max loan', value: formatEGP(Math.round(calc.loan)), hint: ar ? 'القيمة الحالية لقسطك محسوبة كدفعات — نفس حسبة حاسبة التمويل.' : 'Present value of your installment as an annuity — same loan math as the mortgage calculator.', icon: Wallet },
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

            {calc.installment <= 0 && (
              <p className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                {ar
                  ? 'مفيش مساحة لأي قسط — التزاماتك واكلة دخلك كله، فالسعر اللي تقدر عليه هو المقدم الكاش بتاعك بس.'
                  : 'No room for an installment — your commitments eat your whole income, so the affordable price is just your down payment in cash.'}
              </p>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> {ar ? 'تقدر تشتري فين' : 'Where you can buy'}</CardTitle>
                <CardDescription>{ar ? 'مشاريع سعر البداية فيها على قد ميزانيتك — دوس على واحد عشان تفتحه.' : 'Projects whose starting price fits your budget — click one to open it.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {matchesLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بندور على مشاريع على قد ميزانيتك…' : 'Finding projects in your budget…'}
                  </p>
                ) : matchesError ? (
                  <p className="text-sm text-muted-foreground">{ar ? 'معرفناش نجيب المشاريع المناسبة.' : 'Could not load matching projects.'}</p>
                ) : matches.length > 0 ? (
                  matches.map((project) => (
                    <div key={project.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/projects/${project.slug}`} className="min-w-0 flex-1 truncate font-semibold hover:text-estate-gold">
                        {project.name}
                      </Link>
                      {project.startPrice ? (
                        <span className="shrink-0 font-medium text-estate-gold">{formatEGP(project.startPrice)}</span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-center">
                    <p className="font-medium">{ar ? 'مفيش حاجة على قد الميزانية دي لسه' : 'Nothing fits this budget yet'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{ar ? 'جرب مدة أطول أو منطقة أرخص أو مقدم أكبر — وبعدين بص تاني.' : 'Try more years, a cheaper area, or a bigger down payment — then check again.'}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {unitsOn && (
            <Card>
              <CardHeader>
                <CardTitle>{ar ? 'وحدات حقيقية على قد الميزانية دي' : 'Real units within this budget'}</CardTitle>
                <CardDescription>
                  {ar ? 'وحدات متاحة حاليًا في الكتالوج — من غير تقدير.' : 'Currently available catalog units — no estimates.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {unitMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? 'مفيش وحدات تحت الميزانية دي لسه.' : 'No units under this budget yet.'}</p>
                ) : (
                  <div className="space-y-2">
                    {unitMatches.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-3 text-sm">
                        <Link
                          href={`/units/${u.slug || u.id}`}
                          className="min-w-0 flex-1 truncate font-semibold hover:text-estate-gold"
                        >
                          {u.project?.name} — {u.name}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {u.area ? `${u.area}م²` : ''}{u.bedrooms ? ` · ${u.bedrooms} غرف` : ''}
                        </span>
                        <span className="shrink-0 font-medium text-estate-gold">{formatEGP(u.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            <p className="flex items-start gap-2 rounded-2xl border border-estate-gold/20 bg-estate-gold/[0.07] px-4 py-3 text-xs leading-relaxed text-gray-300">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-estate-gold" />
              {ar
                ? 'دي حسبة استرشادية بس — البنوك كمان بتبص على السجل الائتماني والسن والشقة نفسها قبل الموافقة.'
                : 'Estimate only — banks also check credit history, age and the property itself before approving.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
