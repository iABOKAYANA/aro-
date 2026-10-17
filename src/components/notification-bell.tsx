'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Loader2, CheckCheck, Inbox, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

interface AppNotification {
  id: string
  type: string
  title: string
  message: string | null
  link: string | null
  isRead: boolean
  createdAt: string
}

const TYPE_ICONS: Record<string, string> = {
  LEAD_REGISTERED: '🟢',
  PROTECTION_ACTIVATED: '🛡️',
  PROTECTION_EXPIRING: '⏳',
  PROTECTION_EXPIRED: '🔴',
  DUPLICATE_DETECTED: '⚠️',
  LEAD_TRANSFERRED: '🔁',
  STATUS_CHANGED: '📊',
  VIEWING_SCHEDULED: '📅',
  VIEWING_COMPLETED: '⭐',
  RESERVATION_CREATED: '📝',
  DEAL_UPDATED: '💼',
  DEAL_REQUIRING_ACTION: '🔔',
  COMMISSION_CREATED: '💰',
  COMMISSION_UPDATED: '💰',
  COMMISSION_PAID: '✅',
  COMMISSION_DISPUTED: '⚖️',
}

// Reusable header bell backed by /api/notifications (Notification model).
export default function NotificationBell({ linkHref = '/dashboard' }: { linkHref?: string }) {
  const { lang } = useLanguage()
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=15')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.notifications || [])
      setUnread(data.unreadCount || 0)
    } catch {
      /* fail-soft: bell stays at last known state */
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [load])

  const markAll = async () => {
    setLoading(true)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      await load()
    } finally {
      setLoading(false)
    }
  }

  const openItem = async (item: AppNotification) => {
    if (!item.isRead) {
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [item.id] }),
        })
      } catch {
        /* ignore */
      }
    }
    setOpen(false)
    if (item.link) window.location.href = item.link
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o)
          if (!open) load()
        }}
        className="relative rounded-full p-2 hover:bg-muted"
        aria-label={t('Notifications', 'الإشعارات')}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-full z-50 mt-2 w-[22rem] overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">
                {t('Notifications', 'الإشعارات')}
                {unread > 0 ? ` (${unread})` : ''}
              </span>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={markAll}
                    disabled={loading}
                    className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                    title={t('Mark all as read', 'تحديد الكل كمقروء')}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t('No notifications yet', 'لا توجد إشعارات بعد')}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {t(
                      'Follow a city or save a search — we’ll tell you the moment something fitting lands, no spam.',
                      'تابع مدينة أو احفظ بحث — وهنقولك أول ما حاجة مناسبة تنزل، من غير زن.'
                    )}
                  </p>
                </div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={cn(
                      'block w-full border-b px-4 py-3 text-start transition last:border-b-0 hover:bg-muted/50',
                      !n.isRead && 'bg-estate-gold/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none">{TYPE_ICONS[n.type] || '🔔'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{n.title}</p>
                          {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-estate-gold" />}
                        </div>
                        {n.message && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground/70">
                          {new Date(n.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {linkHref && (
              <Link
                href={linkHref}
                onClick={() => setOpen(false)}
                className="block border-t px-4 py-2.5 text-center text-xs font-medium text-estate-gold transition hover:bg-muted/50"
              >
                {t('Open dashboard', 'فتح لوحة التحكم')} →
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
