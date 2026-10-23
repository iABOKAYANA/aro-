import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'حاسبة الميزانية العقارية | Property Affordability',
  description: 'قدّر ميزانيتك العقارية واكتشف المشاريع والوحدات المعروضة المناسبة بناءً على الدخل والمقدم وخطة السداد.',
  alternates: { canonical: `${SITE_URL}/ai-tools/affordability` },
  openGraph: {
    type: 'website',
    title: 'حاسبة القدرة الشرائية العقارية | GHAYA',
    description: 'اكتشف وحدات ومشاريع معروضة تناسب ميزانيتك وخطة السداد.',
    url: `${SITE_URL}/ai-tools/affordability`,
    siteName: SITE_NAME,
  },
}

export default function AffordabilityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
