'use client'

import { useState } from 'react'
import { Calculator, TrendingUp, DollarSign, Percent, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

export default function InvestmentCalcPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [price, setPrice] = useState('')
  const [downPaymentPct, setDownPaymentPct] = useState('10')
  const [years, setYears] = useState('7')
  const [annualRent, setAnnualRent] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calculate = () => {
    setError(null)
    const priceNum = Number(price)
    const dpPctNum = Number(downPaymentPct)
    const yearsNum = Number(years)
    const annualRentNum = annualRent ? Number(annualRent) : priceNum * 0.08

    if (!price || !Number.isFinite(priceNum) || priceNum <= 0) {
      setError(ar ? 'دخل سعر العقار الأول — لازم يبقى أكبر من صفر' : 'Enter the property price first — it must be above zero')
      setResult(null)
      return
    }
    if (!Number.isFinite(dpPctNum) || dpPctNum < 0 || dpPctNum > 100) {
      setError(ar ? 'نسبة المقدم لازم تبقى بين 0 و 100' : 'Down payment must be between 0 and 100')
      setResult(null)
      return
    }
    if (!Number.isFinite(yearsNum) || yearsNum < 1) {
      setError(ar ? 'عدد سنين التقسيط لازم يبقى سنة على الأقل' : 'Installment years must be at least 1')
      setResult(null)
      return
    }
    if (!Number.isFinite(annualRentNum) || annualRentNum < 0) {
      setError(ar ? 'الإيجار السنوي المتوقع لازم يبقى رقم موجب' : 'Expected annual rent must be a positive number')
      setResult(null)
      return
    }
    setLoading(true)

    const dpPct = dpPctNum / 100
    const downPayment = priceNum * dpPct
    const loanAmount = priceNum - downPayment
    const monthlyInstallment = loanAmount / (yearsNum * 12)
    const monthlyRent = annualRentNum / 12
    const annualRentalYield = (annualRentNum / priceNum) * 100
    const cashOnCashYield = downPayment > 0 ? (annualRentNum / downPayment) * 100 : 0

    const appreciationRate = 0.08
    const futureValue5 = priceNum * Math.pow(1 + appreciationRate, 5)
    const futureValue10 = priceNum * Math.pow(1 + appreciationRate, 10)

    setResult({
      downPayment,
      loanAmount,
      monthlyInstallment,
      monthlyRent,
      annualRentalYield,
      cashOnCashYield,
      futureValue5,
      futureValue10,
      totalRentalIncome5: annualRentNum * 5,
      totalRentalIncome10: annualRentNum * 10,
    })
    setLoading(false)
  }

  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-8">
          <Badge variant="gold" className="mb-3"><TrendingUp className="me-1 h-3 w-3" /> {ar ? 'أداة ذكية' : 'AI Tool'}</Badge>
          <h1 className="text-2xl font-bold sm:text-3xl">{ar ? 'حاسبة الاستثمار' : 'Investment Calculator'}</h1>
          <p className="mt-2 text-muted-foreground">{ar ? 'احسب العائد ونسبة الإيجار والكاش فلو للاستثمار العقاري' : 'Calculate ROI, rental yield, and cash flow for property investments'}</p>
        </div>

        <Card className="mb-6 sm:mb-8">
          <CardHeader><CardTitle>{ar ? 'تفاصيل الاستثمار' : 'Investment Details'}</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'سعر العقار (جنيه) *' : 'Property Price (EGP) *'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'مثال: 10000000' : 'e.g. 10000000'} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'المقدم (%)' : 'Down Payment (%)'}</label>
                <Input className="text-base" type="number" value={downPaymentPct} onChange={(e) => setDownPaymentPct(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'سنين التقسيط' : 'Installment Years'}</label>
                <Input className="text-base" type="number" value={years} onChange={(e) => setYears(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الإيجار السنوي المتوقع (جنيه)' : 'Expected Annual Rent (EGP)'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'تلقائي: 8% من السعر' : 'Auto: 8% of price'} value={annualRent} onChange={(e) => setAnnualRent(e.target.value)} />
              </div>
            </div>
            <Button onClick={calculate} disabled={loading || !price} className="w-full bg-estate-gold hover:bg-estate-gold-dark sm:w-auto">
              {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Calculator className="me-2 h-4 w-4" />}
              {ar ? 'احسب' : 'Calculate'}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
        </Card>

        {result && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: ar ? 'المقدم' : 'Down Payment', value: formatEGP(result.downPayment), icon: DollarSign },
              { title: ar ? 'القسط الشهري' : 'Monthly Installment', value: formatEGP(result.monthlyInstallment), icon: DollarSign },
              { title: ar ? 'دخل الإيجار الشهري' : 'Monthly Rent Income', value: formatEGP(result.monthlyRent), icon: TrendingUp },
              { title: ar ? 'العائد الإيجاري' : 'Rental Yield', value: `${result.annualRentalYield.toFixed(1)}%`, icon: Percent },
              { title: ar ? 'العائد على المقدم' : 'Cash-on-Cash Return', value: `${result.cashOnCashYield.toFixed(1)}%`, icon: Percent },
              { title: ar ? 'زيادة السعر بعد 5 سنين' : '5-Year Appreciation', value: formatEGP(result.futureValue5), icon: TrendingUp },
              { title: ar ? 'زيادة السعر بعد 10 سنين' : '10-Year Appreciation', value: formatEGP(result.futureValue10), icon: TrendingUp },
              { title: ar ? 'دخل الإيجار في 5 سنين' : '5-Year Rental Income', value: formatEGP(result.totalRentalIncome5), icon: DollarSign },
              { title: ar ? 'دخل الإيجار في 10 سنين' : '10-Year Rental Income', value: formatEGP(result.totalRentalIncome10), icon: DollarSign },
            ].map((item) => (
              <Card key={item.title}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </div>
                  <p className="mt-1 text-xl font-bold text-estate-gold">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
