'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, CalendarClock, CalendarCheck, MapPin, Video, Phone, ExternalLink, Loader2, Building2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

export interface MeetingNotification {
  id: string
  clientName: string
  clientPhone: string | null
  projectName: string
  scheduledAt: string
  meetingType: string
  meetingLink: string | null
  notes: string | null
  createdAt: string
}

export function formatWhen(iso: string, ar = false) {
  return new Date(iso).toLocaleString(ar ? 'ar-EG' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function meetingTypeLabel(type: string, ar: boolean) {
  if (type === 'online') return ar ? 'أونلاين' : 'Online'
  return ar ? 'حضوري' : 'In-person'
}

export async function fetchMeetingNotifications(): Promise<MeetingNotification[]> {
  try {
    const res = await fetch('/api/ceo/notifications')
    if (!res.ok) return []
    const data = await res.json()
    return data.notifications || []
  } catch {
    return []
  }
}

// Real bell for the CEO header: badge count = pending meeting requests.
export default function CeoNotifications() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<MeetingNotification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await fetchMeetingNotifications())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const count = items.length

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o)
          if (!open) load()
        }}
        className="relative rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-2 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]"
        aria-label={ar ? 'طلبات اجتماعات جديدة' : 'New meeting requests'}
      >
        <Bell className="h-4 w-4 text-gray-400" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-estate-gold px-0.5 text-[10px] font-bold text-estate-navy">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-[23rem] overflow-hidden rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-border dark:border-[#262626] px-4 py-3">
              <span className="font-display text-sm font-semibold text-foreground">
                {ar ? `طلبات اجتماعات جديدة${count > 0 ? ` (${count})` : ''}` : `New Meeting Requests${count > 0 ? ` (${count})` : ''}`}
              </span>
              <button onClick={() => setOpen(false)} className="text-gray-500 transition-colors hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-estate-gold" />
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CalendarCheck className="mx-auto mb-2 h-8 w-8 text-gray-600" />
                  <p className="text-sm text-gray-400">{ar ? 'مفيش طلبات اجتماعات مستنية' : 'No pending meeting requests'}</p>
                  <p className="mt-1 text-xs text-gray-600">{ar ? 'الحجوزات الجديدة هتظهر هنا' : 'New bookings will show up here'}</p>
                </div>
              ) : (
                items.map((n) => (
                  <div key={n.id} className="border-b border-border dark:border-[#262626] px-4 py-3 last:border-b-0 hover:bg-card dark:hover:bg-[#0A0A0A]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{n.clientName}</span>
                      <span className="shrink-0 text-[10px] text-gray-500">
                        {new Date(n.createdAt).toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="mt-1 flex items-center gap-1.5 text-xs text-estate-gold">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{n.projectName}</span>
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatWhen(n.scheduledAt, ar)}
                      </span>
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-full px-1.5 py-0.5',
                          n.meetingType === 'online'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-card dark:bg-[#0A0A0A] text-gray-300'
                        )}
                      >
                        {n.meetingType === 'online' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                        {meetingTypeLabel(n.meetingType, ar)}
                      </span>
                    </div>

                    {n.clientPhone && (
                      <a
                        href={`tel:${n.clientPhone}`}
                        className="mt-1 flex w-fit items-center gap-1 text-xs text-gray-400 transition-colors hover:text-foreground"
                      >
                        <Phone className="h-3.5 w-3.5" /> {n.clientPhone}
                      </a>
                    )}

                    {n.notes && (
                      <p className="mt-1 truncate text-[11px] text-gray-500">{n.notes}</p>
                    )}

                    {n.meetingLink && (
                      <a
                        href={n.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-estate-gold transition-colors hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> {ar ? 'ادخل الاجتماع' : 'Join meeting'}
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>

            <Link
              href="/ceo/viewings"
              onClick={() => setOpen(false)}
              className="block border-t border-border dark:border-[#262626] px-4 py-2.5 text-center text-xs font-medium text-estate-gold transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]"
            >
              {ar ? 'افتح كل الاجتماعات ←' : 'Open all meetings →'}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
