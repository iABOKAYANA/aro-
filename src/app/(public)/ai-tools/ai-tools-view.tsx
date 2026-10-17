'use client'

import { Search, TrendingUp, Calculator, Map, MessageSquare, DollarSign, BarChart3, Landmark, Scale, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

const aiTools = [
  {
    title: 'AI Property Search',
    titleAr: 'البحث بالذكاء الاصطناعي',
    description: 'Describe what you want in natural language and find matching properties instantly.',
    descriptionAr: 'اوصف اللي نفسك فيه بكلام عادي وهنلاقيلك العقارات المناسبة فورًا.',
    icon: Search,
    href: '/ai-tools/search',
    color: 'text-estate-gold',
    bg: 'bg-estate-gold/10',
    status: 'live',
  },
  {
    title: 'Price Estimator',
    titleAr: 'حاسبة سعر العقار',
    description: 'Get accurate property valuations using AI-powered market analysis.',
    descriptionAr: 'اعرف السعر العادل لأي عقار بتحليل السوق بالذكاء الاصطناعي.',
    icon: DollarSign,
    href: '/ai-tools/price-estimator',
    color: 'text-estate-copper',
    bg: 'bg-estate-copper/15',
    status: 'live',
  },
  {
    title: 'Investment Calculator',
    titleAr: 'حاسبة الاستثمار',
    description: 'Calculate ROI, rental yields, and cash flow for any property investment.',
    descriptionAr: 'احسب العائد ونسبة الإيجار والكاش فلو لأي استثمار عقاري.',
    icon: Calculator,
    href: '/ai-tools/investment',
    color: 'text-estate-gold',
    bg: 'bg-estate-gold/10',
    status: 'live',
  },
  {
    title: 'Mortgage Calculator',
    titleAr: 'حاسبة التمويل والأقساط',
    description: 'Compare bank loans, developer plans and cash — with a full amortisation schedule.',
    descriptionAr: 'قارن قرض البنك وتقسيط المطور والكاش — مع جدول الأقساط كامل.',
    icon: Landmark,
    href: '/ai-tools/mortgage',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    status: 'live',
  },
  {
    title: 'What Can I Afford?',
    titleAr: 'أقدر أشتري إيه؟',
    description: 'Work backwards from your salary to the most expensive home a bank would finance for you.',
    descriptionAr: 'ابدأ من مرتبك واعرف أغلى شقة البنك ممكن يمولهالك.',
    icon: Wallet,
    href: '/ai-tools/affordability',
    color: 'text-estate-gold',
    bg: 'bg-estate-gold/10',
    status: 'live',
  },
  {
    title: 'Rent or Buy?',
    titleAr: 'أأجر ولا أشتري؟',
    description: 'Compare total rent against buying costs over the same years and find your breakeven year.',
    descriptionAr: 'قارن إجمالي الإيجار بتكلفة الشراء على نفس السنين واعرف سنة التعادل.',
    icon: Scale,
    href: '/ai-tools/rentbuy',
    color: 'text-estate-gold',
    bg: 'bg-estate-gold/10',
    status: 'live',
  },
  {
    title: 'Market Analysis',
    titleAr: 'تحليل السوق',
    description: 'Real-time market trends, price movements, and area comparisons.',
    descriptionAr: 'اتجاهات السوق وحركة الأسعار ومقارنة المناطق أول بأول.',
    icon: BarChart3,
    href: '/ai-tools/market-analysis',
    color: 'text-estate-copper',
    bg: 'bg-estate-copper/15',
    status: 'coming_soon',
  },
  {
    title: 'Neighborhood Guide',
    titleAr: 'دليل المناطق',
    description: 'AI-generated insights about neighborhoods including safety, amenities, and lifestyle.',
    descriptionAr: 'معلومات بالذكاء الاصطناعي عن المناطق: الأمان والخدمات وأسلوب الحياة.',
    icon: Map,
    href: '/ai-tools/neighborhood',
    color: 'text-estate-gold',
    bg: 'bg-estate-gold/10',
    status: 'coming_soon',
  },
  {
    title: 'AI Property Assistant',
    titleAr: 'المساعد العقاري الذكي',
    description: 'Chat with our AI assistant for personalized property recommendations.',
    descriptionAr: 'اتكلم مع مساعدنا الذكي عشان يرشحلك عقارات على مقاسك.',
    icon: MessageSquare,
    href: '/ai-tools/chat',
    color: 'text-estate-gold',
    bg: 'bg-estate-gold/10',
    status: 'live',
  },
]

export default function AIToolsView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <>
      <section className="cine-hero" style={{ height: '60svh', minHeight: '420px', maxHeight: '600px' }}>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center px-4 text-center">
          <Reveal className="flex flex-col items-center">
            <p className="cine-kicker">{ar ? 'بالذكاء الاصطناعي' : 'AI-Powered'}</p>
            <h1 className="cine-title mt-4">{ar ? 'أدوات العقارات بالذكاء الاصطناعي' : 'AI Real Estate Tools'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#faf7ef]/85">
              {ar
                ? 'أدوات ذكية بالذكاء الاصطناعي عشان تساعدك تاخد قرار عقاري أحسن.'
                : 'Smart tools powered by artificial intelligence to help you make better real estate decisions.'}
            </p>
          </Reveal>
        </div>
      </section>
      <div className="container relative px-4 py-8 sm:py-12">
      <div className="relative mx-auto max-w-4xl">

        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          {aiTools.map((tool, index) => (
            <Reveal key={tool.title} variant="wipe" delay={Math.min(index, 4) * 80}>
            <Card className="card-hover group h-full border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-xl hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:hover:border-[#D4A843]/40">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className={`inline-flex rounded-2xl p-3 ${tool.bg}`}>
                    <tool.icon className={`h-6 w-6 ${tool.color}`} />
                  </div>
                  {tool.status === 'live' ? (
                    <Badge className="bg-green-100 text-green-800">{ar ? 'شغّال' : 'Live'}</Badge>
                  ) : (
                    <Badge variant="secondary">{ar ? 'قريبًا' : 'Coming Soon'}</Badge>
                  )}
                </div>
                <h3 className="font-display mb-2 text-lg font-semibold">{ar ? tool.titleAr : tool.title}</h3>
                <p className="mb-4 text-sm text-muted-foreground">{ar ? tool.descriptionAr : tool.description}</p>
                {tool.status === 'live' ? (
                  <Button
                    asChild
                    variant="default"
                    className="gold-shimmer bg-estate-gold hover:bg-estate-gold-dark"
                  >
                    <Link href={tool.href}>
                      {ar ? 'جرّب دلوقتي' : 'Try Now'}
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    {ar ? 'قريبًا' : 'Coming Soon'}
                  </Button>
                )}
              </CardContent>
            </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
    </>
  )
}
