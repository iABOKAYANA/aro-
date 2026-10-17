import { Metadata } from 'next'
import { db } from '@/lib/db'
import BlogView from './blog-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Blog | GHAYA REAL ESTATE',
  description: 'Stay updated with the latest real estate news, market insights, and tips from GHAYA REAL ESTATE.',
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
