import { Metadata } from 'next'
import MortgageView from './mortgage-view'
import { SITE_NAME, SITE_URL, languageAlternates } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mortgage & Installment Calculator',
  description:
    'Compare a bank mortgage, a developer installment plan and paying cash — monthly payment, total interest and full amortisation schedule.',
  alternates: languageAlternates('/ai-tools/mortgage'),
  openGraph: {
    title: 'Mortgage & Installment Calculator',
    description:
      'Compare a bank mortgage, a developer installment plan and paying cash — with a full amortisation schedule.',
    url: `${SITE_URL}/ai-tools/mortgage`,
    siteName: SITE_NAME,
  },
}

export default function MortgagePage() {
  return <MortgageView />
}
