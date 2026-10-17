'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import ImageInput from '../components/image-input'
import { useLanguage } from '@/lib/language-context'
import {
  FileText,
  Plus,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  Inbox,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type BlogPost = {
  id: string
  title: string
  titleArabic: string | null
  slug: string
  excerpt: string | null
  content: string
  coverImage: string | null
  author: string | null
  tags: string
  category: string | null
  isPublished: boolean
  publishedAt: string | null
  viewCount: number
  createdAt: string
  updatedAt: string
}

type BlogForm = {
  title: string
  titleArabic: string
  slug: string
  excerpt: string
  content: string
  category: string
  coverImage: string
  isPublished: boolean
}

const emptyForm: BlogForm = {
  title: '',
  titleArabic: '',
  slug: '',
  excerpt: '',
  content: '',
  category: '',
  coverImage: '',
  isPublished: false,
}

export default function CEOBlogPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<BlogForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/blog?limit=100&all=true')
      if (!res.ok) throw new Error('Failed to fetch blog posts')
      const data = await res.json()
      // The API answers { items, total, page, totalPages } — older code
      // assigned that object straight into state and crashed on .filter().
      setPosts(Array.isArray(data) ? data : data.items || data.posts || data.blogs || [])
    } catch (err) {
      console.error('Failed to fetch blog posts:', err)
      setError(ar ? 'معرفناش نجيب المقالات — حاول تاني.' : 'Failed to fetch blog posts')
    } finally {
      setLoading(false)
    }
  }, [ar])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  const handleTitleChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: prev.slug === generateSlug(prev.title) || prev.slug === '' ? generateSlug(value) : prev.slug,
    }))
  }

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/blog', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed to create blog post')
      setShowForm(false)
      setForm(emptyForm)
      await fetchPosts()
    } catch (err) {
      console.error('Failed to create blog post:', err)
      alert(ar ? 'معرفناش نعمل المقال — حاول تاني.' : 'Failed to create blog post')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePublish = async (post: BlogPost) => {
    setTogglingId(post.id)
    try {
      const res = await fetch('/api/blog', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, isPublished: !post.isPublished }),
      })
      if (!res.ok) throw new Error('Failed to update post')
      await fetchPosts()
    } catch (err) {
      console.error('Failed to update post:', err)
      alert(ar ? 'معرفناش نحدّث المقال — حاول تاني.' : 'Failed to update post')
    } finally {
      setTogglingId(null)
    }
  }

  const deletePost = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/blog?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) throw new Error('Failed to delete post')
      setExpandedId(null)
      await fetchPosts()
    } catch (err) {
      console.error('Failed to delete post:', err)
      alert(ar ? 'معرفناش نمسح المقال — حاول تاني.' : 'Failed to delete post')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredPosts = posts.filter((post) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      post.title.toLowerCase().includes(q) ||
      (post.titleArabic && post.titleArabic.toLowerCase().includes(q)) ||
      (post.category && post.category.toLowerCase().includes(q))
    )
  })

  const publishedCount = posts.filter((p) => p.isPublished).length
  const draftCount = posts.filter((p) => !p.isPublished).length
  const totalViews = posts.reduce((sum, p) => sum + p.viewCount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · المقالات' : 'CEO Console · Blog'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة المقالات' : 'Blog Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'اعمل واتحكم في مقالات المدونة' : 'Create and manage blog posts and articles'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex gap-2">
          <Button onClick={fetchPosts} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button onClick={() => setShowForm(!showForm)} className="bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
            <Plus className="mr-2 h-4 w-4" />
            {ar ? 'مقال جديد' : 'New Post'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Posts', labelAr: 'كل المقالات', value: posts.length, color: 'text-blue-400 bg-blue-500/10', icon: <FileText className="h-5 w-5" /> },
          { label: 'Published', labelAr: 'منشورين', value: publishedCount, color: 'text-green-400 bg-green-500/10', icon: <CheckCircle2 className="h-5 w-5" /> },
          { label: 'Drafts', labelAr: 'مسودات', value: draftCount, color: 'text-yellow-400 bg-yellow-500/10', icon: <Edit className="h-5 w-5" /> },
          { label: 'Total Views', labelAr: 'كل المشاهدات', value: totalViews, color: 'text-estate-gold bg-estate-gold/10', icon: <Eye className="h-5 w-5" /> },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', stat.color)}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{ar ? stat.labelAr : stat.label}</p>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border dark:border-[#262626] pb-4">
            <CardTitle className="text-lg text-foreground">{ar ? 'مقال جديد' : 'New Blog Post'}</CardTitle>
            <button onClick={() => { setShowForm(false); setForm(emptyForm) }} className="rounded-full p-1 text-gray-500 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'العنوان *' : 'Title *'}</label>
                <Input
                  value={form.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={ar ? 'اكتب عنوان المقال…' : 'Enter post title...'}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'العنوان (بالعربي)' : 'Title (Arabic)'}</label>
                <Input
                  value={form.titleArabic}
                  onChange={(e) => setForm({ ...form, titleArabic: e.target.value })}
                  placeholder="العنوان بالعربية"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الرابط' : 'Slug'}</label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="auto-generated-from-title"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'التصنيف' : 'Category'}</label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Market Insights, Tips"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'مختصر' : 'Excerpt'}</label>
              <Input
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                placeholder={ar ? 'ملخص سريع للمقال…' : 'Brief summary of the post...'}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
              />
            </div>
            <ImageInput
              label={ar ? 'صورة الغلاف (ارفع ملف أو حط لينك)' : 'Cover Image (upload a file or paste a URL)'}
              value={form.coverImage}
              onChange={(v) => setForm({ ...form, coverImage: v })}
            />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'المحتوى *' : 'Content *'}</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                placeholder={ar ? 'اكتب محتوى المقال هنا…' : 'Write your blog post content here...'}
                className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:outline-none focus:ring-1 focus:ring-estate-gold/20"
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{ar ? 'انشر فورًا' : 'Publish immediately'}</p>
                <p className="text-xs text-gray-500">{ar ? 'شغّلها عشان تنشر أو سيبها مسودة' : 'Toggle to publish or save as draft'}</p>
              </div>
              <button
                onClick={() => setForm({ ...form, isPublished: !form.isPublished })}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  form.isPublished ? 'bg-estate-gold' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    form.isPublished ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm) }} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleSubmit} disabled={!form.title.trim() || !form.content.trim() || submitting} className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {ar ? 'بيتعمل…' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {ar ? 'اعمل المقال' : 'Create Post'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بالعنوان أو التصنيف…' : 'Search posts by title or category...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-10 text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchPosts} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {!loading && !error && filteredPosts.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش مقالات' : 'No blog posts found'}</p>
          <p className="mt-1 text-sm text-gray-500">{search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search') : (ar ? 'اعمل أول مقال' : 'Create your first blog post')}</p>
        </div>
      )}

      {!loading && !error && filteredPosts.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'العنوان' : 'Title'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'التصنيف' : 'Category'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 sm:table-cell">{ar ? 'المشاهدات' : 'Views'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'التاريخ' : 'Date'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filteredPosts.map((post) => {
                    const isExpanded = expandedId === post.id
                    return (
                      <>
                        <tr
                          key={post.id}
                          onClick={() => setExpandedId(isExpanded ? null : post.id)}
                          className={cn('cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', isExpanded && 'bg-muted')}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-estate-gold/10 text-estate-gold">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate max-w-[200px] sm:max-w-none">{post.title}</p>
                                {post.titleArabic && (
                                  <p className="text-xs text-gray-500 truncate max-w-[200px] sm:max-w-none">{post.titleArabic}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            {post.category ? (
                              <Badge className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-xs text-gray-300">{post.category}</Badge>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePublish(post) }}
                              disabled={togglingId === post.id}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                                post.isPublished
                                  ? 'border-green-500/30 bg-green-500/15 text-green-400 hover:bg-green-500/20'
                                  : 'border-yellow-500/30 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/20'
                              )}
                            >
                              {togglingId === post.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : post.isPublished ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {post.isPublished ? (ar ? 'منشور' : 'Published') : (ar ? 'مسودة' : 'Draft')}
                            </button>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <Eye className="h-3 w-3" />
                              {post.viewCount}
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-gray-400">
                              {new Date(post.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => togglePublish(post)}
                                disabled={togglingId === post.id}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {post.isPublished ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => deletePost(post.id)}
                                disabled={deletingId === post.id}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                              >
                                {deletingId === post.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : post.id)}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${post.id}-expanded`}>
                            <td colSpan={6} className="border-b border-border dark:border-[#262626] bg-white/[0.02] px-4 py-5">
                              <div className="grid gap-6 lg:grid-cols-2">
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'تفاصيل المقال' : 'Post Details'}</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'الرابط' : 'Slug'}</span>
                                      <span className="text-gray-300">{post.slug}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'التصنيف' : 'Category'}</span>
                                      <span className="text-gray-300">{post.category || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'الكاتب' : 'Author'}</span>
                                      <span className="text-gray-300">{post.author || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'المشاهدات' : 'Views'}</span>
                                      <span className="text-gray-300">{post.viewCount}</span>
                                    </div>
                                    {post.publishedAt && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">{ar ? 'اتنشر' : 'Published'}</span>
                                        <span className="text-gray-300">{new Date(post.publishedAt).toLocaleDateString(ar ? 'ar-EG' : undefined)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'معاينة المحتوى' : 'Content Preview'}</h4>
                                  <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-3">
                                    {post.excerpt && <p className="mb-2 text-sm text-gray-400 italic">{post.excerpt}</p>}
                                    <p className="text-sm text-gray-300 line-clamp-4">{post.content}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
