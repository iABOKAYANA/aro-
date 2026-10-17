'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

type ReleaseCard = {
  id: string
  title: string
  titleArabic: string | null
  slug: string
  excerpt: string | null
  content: string
  coverImage: string | null
  source: string | null
  sourceUrl: string | null
  publishedAt: Date | null
}

export default function PressView({ releases }: { releases: ReleaseCard[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="min-h-screen bg-estate-bg-dark dark:bg-black">
      <section className="cine-hero" style={{ height: '60svh', minHeight: '420px', maxHeight: '600px' }}>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center px-4 text-center">
          <Reveal className="flex flex-col items-center">
            <p className="cine-kicker">{ar ? 'التغطية الإعلامية' : 'Media coverage'}</p>
            <h1 className="cine-title mt-4">{ar ? 'الصحافة' : 'Press'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#faf7ef]/85">
              {ar ? 'آخر الأخبار والتغطية الصحفية عن غاية' : 'Latest news and media coverage about GHAYA REAL ESTATE'}
            </p>
          </Reveal>
        </div>
      </section>
      <div className="container px-4 py-8 md:py-12">
        <div className="mx-auto max-w-4xl">

          {releases.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-lg text-gray-400">{ar ? 'لسه مفيش بيانات صحفية.' : 'No press releases available yet.'}</p>
              <p className="mt-2 text-sm text-gray-500">{ar ? 'عدّي علينا كمان شوية لآخر الأخبار.' : 'Check back soon for media updates.'}</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 hidden w-px bg-gradient-to-b from-estate-gold/30 via-white/10 to-transparent sm:block" />

              <div className="space-y-8">
                {releases.map((release, index) => (
                  <Reveal key={release.id} delay={Math.min(index, 3) * 80}>
                  <div
                    className="relative group sm:pl-14"
                  >
                    <div className="absolute left-4 top-6 hidden h-4 w-4 rounded-full border-2 border-estate-gold bg-[#080E1A] sm:block" />

                    <Link
                      href={`/press/${release.slug}`}
                      className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:border-estate-gold/40 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-estate-gold/10 sm:p-6 dark:border-[#262626] dark:bg-[#0A0A0A] dark:hover:border-[#D4A843]/40"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row">
                        {release.coverImage && (
                          <Reveal variant="wipe" className="w-full flex-shrink-0 overflow-hidden rounded-2xl sm:h-32 sm:w-48">
                            <Image
                              src={release.coverImage}
                              alt={ar && release.titleArabic ? release.titleArabic : release.title}
                              width={384}
                              height={256}
                              className="aspect-[3/2] w-full object-cover sm:aspect-auto sm:h-full"
                            />
                          </Reveal>
                        )}

                        <div className="flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                            {release.publishedAt && (
                              <span>
                                {new Date(release.publishedAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                            {release.source && (
                              <>
                                <span className="text-gray-700">·</span>
                                {release.sourceUrl ? (
                                  <a
                                    href={release.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="break-words text-estate-gold hover:underline"
                                  >
                                    {release.source}
                                  </a>
                                ) : (
                                  <span>{release.source}</span>
                                )}
                              </>
                            )}
                          </div>

                          <h2 className="font-display break-words text-lg text-white group-hover:text-estate-gold">
                            {ar && release.titleArabic ? release.titleArabic : release.title}
                          </h2>

                          {release.excerpt && (
                            <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                              {release.excerpt}
                            </p>
                          )}

                          <div className="mt-3">
                            <span className="text-xs text-estate-gold/70 transition-colors group-hover:text-estate-gold">
                              {ar ? 'اقرا البيان كامل ←' : 'Read full release →'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </div>
                  </Reveal>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
