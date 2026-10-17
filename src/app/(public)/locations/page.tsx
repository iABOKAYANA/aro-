import { Metadata } from 'next'
import { MapPin } from 'lucide-react'
import LocationsView from './locations-view'
import { languageAlternates } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'كل المناطق | All Areas',
  description:
    'كل حتة فيها مشاريع معروضة في مكان واحد — اختار المنطقة وشوف مشاريعها وأسعارها. Every area with active projects in one directory: project count and starting price per city.',
  alternates: languageAlternates('/locations'),
  openGraph: {
    title: 'كل المناطق | GHAYA REAL ESTATE',
    description:
      'كل حتة فيها مشاريع معروضة في مكان واحد — اختار المنطقة وشوف مشاريعها وأسعارها.',
  },
}

export default function LocationsPage() {
  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
            <MapPin className="h-3 w-3" /> كل المناطق · All areas
          </span>
          <h1 className="text-2xl font-bold sm:text-4xl">كل المناطق</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            كل حتة فيها مشاريع معروضة في مكان واحد — اختار المنطقة وشوف
            مشاريعها وأقل سعر معلن فيها.
          </p>
        </div>

        <LocationsView />
      </div>
    </div>
  )
}
