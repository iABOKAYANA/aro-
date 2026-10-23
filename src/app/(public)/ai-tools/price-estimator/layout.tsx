import { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'حاسبة تقدير سعر العقار | Property Price Estimator',
  description: 'تقدير أولي غير رسمي يعتمد على افتراضات مبسطة؛ لا يمثل سعر وحدة معروضة أو تقييمًا عقاريًا معتمدًا.',
  alternates: { canonical: `${SITE_URL}/ai-tools/price-estimator` },
  robots: { index: false, follow: true },
}

export default function PriceEstimatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
