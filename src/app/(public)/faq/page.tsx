import { Metadata } from 'next'
import FaqView from './faq-view'
import { SITE_URL, languageAlternates } from '@/lib/site'
import { FAQ_GROUPS } from './faq-data'

export const metadata: Metadata = {
  title: 'الأسئلة الشائعة | FAQ',
  description:
    'إجابات غاية العقارية عن الحجز والمعاينة والأسعار والمناطق والحسابات والمساعد عين والتواصل. GHAYA REAL ESTATE answers on booking, prices, areas, accounts, Ayn and contact.',
  alternates: languageAlternates('/faq'),
  openGraph: {
    title: 'الأسئلة الشائعة عن العقارات | FAQ',
    description:
      'إجابات سريعة عن الحجز والأسعار والمناطق والحسابات والمساعد عين.',
      url: `${SITE_URL}/faq`,
      siteName: 'GHAYA REAL ESTATE',
    images: [
      {
        url: `${SITE_URL}/og?t=${encodeURIComponent('FAQ')}&s=${encodeURIComponent('Booking, prices, areas and Ayn answers')}`,
        width: 1200,
        height: 630,
        alt: 'GHAYA REAL ESTATE — FAQ',
      },
    ],
  },
}

/** Server-rendered FAQPage graph so crawlers see it without JS (Arabic-first). */
function faqJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_GROUPS.flatMap((g) =>
      g.items.map((item) => [
        {
          '@type': 'Question',
          name: item.qAr,
          acceptedAnswer: { '@type': 'Answer', text: item.aAr },
        },
        {
          '@type': 'Question',
          name: item.qEn,
          acceptedAnswer: { '@type': 'Answer', text: item.aEn },
        },
      ]),
    ).flat(),
  }
}

export default function FaqPage() {
  const jsonLd = faqJsonLd()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FaqView />
    </>
  )
}
