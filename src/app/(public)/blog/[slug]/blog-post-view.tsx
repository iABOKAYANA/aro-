'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

type BlogPost = {
  id: string
  title: string
  titleArabic: string | null
  content: string
  coverImage: string | null
  author: string | null
  category: string | null
  publishedAt: Date | null
  excerpt: string | null
}

export default function BlogPostView({ post }: { post: BlogPost }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const title = ar && post.titleArabic ? post.titleArabic : post.title

  return (
    <div className="min-h-screen bg-estate-bg-dark dark:bg-black">
      <div className="container px-4 py-8 md:py-12">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm text-gray-400 transition-colors hover:text-estate-gold sm:min-h-0"
          >
            <svg
              className="h-4 w-4 rtl:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {ar ? 'ارجع للمدونة' : 'Back to Blog'}
          </Link>

          <article>
            <Reveal>
            {post.coverImage && (
              <div className="relative mb-8 overflow-hidden rounded-2xl border border-estate-gold/15 dark:border-[#D4A843]/15">
                <Image
                  src={post.coverImage}
                  alt={title}
                  width={1200}
                  height={600}
                  className="aspect-[2/1] w-full object-cover"
                />
              </div>
            )}
            </Reveal>

            <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-500">
              {post.category && (
                <span className="rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
                  {post.category}
                </span>
              )}
              {post.author && <span>{post.author}</span>}
              <span>
                {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }) : null}
              </span>
            </div>

            <Reveal>
            <h1 className="font-display display-2 break-words text-white">
              {title}
            </h1>
            </Reveal>

            {post.excerpt && (
              <p className="mt-4 text-lg text-gray-400">
                {post.excerpt}
              </p>
            )}

            <hr className="gold-hairline my-8" />

            <div
              className="prose prose-invert prose-lg max-w-none break-words
                prose-headings:text-white prose-p:text-gray-300 prose-a:text-estate-gold
                prose-strong:text-white prose-code:text-estate-gold prose-pre:bg-white/5
                prose-img:rounded-2xl max-sm:[&_pre]:max-w-full max-sm:[&_pre]:overflow-x-auto
                max-sm:[&_table]:block max-sm:[&_table]:overflow-x-auto max-sm:[&_iframe]:max-w-full"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </article>
        </div>
      </div>
    </div>
  )
}
