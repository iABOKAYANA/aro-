'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

type PressRelease = {
  title: string
  titleArabic: string | null
  excerpt: string | null
  content: string
  coverImage: string | null
  source: string | null
  sourceUrl: string | null
  publishedAt: Date | null
}

export default function PressReleaseView({ release }: { release: PressRelease }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const title = ar && release.titleArabic ? release.titleArabic : release.title

  return (
    <div className="min-h-screen bg-estate-bg-dark dark:bg-black">
      <div className="container px-4 py-8 md:py-12">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/press"
            className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm text-gray-400 transition-colors hover:text-estate-gold sm:min-h-0"
          >
            <svg className="h-4 w-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {ar ? 'ارجع للصحافة' : 'Back to Press'}
          </Link>

          <article>
            <Reveal>
            {release.coverImage && (
              <div className="relative mb-8 aspect-[2/1] overflow-hidden rounded-2xl border border-estate-gold/15 dark:border-[#D4A843]/15">
                <Image
                  src={release.coverImage}
                  alt={title}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                />
              </div>
            )}
            </Reveal>

            <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-gray-500">
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
                      className="text-estate-gold hover:underline"
                    >
                      {release.source}
                    </a>
                  ) : (
                    <span>{release.source}</span>
                  )}
                </>
              )}
            </div>

            <Reveal>
            <h1 className="font-display display-2 break-words text-white">{title}</h1>
            </Reveal>

            {release.excerpt && <p className="mt-4 text-lg text-gray-400">{release.excerpt}</p>}

            <hr className="gold-hairline my-8" />

            <div
              className="prose prose-invert prose-lg max-w-none break-words prose-headings:text-white prose-p:text-gray-300 prose-a:text-estate-gold prose-strong:text-white prose-img:rounded-2xl max-sm:[&_pre]:max-w-full max-sm:[&_pre]:overflow-x-auto max-sm:[&_table]:block max-sm:[&_table]:overflow-x-auto max-sm:[&_iframe]:max-w-full"
              dangerouslySetInnerHTML={{ __html: release.content }}
            />
          </article>
        </div>
      </div>
    </div>
  )
}
