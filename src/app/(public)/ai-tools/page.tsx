import { Metadata } from 'next'
import AIToolsView from './ai-tools-view'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'أدوات عقارية ذكية | AI Real Estate Tools',
  description: 'استخدم أدوات غاية لمقارنة المشاريع، تقدير الأسعار، وحساب القدرة الشرائية وخطط السداد في السوق العقاري المصري.',
  alternates: { canonical: `${SITE_URL}/ai-tools` },
  openGraph: {
    type: 'website',
    title: 'أدوات عقارية | GHAYA Real Estate Tools',
    description: 'Compare Egyptian real estate projects, estimate prices, and explore payment options with GHAYA tools.',
    url: `${SITE_URL}/ai-tools`,
    siteName: SITE_NAME,
  },
}

export default function AIToolsPage() {
  return <AIToolsView />
}
