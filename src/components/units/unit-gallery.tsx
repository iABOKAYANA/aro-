'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'

interface UnitGalleryProps {
  images: string[]
  name: string
}

/** Thumbnail grid with a full-screen lightbox for unit photos. */
export function UnitGallery({ images, name }: UnitGalleryProps) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [idx, setIdx] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!images || images.length === 0) return null

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-lg font-semibold">{ar ? 'الصور' : 'Gallery'}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            onClick={() => setIdx(i)}
            className="group relative aspect-[4/3] overflow-hidden rounded-2xl border bg-muted"
            aria-label={`Open ${name} image ${i + 1}`}
          >
            <Image
              src={url}
              alt={`${name} — ${i + 1}`}
              fill
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              loading="lazy"
            />
            <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
          </button>
        ))}
      </div>

      {mounted && idx !== null && images[idx] && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={() => setIdx(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setIdx(null)}
            className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/25 md:min-h-0 md:min-w-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((idx - 1 + images.length) % images.length) }}
                className="absolute left-3 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 md:min-h-0 md:min-w-0"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((idx + 1) % images.length) }}
                className="absolute right-3 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 md:min-h-0 md:min-w-0"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <Image
            src={images[idx]}
            alt={`${name} — ${idx + 1}`}
            width={1600}
            height={1200}
            className="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
          />
          <p className="mt-3 text-sm text-white/70">
            {idx + 1} / {images.length}
          </p>
        </div>,
        document.body
      )}
    </div>
  )
}
