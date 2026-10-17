'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  X, Clock, MapPin, Video, Copy, Check, Loader2,
  CalendarCheck, ExternalLink, AlertCircle, MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/language-context'
import { useAppType } from '@/lib/use-app-type'
import { cn } from '@/lib/utils'

interface CreatedViewing {
  id: string
  scheduledAt: string
  meetingType: string
  meetingLink?: string | null
}

const TIME_SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

// Local-timezone date (toISOString() is UTC and can show yesterday's date
// near midnight in UTC+X timezones like Egypt)
function isoDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Don't allow booking a slot that already passed (15-min lead time)
const LEAD_MS = 15 * 60 * 1000

function isSlotPast(dateStr: string, slot: string): boolean {
  if (!dateStr) return false
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const [h, m] = slot.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime() <= Date.now() + LEAD_MS
}

// wa.me needs bare digits (no `+`, spaces or dashes) — mirrors the
// encodeURIComponent-text pattern of the share buttons (unit-share-button).
function waDigits(raw: string): string {
  return (raw || '').replace(/\D/g, '')
}

// Egyptian-colloquial confirmation, neutral direction so staff and client
// can use the same copy. Pure deep link — never auto-sent.
function buildWaConfirmText(opts: {
  name: string
  project: string
  date: string
  time: string
  type: string
  ar: boolean
}): string {
  if (opts.ar) {
    return `أهلاً ${opts.name} 👋\nمعاينتك في ${opts.project} متسجلة يوم ${opts.date} الساعة ${opts.time} (${opts.type}).\nهنستناك، ولو عايز تغيّر المعاد رد على الرسالة دي 🙏`
  }
  return `Hi ${opts.name} 👋\nYour viewing at ${opts.project} is booked for ${opts.date} at ${opts.time} (${opts.type}).\nSee you then — reply here if you need to reschedule 🙏`
}

interface BookingButtonProps {
  projectId?: string
  unitId?: string
  propertyName?: string
  label?: string
  className?: string
  size?: 'sm' | 'default' | 'lg'
}

