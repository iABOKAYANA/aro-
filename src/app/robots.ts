import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/ceo/',
          '/admin/',
          '/broker/',
          '/developer/',
          '/seller/',
          '/buyer/',
          '/dashboard/',
          '/auth/',
          '/saved',
        ],
      },
      // AI crawlers get a narrower view: they must not index the assistant
      // transcripts or the price-estimator output pages.
      {
        userAgent: ['GPTBot', 'CCBot', 'Google-Extended', 'Bytespider'],
        allow: '/',
        disallow: ['/ai-tools/chat', '/api/', '/dashboard/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
