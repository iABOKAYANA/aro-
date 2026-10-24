'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Bed, Bath, Maximize, Heart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatEGP, formatSQM } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { coverChain } from '@/lib/landmarks'

interface UnitCardProps {
  unit: {
    id: string
    name: string
    slug?: string | null
    unitNumber?: string | null
    unitType: string
    listingType: string
    status: string
    bedrooms?: number | null
    bathrooms?: number | null
    area: number
    price: number
    pricePerSqm?: number | null
    finishingType?: string | null
    view?: string | null
    hasBalcony?: boolean | null
    gallery: string[]
    project?: {
      name: string
      slug: string
      coverImage?: string | null
    } | null
    phase?: { name: string } | null
  }
  projectName?: string
  projectSlug?: string
  projectCoverImage?: string | null
}

export function UnitCard({ unit, projectName, projectSlug, projectCoverImage }: UnitCardProps) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const project = unit.project
  const pName = projectName || project?.name || ''
  const pSlug = projectSlug || project?.slug || ''
  const pCover = projectCoverImage || project?.coverImage
  const unitName = unit.name.trim()
  const looksLikeUnitCode = /^[A-Z0-9]+(?:[-/.][A-Z0-9]+)+$/i.test(unitName)
  const cardTitle = unitName && !looksLikeUnitCode ? unitName : pName
  const gallery = typeof unit.gallery === 'string' ? JSON.parse(unit.gallery) : (unit.gallery || [])
  // Display chain: unit gallery[0] → project cover → placeholder, stepped onError.
  const sources = coverChain(gallery[0], pCover)
  const [stage, setStage] = useState(0)
  useEffect(() => { setStage(0) }, [gallery[0], pCover])
  const image = sources[Math.min(stage, sources.length - 1)]

  return (
    <Card className="group overflow-hidden card-hover">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={image}
          alt={unit.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          onError={() => setStage((s) => (s < sources.length - 1 ? s + 1 : s))}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        <div className="absolute start-3 top-3 flex gap-2">
          <Badge variant="gold">{unit.listingType.replace(/_/g, ' ')}</Badge>
          <Badge className="bg-background/90 text-foreground">
            {unit.unitType.replace(/_/g, ' ')}
          </Badge>
        </div>

        <button aria-label="Save to favorites" className="absolute end-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-background/80 text-foreground transition-colors hover:bg-background hover:text-red-500 md:min-h-0 md:min-w-0 md:p-2">
          <Heart className="h-4 w-4" />
        </button>
      </div>

      <CardContent className="p-4">
        <Link href={`/units/${unit.slug || unit.id}`}>
          {cardTitle !== pName && <p className="text-xs text-muted-foreground">{pName}</p>}
          <h2 className="mb-1 font-semibold hover:text-estate-gold transition-colors">
            {cardTitle}
            {unit.phase && ` · ${unit.phase.name}`}
          </h2>
        </Link>

        <div className="mb-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
          {unit.bedrooms !== null && unit.bedrooms !== undefined && (
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4" />
              {unit.bedrooms} {unit.bedrooms === 1 ? (ar ? 'أوضة' : 'Bed') : (ar ? 'أوض' : 'Beds')}
            </span>
          )}
          {unit.bathrooms !== null && unit.bathrooms !== undefined && (
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              {unit.bathrooms} {unit.bathrooms === 1 ? (ar ? 'حمام' : 'Bath') : (ar ? 'حمامات' : 'Baths')}
            </span>
          )}
          {unit.area > 0 && (
            <span className="flex items-center gap-1">
              <Maximize className="h-4 w-4" />
              {formatSQM(unit.area)}
            </span>
          )}
        </div>

        {unit.finishingType && (
          <Badge variant="secondary" className="mb-3 text-xs">
            {unit.finishingType}
          </Badge>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <div className="min-w-0">
            <p className="break-words text-lg font-bold text-estate-gold max-sm:text-xl max-sm:font-extrabold">
              {formatEGP(unit.price)}
            </p>
            {unit.pricePerSqm && (
              <p className="text-xs text-muted-foreground">
                {formatEGP(unit.pricePerSqm)}{ar ? '/م²' : '/sqm'}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
