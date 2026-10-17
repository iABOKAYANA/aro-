'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

type BlogCard = {
  id: string
  title: string
  titleArabic: string | null
  slug: string
  excerpt: string | null
  coverImage: string | null
  category: string | null
  publishedAt: Date | null
  author: string | null
}

export default function BlogView({ posts }: { posts: BlogCard[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="min-h-screen bg-estate-bg-dark dark:bg-black">
      <section className="cine-hero" style={{ height: '60svh', minHeight: '420px', maxHeight: '600px' }}>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center px-4 text-center">
          <Reveal className="flex flex-col items-center">
            <p className="cine-kicker">{ar ? 'رؤى السوق' : 'Market insights'}</p>
            <h1 className="cine-title mt-4">{ar ? 'المدونة' : 'Blog'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#faf7ef]/85">
              {ar ? 'أخبار العقارات وتحديثات السوق ونصايح الخبرا' : 'Real estate insights, market updates, and expert advice'}
            </p>
          </Reveal>
        </div>
      </section>
      <div className="container px-4 py-8 md:py-12">
        <div className="mx-auto max-w-6xl">

          {posts.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-lg text-gray-400">{ar ? 'لسه مفيش مقالات.' : 'No blog posts available yet.'}</p>
              <p className="mt-2 text-sm text-gray-500">{ar ? 'عدّي علينا كمان شوية لآخر الأخبار.' : 'Check back soon for the latest updates.'}</p>
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <Reveal key={post.id} delay={Math.min(index % 3, 2) * 80}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group block h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all hover:border-estate-gold/40 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#262626] dark:bg-[#0A0A0A] dark:hover:border-[#D4A843]/40"
                >
                  <Reveal variant="wipe" className="relative aspect-[16/10] overflow-hidden">
                    {post.coverImage ? (
                      <Image
                        src={post.coverImage}
                        alt={ar && post.titleArabic ? post.titleArabic : post.title}
                        fill
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-estate-navy to-[#111827] dark:from-black dark:to-[#0A0A0A]">
                        <span className="text-4xl font-bold text-estate-gold/20">EA</span>
                      </div>
                    )}
                    {post.category && (
                      <span className="absolute start-3 top-3 rounded-full bg-estate-gold/90 px-3 py-1 text-xs font-medium text-estate-navy">
                        {post.category}
                      </span>
                    )}
                  </Reveal>

                  <div className="p-5">
                    <h2 className="font-display break-words text-lg text-white transition-colors group-hover:text-estate-gold">
                      {ar && post.titleArabic ? post.titleArabic : post.title}
                    </h2>

                    {post.excerpt && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                        {post.excerpt}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      {post.author && <span>{post.author}</span>}
                      {post.publishedAt && (
                        <span>
                          {new Date(post.publishedAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
