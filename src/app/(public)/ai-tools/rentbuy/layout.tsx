import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'حاسبة الإيجار أم الشراء | Rent vs Buy Calculator',
  description: 'قارن تكلفة الإيجار والشراء على المدى الذي تختاره، وعدّل افتراضات النمو والعائد بنفسك.',
  alternates: { canonical: `${SITE_URL}/ai-tools/rentbuy` },
  openGraph: {
    type: 'website',
    title: 'أستأجر ولا أشتري؟ | Rent vs Buy Calculator',
    description: 'أداة سيناريوهات تساعدك تقارن الإيجار والشراء باستخدام الأرقام والافتراضات التي تدخلها.',
    url: `${SITE_URL}/ai-tools/rentbuy`,
    siteName: SITE_NAME,
  },
}

export default function RentBuyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
