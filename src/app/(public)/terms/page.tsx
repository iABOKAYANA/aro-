import { Metadata } from 'next'
import TermsView from './terms-view'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'GHAYA REAL ESTATE terms of service - rules and guidelines for using our platform.',
  alternates: { canonical: `${SITE_URL}/terms` },
}

export default function TermsPage() {
  return <TermsView />
}
