import { Metadata } from 'next'
import CookiesView from './cookies-view'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'GHAYA REAL ESTATE cookie policy - how we use cookies and similar technologies.',
  alternates: { canonical: `${SITE_URL}/cookies` },
}

export default function CookiesPage() {
  return <CookiesView />
}
