'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, CalendarClock, MapPin, Video, Phone, ExternalLink, Building2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { fetchMeetingNotifications, formatWhen, meetingTypeLabel, type MeetingNotification } from './ceo-notifications'

// Overview card: shows every pending meeting request with full details
// (client, phone, project, date/time, in-person/online + join link).
export default function CeoMeetingRequests() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<MeetingNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchMeetingNotifications().then((n) => {
      if (alive) {
        setItems(n)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  if (loading) return null

  const has = items.length > 0
  const shown = items.slice(0, 5)

  return (
    <Card
      className={cn(
        'rounded-2xl border bg-card dark:bg-[#0A0A0A] backdrop-blur-sm',
        has ? 'border-estate-gold/40 shadow-lg shadow-estate-gold/5' : 'border-border dark:border-[#262626]'
      )}
    >
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-2xl',
                has ? 'bg-estate-gold/20 text-estate-gold' : 'bg-card dark:bg-[#0A0A0A] text-gray-500'
              )}
            >
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-foreground">{ar ? 'طلبات اجتماعات جديدة' : 'New Meeting Requests'}</p>
              <p className="text-xs text-gray-500">
                {has
                  ? (ar ? `${items.length} مستنيين — متحجزوا من الموقع` : `${items.length} pending — booked from the website`)
                  : (ar ? 'الحجوزات الجديدة هتظهر هنا لوحدها' : 'New bookings will appear here automatically')}
              </p>
            </div>
            {has && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-estate-gold px-1.5 text-[11px] font-bold text-estate-navy">
                {items.length}
              </span>
            )}
          </div>
          <Link
            href="/ceo/viewings"
            className="shrink-0 text-xs font-medium text-estate-gold transition-colors hover:underline"
          >
            {ar ? 'شوف الكل ←' : 'View all →'}
          </Link>
        </div>

        {has ? (
          <div className="space-y-3">
            {shown.map((n) => (
              <div
                key={n.id}
                className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-3 transition-colors hover:border-estate-gold/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">{n.clientName}</span>
                  <span className="flex items-center gap-1 text-xs font-medium text-estate-gold">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="max-w-[24rem] truncate">{n.projectName}</span>
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
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
                  {n.clientPhone && (
                    <a href={`tel:${n.clientPhone}`} className="flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" /> {n.clientPhone}
                    </a>
                  )}
                  {n.meetingLink && (
                    <a
                      href={n.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-estate-gold hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> {ar ? 'ادخل الاجتماع' : 'Join meeting'}
                    </a>
                  )}
                </div>

                {n.notes && <p className="mt-1 truncate text-[11px] text-gray-500">{n.notes}</p>}
              </div>
            ))}

            {items.length > 5 && (
              <p className="text-center text-xs text-gray-500">{ar ? `+ ${items.length - 5} كمان…` : `+ ${items.length - 5} more…`}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-border dark:border-[#262626] py-6">
            <p className="text-sm text-gray-500">{ar ? 'مفيش طلبات اجتماعات مستنية دلوقتي' : 'No pending meeting requests right now'}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
