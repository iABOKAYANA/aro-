import { Metadata } from 'next'
import { db } from '@/lib/db'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import BlogView from './blog-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const publishedCount = await db.blog.count({ where: { isPublished: true } }).catch(() => 0)
  const title = 'مدونة العقارات في مصر | Real Estate Insights'
  const description = 'نصائح ومعلومات عن شراء العقارات والسوق المصري. Real estate market insights, buying guides, and property news from GHAYA.'
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/blog` },
    ...(publishedCount === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${SITE_URL}/blog`,
      siteName: SITE_NAME,
      images: [{ url: `${SITE_URL}/og?t=${encodeURIComponent(title)}&s=${encodeURIComponent(description)}`, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [`${SITE_URL}/og?t=${encodeURIComponent(title)}`] },
  }
}

export default async function BlogPage() {
  const posts = await db.blog.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      titleArabic: true,
      slug: true,
      excerpt: true,
      coverImage: true,
      category: true,
      publishedAt: true,
      author: true,
    },
  })

  return <BlogView posts={posts} />
}
