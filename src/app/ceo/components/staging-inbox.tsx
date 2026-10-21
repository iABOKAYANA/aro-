'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import {
  ceoApi,
  Toast,
  type ToastState,
  ConfirmDialog,
  StatusPill,
  InlineNote,
} from './manager-ui'
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  GitMerge,
  ExternalLink,
  FileIcon,
  ImageIcon,
  MessageSquareText,
  User,
  Phone,
  Users,
  Pencil,
  StickyNote,
} from 'lucide-react'

/* ─── Types (mirror GET /api/ceo/staging exactly) ─── */

interface Extracted {
  name: string | null
  nameArabic: string | null
  city: string | null
  price: number | null
  area: number | null
  downPayment: number | null
  years: number | null
  location: string | null
  description: string | null
  amenities: string[]
}

interface StagingPayload {
  raw?: string
  extracted?: Extracted | null
  extractionEngine?: string
  mediaUrls?: string[]
  mediaFiles?: Array<{ url: string; originalName?: string; mime?: string; kind?: string }>
  source?: string
  suggestedProjectId?: string | null
  matchScore?: number | null
}

/** Runtime-saved files are served through the API mount (public/ is boot-frozen). */
function fileUrl(u: string): string {
  if (u.startsWith('/images/whatsapp/')) return `/api/files/images/${u.slice('/images/whatsapp/'.length)}`
  if (u.startsWith('/files/whatsapp/')) return `/api/files/whatsapp/${u.slice('/files/whatsapp/'.length)}`
  return u
}

interface StagingItem {
  id: string
  groupJid?: string | null
  groupName?: string | null
  senderName?: string | null
  senderPhone?: string | null
  messageIds: string
  payload: string
  status: string
  targetProjectId?: string | null
  reviewNote?: string | null
  createdAt: string
}

interface DevLite {
  id: string
  companyName: string
  contactPhone?: string | null
  phone?: string | null
}

interface ProjectLite {
  id: string
  name: string
  approvalStatus: string
}

const STATUSES = ['NEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'MERGED'] as const

const STATUS_AR: Record<string, string> = {
  ALL: 'الكل',
  NEW: 'جديد',
  IN_REVIEW: 'قيد المراجعة',
  APPROVED: 'اتوافق عليه',
  REJECTED: 'مرفوض',
  MERGED: 'اتدمج',
}

const EMPTY_AR: Record<string, string> = {
  NEW: 'مفيش رسايل جديدة — الوارد فاضي.',
  IN_REVIEW: 'مفيش حاجة قيد المراجعة دلوقتي.',
  APPROVED: 'لسه متوافقش على حاجة من الوارد.',
  REJECTED: 'مفيش عناصر مرفوضة.',
  MERGED: 'لسه مفيش حاجة اتدمجت.',
  ALL: 'الوارد فاضي خالص.',
}

const EMPTY_EN: Record<string, string> = {
  NEW: 'No new messages — the inbox is clear.',
  IN_REVIEW: 'Nothing is in review right now.',
  APPROVED: 'Nothing approved from the inbox yet.',
  REJECTED: 'No rejected items.',
  MERGED: 'Nothing merged yet.',
  ALL: 'The inbox is completely empty.',
}

function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try {
    return JSON.parse(val) as T
  } catch {
    return fallback
  }
}

function digits(phone: string | null | undefined): string {
  return (phone || '').replace(/\D/g, '')
}

function toNumOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}

interface Draft {
  name: string
  nameArabic: string
  city: string
  price: string
  area: string
  downPayment: string
  years: string
  location: string
  description: string
  amenities: string
}

function draftFrom(ex: Extracted | null | undefined): Draft {
  return {
    name: ex?.name || '',
    nameArabic: ex?.nameArabic || '',
    city: ex?.city || '',
    price: ex?.price != null ? String(ex.price) : '',
    area: ex?.area != null ? String(ex.area) : '',
    downPayment: ex?.downPayment != null ? String(ex.downPayment) : '',
    years: ex?.years != null ? String(ex.years) : '',
    location: ex?.location || '',
    description: ex?.description || '',
    amenities: (ex?.amenities || []).join('، '),
  }
}

