'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import {
  Inbox,
  Mail,
  Search,
  X,
  Copy,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
  MailCheck,
  MailWarning,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type OutboxItem = {
  id: string
  at: string | null
  from: string | null
  to: string[]
  subject: string
  text: string | null
  hasHtml: boolean
  replyTo: string | null
  meta: Record<string, unknown> | null
}

export default function OutboxClient() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<OutboxItem[]>([])
  const [emailLive, setEmailLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ceo/outbox')
      if (!res.ok) throw new Error('Failed to fetch outbox')
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
      setEmailLive(Boolean(data.emailLive))
    } catch {
      setError(ar ? 'معرفناش نجيب البريد الصادر — حاول تاني.' : 'Failed to fetch the email outbox')
    } finally {
      setLoading(false)
    }
  }, [ar])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const markResolved = async (id: string) => {
    setResolvingId(id)
    try {
      const res = await fetch(`/api/ceo/outbox?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      if (!res.ok) throw new Error('Failed to resolve')
      setItems((prev) => prev.filter((i) => i.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch {
      alert(ar ? 'معرفناش نعلّمها كمحلولة — حاول تاني.' : 'Failed to mark as resolved')
    } finally {
      setResolvingId(null)
    }
  }

  const filtered = items.filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.subject.toLowerCase().includes(q) ||
      item.to.some((t) => t.toLowerCase().includes(q)) ||
      (item.text && item.text.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · البريد' : 'CEO Console · Mail'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'البريد الصادر' : 'Email Outbox'}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar
              ? 'إيميلات متحفظتش — انسخها وابعته بنفسك لحد ما الإيميل يتظبّط'
              : 'Unsent mail queued while email is unconfigured — copy and follow up manually'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button
          onClick={fetchItems}
          variant="outline"
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {emailLive ? (
        <div className="flex items-center gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-green-400">
          <MailCheck className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">
            {ar
              ? 'الإيميل شغّال — الصفحة دي مجرد سجل قديم. علّم اللي خلص كمحلول.'
              : 'Email is live — this outbox is history. Mark items resolved once followed up.'}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-yellow-400">
          <MailWarning className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">
            {ar
              ? 'الإيميل مش متظبّط (مفيش RESEND_API_KEY ولا SMTP). الرسايل هنا متحفظة — انسخها وابعته بنفسك.'
              : 'Email is not configured (no RESEND_API_KEY or SMTP_*). Messages queue here — copy and send them manually.'}
          </span>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بالموضوع أو الإيميل…' : 'Search by subject or recipient...'}
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
          <Button onClick={fetchItems} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش رسايل متأخرة' : 'Outbox is clear'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search') : (ar ? 'كل الإيميلات اتبعتت أو اتحلّت' : 'Every email was delivered or resolved')}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الموضوع' : 'Subject'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'إلى' : 'To'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'التاريخ' : 'Queued'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filtered.map((item) => {
                    const isExpanded = expandedId === item.id
                    return (
                      <>
                        <tr
                          key={item.id}
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className={cn('cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', isExpanded && 'bg-muted')}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-estate-gold/20 to-estate-gold/5 text-estate-gold">
                                <Mail className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{item.subject}</p>
                                <p className="text-xs text-gray-500 md:hidden">{item.to.join(', ')}</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden max-w-[220px] truncate px-4 py-3 text-gray-400 md:table-cell">
                            {item.to.join(', ')}
                          </td>
                          <td className="hidden px-4 py-3 text-gray-400 lg:table-cell">
                            {item.at
                              ? new Date(item.at).toLocaleString(ar ? 'ar-EG' : undefined)
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                title={ar ? 'انسخ الموضوع' : 'Copy subject'}
                                onClick={() => copyText(`${item.id}:subject`, item.subject)}
                                className="text-gray-400 hover:text-foreground"
                              >
                                {copied === `${item.id}:subject` ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title={ar ? 'انسخ المتن' : 'Copy body'}
                                disabled={!item.text}
                                onClick={() => item.text && copyText(`${item.id}:body`, item.text)}
                                className="text-gray-400 hover:text-foreground"
                              >
                                {copied === `${item.id}:body` ? <Check className="h-4 w-4 text-green-400" /> : <Mail className="h-4 w-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title={ar ? 'علّم كمحلولة' : 'Mark resolved'}
                                disabled={resolvingId === item.id}
                                onClick={() => markResolved(item.id)}
                                className="text-gray-400 hover:text-green-400"
                              >
                                {resolvingId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                              </Button>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${item.id}-expanded`}>
                            <td colSpan={4} className="border-b border-border dark:border-[#262626] bg-white/[0.02] px-4 py-5">
                              <div className="grid gap-6 lg:grid-cols-3">
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'التفاصيل' : 'Details'}</h4>
                                  <div className="space-y-2 text-sm text-gray-300">
                                    <p><span className="text-gray-500">{ar ? 'من: ' : 'From: '}</span>{item.from ?? '—'}</p>
                                    <p><span className="text-gray-500">{ar ? 'إلى: ' : 'To: '}</span>{item.to.join(', ') || '—'}</p>
                                    {item.replyTo && <p><span className="text-gray-500">Reply-To: </span>{item.replyTo}</p>}
                                    {item.meta && (
                                      <pre className="overflow-x-auto rounded-xl bg-black/30 p-2 text-xs text-gray-500">
                                        {JSON.stringify(item.meta, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-3 lg:col-span-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'المتن' : 'Body'}</h4>
                                    {item.text && (
                                      <Button size="sm" variant="outline" onClick={() => copyText(`${item.id}:body`, item.text!)}>
                                        {copied === `${item.id}:body` ? (ar ? 'اتنسخ!' : 'Copied!') : (ar ? 'انسخ المتن' : 'Copy body')}
                                      </Button>
                                    )}
                                  </div>
                                  <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
                                    <p className="whitespace-pre-wrap text-sm text-gray-300">
                                      {item.text ?? (ar ? 'مفيش متن نصي (HTML بس)' : 'No plain-text body (HTML only)')}
                                    </p>
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
