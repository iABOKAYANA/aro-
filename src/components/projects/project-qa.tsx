'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/lib/language-context'
import { useFeatureFlag } from '@/components/flags/flags-provider'

/**
 * Project Q&A block: shows published Q&A for the project and a small ask-form.
 * The form lands PENDING in the CEO queue (/ceo/questions) — nothing is
 * published until the owner answers it. Rate-limited server-side (3/hr/IP).
 */

interface QARow {
  id: string
  name: string
  question: string
  answer: string
  createdAt: string
}

export function ProjectQA({ slug }: { slug: string }) {
  const enabled = useFeatureFlag('project_qa')
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<QARow[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', question: '' })

  useEffect(() => {
    if (!enabled) return
    fetch(`/api/projects/${slug}/questions`)
      .then((r) => (r.ok ? r.json() : { questions: [] }))
      .then((d) => setItems(d.questions || []))
      .catch(() => setItems([]))
  }, [slug, enabled])

  if (!enabled) return null

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${slug}/questions`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Failed')
      setSent(true)
      setForm({ name: '', phone: '', question: '' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section dir="rtl" className="mt-12">
      <h2 className="mb-4 text-lg font-bold">أسئلة عن المشروع</h2>

      {items && items.length > 0 && (
        <div className="mb-6 space-y-3">
          {items.map((q) => (
            <div key={q.id} className="rounded-2xl border border-border dark:border-[#262626] p-4">
              <p className="text-sm">
                <span className="font-semibold text-estate-gold">{q.name}:</span> {q.question}
              </p>
              <p className="mt-2 rounded-xl bg-muted/40 p-3 text-sm">{q.answer}</p>
            </div>
          ))}
        </div>
      )}

      {!sent ? (
        asking ? (
          <div className="max-w-lg space-y-2 rounded-2xl border border-border dark:border-[#262626] p-4">
            <Input
              placeholder="اسمك"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={60}
            />
            <Input
              placeholder="رقم موبايلك (اختياري — عشان نقدر نرد عليك)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              maxLength={20}
            />
            <textarea
              className="min-h-[80px] w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
              placeholder="اكتب سؤالك عن المشروع…"
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              maxLength={500}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center gap-2">
              <Button type="button" disabled={busy} onClick={submit} className="bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark">
                {busy ? 'جاري الإرسال…' : 'ابعت السؤال'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAsking(false)}>
                إلغاء
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              سؤالك بيوصل لفريق غاية — بيتعرض هنا بعد ما نراجعه ونرد عليه.
            </p>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => setAsking(true)} className="rounded-xl">
            اسأل عن المشروع
          </Button>
        )
      ) : (
        <p className="rounded-xl bg-green-500/10 p-4 text-sm text-green-400">
          وصل سؤالك ✓ — هنراجعه ونرد عليك هنا قريب.
        </p>
      )}
    </section>
  )
}
