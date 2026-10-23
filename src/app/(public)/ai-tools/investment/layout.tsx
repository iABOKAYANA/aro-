import { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Investment Calculator',
  description: 'احسب سيناريوهات الاستثمار العقاري والعائد المتوقع بناءً على السعر والإيجار والافتراضات التي تدخلها.',
  alternates: { canonical: `${SITE_URL}/ai-tools/investment` },
  openGraph: {
    type: 'website',
    title: 'حاسبة الاستثمار العقاري | Investment Calculator',
    description: 'قارن سيناريوهات الاستثمار والعائد من بياناتك وافتراضاتك أنت.',
    url: `${SITE_URL}/ai-tools/investment`,
    siteName: SITE_NAME,
  },
}

export default function InvestmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
