'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, X, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'
import { getSavedProjects, removeSaved, type SavedProject } from '@/lib/saved-projects'

export function SavedClient() {
  const { lang } = useLanguage()
  const isRtl = lang === 'ar'
  const [items, setItems] = useState<SavedProject[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setItems(getSavedProjects())
    setMounted(true)
  }, [])

  const remove = (id: string) => {
    removeSaved(id)
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <div className="min-h-[60vh] bg-gray-50 dark:bg-black">
      <div className="container px-4 py-10">
        <Reveal>
          <SectionHeader
            kicker={isRtl ? 'قايمتك الخاصة' : 'Your shortlist'}
            title={isRtl ? 'المشاريع المحفوظة' : 'Saved Projects'}
            description={
              mounted && items.length > 0
                ? isRtl
                  ? `${items.length} مشروع محفوظ`
                  : `${items.length} saved project${items.length === 1 ? '' : 's'}`
                : isRtl
                  ? 'المشاريع اللي حفظتها بتظهر هنا'
                  : 'Projects you save are kept here — on this device.'
            }
          />
        </Reveal>

        {!mounted ? null : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card py-20 text-center dark:border-[#262626] dark:bg-[#0A0A0A]">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-estate-gold/10">
              <Heart className="h-7 w-7 text-estate-gold" />
            </div>
            <h2 className="mb-1 text-lg font-semibold">
              {isRtl ? 'مفيش مشاريع محفوظة لسه' : 'No saved projects yet'}
            </h2>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              {isRtl
                ? 'دوس على «Save» في أي مشروع عشان تلاقيه هنا بسرعة.'
                : 'Hit “Save” on any project and it will show up here for quick access.'}
            </p>
            <Button asChild className="bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark">
              <Link href="/projects">{isRtl ? 'تصفّح المشاريع' : 'Browse projects'}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p, index) => (
              <Reveal key={p.id} delay={Math.min(index % 3, 2) * 80}>
              <div
                className="group relative h-full overflow-hidden rounded-2xl border bg-card transition-all hover:border-estate-gold/40 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#262626] dark:bg-[#0A0A0A] dark:hover:border-[#D4A843]/40"
              >
                <Link href={`/projects/${p.slug}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    {p.coverImage ? (
                      <Image
                        src={p.coverImage}
                        alt={p.name}
                        fill
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Heart className="h-8 w-8 text-estate-gold/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="font-display truncate text-white">
                        {isRtl && p.nameArabic ? p.nameArabic : p.name}
                      </p>
                      {p.startPrice != null && (
                        <p className="text-sm font-bold text-estate-gold">
                          {formatEGP(p.startPrice)}
                          {isRtl ? ' يبدأ من' : ' starting'}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-between px-4 py-3">
                  <Link
                    href={`/projects/${p.slug}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-estate-gold hover:underline"
                  >
                    {isRtl ? 'اكتب المشروع' : 'Open project'}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    aria-label={isRtl ? 'إزالة من المحفوظات' : 'Remove from saved'}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
