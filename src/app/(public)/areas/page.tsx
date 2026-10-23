import { Metadata } from 'next'
import { MapPin } from 'lucide-react'
import AreasView from './areas-view'
import { SITE_URL, languageAlternates } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'دليل المناطق | Area Guide',
  description:
    'معلومات كل منطقة من المشاريع المعروضة فعلا — عدد المشاريع وأقل سعر والمدارس والمستشفيات والمواصلات والمولات. أرقام بس، من غير تقييمات. Per-city facts from listed projects: project count, price range and nearby-service coverage.',
  alternates: languageAlternates('/areas'),
  openGraph: {
    title: 'دليل المناطق العقارية في مصر | Area Guide',
    description:
      'معلومات كل منطقة من المشاريع المعروضة فعلا — عدد المشاريع وأقل سعر والمدارس والمستشفيات والمواصلات والمولات.',
        url: `${SITE_URL}/areas`,
        siteName: 'GHAYA REAL ESTATE',
    images: [
      {
        url: `${SITE_URL}/og?t=${encodeURIComponent('Area Guide')}&s=${encodeURIComponent('Real project counts and prices per city')}`,
        width: 1200,
        height: 630,
        alt: 'GHAYA REAL ESTATE — Area Guide',
      },
    ],
  },
}

export default function AreasPage() {
  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center sm:mb-8">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
            <MapPin className="h-3 w-3" /> دليل المناطق · Area facts
          </span>
          <h1 className="text-2xl font-bold sm:text-4xl">دليل المناطق</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            معلومات كل منطقة من المشاريع المعروضة فعلا — عدد المشاريع وأقل سعر
            معلن، والمدارس والمستشفيات والمواصلات والمولات اللي المشاريع مسجلاها
            حواليها.
          </p>
        </div>

        <AreasView />
      </div>
    </div>
  )
}
