import { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'AI Property Search',
  description: 'Search Egyptian properties using natural language with our AI-powered search. Describe what you want and get instant results.',
  alternates: { canonical: `${SITE_URL}/ai-tools/search` },
  openGraph: {
    type: 'website',
    title: 'البحث عن عقارات في مصر | AI Property Search',
    description: 'ابحث عن مشاريع ووحدات عقارية في مصر باستخدام وصفك وميزانيتك والمنطقة المناسبة.',
    url: `${SITE_URL}/ai-tools/search`,
    siteName: SITE_NAME,
  },
}

export default function AISearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
