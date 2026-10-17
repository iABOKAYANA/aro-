'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Home, Bed, Bath, Maximize, Eye } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatEGP, formatSQM } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

interface Unit {
  id: string
  name: string
  slug: string | null
  unitNumber: string | null
  unitType: string
  listingType: string
  status: string
  bedrooms: number | null
  bathrooms: number | null
  area: number
  price: number
  finishingType: string | null
  viewCount: number
  project: { name: string; slug: string }
}

const UNIT_TYPE_AR: Record<string, string> = {
  APARTMENT: 'شقة',
  VILLA: 'فيلا',
  TWINHOUSE: 'توين هاوس',
  TOWNHOUSE: 'تاون هاوس',
  DUPLEX: 'دوبلكس',
  PENTHOUSE: 'بنتهاوس',
  STUDIO: 'استوديو',
  CHALET: 'شاليه',
  OFFICE: 'مكتب',
  SHOP: 'محل',
  CLINIC: 'عيادة',
  LAND: 'أرض',
}

const LISTING_TYPE_AR: Record<string, string> = {
  SALE: 'بيع',
  RENT: 'إيجار',
  RESALE: 'إعادة بيع',
}

const STATUS_LABEL_AR: Record<string, string> = {
  AVAILABLE: 'متاح',
  RESERVED: 'محجوز',
  SOLD: 'متباع',
  RENTED: 'متأجر',
  PENDING: 'مستني',
  CANCELLED: 'ملغي',
}

export default function DashboardUnitsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/units')
      .then((r) => r.json())
      .then((data) => { setUnits(data.units || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = units.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.project.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker={ar ? 'العقارات' : 'Properties'}
          title={ar ? 'الوحدات' : 'Units'}
          description={ar ? 'إدارة الوحدات العقارية' : 'Manage property units'}
        />
      </Reveal>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={ar ? 'دوّر على الوحدات...' : 'Search units...'} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">{ar ? 'بيحمّل...' : 'Loading...'}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">{ar ? 'مفيش وحدات' : 'No units found'}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((unit) => (
            <Card key={unit.id} className="card-hover border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="gold">{ar ? UNIT_TYPE_AR[unit.unitType] || unit.unitType.replace(/_/g, ' ') : unit.unitType.replace(/_/g, ' ')}</Badge>
                  <Badge variant="secondary">{ar ? LISTING_TYPE_AR[unit.listingType] || unit.listingType.replace(/_/g, ' ') : unit.listingType.replace(/_/g, ' ')}</Badge>
                  {unit.status !== 'AVAILABLE' && <Badge variant="destructive">{ar ? STATUS_LABEL_AR[unit.status] || unit.status.replace(/_/g, ' ') : unit.status.replace(/_/g, ' ')}</Badge>}
                </div>
                <p className="font-semibold">{unit.project.name}</p>
                <p className="text-sm text-muted-foreground">{unit.unitNumber || unit.name}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {unit.bedrooms != null && <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" />{unit.bedrooms} {ar ? 'أوض' : 'Bed'}</span>}
                  {unit.bathrooms != null && <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{unit.bathrooms} {ar ? 'حمّام' : 'Bath'}</span>}
                  <span className="flex items-center gap-1"><Maximize className="h-3.5 w-3.5" />{formatSQM(unit.area)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-estate-gold/15 pt-3">
                  <span className="text-lg font-bold text-estate-gold">{formatEGP(unit.price)}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3 w-3" />{unit.viewCount}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
