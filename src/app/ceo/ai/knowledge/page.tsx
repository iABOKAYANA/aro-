'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Chunk = {
  id: string
  title: string
  url: string
  source: string
  wordCount: number
  updatedAt: string
}

type Stats = {
  bySource: Array<{ source: string; count: number }>
  hostCounts: Record<string, number>
  total: number
}

export default function AiKnowledgePage() {
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [search, setSearch] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'none' | 'list' | 'train' | 'all'>('none')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q = '') => {
    setBusy('list')
    try {
      const res = await fetch(`/api/ceo/ai-knowledge?search=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'فشل التحميل')
      setChunks(data.chunks ?? [])
      setStats(data.stats ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('none')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => load(search), 400)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [search, load])

  async function trainOne() {
    if (!url.trim()) return
    setBusy('train')
    setMsg(null)
    setError(null)
    try {
      const res = await fetch('/api/ceo/ai-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'التدريب فشل')
      setMsg(`تم: ${data.added} مقطع جديد، ${data.updated} اتحدّث من ${url}`)
      setUrl('')
      load(search)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('none')
    }
  }

  async function retrainAll() {
    setBusy('all')
    setMsg(null)
    setError(null)
    try {
      const res = await fetch('/api/ceo/ai-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retrainAll: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'إعادة التدريب فشلت')
      setMsg(
        `التدريب الشامل خلص: ${data.pages} صفحة — ${data.added} جديد / ${data.updated} محدّث` +
          (data.failed?.length ? ` — فشل: ${data.failed.length} (بأنظمة rate-limit زي stm.com.eg)` : '')
      )
      load(search)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('none')
    }
  }

  async function remove(id: string) {
    setChunks((c) => c.filter((x) => x.id !== id))
    await fetch('/api/ceo/ai-knowledge', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">علم العين — المعرفة المتعلَّمة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            المقاطع المقروءة من مواقع المطورين الرسمية. الكاتالوج والـDB دايمًا بيتقدّم عليهم في الإجابات.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={retrainAll} disabled={busy !== 'none'}>
            {busy === 'all' ? 'جاري إعادة التدريب… (قد ياخد دقيقة)' : 'إعادة تدريب كل المواقع'}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">إجمالي المقاطع</p>
              <p className="font-display mt-1 text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          {Object.entries(stats.hostCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([host, count]) => (
              <Card key={host}>
                <CardContent className="p-4">
                  <p className="truncate text-xs text-muted-foreground">{host}</p>
                  <p className="font-display mt-1 text-2xl font-bold">{count}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="font-medium">تدريب من رابط</p>
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mountainviewegypt.com/projects…"
              dir="ltr"
              onKeyDown={(e) => e.key === 'Enter' && trainOne()}
            />
            <Button onClick={trainOne} disabled={busy !== 'none' || !url.trim()}>
              {busy === 'train' ? 'جاري القراءة…' : 'درّب'}
            </Button>
          </div>
          {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="فلترة المقاطع…"
          className="max-w-xs"
        />
        <Badge variant="gold" className="self-center">{chunks.length} معروض</Badge>
      </div>

      <div className="space-y-2">
        {busy === 'list' && chunks.length === 0 && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {chunks.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.title}</p>
                <a href={c.url.replace(/#c\d+$/, '')} target="_blank" rel="noreferrer" dir="ltr"
                   className="block truncate text-xs text-estate-gold hover:underline">
                  {c.url}
                </a>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">{c.source}</Badge>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                {c.wordCount} كلمة · {new Date(c.updatedAt).toLocaleDateString('ar-EG')}
              </span>
              <Button
                onClick={() => remove(c.id)}
                variant="destructive"
                className="h-8 shrink-0 px-2 text-xs"
              >
                حذف
              </Button>
            </CardContent>
          </Card>
        ))}
        {!busy && chunks.length === 0 && (
          <p className="text-sm text-muted-foreground">مفيش مقاطع مطابقة.</p>
        )}
      </div>
    </div>
  )
}
