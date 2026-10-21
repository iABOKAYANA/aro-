'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/language-context'
import { ceoApi, Toast, StatusPill, type ToastState } from '../components/manager-ui'

/**
 * Q&A moderation: project questions from visitors land PENDING; the CEO
 * answers them here and publishes → they render on the public project page.
 */

interface QItem {
  id: string
  slug: string
  name: string
  phone?: string | null
  question: string
  answer?: string | null
  status: string
  createdAt: string
  project?: { name: string; nameArabic?: string | null } | null
}

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  PENDING: 'yellow',
  ANSWERED: 'blue',
  PUBLISHED: 'green',
  REJECTED: 'red',
}

export default function QuestionsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<QItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<string>('PENDING')
  const [slugQ, setSlugQ] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  async function load() {
    try {
      const params = new URLSearchParams()
      if (filter) params.set('status', filter)
      if (slugQ.trim()) params.set('slug', slugQ.trim())
      const d = await ceoApi<{ items: QItem[]; counts: Record<string, number> }>(
        `/api/ceo/questions?${params.toString()}`
      )
      setItems(d.items)
      setCounts(d.counts)
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, slugQ])

  async function update(item: QItem, action: 'answer-publish' | 'reject') {
    setBusy(item.id)
    try {
      if (action === 'answer-publish') {
        await ceoApi('/api/ceo/questions', 'PATCH', {
          id: item.id,
          answer: drafts[item.id] ?? '',
          status: 'PUBLISHED',
        })
      } else {
        await ceoApi('/api/ceo/questions', 'PATCH', { id: item.id, status: 'REJECTED' })
      }
      setToast({ msg: ar ? 'تم التحديث' : 'Updated', tone: 'ok' })
      await load()
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const TABS: Array<{ key: string; arLabel: string; enLabel: string }> = [
    { key: 'PENDING', arLabel: 'جديدة', enLabel: 'Pending' },
    { key: 'ANSWERED', arLabel: 'متجاوبة مش منشورة', enLabel: 'Answered (not published)' },
    { key: 'PUBLISHED', arLabel: 'منشورة', enLabel: 'Published' },
    { key: 'REJECTED', arLabel: 'مرفوضة', enLabel: 'Rejected' },
  ]

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold">{ar ? 'أسئلة الزوار عن المشاريع' : 'Project Q&A'}</h1>
        <span className="text-sm text-muted-foreground">{counts.PENDING || 0} {ar ? 'جديدة' : 'pending'}</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {ar ? 'جاوب، واعمل نشر — الإجابة تظهر على صفحة المشروع فورًا.' : 'Answer then publish — the answer appears on the project page immediately.'}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              filter === t.key ? 'border-estate-gold bg-estate-gold/10 text-estate-gold' : 'border-border'
            }`}
          >
            {ar ? t.arLabel : t.enLabel} ({counts[t.key] || 0})
          </button>
        ))}
        <Input
          placeholder={ar ? 'فلتر بسلاگ المشروع' : 'Filter by project slug'}
          value={slugQ}
          onChange={(e) => setSlugQ(e.target.value)}
          className="ms-auto max-w-xs"
        />
      </div>

      <div className="space-y-3">
        {items.map((q) => (
          <Card key={q.id}>
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusPill tone={STATUS_TONE[q.status] || 'yellow'}>{q.status}</StatusPill>
                <span className="font-medium text-foreground">{q.name}</span>
                {q.phone && <span dir="ltr">· {q.phone}</span>}
                <span>· {q.project?.nameArabic || q.project?.name || q.slug}</span>
                <span>· {new Date(q.createdAt).toLocaleDateString('ar-EG')}</span>
                <Link href={`/projects/${q.slug}`} target="_blank" className="text-estate-gold hover:underline">
                  {ar ? 'صفحة المشروع' : 'project →'}
                </Link>
              </div>
              <p className="text-sm font-medium">{q.question}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder={ar ? 'اكتب الإجابة…' : 'Write the answer…'}
                  value={drafts[q.id] ?? q.answer ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })}
                />
                <Button
                  disabled={busy === q.id}
                  onClick={() => update(q, 'answer-publish')}
                  className="shrink-0 bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark"
                >
                  {ar ? 'انشر الإجابة' : 'Publish'}
                </Button>
                {q.status !== 'REJECTED' && (
                  <Button variant="outline" disabled={busy === q.id} onClick={() => update(q, 'reject')} className="shrink-0">
                    {ar ? 'ارفض' : 'Reject'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">{ar ? 'مفيش أسئلة في القايمة دي.' : 'No questions here.'}</p>
        )}
      </div>
    </main>
  )
}
