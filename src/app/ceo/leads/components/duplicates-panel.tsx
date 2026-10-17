'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Loader2, RefreshCw, AlertTriangle, GitMerge, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

/* ─── Suspected-duplicate queue + merge ────────────────────
   GET /api/ceo/leads/duplicates → { groups: [{ key, leads: [{ id, name,
     phone, email, broker, status, createdAt }] }] }
   POST /api/ceo/leads/merge ← { keepId, mergeIds[] }
   Merge repoints deals/viewings/activities/ownership/voice-notes to the kept
   lead, folds notes, and deletes the absorbed rows. Destructive → confirm. */

interface DupLead {
  id: string
  name: string
  phone: string
  email: string | null
  broker: string | null
  status: string
  createdAt: string
}

interface DupGroup {
  key: string
  leads: DupLead[]
}

interface BrokerLite {
  id: string
  user?: { name?: string | null; email?: string | null } | null
}

export default function DuplicatesPanel({ brokers, onMerged }: { brokers: BrokerLite[]; onMerged: () => void }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({})
  const [mergingKey, setMergingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/ceo/leads/duplicates')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => setGroups(data.groups || []))
      .catch((e) => {
        console.error('Failed to load duplicates:', e)
        setError(ar ? 'معرفناش نجيب الليدز المكررة — حاول تاني.' : 'Failed to load duplicate groups')
      })
      .finally(() => setLoading(false))
  }, [ar])

  useEffect(() => {
    load()
  }, [load])

  const brokerName = (id: string | null) => {
    if (!id) return ar ? 'مش متوزع' : 'Unassigned'
    const b = brokers.find((x) => x.id === id)
    return b?.user?.name || b?.user?.email || (ar ? 'بروكر' : 'Broker')
  }

  const merge = async (group: DupGroup) => {
    const keepId = keepByGroup[group.key] || group.leads[0]?.id
    if (!keepId) return
    const mergeIds = group.leads.map((l) => l.id).filter((id) => id !== keepId)
    if (mergeIds.length === 0) return
    const keep = group.leads.find((l) => l.id === keepId)
    const ok = window.confirm(
      ar
        ? `ادمج ${mergeIds.length} ليد جوه "${keep?.name || ''}"؟ الليدز المدموجة هتتمسح والصفقات والنشاطات هتتنقل لليد المحتفظ بيه.`
        : `Merge ${mergeIds.length} lead(s) into "${keep?.name || ''}"? Absorbed leads are deleted; deals and activity move to the kept lead.`
    )
    if (!ok) return
    setMergingKey(group.key)
    setMessage(null)
    try {
      const res = await fetch('/api/ceo/leads/merge', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId, mergeIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to merge leads')
      setMessage(ar ? `اتدمج ${mergeIds.length} ليد في "${keep?.name || ''}"` : `Merged ${mergeIds.length} lead(s) into "${keep?.name || ''}"`)
      onMerged()
      load()
    } catch (err) {
      console.error('Failed to merge leads:', err)
      setError(ar ? 'معرفناش ندمج — حاول تاني.' : 'Failed to merge leads')
    } finally {
      setMergingKey(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border dark:border-[#262626] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Copy className="h-4 w-4 text-orange-400" />
          {ar ? 'الليدز المكررة' : 'Suspected duplicates'}
          {groups.length > 0 && (
            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[11px] text-orange-400">
              {groups.length}
            </span>
          )}
        </h3>
        <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300" onClick={load}>
          <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />{ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      <div className="p-4">
        {message && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />{message}
          </div>
        )}
        {error && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</span>
            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={load}>{ar ? 'حاول تاني' : 'Retry'}</Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيدوّر على المكرر…' : 'Scanning for duplicates…'}
          </div>
        ) : groups.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">{ar ? 'مفيش ليدز مكررة — نضيف.' : 'No suspected duplicates — clean.'}</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const keepId = keepByGroup[group.key] || group.leads[0]?.id
              return (
                <div key={group.key} className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-orange-400" dir="ltr">{group.key}</p>
                    <span className="text-[11px] text-gray-500">
                      {ar ? `${group.leads.length} ليدز — علّم على اللي يفضل` : `${group.leads.length} leads — tick the one to keep`}
                    </span>
                    <Button
                      size="sm"
                      className="ml-auto bg-orange-500/15 text-orange-300 hover:bg-orange-500/25"
                      disabled={mergingKey === group.key}
                      onClick={() => merge(group)}
                    >
                      {mergingKey === group.key ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <GitMerge className="mr-1 h-4 w-4" />}
                      {ar ? 'ادمج في المحتفظ بيه' : 'Merge into kept'}
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {group.leads.map((l) => (
                      <label key={l.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm transition-colors', l.id === keepId ? 'bg-green-500/10' : 'hover:bg-white/[0.04]')}>
                        <input
                          type="radio"
                          name={`keep-${group.key}`}
                          checked={l.id === keepId}
                          onChange={() => setKeepByGroup({ ...keepByGroup, [group.key]: l.id })}
                          className="h-4 w-4 accent-green-500"
                          title={ar ? 'احتفظ بده' : 'Keep this one'}
                        />
                        <span className={cn('min-w-0 flex-1 truncate', l.id === keepId ? 'font-medium text-green-300' : 'text-gray-300')}>
                          {l.name}
                          <span className="ml-2 text-xs text-gray-500" dir="ltr">{l.phone}{l.email ? ` · ${l.email}` : ''}</span>
                        </span>
                        <span className="hidden shrink-0 text-[11px] text-gray-500 sm:inline">{brokerName(l.broker)}</span>
                        <span className="shrink-0 text-[11px] text-gray-500">{l.status}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
