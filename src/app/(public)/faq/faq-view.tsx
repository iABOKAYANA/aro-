'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, MessageCircleQuestion } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import { cn } from '@/lib/utils'
import { FAQ_GROUPS } from './faq-data'

/**
 * Render bare site paths (/contact, /offers …) inside answer copy as real
 * links. Anything else stays plain text — no invented URLs, ever.
 */
function renderAnswer(text: string) {
  const parts = text.split(/(\/[a-z0-9\-/?=&#._]+)/gi)
  return parts.map((part, i) =>
    /^\/[a-z0-9\-/?=&#._]+$/i.test(part) ? (
      <Link
        key={i}
        href={part}
        className="font-semibold text-estate-gold underline-offset-4 hover:underline"
      >
        {part}
      </Link>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export default function FaqView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <section className="cine-hero" style={{ height: '60svh', minHeight: '420px', maxHeight: '600px' }}>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center px-4 text-center">
          <Reveal className="flex flex-col items-center">
            <p className="cine-kicker">{ar ? 'غاية العقارية' : 'GHAYA REAL ESTATE'}</p>
            <h1 className="cine-title mt-4">{ar ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#faf7ef]/85">
              {ar
                ? 'إجابات سريعة عن الحجز والأسعار والمناطق والحسابات والمساعد عين — ولو ملقتش سؤالك ابعتلنا من صفحة التواصل.'
                : 'Quick answers about booking, prices, areas, accounts and Ayn — and if your question is missing, message us from the contact page.'}
            </p>
          </Reveal>
        </div>
      </section>

      <div className="container relative px-4 py-8 md:py-12">
        <div className="relative mx-auto max-w-3xl">
          {FAQ_GROUPS.map((group, gi) => (
            <Reveal key={group.titleEn}>
              <section className={gi > 0 ? 'mt-10' : ''} aria-label={ar ? group.titleAr : group.titleEn}>
                <h2 className="font-display display-3 mb-4 flex items-center gap-2">
                  <MessageCircleQuestion className="h-5 w-5 shrink-0 text-estate-gold" aria-hidden="true" />
                  {ar ? group.titleAr : group.titleEn}
                </h2>
                <div className="space-y-3">
                  {group.items.map((item, ii) => {
                    const key = `${gi}-${ii}`
                    const isOpen = open === key
                    return (
                      <div
                        key={key}
                        className={cn(
                          'overflow-hidden rounded-2xl border transition-colors',
                          isOpen
                            ? 'border-estate-gold/50 shadow-lg shadow-estate-gold/10'
                            : 'border-estate-gold/20 hover:border-estate-gold/40',
                          'dark:border-[#D4A843]/20 dark:bg-[#0A0A0A] dark:hover:border-[#D4A843]/40',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : key)}
                          aria-expanded={isOpen}
                          className="flex min-h-[44px] w-full items-center justify-between gap-3 p-4 text-start"
                        >
                          <span className="min-w-0 flex-1 break-words font-semibold">
                            {ar ? item.qAr : item.qEn}
                          </span>
                          <ChevronDown
                            className={cn(
                              'h-5 w-5 shrink-0 text-estate-gold transition-transform',
                              isOpen && 'rotate-180',
                            )}
                            aria-hidden="true"
                          />
                        </button>
                        {isOpen && (
                          <div className="border-t border-estate-gold/15 px-4 py-3">
                            <p className="break-words text-sm leading-7 max-sm:text-base max-sm:leading-8 text-muted-foreground">
                              {renderAnswer(ar ? item.aAr : item.aEn)}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            </Reveal>
          ))}

          <hr className="gold-hairline my-8" />

          <Reveal>
            <p className="text-center text-sm text-muted-foreground">
              {ar ? (
                <>
                  ملقتش إجابتك؟ ابعتلنا من <Link href="/contact" className="font-semibold text-estate-gold underline-offset-4 hover:underline">صفحة التواصل</Link> وهنرد خلال 24 ساعة.
                </>
              ) : (
                <>
                  Still stuck? Message us from the <Link href="/contact" className="font-semibold text-estate-gold underline-offset-4 hover:underline">contact page</Link> — we reply within 24 hours.
                </>
              )}
            </p>
          </Reveal>
        </div>
      </div>
    </>
  )
}
