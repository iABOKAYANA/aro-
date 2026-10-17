'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Shield, ShieldAlert, ShieldOff, AlertTriangle, Eye, FileText,
  Handshake, Loader2, RefreshCw, ArrowRight, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

interface LeadStats {
  totalLeads: number
  newLeads: number
  activeProtected: number
  expiringSoon: number
  expired: number
  duplicateReview: number
  qualified: number
  viewings: number
  reservations: number
  contracts: number
  sold: number
  lost: number
}

// Broker/developer "Lead Protection" section on the overview dashboard.
// Numbers come from /api/leads/stats — server-scoped to the caller's role.
export default function LeadProtectionSummary() {
  const { lang } = useLanguage()
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const [stats, setStats] = useState<LeadStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    fetch('/api/leads/stats')
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => setStats(data.stats))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const cards = stats ? [
    { icon: Users, label: t('My Leads', 'عملائي'), value: stats.totalLeads, accent: 'text-blue-500' },
    { icon: Shield, label: t('Active Protected', 'محمية فعالًا'), value: stats.activeProtected, accent: 'text-green-500' },
    { icon: ShieldAlert, label: t('Expiring Soon', 'تنتهي قريبًا'), value: stats.expiringSoon, accent: 'text-amber-500' },
    { icon: ShieldOff, label: t('Expired', 'منتهية'), value: stats.expired, accent: 'text-red-500' },
    { icon: AlertTriangle, label: t('Duplicate Review', 'مراجعة تكرار'), value: stats.duplicateReview, accent: 'text-orange-500' },
    { icon: Eye, label: t('Qualified', 'مؤهلون'), value: stats.qualified, accent: 'text-teal-500' },
    { icon: Calendar, label: t('Viewings', 'معاينات'), value: stats.viewings, accent: 'text-purple-500' },
    { icon: FileText, label: t('Reservations', 'حجوزات'), value: stats.reservations, accent: 'text-indigo-500' },
    { icon: Handshake, label: t('Sold Deals', 'صفقات مباعة'), value: stats.sold, accent: 'text-emerald-600' },
  ] : []

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4 text-estate-gold" />
          {t('Lead Protection', 'حماية العملاء المحتملين')}
        </h2>
        <div className="flex items-center gap-2">
          {!loading && !error && (
            <button onClick={load} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground" title={t('Refresh', 'تحديث')}>
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <Link href="/dashboard/leads" className="flex items-center gap-1 text-xs font-medium text-estate-gold hover:underline">
            {t('Open CRM', 'فتح CRM')} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading protection stats...', 'جارِ تحميل إحصائيات الحماية...')}
          </div>
        ) : error ? (
          <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
            <span>{t('Could not load protection stats', 'تعذّر تحميل إحصائيات الحماية')}</span>
            <button onClick={load} className="rounded-full border border-red-500/30 px-2 py-1 text-xs hover:bg-red-500/20">
              {t('Retry', 'إعادة المحاولة')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {cards.map((card) => (
              <div key={card.label} className="rounded-2xl border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5">
                  <card.icon className={cn('h-4 w-4', card.accent)} />
                  <span className="truncate text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className="mt-1 text-xl font-bold">{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
