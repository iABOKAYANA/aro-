import { Metadata } from 'next'
import PrivacyView from './privacy-view'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'GHAYA REAL ESTATE privacy policy - how we collect, use, and protect your personal information.',
  alternates: { canonical: `${SITE_URL}/privacy` },
}

export default function PrivacyPage() {
  return <PrivacyView />
}
