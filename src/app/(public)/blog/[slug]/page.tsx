import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { absoluteImage } from '@/lib/seo'
import BlogPostView from './blog-post-view'

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  return []
}

interface BlogPostPageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = await db.blog.findFirst({
    where: { slug: params.slug, isPublished: true },
    select: { title: true, excerpt: true, coverImage: true, author: true, publishedAt: true },
  })

  if (!post) return { title: 'Post Not Found', robots: { index: false, follow: false } }

  const url = `${SITE_URL}/blog/${params.slug}`
  const description = (post.excerpt || `Real estate news, market insights, and guides from ${SITE_NAME}.`).slice(0, 180)
  const image = absoluteImage(post.coverImage)

  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      url,
      siteName: SITE_NAME,
      ...(image ? { images: [{ url: image, alt: post.title }] } : {}),
      ...(post.publishedAt ? { publishedTime: post.publishedAt.toISOString() } : {}),
      ...(post.author ? { authors: [post.author] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await db.blog.findFirst({
    where: { slug: params.slug, isPublished: true },
    select: {
      id: true,
      title: true,
      titleArabic: true,
      content: true,
      coverImage: true,
      author: true,
      category: true,
      publishedAt: true,
      excerpt: true,
      updatedAt: true,
      isPublished: true,
    },
  })

  if (!post || !post.isPublished) notFound()

  const postUrl = `${SITE_URL}/blog/${params.slug}`
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    ...(post.titleArabic ? { alternativeHeadline: post.titleArabic } : {}),
    ...(post.excerpt ? { description: post.excerpt } : {}),
    url: postUrl,
    mainEntityOfPage: postUrl,
    ...(absoluteImage(post.coverImage) ? { image: absoluteImage(post.coverImage) } : {}),
    ...(post.author ? { author: { '@type': 'Person', name: post.author } } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt.toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt.toISOString() } : {}),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd).replace(/</g, '\\u003c') }} />
      <BlogPostView post={post} />
    </>
  )
}
