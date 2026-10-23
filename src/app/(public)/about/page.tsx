import { Metadata } from 'next'
import AboutView from './about-view'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn how GHAYA helps people explore Egyptian real estate projects, compare available units and payment information.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    type: 'website',
    title: 'About GHAYA Real Estate',
    description: 'A clearer way to explore real estate projects and available units in Egypt.',
    url: `${SITE_URL}/about`,
    siteName: SITE_NAME,
  },
}

export default function AboutPage() {
  return <AboutView />
}
