'use client'

import { useState } from 'react'
import { DollarSign, Calculator, TrendingUp, MapPin, Bed, Maximize, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatEGP, formatSQM } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

export default function PriceEstimatorPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [area, setArea] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('APARTMENT')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEstimate = async () => {
    const areaNum = Number(area)
    if (!area || !Number.isFinite(areaNum) || areaNum <= 0) {
      setError(ar ? 'دخل مساحة صحيحة أكبر من صفر عشان نعرف نقيّم السعر' : 'Enter a valid area above zero so we can estimate the price')
      setResult(null)
      return
    }
    setError(null)
    setLoading(true)
    const avgPricePerSqm = 45000 + (location.toLowerCase().includes('new cairo') ? 10000 : 0)
    const basePrice = areaNum * avgPricePerSqm
    const bedroomMultiplier = bedrooms ? (1 + (Number(bedrooms) - 1) * 0.15) : 1
    const estimatedPrice = basePrice * bedroomMultiplier

    const pricePerSqm = estimatedPrice / areaNum

    const comparableUnits = await fetch('/api/units').then(r => r.json()).then(d => {
      return (d.units || [])
        .filter((u: any) => u.area > areaNum * 0.8 && u.area < areaNum * 1.2)
        .slice(0, 5)
    }).catch(() => [])

    setResult({
      estimatedPrice,
      pricePerSqm,
      range: { min: estimatedPrice * 0.85, max: estimatedPrice * 1.15 },
      comparableUnits,
      factors: [
        { label: 'Location premium', labelAr: 'تميز المكان', value: location ? '+10%' : 'Standard', valueAr: location ? '+10%' : 'عادي' },
        { label: 'Bedroom multiplier', labelAr: 'معامل الأوض', value: bedrooms ? `${bedrooms}BR (+${((bedroomMultiplier - 1) * 100).toFixed(0)}%)` : 'N/A', valueAr: bedrooms ? `${bedrooms} أوض (+${((bedroomMultiplier - 1) * 100).toFixed(0)}%)` : '—' },
        { label: 'Market trend', labelAr: 'اتجاه السوق', value: 'Stable (+3% YoY)', valueAr: 'مستقر (+3% سنويًا)' },
      ],
    })
    setLoading(false)
  }

  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-8">
          <Badge variant="gold" className="mb-3"><DollarSign className="me-1 h-3 w-3" /> {ar ? 'أداة ذكية' : 'AI Tool'}</Badge>
          <h1 className="text-2xl font-bold sm:text-3xl">{ar ? 'حاسبة سعر العقار' : 'Property Price Estimator'}</h1>
          <p className="mt-2 text-muted-foreground">{ar ? 'اعرف القيمة السوقية المتوقعة لأي عقار في مصر' : 'Get an estimated market value for any property in Egypt'}</p>
        </div>

        <Card className="mb-6 sm:mb-8">
          <CardHeader>
            <CardTitle>{ar ? 'تفاصيل العقار' : 'Property Details'}</CardTitle>
            <CardDescription>{ar ? 'دخل تفاصيل العقار عشان تاخد سعر متوقع' : 'Enter property details to get an estimated price'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'المساحة (متر) *' : 'Area (sqm) *'}</label>
                <Input className="text-base" type="number" placeholder={ar ? 'مثال: 150' : 'e.g. 150'} value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'أوض النوم' : 'Bedrooms'}</label>
                <select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className="flex h-10 w-full rounded-xl border bg-background px-3 py-2 text-base">
                  <option value="">{ar ? 'أي حاجة' : 'Any'}</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5+</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'المكان' : 'Location'}</label>
                <Input className="text-base" placeholder={ar ? 'مثال: التجمع الخامس' : 'e.g. New Cairo'} value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'نوع العقار' : 'Property Type'}</label>
                <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="flex h-10 w-full rounded-xl border bg-background px-3 py-2 text-base">
                  <option value="APARTMENT">{ar ? 'شقة' : 'Apartment'}</option>
                  <option value="VILLA">{ar ? 'فيلا' : 'Villa'}</option>
                  <option value="TOWNHOUSE">{ar ? 'تاون هاوس' : 'Townhouse'}</option>
                  <option value="DUPLEX">{ar ? 'دوبلكس' : 'Duplex'}</option>
                </select>
              </div>
            </div>
            <Button onClick={handleEstimate} disabled={loading || !area} className="w-full bg-estate-gold hover:bg-estate-gold-dark sm:w-auto">
              {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Calculator className="me-2 h-4 w-4" />}
              {ar ? 'احسب السعر' : 'Estimate Price'}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-4">
            <Card className="border-estate-gold/20 bg-estate-gold/5">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">{ar ? 'القيمة السوقية المتوقعة' : 'Estimated Market Value'}</p>
                <p className="mt-2 text-3xl font-bold sm:text-4xl text-estate-gold">{formatEGP(result.estimatedPrice)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ar ? 'النطاق' : 'Range'}: {formatEGP(result.range.min)} - {formatEGP(result.range.max)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatEGP(result.pricePerSqm)}{ar ? '/متر' : '/sqm'}
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">{ar ? 'عوامل التقييم' : 'Valuation Factors'}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {result.factors.map((f: any) => (
                    <div key={f.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{ar ? f.labelAr : f.label}</span>
                      <span className="font-medium">{ar ? f.valueAr : f.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {result.comparableUnits?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">{ar ? 'عقارات مشابهة' : 'Comparable Properties'}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {result.comparableUnits.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0 flex-1 break-words">
                          <span className="font-medium">{u.project?.name || u.name}</span>
                          <span className="ms-2 shrink-0 text-muted-foreground">{u.area}{ar ? ' متر' : 'sqm'}</span>
                        </div>
                        <span className="shrink-0 font-medium text-estate-gold">{formatEGP(u.price)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
