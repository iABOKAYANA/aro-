'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import {
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  Inbox,
  X,
  Star,
  Check,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type Review = {
  id: string
  rating: number
  comment: string | null
  status: string
  createdAt: string
  user: { id: string; name: string | null } | null
  project: { id: string; name: string; slug: string } | null
}

const STATUS_TABS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  APPROVED: 'bg-green-500/15 text-green-400 border-green-500/30',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

function Stars({ value, ar }: { value: number; ar: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={ar ? `${value} من ٥ نجوم` : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            'h-3.5 w-3.5',
            s <= value ? 'fill-estate-gold text-estate-gold' : 'text-gray-600'
          )}
        />
      ))}
    </span>
  )
}

export default function CEOReviewsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('PENDING')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (activeTab !== 'ALL') params.set('status', activeTab)
      const res = await fetch(`/api/reviews?${params}`)
      if (!res.ok) throw new Error('Failed to fetch reviews')
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch (err) {
      console.error('Failed to fetch reviews:', err)
      setError(ar ? 'معرفناش نجيب التقييمات — حاول تاني.' : 'Failed to fetch reviews')
    } finally {
      setLoading(false)
    }
  }, [activeTab, ar])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  const moderate = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update review')
      await fetchReviews()
    } catch (err) {
      console.error('Failed to update review:', err)
      alert(ar ? 'معرفناش نحدّث التقييم — حاول تاني.' : 'Failed to update review')
    } finally {
      setUpdatingId(null)
    }
  }

  const needle = search.trim().toLowerCase()
  const filtered = needle
    ? reviews.filter((r) =>
        [r.user?.name, r.project?.name, r.comment].some((v) =>
          (v ?? '').toLowerCase().includes(needle)
        )
      )
    : reviews

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · التقييمات' : 'CEO Console · Reviews'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'مراجعة التقييمات' : 'Reviews Moderation'}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar ? 'وافق على تقييمات الزوار قبل ما تظهر على صفحات المشاريع' : 'Approve visitor ratings before they show on project pages'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button onClick={fetchReviews} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200',
              activeTab === tab
                ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
                : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:border-border dark:hover:border-[#262626] hover:text-gray-300'
            )}
          >
            {tab === 'ALL' ? (ar ? 'الكل' : 'ALL') : statusLabel(tab, ar)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بزاير أو مشروع أو تعليق…' : 'Search by visitor, project, comment...'}
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchReviews} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش تقييمات' : 'No reviews found'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search criteria') : (ar ? 'مفيش حاجة مستنية المراجعة' : 'Nothing waiting for moderation')}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الزاير' : 'Visitor'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'المشروع' : 'Project'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'التقييم' : 'Rating'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'التعليق' : 'Comment'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filtered.map((review) => (
                    <tr key={review.id} className="transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-estate-gold/20 to-estate-gold/5 text-sm font-semibold text-estate-gold">
                            {(review.user?.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{review.user?.name || (ar ? 'زاير' : 'Visitor')}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(review.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <p className="text-gray-300">{review.project?.name || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Stars value={review.rating} ar={ar} />
                      </td>
                      <td className="hidden max-w-[280px] px-4 py-3 lg:table-cell">
                        <p className="truncate text-gray-400">{review.comment || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                          STATUS_COLORS[review.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                        )}>
                          {statusLabel(review.status, ar)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {review.status === 'PENDING' ? (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => moderate(review.id, 'APPROVED')} disabled={updatingId === review.id} className="text-green-400 hover:text-green-300" title={ar ? 'وافق' : 'Approve'}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => moderate(review.id, 'REJECTED')} disabled={updatingId === review.id} className="text-red-400 hover:text-red-300" title={ar ? 'ارفض' : 'Reject'}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">{ar ? 'خلص' : 'Done'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
