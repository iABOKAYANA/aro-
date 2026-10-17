import { Metadata } from 'next'
import TermsView from './terms-view'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'GHAYA REAL ESTATE terms of service - rules and guidelines for using our platform.',
}

export default function TermsPage() {
  return <TermsView />
}
