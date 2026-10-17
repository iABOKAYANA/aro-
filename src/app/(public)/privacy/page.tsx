import { Metadata } from 'next'
import PrivacyView from './privacy-view'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'GHAYA REAL ESTATE privacy policy - how we collect, use, and protect your personal information.',
}

export default function PrivacyPage() {
  return <PrivacyView />
}