function draftToPayload(d: Draft): Record<string, unknown> {
  return {
    name: d.name.trim() || null,
    nameArabic: d.nameArabic.trim() || null,
    city: d.city.trim() || null,
    price: toNumOrNull(d.price),
    area: toNumOrNull(d.area),
    downPayment: toNumOrNull(d.downPayment),
    years: toNumOrNull(d.years),
    location: d.location.trim() || null,
    description: d.description.trim() || null,
    amenities: d.amenities.split(/[،,]/).map((a) => a.trim()).filter(Boolean).slice(0, 30),
  }
}

const FIELD_LABELS: { key: keyof Draft; ar: string; en: string; type?: 'text' | 'number' | 'area' }[] = [
  { key: 'name', ar: 'الاسم', en: 'Name' },
  { key: 'nameArabic', ar: 'الاسم بالعربي', en: 'Arabic name' },
  { key: 'city', ar: 'المدينة', en: 'City' },
  { key: 'price', ar: 'السعر (جنيه)', en: 'Price (EGP)', type: 'number' },
  { key: 'area', ar: 'المساحة (م²)', en: 'Area (sqm)', type: 'number' },
  { key: 'downPayment', ar: 'المقدم (%)', en: 'Down payment (%)', type: 'number' },
  { key: 'years', ar: 'سنين التقسيط', en: 'Years', type: 'number' },
  { key: 'location', ar: 'العنوان', en: 'Location' },
]

