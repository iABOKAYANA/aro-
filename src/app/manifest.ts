import type { MetadataRoute } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE_NAME,
    short_name: 'GHAYA',
    description:
      "Egypt's AI-powered real estate platform — projects, compounds, units and smart search.",
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b1020',
    theme_color: '#0b1020',
    lang: 'en',
    dir: 'ltr',
    categories: ['business', 'finance', 'shopping'],
    icons: [
      { src: `${SITE_URL}/images/ghaya-logo.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    screenshots: [],
  }
}
