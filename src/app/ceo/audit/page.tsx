'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollText, Loader2, RefreshCw, AlertTriangle, Search, X } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import ExportCsvBtn from '@/components/ui/export-csv'

/* ─── Audit-log viewer ─────────────────────────────────────
   GET /api/ceo/audit?action&entity&userId&from&to&limit → { items: [{
     id, action, entity, entityId, changes, userId, userName, userEmail,
     ipAddress, createdAt }] } (newest-first). Read-only. */

interface AuditItem {
  id: string
  action: string
  entity: string | null
  entityId: string | null
  changes: unknown
  userId: string | null
  userName: string | null
  userEmail: string | null
  ipAddress: string | null
  createdAt: string
}

const inputCls =
  'rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-estate-gold/50'

export default function CEOAuditPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ action: '', entity: '', userId: '', from: '', to: '', limit: '50' })
  const [applied, setApplied] = useState({ action: '', entity: '', userId: '', from: '', to: '', limit: '50' })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (applied.action.trim()) params.set('action', applied.action.trim())
    if (applied.entity.trim()) params.set('entity', applied.entity.trim())
    if (applied.userId.trim()) params.set('userId', applied.userId.trim())
    if (applied.from) params.set('from', applied.from)
    if (applied.to) params.set('to', applied.to)
    params.set('limit', applied.limit || '50')
    fetch(`/api/ceo/audit?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => setItems(data.items || []))
      .catch((e) => {
        console.error('Failed to load audit log:', e)
        setError(ar ? 'معرفناش نجيب سجل التدقيق — حاول تاني.' : 'Failed to load audit log')
      })
      .finally(() => setLoading(false))
  }, [applied, ar])

  useEffect(() => {
    load()
  }, [load])

  const hasFilters = filters.action || filters.entity || filters.userId || filters.from || filters.to

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · التدقيق' : 'CEO Console · Audit'}</p>
          <h1 className="font-display display-3 flex items-center gap-2 text-foreground">
            <ScrollText className="h-7 w-7 text-estate-gold" />
            {ar ? 'سجل التدقيق' : 'Audit Log'}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar ? 'كل حركة إدارية متسجلة: مين عمل إيه وإمتى' : 'Every admin move, logged: who did what and when'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex gap-2">
          <ExportCsvBtn
            filename="ceo-audit"
            rows={items.map((i) => ({
              createdAt: i.createdAt,
              action: i.action,
              entity: i.entity,
              entityId: i.entityId,
              userName: i.userName,
              userEmail: i.userEmail,
              ipAddress: i.ipAddress,
              changes: typeof i.changes === 'string' ? i.changes : JSON.stringify(i.changes),
            }))}
            columns={[
              { key: 'createdAt', label: ar ? 'التاريخ' : 'Date' },
              { key: 'action', label: ar ? 'الحركة' : 'Action' },
              { key: 'entity', label: ar ? 'الكيان' : 'Entity' },
              { key: 'entityId', label: ar ? 'معرّف الكيان' : 'Entity ID' },
              { key: 'userName', label: ar ? 'الفاعل' : 'Actor' },
              { key: 'userEmail', label: ar ? 'إيميل الفاعل' : 'Actor email' },
              { key: 'ipAddress', label: ar ? 'الـIP' : 'IP' },
              { key: 'changes', label: ar ? 'التفاصيل' : 'Changes' },
            ]}
          />
          <Button onClick={load} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder={ar ? 'الحركة (مثال: LEAD_DELETED)' : 'Action (e.g. LEAD_DELETED)'}
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-9 text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
          />
        </div>
        <input
          placeholder={ar ? 'الكيان (مثال: Lead)' : 'Entity (e.g. Lead)'}
          value={filters.entity}
          onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
          className={inputCls}
        />
        <input
          placeholder={ar ? 'معرّف الفاعل (userId)' : 'Actor userId'}
          value={filters.userId}
          onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
          className={inputCls}
        />
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={inputCls} title={ar ? 'من' : 'From'} />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={inputCls} title={ar ? 'لحد' : 'To'} />
        <select value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: e.target.value })} className={inputCls}>
          {['25', '50', '100', '200'].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90" onClick={() => setApplied({ ...filters })}>
          {ar ? 'دوّر' : 'Search'}
        </Button>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400"
            onClick={() => {
              const blank = { action: '', entity: '', userId: '', from: '', to: '', limit: '50' }
              setFilters(blank)
              setApplied(blank)
            }}
          >
            <X className="mr-1 h-4 w-4" />{ar ? 'امسح الفلاتر' : 'Clear'}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={load} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      ) : (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">
              {ar ? `${items.length} حركة` : `${items.length} entr${items.length === 1 ? 'y' : 'ies'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <p className="py-14 text-center text-sm text-gray-500">{ar ? 'مفيش حركات مطابقة.' : 'No matching entries.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border dark:border-[#262626]">
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'التاريخ' : 'Date'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحركة' : 'Action'}</th>
                      <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'الكيان' : 'Entity'}</th>
                      <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'الفاعل' : 'Actor'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'التفاصيل' : 'Changes'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-[#262626]">
                    {items.map((i) => {
                      const expanded = expandedId === i.id
                      const changesText = typeof i.changes === 'string' ? i.changes : JSON.stringify(i.changes, null, 2)
                      return (
                        <tr key={i.id} className="transition-colors hover:bg-white/[0.03]">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                            {new Date(i.createdAt).toLocaleString(ar ? 'ar-EG' : undefined)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-estate-gold/30 bg-estate-gold/10 px-2.5 py-0.5 font-mono text-[11px] text-estate-gold">
                              {i.action}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-gray-400 lg:table-cell">
                            {i.entity || '—'}
                            {i.entityId && <span className="ml-1 font-mono text-gray-600">{i.entityId.slice(0, 8)}</span>}
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-gray-300 xl:table-cell">
                            {i.userName || i.userEmail || (ar ? 'سيستم' : 'system')}
                          </td>
                          <td className="max-w-[320px] px-4 py-3">
                            {i.changes == null ? (
                              <span className="text-gray-600">—</span>
                            ) : (
                              <button
                                onClick={() => setExpandedId(expanded ? null : i.id)}
                                className="block w-full truncate text-left font-mono text-[11px] text-gray-500 hover:text-gray-300"
                                dir="ltr"
                              >
                                {expanded ? changesText : changesText.slice(0, 80)}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
