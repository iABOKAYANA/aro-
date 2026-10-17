import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import BlogPostView from './blog-post-view'

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  return []
}

interface BlogPostPageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = await db.blog.findUnique({
    where: { slug: params.slug },
    select: { title: true, excerpt: true },
  })

  if (!post) return { title: 'Post Not Found' }

  return {
    title: `${post.title} | GHAYA Blog`,
    description: post.excerpt || undefined,
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await db.blog.findUnique({
    where: { slug: params.slug },
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
    },
  })

  if (!post || !post.publishedAt) notFound()

  return <BlogPostView post={post} />
}