export function BookingButton({ projectId, unitId, propertyName, label, className, size = 'lg' }: BookingButtonProps) {
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'
  const { data: session, status } = useSession()
  const router = useRouter()
  // Public host: zero login — no dashboard links, no "sign in" prompts;
  // appointment tracking goes through WhatsApp/contact instead.
  const isPublic = useAppType() === 'public'

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [meetingType, setMeetingType] = useState<'in_person' | 'online'>('in_person')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedViewing | null>(null)
  const [copied, setCopied] = useState(false)

  const minDate = isoDate(0)
  const maxDate = isoDate(90)

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setStep('form')
      setError(null)
      setCreated(null)
      setCopied(false)
      setDate(isoDate(1))
      setTime('')
      setNotes('')
      setName('')
      setPhone('')
      setMeetingType('in_person')
    }
  }, [open])

  // Prefill name/phone from the signed-in account (booking itself needs no login)
  useEffect(() => {
    if (open && status === 'authenticated') {
      const accountName = (session as any)?.user?.name
      const accountPhone = (session as any)?.user?.phone
      if (accountName) setName(prev => prev || accountName)
      if (accountPhone) setPhone(prev => prev || accountPhone)
    }
  }, [open, status, session])

  const reset = useCallback(() => {
    setOpen(false)
    setStep('form')
    setCreated(null)
    setError(null)
  }, [])

  const handleSubmit = async () => {
    setError(null)
    if (!projectId && !unitId) {
      console.error('[BookingButton] missing projectId/unitId', { projectId, unitId })
      setError(lang === 'ar' ? 'مفيش عقار محدد للحجز — جرّب تاني من صفحة المشروع' : 'No property selected for booking')
      return
    }
    if (!date || !time) {
      setError(lang === 'ar' ? 'اختار التاريخ والوقت الأول' : 'Please pick a date and time first')
      return
    }
    const when = new Date(`${date}T${time}:00`)
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + LEAD_MS) {
      setError(lang === 'ar' ? 'الوقت ده مش متاح — اختار موعد تاني' : 'That time is not available — pick another slot')
      return
    }
    if (!name.trim()) {
      setError(t('book.nameRequired'))
      return
    }
    const digits = phone.replace(/[\s\-().]/g, '')
    if (!digits) {
      setError(t('book.phoneRequired'))
      return
    }
    if (!/^\+?\d{7,15}$/.test(digits)) {
      setError(t('book.phoneInvalid'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/viewings', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          unitId,
          meetingType,
          scheduledAt: when.toISOString(),
          name: name.trim(),
          phone: digits,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const raw: string = data.error || 'Failed'
        const localized: Record<string, string> = {
          'Invalid appointment date': lang === 'ar' ? 'الموعد المختار مش متاح — اختار وقت تاني' : 'That appointment time is not available',
          'projectId or unitId required': lang === 'ar' ? 'مفيش عقار محدد للحجز' : 'No property selected for booking',
          'Name is required': lang === 'ar' ? 'اكتب اسمك الأول' : 'Enter your name',
        }
        throw new Error(localized[raw] || raw)
      }
      setCreated(data.viewing)
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = async () => {
    if (!created?.meetingLink) return
    try {
      await navigator.clipboard.writeText(created.meetingLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const formattedDate = useMemo(() => {
    if (!created) return ''
    return new Date(created.scheduledAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
  }, [created, lang])

  // Client one-tap WhatsApp confirmation — pure `wa.me` deep link, no API,
  // no auto-send. The phone is the one just typed in the form; hidden when
  // it cannot address a chat (defensive: submit() already requires 7–15
  // digits, so this is normally always shown).
  const waPhoneDigits = waDigits(phone)
  const waHref = step === 'success' && created && waPhoneDigits.length >= 7
    ? `https://wa.me/${waPhoneDigits}?text=${encodeURIComponent(buildWaConfirmText({
      name: name.trim() || propertyName || '…',
      project: propertyName || (ar ? 'غاية' : 'GHAYA'),
      date: formattedDate,
      time: time || new Date(created.scheduledAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
      type: created.meetingType === 'online' ? t('book.online') : t('book.inPerson'),
      ar,
    }))}`
    : null

  const btnLabel = label || t('book.button')

  // Endowed-progress stepper — derived from real form state, never faked.
  const step1Done = Boolean(date && time)
  const step2Done = Boolean(name.trim() && phone.replace(/[\s\-().]/g, '').length >= 7)
  const stepsDone = step === 'success' ? 3 : (step1Done ? 1 : 0) + (step2Done ? 1 : 0)

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size={size}
        className={cn('bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark', className)}
      >
        <CalendarCheck className="me-2 h-4 w-4" />
        {btnLabel}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={reset} />

          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border bg-background p-6 shadow-2xl">
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">{t('book.title')}</h3>
                {propertyName && <p className="mt-0.5 text-sm text-muted-foreground">{propertyName}</p>}
              </div>
              <button onClick={reset} className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Endowed-progress stepper: hairline + text only, flips with dir */}
            <ol className="mb-5 flex items-center gap-2 border-y border-border py-2 text-[11px] text-muted-foreground" aria-label={ar ? 'خطوات الحجز' : 'Booking steps'}>
              {[
                { n: 1, label: ar ? 'المعاد' : 'Time', done: step1Done || step === 'success' },
                { n: 2, label: ar ? 'بياناتك' : 'Details', done: step2Done || step === 'success' },
                { n: 3, label: ar ? 'تأكيد' : 'Confirm', done: step === 'success' },
              ].map((s, i) => (
                <li key={s.n} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden className="text-border">•</span>}
                  <span className={cn('flex items-center gap-1', s.done ? 'font-semibold text-foreground' : '')}>
                    <span className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                      s.done ? 'border-estate-gold bg-estate-gold/15 text-estate-gold' : 'border-border'
                    )}>
                      {s.done ? <Check className="h-2.5 w-2.5" /> : s.n}
                    </span>
                    {s.n} {s.label}
                  </span>
                </li>
              ))}
              {stepsDone < 3 && (
                <span className="ms-auto shrink-0">{ar ? '— فاضل خطوة وتخلص' : '— almost done'}</span>
              )}
            </ol>

            {step === 'success' && created ? (
              /* ── Success ── */
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                  <Check className="h-7 w-7 text-green-500" />
                </div>
                <p className="text-lg font-bold">{ar && name.trim() ? `اتسجلت يا ${name.trim()} ✓` : t('book.success')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('book.successDesc')}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {ar ? 'هنأكد معاك على واتساب قبلها بيوم' : 'We’ll confirm with you on WhatsApp a day before'}
                  {' — '}
                  {ar ? 'لو حابب تغيّر المعاد، من هنا ' : 'To change the time, go to '}
                  {isPublic ? (
                    <span>
                      {ar ? 'الحسابات والتفضيلات في تطبيق غاية — حمّله وتابع من هناك، أو ' : 'Accounts & saved stuff live in the Ghaya app — download it and pick up from there, or '}
                      <Link href="/contact" className="font-semibold text-estate-gold hover:underline">
                        {ar ? 'كلّمنا' : 'contact us'}
                      </Link>
                    </span>
                  ) : status === 'authenticated' ? (
                    <button
                      type="button"
                      onClick={() => { reset(); router.push('/dashboard/viewings') }}
                      className="font-semibold text-estate-gold hover:underline"
                    >
                      {t('book.myAppointments')}
                    </button>
                  ) : (
                    <span>{ar ? 'معايناتي (سجّل الدخول عشان تشوفها)' : 'my viewings (sign in to see them)'}</span>
                  )}
                </p>

                <div className="mt-5 space-y-3 rounded-2xl border bg-muted/40 p-4 text-start">
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarCheck className="h-4 w-4 text-estate-gold" />
                    <span>{formattedDate}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-estate-gold" />
                    <span>{time}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {created.meetingType === 'online'
                      ? <Video className="h-4 w-4 text-estate-gold" />
                      : <MapPin className="h-4 w-4 text-estate-gold" />}
                    <span>{created.meetingType === 'online' ? t('book.online') : t('book.inPerson')}</span>
                  </div>

                  {created.meetingLink && (
                    <div className="rounded-2xl border bg-background p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">{t('book.meetingLink')}</p>
                      <div className="flex items-center gap-2">
                        <a
                          href={created.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate text-xs text-estate-gold hover:underline"
                        >
                          {created.meetingLink}
                        </a>
                        <Button size="sm" variant="outline" onClick={copyLink} className="h-7 shrink-0">
                          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="outline" asChild className="h-7 shrink-0">
                          <a href={created.meetingLink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-[#0b3d20] transition hover:brightness-110"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {ar ? 'تأكيد واتساب' : 'Confirm on WhatsApp'}
                  </a>
                )}

                <div className="mt-5 flex gap-3">
                  <Button variant="outline" className={!isPublic && status === 'authenticated' ? 'flex-1' : 'w-full'} onClick={reset}>{t('book.close')}</Button>
                  {!isPublic && status === 'authenticated' && (
                    <Button
                      className="flex-1 bg-estate-gold hover:bg-estate-gold-dark"
                      onClick={() => { reset(); router.push('/dashboard/viewings') }}
                    >
                      {t('book.myAppointments')}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <div className="space-y-5">
                {/* Meeting type */}
                <div>
                  <p className="mb-2 text-sm font-medium">{t('book.selectType')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { key: 'in_person' as const, icon: MapPin, title: t('book.inPerson'), desc: t('book.inPersonDesc') },
                      { key: 'online' as const, icon: Video, title: t('book.online'), desc: t('book.onlineDesc') },
                    ]).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setMeetingType(opt.key)}
                        className={cn(
                          'rounded-2xl border p-4 text-start transition-all',
                          meetingType === opt.key
                            ? 'border-estate-gold bg-estate-gold/10 shadow-sm'
                            : 'bg-background hover:border-estate-gold/40 hover:bg-muted/50'
                        )}
                      >
                        <opt.icon className={cn('mb-2 h-5 w-5', meetingType === opt.key ? 'text-estate-gold' : 'text-muted-foreground')} />
                        <p className="text-sm font-semibold">{opt.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <p className="mb-2 text-sm font-medium">{t('book.date')}</p>
                  <input
                    type="date"
                    value={date}
                    min={minDate}
                    max={maxDate}
                    onChange={e => {
                      setDate(e.target.value)
                      // Clear a time slot that would be in the past on the new date
                      if (e.target.value && time && isSlotPast(e.target.value, time)) setTime('')
                    }}
                    className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-estate-gold"
                  />
                </div>

                {/* Time */}
                <div>
                  <p className="mb-2 text-sm font-medium">{t('book.time')}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {TIME_SLOTS.map(slot => {
                      const past = isSlotPast(date, slot)
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={past}
                          onClick={() => !past && setTime(slot)}
                          className={cn(
                            'rounded-full border py-2 text-sm font-medium transition-all',
                            past
                              ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground/40 line-through'
                              : time === slot
                                ? 'border-estate-gold bg-estate-gold text-white'
                                : 'bg-background text-muted-foreground hover:border-estate-gold/50 hover:text-foreground'
                          )}
                        >
                          {slot}
                        </button>
                      )
                    })}
                  </div>
                  {date && TIME_SLOTS.every(s => isSlotPast(date, s)) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {lang === 'ar'
                        ? 'مفيش مواعيد فاضلة في النهارده — اختار يوم تاني ✌️'
                        : 'No slots left today — pick another day'}
                    </p>
                  )}
                </div>

                {/* Name — booking needs no login */}
                <div>
                  <p className="mb-2 text-sm font-medium">{t('book.name')}</p>
                  <input
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('book.namePlaceholder')}
                    className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-estate-gold"
                  />
                </div>

                {/* Phone */}
                <div>
                  <p className="mb-2 text-sm font-medium">{t('book.phone')}</p>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder={t('book.phonePlaceholder')}
                    className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-estate-gold"
                  />
                </div>

                {/* Notes */}
                <div>
                  <p className="mb-2 text-sm font-medium">{t('book.notes')}</p>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder={t('book.notesPlaceholder')}
                    className="w-full resize-none rounded-2xl border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-estate-gold"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full bg-estate-gold text-white hover:bg-estate-gold-dark"
                  size="lg"
                >
                  {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t('book.confirm')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
