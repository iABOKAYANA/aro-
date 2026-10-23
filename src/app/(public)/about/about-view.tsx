'use client'

import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

export default function AboutView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const features = ar
    ? [
        { title: 'سيرش بالذكاء الاصطناعي', desc: 'دوّر بكلام عادي وهتلاقي اللي على مزاجك بالظبط.' },
        { title: 'إعلانات موثوقة', desc: 'كل عقار ومطوّر متراجع ومتأكد منه.' },
        { title: 'رؤية للسوق', desc: 'أرقام وتريندات لحظة بلحظة عشان تقرر صح.' },
        { title: 'بروكرز خبرة', desc: 'اتعامل مع وسطاء مرخّصين وعندهم خبرة حقيقية.' },
        { title: 'ترشيحات ذكية', desc: 'الذكاء الاصطناعي بيرشحلك اللي يناسب ذوقك وتصرّفاتك.' },
        { title: 'جولات افتراضية', desc: 'اتفرج على العقارات وانت قاعد في بيتك.' },
      ]
    : [
        { title: 'AI-Powered Search', desc: 'Natural language search to find properties matching your exact needs.' },
        { title: 'Verified Listings', desc: 'Every property and developer is thoroughly verified.' },
        { title: 'Market Insights', desc: 'Real-time data and trends to make informed decisions.' },
        { title: 'Expert Brokers', desc: 'Connect with licensed, experienced real estate professionals.' },
        { title: 'Smart Matching', desc: 'AI recommends properties based on your preferences and behavior.' },
        { title: 'Virtual Tours', desc: 'Explore properties from the comfort of your home.' },
      ]

  return (
    <>
      <section className="cine-hero" style={{ height: '60svh', minHeight: '420px', maxHeight: '600px' }}>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center px-4 text-center">
          <Reveal className="flex flex-col items-center">
            <p className="cine-kicker">{ar ? 'منصة مصرية لاستكشاف العقارات' : 'Explore Egyptian real estate with GHAYA'}</p>
            <h1 className="cine-title mt-4">{ar ? 'عن غاية العقارية' : 'About GHAYA REAL ESTATE'}</h1>
          </Reveal>
        </div>
      </section>
      <div className="container relative px-4 py-8 md:py-12">
      <div className="relative mx-auto max-w-4xl">

        <div className="prose prose-lg mx-auto max-w-none break-words dark:prose-invert">
          <Reveal>
          <section className="mb-12">
            <h2 className="font-display display-3">{ar ? 'مهمتنا' : 'Our Mission'}</h2>
            <p className="text-muted-foreground">
              {ar
                ? 'غاية نازلة تغيّر سوق العقارات في مصر، بالذكاء الاصطناعي ومعرفة حقيقية بالسوق هنا. احنا مؤمنين إنك تلاقي المكان المثالي ليك لازم يبقى حاجة سهلة وواضحة ومتاحة للكل.'
                : 'GHAYA REAL ESTATE is on a mission to transform the Egyptian real estate market by combining cutting-edge artificial intelligence with deep local market expertise. We believe that finding the perfect property should be simple, transparent, and accessible to everyone.'}
            </p>
          </section>
          </Reveal>

          <hr className="gold-hairline my-8" />

          <Reveal>
          <section className="mb-12">
            <h2 className="font-display display-3">{ar ? 'بنقدّم إيه' : 'What We Offer'}</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {features.map((item, index) => (
                <Reveal key={item.title} variant="wipe" delay={Math.min(index, 4) * 80}>
                <div className="rounded-2xl border border-estate-gold/20 p-4 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A] dark:hover:border-[#D4A843]/40">
                  <h3 className="font-display break-words font-semibold">{item.title}</h3>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{item.desc}</p>
                </div>
                </Reveal>
              ))}
            </div>
          </section>
          </Reveal>

          <hr className="gold-hairline my-8" />

          <Reveal>
          <section className="mb-12">
            <h2 className="font-display display-3">{ar ? 'ليه مصر؟' : 'Why Egypt?'}</h2>
            <p className="text-muted-foreground">
              {ar
                ? 'سوق العقارات في مصر من أسرع الأسواق في المنطقة. مع مشاريع زي العاصمة الإدارية والمدن الجديدة وتطوير البنية التحتية، مفيش وقت أحسن من دلوقتي تستثمر في العقارات في مصر. وغاية هنا عشان تساعدك تمشي في السوق ده وانت متطمن.'
                : "Egypt's real estate market is one of the fastest-growing in the MENA region. With mega-projects like the New Administrative Capital, new cities, and infrastructure developments, there has never been a better time to invest in Egyptian real estate. GHAYA REAL ESTATE is here to help you navigate this exciting market with confidence."}
            </p>
          </section>
          </Reveal>
        </div>
      </div>
    </div>
    </>
  )
}