export default function StagingInbox() {
  const router = useRouter()
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [status, setStatus] = useState<string>('NEW')
  const [group, setGroup] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const [items, setItems] = useState<StagingItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)

  const [devs, setDevs] = useState<DevLite[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({})
  const [editOpen, setEditOpen] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [devSel, setDevSel] = useState<Record<string, string>>({})
  const [targetSel, setTargetSel] = useState<Record<string, string>>({})
  const [targetName, setTargetName] = useState<Record<string, string>>({})
  const [targetQ, setTargetQ] = useState<Record<string, string>>({})
  const [targetResults, setTargetResults] = useState<Record<string, ProjectLite[]>>({})
  const [targetBusy, setTargetBusy] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [cardError, setCardError] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ itemId: string; decision: 'APPROVED' | 'MERGE' } | null>(null)
  const [reject, setReject] = useState<{ itemId: string; reason: string } | null>(null)

  // Debounce the group text filter before it hits the API.
  useEffect(() => {
    const t = setTimeout(() => setGroupQuery(group.trim()), 400)
    return () => clearTimeout(t)
  }, [group])

  const fetchItems = useCallback(
    async (s: string, g: string, silent = false) => {
      if (!silent) setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (s !== 'ALL') params.set('status', s)
        if (g) params.set('group', g)
        const q = params.toString()
        const data = await ceoApi<{ items: StagingItem[]; counts: Record<string, number> }>(
          `/api/ceo/staging${q ? `?${q}` : ''}`
        )
        setItems(data.items || [])
        setCounts(data.counts || {})
      } catch (e) {
        setError(e instanceof Error ? e.message : ar ? 'معرفناش نجيب الوارد.' : 'Failed to load inbox.')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [ar]
  )

  useEffect(() => {
    fetchItems(status, groupQuery)
  }, [status, groupQuery, fetchItems])

  useEffect(() => {
    ceoApi<{ developers: DevLite[] }>('/api/ceo/developers')
      .then((d) => setDevs(d.developers || []))
      .catch(() => {})
  }, [])

  const phoneMatch = useCallback(
    (senderPhone: string | null | undefined): DevLite | null => {
      const a = digits(senderPhone)
      if (!a) return null
      for (const d of devs) {
        const b = digits(d.contactPhone || d.phone)
        if (b && (a === b || a.endsWith(b) || b.endsWith(a))) return d
      }
      return null
    },
    [devs]
  )

  const searchTargets = useCallback(
    async (itemId: string, q: string) => {
      setTargetBusy((p) => ({ ...p, [itemId]: true }))
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set('search', q.trim())
        params.set('limit', '10')
        const data = await ceoApi<{ projects: ProjectLite[] }>(`/api/ceo/projects?${params}`)
        setTargetResults((p) => ({ ...p, [itemId]: data.projects || [] }))
      } catch {
        setTargetResults((p) => ({ ...p, [itemId]: [] }))
      } finally {
        setTargetBusy((p) => ({ ...p, [itemId]: false }))
      }
    },
    []
  )

  const parsed = useMemo(() => {
    const m = new Map<string, StagingPayload>()
    for (const it of items) m.set(it.id, safeParse<StagingPayload>(it.payload, {}))
    return m
  }, [items])

  const getDraft = (item: StagingItem): Draft => {
    const existing = drafts[item.id]
    if (existing) return existing
    const fresh = draftFrom(parsed.get(item.id)?.extracted)
    setDrafts((p) => (p[item.id] ? p : { ...p, [item.id]: fresh }))
    return fresh
  }

  const decide = async (itemId: string, decision: 'APPROVED' | 'REJECTED' | 'MERGE', reason?: string) => {
    setBusy(itemId)
    setCardError((p) => ({ ...p, [itemId]: '' }))
    try {
      const p = parsed.get(itemId)
      const body: Record<string, unknown> = { id: itemId, decision }
      if (editOpen[itemId] && drafts[itemId] && decision !== 'REJECTED') {
        body.editedPayload = draftToPayload(drafts[itemId])
      }
      const note = (reason ?? notes[itemId] ?? '').trim()
      if (note) body.reason = note
      if (decision === 'APPROVED') {
        if (devSel[itemId]) body.developerId = devSel[itemId]
      }
      if (decision === 'MERGE') {
        body.targetProjectId = targetSel[itemId]
      }
      const res = await ceoApi<{ item: StagingItem; project?: { id: string; name: string } }>(
        '/api/ceo/staging',
        'PATCH',
        body
      )
      await fetchItems(status, groupQuery, true)
      const proj = res.project
      setToast({
        tone: 'ok',
        msg:
          decision === 'APPROVED'
            ? ar
              ? `اتوافق على العنصر واتعمل مشروع: ${proj?.name || ''}`
              : `Approved — live project created: ${proj?.name || ''}`
            : decision === 'MERGE'
              ? ar
                ? `اتدمج في المشروع: ${proj?.name || targetName[itemId] || ''}`
                : `Merged into project: ${proj?.name || targetName[itemId] || ''}`
              : ar
                ? 'اترفض العنصر واتسجّل السبب.'
                : 'Item rejected with reason recorded.',
      })
      if (proj && decision !== 'REJECTED') {
        router.refresh()
      }
    } catch (e) {
      setCardError((p) => ({
        ...p,
        [itemId]: e instanceof Error ? e.message : ar ? 'القرار منفعش.' : 'Decision failed.',
      }))
    } finally {
      setBusy(null)
      setConfirm(null)
      setReject(null)
    }
  }

  const total = useMemo(() => STATUSES.reduce((s, k) => s + (counts[k] || 0), 0), [counts])

  return (
    <div className="space-y-4">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Status chips + group filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', ...STATUSES] as string[]).map((s) => {
          const c = s === 'ALL' ? total : counts[s] || 0
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                status === s
                  ? 'bg-[#D4A843] text-black'
                  : 'bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-foreground border border-border dark:border-[#262626]'
              )}
            >
              {ar ? STATUS_AR[s] : s.replace(/_/g, ' ')} <span className="opacity-70">{c}</span>
            </button>
          )
        })}
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder={ar ? 'فلتر بالجروب (اسم أو رقم)…' : 'Filter by group (name or JID)…'}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="pl-9 bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {error && (
        <InlineNote tone="err">
          {error}{' '}
          <button onClick={() => fetchItems(status, groupQuery)} className="underline">
            {ar ? 'حاول تاني' : 'Retry'}
          </button>
        </InlineNote>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D4A843] border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <Card className="bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626]">
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <MessageSquareText size={36} className="text-gray-600" />
            <p className="text-sm text-gray-400">{ar ? EMPTY_AR[status] : EMPTY_EN[status]}</p>
            {groupQuery && (
              <button onClick={() => setGroup('')} className="text-xs text-[#D4A843] hover:underline">
                {ar ? 'امسح فلتر الجروب' : 'Clear group filter'}
              </button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const p = parsed.get(item.id) || {}
            const ex = p.extracted || null
            const docFiles = (p.mediaFiles || []).filter((m) => (m.kind || 'image') === 'document')
            // Legacy items predate mediaFiles/kind — treat their mediaUrls as images.
            const imgFiles = p.mediaFiles
              ? (p.mediaFiles).filter((m) => (m.kind || 'image') === 'image')
              : (p.mediaUrls || []).map((u) => ({ url: u }))
            const media = p.mediaUrls || []
            const msgCount = safeParse<string[]>(item.messageIds, []).length
            const decidable = item.status === 'NEW' || item.status === 'IN_REVIEW'
            const isOpen = !!expanded[item.id]
            const match = phoneMatch(item.senderPhone)
            const ownerId = devSel[item.id] || ''
            const needsOwner = !match && !ownerId
            const targetId = targetSel[item.id] || ''
            const draft = drafts[item.id] || draftFrom(ex)
            const raw = p.raw || ''
            const rawShown = rawOpen[item.id] || raw.length <= 240

            return (
              <Card
                key={item.id}
                className="bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626]"
              >
                <CardContent className="space-y-3 p-4 sm:p-5">
                  {/* Source header */}
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={item.status === 'NEW' ? 'blue' : item.status === 'IN_REVIEW' ? 'yellow' : item.status === 'REJECTED' ? 'red' : 'green'}>
                          {ar ? STATUS_AR[item.status] || item.status : item.status.replace(/_/g, ' ')}
                        </StatusPill>
                        {p.extractionEngine && (
                          <span className="rounded-full border border-border dark:border-[#262626] px-2 py-0.5 text-[10px] text-gray-500">
                            {p.extractionEngine}
                          </span>
                        )}
                        {msgCount > 0 && (
                          <span className="text-[11px] text-gray-500">
                            {msgCount} {ar ? 'رسايل' : 'msgs'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} /> {item.groupName || item.groupJid || (ar ? 'جروب مش معروف' : 'Unknown group')}
                        </span>
                        {(item.senderName || item.senderPhone) && (
                          <span className="inline-flex items-center gap-1">
                            <User size={12} /> {item.senderName || ''}
                            {item.senderPhone && (
                              <span className="inline-flex items-center gap-0.5 text-gray-500">
                                <Phone size={11} /> <span dir="ltr">{item.senderPhone}</span>
                              </span>
                            )}
                          </span>
                        )}
                        <span className="text-gray-600">
                          {new Date(item.createdAt).toLocaleString(ar ? 'ar-EG' : undefined)}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => setExpanded((pr) => ({ ...pr, [item.id]: !pr[item.id] }))}
                      className="rounded-full p-1.5 text-gray-500 hover:bg-white/5 hover:text-foreground"
                      aria-label={isOpen ? (ar ? 'اقفل' : 'Collapse') : (ar ? 'افتح' : 'Expand')}
                    >
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* Raw text (collapsible) */}
                  {raw ? (
                    <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-3">
                      <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                        {rawShown ? raw : `${raw.slice(0, 240)}…`}
                      </p>
                      {raw.length > 240 && (
                        <button
                          onClick={() => setRawOpen((pr) => ({ ...pr, [item.id]: !pr[item.id] }))}
                          className="mt-1 text-xs text-[#D4A843] hover:underline"
                        >
                          {rawShown ? (ar ? 'اختصر' : 'Show less') : (ar ? 'اقرا الكل' : 'Read all')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600">{ar ? 'مفيش نص خام محفوظ.' : 'No raw text stored.'}</p>
                  )}

                  {isOpen && (
                    <>
                      {/* Extracted fields */}
                      {ex ? (
                        <div className="overflow-hidden rounded-2xl border border-border dark:border-[#262626]">
                          <div className="divide-y divide-border dark:divide-[#262626]">
                            {[
                              { k: ar ? 'الاسم' : 'Name', v: ex.name },
                              { k: ar ? 'عربي' : 'Arabic', v: ex.nameArabic },
                              { k: ar ? 'المدينة' : 'City', v: ex.city },
                              { k: ar ? 'السعر' : 'Price', v: ex.price != null ? formatEGP(ex.price) : null },
                              { k: ar ? 'المساحة' : 'Area', v: ex.area != null ? `${ex.area.toLocaleString()} م²` : null },
                              { k: ar ? 'المقدم' : 'Down payment', v: ex.downPayment != null ? `${ex.downPayment}%` : null },
                              { k: ar ? 'السنين' : 'Years', v: ex.years != null ? String(ex.years) : null },
                              { k: ar ? 'العنوان' : 'Location', v: ex.location },
                              { k: ar ? 'الوصف' : 'Description', v: ex.description },
                            ].map((row) => (
                              <div key={row.k} className="grid grid-cols-[110px_1fr] gap-2 px-3 py-1.5 text-xs sm:grid-cols-[140px_1fr]">
                                <span className="text-gray-500">{row.k}</span>
                                <span dir="auto" className="text-gray-200">{row.v || '—'}</span>
                              </div>
                            ))}
                            <div className="grid grid-cols-[110px_1fr] gap-2 px-3 py-1.5 text-xs sm:grid-cols-[140px_1fr]">
                              <span className="text-gray-500">{ar ? 'المرافق' : 'Amenities'}</span>
                              <span className="flex flex-wrap gap-1">
                                {ex.amenities.length === 0 ? (
                                  <span className="text-gray-600">—</span>
                                ) : (
                                  ex.amenities.map((a) => (
                                    <span key={a} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
                                      {a}
                                    </span>
                                  ))
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <InlineNote>
                          {ar
                            ? 'الاستخراج الآلي فشل — راجع النص الخام وعدّل القيم بنفسك قبل الموافقة.'
                            : 'Auto-extraction failed — review the raw text and fill the overrides yourself before approving.'}
                        </InlineNote>
                      )}

                      {/* Media */}
                      {imgFiles.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1 text-[11px] uppercase tracking-wider text-gray-600">
                            <ImageIcon size={12} /> {ar ? `الصور (${imgFiles.length})` : `Images (${imgFiles.length})`}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {imgFiles.map((m) => (
                              <a key={m.url} href={fileUrl(m.url)} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fileUrl(m.url)}
                                  alt=""
                                  loading="lazy"
                                  width={64}
                                  height={64}
                                  className="h-16 w-16 rounded-xl border border-border dark:border-[#262626] object-cover hover:opacity-80"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Document attachments (developer sheets, PDFs…) */}
                      {docFiles.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1 text-[11px] uppercase tracking-wider text-gray-600">
                            <FileIcon size={12} /> {ar ? `الملفات (${docFiles.length})` : `Documents (${docFiles.length})`}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {docFiles.map((m) => (
                              <a
                                key={m.url}
                                href={fileUrl(m.url)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-[240px] items-center gap-1.5 rounded-xl border border-border dark:border-[#262626] px-2.5 py-1.5 text-xs hover:border-[#D4A843]/50"
                              >
                                <FileIcon size={13} className="shrink-0 text-[#D4A843]" />
                                <span className="truncate">{m.originalName || fileUrl(m.url).split('/').pop()}</span>
                                <span className="shrink-0 text-[10px] text-gray-500">
                                  {(m.mime?.split('/').pop() || '').toUpperCase().slice(0, 5)}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggested duplicate */}
                      {p.suggestedProjectId && (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs">
                          <span className="text-yellow-200">
                            {ar
                              ? `شبه مشروع موجود${p.matchScore != null ? ` (تشابه ${Math.round(p.matchScore * 100)}%)` : ''} — اتأكد قبل ما توافق.`
                              : `Looks like an existing project${p.matchScore != null ? ` (${Math.round(p.matchScore * 100)}% match)` : ''} — verify before approving.`}
                          </span>
                          <span className="ml-auto flex gap-2">
                            <button
                              onClick={() => router.push(`/ceo/projects/${p.suggestedProjectId}`)}
                              className="inline-flex items-center gap-1 text-[#D4A843] hover:underline"
                            >
                              <ExternalLink size={12} /> {ar ? 'افتح المشروع' : 'Open target'}
                            </button>
                            {decidable && (
                              <button
                                onClick={() => {
                                  setTargetSel((pr) => ({ ...pr, [item.id]: p.suggestedProjectId as string }))
                                  setTargetName((pr) => ({
                                    ...pr,
                                    [item.id]: ar ? 'المشروع المقترح' : 'Suggested project',
                                  }))
                                }}
                                className="text-yellow-200 hover:underline"
                              >
                                {ar ? 'استخدمه للدمج' : 'Use for merge'}
                              </button>
                            )}
                          </span>
                        </div>
                      )}

                      {decidable && (
                        <>
                          {/* Field overrides */}
                          <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02]">
                            <button
                              onClick={() => {
                                if (!drafts[item.id]) setDrafts((pr) => ({ ...pr, [item.id]: draftFrom(ex) }))
                                setEditOpen((pr) => ({ ...pr, [item.id]: !pr[item.id] }))
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-300 hover:text-foreground"
                            >
                              <Pencil size={13} />
                              {ar ? 'عدّل القيم قبل القرار (اختياري)' : 'Edit values before deciding (optional)'}
                              {editOpen[item.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {editOpen[item.id] && (
                              <div className="grid grid-cols-1 gap-2 border-t border-border dark:border-[#262626] p-3 sm:grid-cols-2">
                                {FIELD_LABELS.map((f) => (
                                  <label key={f.key} className="block">
                                    <span className="mb-1 block text-[11px] text-gray-500">
                                      {ar ? f.ar : f.en}
                                    </span>
                                    <input
                                      type={f.type === 'number' ? 'number' : 'text'}
                                      min={f.type === 'number' ? 0 : undefined}
                                      value={draft[f.key]}
                                      onChange={(e) =>
                                        setDrafts((pr) => ({
                                          ...pr,
                                          [item.id]: { ...(pr[item.id] || draftFrom(ex)), [f.key]: e.target.value },
                                        }))
                                      }
                                      className="h-9 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black px-2.5 text-sm text-foreground outline-none focus:border-[#D4A843]/50"
                                    />
                                  </label>
                                ))}
                                <label className="block sm:col-span-2">
                                  <span className="mb-1 block text-[11px] text-gray-500">
                                    {ar ? 'الوصف' : 'Description'}
                                  </span>
                                  <textarea
                                    value={draft.description}
                                    onChange={(e) =>
                                      setDrafts((pr) => ({
                                        ...pr,
                                        [item.id]: { ...(pr[item.id] || draftFrom(ex)), description: e.target.value },
                                      }))
                                    }
                                    className="min-h-[64px] w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black px-2.5 py-2 text-sm text-foreground outline-none focus:border-[#D4A843]/50"
                                  />
                                </label>
                                <label className="block sm:col-span-2">
                                  <span className="mb-1 block text-[11px] text-gray-500">
                                    {ar ? 'المرافق (افصل بفاصلة)' : 'Amenities (comma separated)'}
                                  </span>
                                  <input
                                    value={draft.amenities}
                                    onChange={(e) =>
                                      setDrafts((pr) => ({
                                        ...pr,
                                        [item.id]: { ...(pr[item.id] || draftFrom(ex)), amenities: e.target.value },
                                      }))
                                    }
                                    className="h-9 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black px-2.5 text-sm text-foreground outline-none focus:border-[#D4A843]/50"
                                  />
                                </label>
                              </div>
                            )}
                          </div>

                          {/* Owner picker */}
                          <div>
                            <p className="mb-1 text-[11px] uppercase tracking-wider text-gray-600">
                              {ar ? 'المطوّر المالك (للموافقة)' : 'Owner developer (for approval)'}
                            </p>
                            {match ? (
                              <InlineNote>
                                {ar ? (
                                  <>رقم المرسل مربوط بحساب <span className="font-semibold">{match.companyName}</span> — الموافقة هتنشئ المشروع باسمه، أو اختار مالك تاني من القايمة.</>
                                ) : (
                                  <>Sender phone matches <span className="font-semibold">{match.companyName}</span> — approval will create the project under them, or pick another owner below.</>
                                )}
                              </InlineNote>
                            ) : (
                              <InlineNote tone="err">
                                {ar
                                  ? 'رقم المرسل مش مربوط بأي حساب مطوّر — لازم تختار المالك بنفسك عشان الموافقة تشتغل، أو ادمج في مشروع موجود.'
                                  : 'Sender phone matches no developer account — you must pick the owner for approval to work, or merge into an existing project.'}
                              </InlineNote>
                            )}
                            <select
                              value={ownerId}
                              onChange={(e) => setDevSel((pr) => ({ ...pr, [item.id]: e.target.value }))}
                              className="mt-2 h-10 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black px-3 text-sm text-foreground outline-none focus:border-[#D4A843]/50"
                            >
                              <option value="">
                                {match
                                  ? ar
                                    ? `تلقائي: ${match.companyName}`
                                    : `Auto: ${match.companyName}`
                                  : ar
                                    ? 'اختار المالك…'
                                    : 'Select owner…'}
                              </option>
                              {devs.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.companyName}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Merge target picker */}
                          <div>
                            <p className="mb-1 text-[11px] uppercase tracking-wider text-gray-600">
                              {ar ? 'المشروع المستهدف (للدمج)' : 'Target project (for merge)'}
                            </p>
                            {targetId ? (
                              <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-200">
                                <GitMerge size={14} />
                                <span className="flex-1 truncate">{targetName[item.id] || targetId}</span>
                                <button
                                  onClick={() => router.push(`/ceo/projects/${targetId}`)}
                                  className="inline-flex items-center gap-1 text-xs text-[#D4A843] hover:underline"
                                >
                                  <ExternalLink size={12} /> {ar ? 'افتح' : 'Open'}
                                </button>
                                <button
                                  onClick={() => setTargetSel((pr) => ({ ...pr, [item.id]: '' }))}
                                  className="text-xs text-gray-400 hover:underline"
                                >
                                  {ar ? 'غيّر' : 'Change'}
                                </button>
                              </div>
                            ) : (
                              <>
                                <Input
                                  placeholder={ar ? 'دوّر على مشروع للدمج…' : 'Search a project to merge into…'}
                                  value={targetQ[item.id] || ''}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setTargetQ((pr) => ({ ...pr, [item.id]: v }))
                                    searchTargets(item.id, v)
                                  }}
                                  onFocus={() => {
                                    if (!targetResults[item.id]) searchTargets(item.id, targetQ[item.id] || '')
                                  }}
                                  className="bg-card dark:bg-black border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground"
                                />
                                {(targetBusy[item.id] || (targetResults[item.id] || []).length > 0) && (
                                  <div className="mt-1 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black p-1.5">
                                    {targetBusy[item.id] ? (
                                      <p className="px-2 py-2 text-center text-xs text-gray-500">
                                        {ar ? 'بيدوّر…' : 'Searching…'}
                                      </p>
                                    ) : (
                                      (targetResults[item.id] || []).map((t) => (
                                        <button
                                          key={t.id}
                                          onClick={() => {
                                            setTargetSel((pr) => ({ ...pr, [item.id]: t.id }))
                                            setTargetName((pr) => ({ ...pr, [item.id]: t.name }))
                                          }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-gray-300 hover:bg-white/5"
                                        >
                                          <span className="flex-1 truncate">{t.name}</span>
                                          <span className="text-[10px] text-gray-600">{t.approvalStatus}</span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Optional review note */}
                          <label className="block">
                            <span className="mb-1 flex items-center gap-1 text-[11px] text-gray-500">
                              <StickyNote size={11} /> {ar ? 'ملاحظة للسجل (اختياري)' : 'Review note (optional)'}
                            </span>
                            <input
                              value={notes[item.id] || ''}
                              onChange={(e) => setNotes((pr) => ({ ...pr, [item.id]: e.target.value }))}
                              placeholder={ar ? 'هتتسجل مع القرار…' : 'Recorded with the decision…'}
                              className="h-9 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black px-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#D4A843]/50"
                            />
                          </label>

                          {cardError[item.id] && <InlineNote tone="err">{cardError[item.id]}</InlineNote>}

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 border-t border-border dark:border-[#262626] pt-3">
                            <Button
                              disabled={busy === item.id || needsOwner}
                              title={needsOwner ? (ar ? 'اختار المالك الأول' : 'Select the owner first') : undefined}
                              onClick={() => setConfirm({ itemId: item.id, decision: 'APPROVED' })}
                              className="bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                            >
                              <CheckCircle size={15} className="mr-1.5" />
                              {ar ? 'وافق واعمل مشروع' : 'Approve & create'}
                            </Button>
                            <Button
                              disabled={busy === item.id || !targetId}
                              title={!targetId ? (ar ? 'اختار المشروع المستهدف الأول' : 'Select the target project first') : undefined}
                              onClick={() => setConfirm({ itemId: item.id, decision: 'MERGE' })}
                              variant="outline"
                              className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
                            >
                              <GitMerge size={15} className="mr-1.5" />
                              {ar ? 'ادمج' : 'Merge'}
                            </Button>
                            <Button
                              disabled={busy === item.id}
                              onClick={() => setReject({ itemId: item.id, reason: '' })}
                              variant="outline"
                              className="border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                            >
                              <XCircle size={15} className="mr-1.5" />
                              {ar ? 'ارفض' : 'Reject'}
                            </Button>
                            {busy === item.id && (
                              <span className="ml-auto self-center text-xs text-gray-500">
                                {ar ? 'بيتنفذ…' : 'Working…'}
                              </span>
                            )}
                          </div>
                        </>
                      )}

                      {/* Decided state */}
                      {!decidable && (
                        <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] px-3 py-2 text-xs text-gray-400">
                          {item.reviewNote && (
                            <p dir="auto">
                              <span className="text-gray-600">{ar ? 'السبب/الملاحظة: ' : 'Reason/note: '}</span>
                              {item.reviewNote}
                            </p>
                          )}
                          {item.targetProjectId && (
                            <button
                              onClick={() => router.push(`/ceo/projects/${item.targetProjectId}`)}
                              className="mt-1 inline-flex items-center gap-1 text-[#D4A843] hover:underline"
                            >
                              <ExternalLink size={12} /> {ar ? 'افتح المشروع المرتبط' : 'Open linked project'}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Approve / Merge confirm (both mutate live projects) */}
      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.decision === 'MERGE'
            ? ar
              ? 'ادمج في المشروع المستهدف'
              : 'Merge into target project'
            : ar
              ? 'وافق واعمل مشروع لايف'
              : 'Approve & create live project'
        }
        tone="primary"
        confirmLabel={
          confirm?.decision === 'MERGE' ? (ar ? 'ادمج' : 'Merge') : ar ? 'وافق واعمل' : 'Approve & create'
        }
        busy={!!confirm && busy === confirm.itemId}
        message={
          confirm?.decision === 'MERGE'
            ? ar
              ? 'الدمج هيكتب فوق أسماء وأسعار المشروع المستهدف، والصور هتتضم — اتأكد إنك مختار المشروع الصح.'
              : 'Merging overwrites the target project names/prices and unions the gallery — make sure the target is correct.'
            : ar
              ? 'الموافقة هتنشئ مشروع لايف بحالة APPROVED (خطوة النشر لسه بعدين) بالمالك والقيم اللي فوق.'
              : 'Approval creates a live APPROVED project (publishing is still a later step) with the owner and values above.'
        }
        onConfirm={() => confirm && decide(confirm.itemId, confirm.decision)}
        onCancel={() => setConfirm(null)}
      />

      {/* Reject — reason required by the API */}
      {reject && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={() => setReject(null)}>
          <Card className="w-full max-w-md border border-border dark:border-[#262626] bg-card dark:bg-black" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 p-6">
              <h3 className="font-semibold text-foreground">{ar ? 'ارفض العنصر' : 'Reject item'}</h3>
              <textarea
                autoFocus
                placeholder={ar ? 'سبب الرفض (مطلوب)' : 'Reason for rejection (required)'}
                value={reject.reason}
                onChange={(e) => setReject((r) => (r ? { ...r, reason: e.target.value } : null))}
                className="h-24 w-full resize-none rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#D4A843]/50"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setReject(null)}
                  className="border-border dark:border-[#262626] text-gray-300"
                >
                  {ar ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  disabled={!reject.reason.trim() || busy === reject.itemId}
                  onClick={() => decide(reject.itemId, 'REJECTED', reject.reason)}
                  className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                >
                  {ar ? 'ارفض' : 'Reject'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
