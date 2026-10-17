'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import {
  Search,
  DollarSign,
  RefreshCw,
  Loader2,
  AlertCircle,
  Inbox,
  X,
  Check,
  TrendingUp,
  TrendingDown,
  History,
  Edit2,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type PricingUnit = {
  id: string
  name: string
  price: number
  pricePerSqm: number
  status: string
  area: number
  project: { id: string; name: string } | null
}

type PriceHistoryEntry = {
  id: string
  oldPrice: number
  newPrice: number
  reason: string | null
  createdAt: string
  user: { name: string | null } | null
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-500/15 text-green-400 border-green-500/30',
  RESERVED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  SOLD: 'bg-[#D4A843]/15 text-[#D4A843] border-[#D4A843]/30',
}

export default function CEOPricingPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [units, setUnits] = useState<PricingUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [bulkMode, setBulkMode] = useState<'percentage' | 'fixed'>('percentage')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkReason, setBulkReason] = useState('')
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editReason, setEditReason] = useState('')
  const [showEditConfirm, setShowEditConfirm] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [historyUnitId, setHistoryUnitId] = useState<string | null>(null)
  const [history, setHistory] = useState<PriceHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchUnits = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const res = await fetch(`/api/ceo/pricing?${params}`)
      if (!res.ok) throw new Error('Failed to fetch pricing data')
      const data = await res.json()
      setUnits(data.units || [])
    } catch (err) {
      console.error('Failed to fetch pricing data:', err)
      setError(ar ? 'معرفناش نجيب بيانات الأسعار — حاول تاني.' : 'Failed to fetch pricing data')
    } finally {
      setLoading(false)
    }
  }, [search, ar])

  useEffect(() => {
    fetchUnits()
  }, [fetchUnits])

  const fetchHistory = async (unitId: string) => {
    setHistoryLoading(true)
    setHistoryUnitId(unitId)
    try {
      const res = await fetch(`/api/ceo/pricing?unitId=${unitId}&history=true`)
      if (!res.ok) throw new Error('Failed to fetch history')
      const data = await res.json()
      setHistory(data.history || [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === units.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(units.map((u) => u.id)))
  }

  const calculateNewPrice = (currentPrice: number, mode: 'percentage' | 'fixed', value: number) => {
    if (mode === 'percentage') return Math.round(currentPrice * (1 + value / 100))
    return currentPrice + value
  }

  const getBulkPreview = () => {
    const value = Number(bulkValue) || 0
    const selected = units.filter((u) => selectedIds.has(u.id))
    if (selected.length === 0 || value === 0) return null

    const totalOld = selected.reduce((sum, u) => sum + u.price, 0)
    const totalNew = selected.reduce((sum, u) => sum + calculateNewPrice(u.price, bulkMode, value), 0)
    return { count: selected.length, totalOld, totalNew, difference: totalNew - totalOld }
  }

  const applyBulkUpdate = async () => {
    const value = Number(bulkValue) || 0
    if (!value || selectedIds.size === 0) return

    setBulkSubmitting(true)
    try {
      const ids = Array.from(selectedIds)
      await Promise.all(
        ids.map((id) => {
          const unit = units.find((u) => u.id === id)
          if (!unit) return Promise.resolve()
          const newPrice = calculateNewPrice(unit.price, bulkMode, value)
          return fetch('/api/ceo/pricing', {
            method: 'PATCH',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
            body: JSON.stringify({ unitId: id, newPrice, reason: bulkReason }),
          })
        })
      )
      setSelectedIds(new Set())
      setShowBulkConfirm(false)
      setBulkValue('')
      setBulkReason('')
      await fetchUnits()
    } catch (err) {
      console.error('Bulk price update failed:', err)
      alert(ar ? 'التحديث الجماعي للأسعار فشل — حاول تاني.' : 'Bulk price update failed')
    } finally {
      setBulkSubmitting(false)
    }
  }

  const applySingleEdit = async () => {
    if (!editingUnitId || !editPrice) return
    setEditSubmitting(true)
    try {
      const res = await fetch('/api/ceo/pricing', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: editingUnitId,
          newPrice: Number(editPrice),
          reason: editReason,
        }),
      })
      if (!res.ok) throw new Error('Failed to update price')
      setEditingUnitId(null)
      setEditPrice('')
      setEditReason('')
      setShowEditConfirm(false)
      await fetchUnits()
    } catch (err) {
      console.error('Failed to update price:', err)
      alert(ar ? 'معرفناش نحدّث السعر — حاول تاني.' : 'Failed to update price')
    } finally {
      setEditSubmitting(false)
    }
  }

  const startEdit = (unit: PricingUnit) => {
    setEditingUnitId(unit.id)
    setEditPrice(String(unit.price))
    setEditReason('')
    setShowEditConfirm(false)
  }

  const bulkPreview = getBulkPreview()
  const editingUnit = editingUnitId ? units.find((u) => u.id === editingUnitId) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الأسعار' : 'CEO Console · Pricing'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة الأسعار' : 'Pricing Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'اتحكم في أسعار الوحدات واعمل تحديث جماعي للأسعار' : 'Manage unit prices and perform bulk price updates'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button onClick={fetchUnits} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-estate-gold/10">
                <DollarSign className="h-5 w-5 text-estate-gold" />
              </div>
              <div>
                <p className="text-sm text-gray-400">{ar ? 'كل الوحدات' : 'Total Units'}</p>
                <p className="text-xl font-bold text-foreground">{units.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">{ar ? 'متوسط السعر/متر' : 'Avg Price/Sqm'}</p>
                <p className="text-xl font-bold text-foreground">
                  {units.length > 0
                    ? formatEGP(Math.round(units.reduce((sum, u) => sum + u.pricePerSqm, 0) / units.length))
                    : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10">
                <TrendingDown className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">{ar ? 'القيمة الكلية' : 'Total Value'}</p>
                <p className="text-xl font-bold text-foreground">
                  {formatEGP(units.reduce((sum, u) => sum + u.price, 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Bulk Panel */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder={ar ? 'دوّر على الوحدات…' : 'Search units...'}
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
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">{ar ? `${selectedIds.size} مختارين` : `${selectedIds.size} selected`}</span>
            <Button onClick={() => setShowBulkConfirm(true)} className="bg-estate-gold text-black hover:bg-estate-gold/90">
              <DollarSign className="mr-2 h-4 w-4" />
              {ar ? 'حدّث السعر جماعي' : 'Bulk Update Price'}
            </Button>
            <Button onClick={() => setSelectedIds(new Set())} variant="ghost" size="sm" className="text-gray-400 hover:text-foreground">
              {ar ? 'اشيل التحديد' : 'Clear'}
            </Button>
          </div>
        )}
      </div>

      {/* Bulk Confirmation Dialog */}
      {showBulkConfirm && (
        <Card className="border-estate-gold/30 bg-estate-gold/5 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{ar ? 'تحديث جماعي للسعر' : 'Bulk Price Update'}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowBulkConfirm(false)} className="text-gray-400 hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'طريقة التحديث' : 'Update Mode'}</label>
                <select
                  value={bulkMode}
                  onChange={(e) => setBulkMode(e.target.value as 'percentage' | 'fixed')}
                  className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold/50 focus:outline-none"
                >
                  <option value="percentage" className="bg-[#0a1220]">{ar ? 'نسبة (%)' : 'Percentage (%)'}</option>
                  <option value="fixed" className="bg-[#0a1220]">{ar ? 'مبلغ ثابت (جنيه)' : 'Fixed Amount (EGP)'}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">
                  {bulkMode === 'percentage' ? (ar ? 'نسبة التغيير' : 'Percentage Change') : (ar ? 'مبلغ التغيير' : 'Amount Change')}
                </label>
                <Input
                  type="number"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder={bulkMode === 'percentage' ? 'e.g. 10 or -5' : 'e.g. 50000 or -20000'}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'السبب' : 'Reason'}</label>
                <Input
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder={ar ? 'سبب تغيير السعر' : 'Reason for price change'}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
            </div>
            {bulkPreview && (
              <div className="mt-4 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-gray-400">{ar ? 'الوحدات المتأثرة' : 'Units Affected'}</p>
                    <p className="text-lg font-bold text-foreground">{bulkPreview.count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{ar ? 'الإجمالي الحالي' : 'Current Total'}</p>
                    <p className="text-lg font-bold text-foreground">{formatEGP(bulkPreview.totalOld)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{ar ? 'الإجمالي الجديد' : 'New Total'}</p>
                    <p className="text-lg font-bold text-estate-gold">{formatEGP(bulkPreview.totalNew)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{ar ? 'الفرق' : 'Difference'}</p>
                    <p className={cn('text-lg font-bold', bulkPreview.difference >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {bulkPreview.difference >= 0 ? '+' : ''}{formatEGP(bulkPreview.difference)}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBulkConfirm(false)} className="border-border dark:border-[#262626] text-gray-400 hover:text-foreground">
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                onClick={applyBulkUpdate}
                disabled={bulkSubmitting || !bulkValue || selectedIds.size === 0}
                className="gold-shimmer bg-estate-gold text-black hover:bg-estate-gold/90"
              >
                {bulkSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {ar ? 'أكّد التحديث' : 'Confirm Update'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single Edit Confirmation */}
      {showEditConfirm && editingUnit && (
        <Card className="border-estate-gold/30 bg-estate-gold/5 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{ar ? 'أكّد تغيير السعر' : 'Confirm Price Change'}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowEditConfirm(false)} className="text-gray-400 hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
              <p className="text-sm text-gray-400 mb-2">{ar ? 'الوحدة:' : 'Unit:'} <span className="text-foreground font-medium">{editingUnit.name}</span></p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400">{ar ? 'السعر الحالي' : 'Current Price'}</p>
                  <p className="text-lg font-bold text-foreground">{formatEGP(editingUnit.price)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{ar ? 'السعر الجديد' : 'New Price'}</p>
                  <p className="text-lg font-bold text-estate-gold">{formatEGP(Number(editPrice) || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{ar ? 'الفرق' : 'Difference'}</p>
                  <p className={cn('text-lg font-bold', (Number(editPrice) - editingUnit.price) >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {(Number(editPrice) - editingUnit.price) >= 0 ? '+' : ''}
                    {formatEGP(Number(editPrice) - editingUnit.price)}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'السبب' : 'Reason'}</label>
                <Input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={ar ? 'سبب تغيير السعر' : 'Reason for price change'}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditConfirm(false)} className="border-border dark:border-[#262626] text-gray-400 hover:text-foreground">
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={applySingleEdit} disabled={editSubmitting} className="gold-shimmer bg-estate-gold text-black hover:bg-estate-gold/90">
                {editSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {ar ? 'أكّد' : 'Confirm'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Price History Modal */}
      {historyUnitId && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                <History className="mr-2 inline h-5 w-5 text-estate-gold" />
                {ar ? 'تاريخ السعر' : 'Price History'} - {units.find((u) => u.id === historyUnitId)?.name}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setHistoryUnitId(null); setHistory([]) }} className="text-gray-400 hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-estate-gold" /></div>
            ) : history.length === 0 ? (
              <p className="py-10 text-center text-gray-500">{ar ? 'مفيش تاريخ أسعار' : 'No price history found'}</p>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-3">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{formatEGP(entry.oldPrice)} &rarr; {formatEGP(entry.newPrice)}</p>
                        <p className="text-xs text-gray-500">{entry.user?.name || (ar ? 'السيستم' : 'System')} &middot; {new Date(entry.createdAt).toLocaleString(ar ? 'ar-EG' : undefined)}</p>
                      </div>
                      {entry.reason && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-gray-400">{entry.reason}</span>
                      )}
                    </div>
                    <span className={cn('text-sm font-bold', entry.newPrice >= entry.oldPrice ? 'text-green-400' : 'text-red-400')}>
                      {entry.newPrice >= entry.oldPrice ? '+' : ''}{formatEGP(entry.newPrice - entry.oldPrice)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchUnits} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && units.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش وحدات' : 'No units found'}</p>
          <p className="mt-1 text-sm text-gray-500">{ar ? 'مفيش بيانات أسعار متاحة' : 'No pricing data available'}</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && units.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">
                      <button onClick={toggleSelectAll}>
                        {selectedIds.size === units.length && units.length > 0 ? (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-2xl bg-estate-gold text-black text-xs font-bold">✓</span>
                        ) : (
                          <span className="inline-flex h-4 w-4 rounded border border-gray-500" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الوحدة' : 'Unit'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'المشروع' : 'Project'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'السعر الحالي' : 'Current Price'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'السعر/متر' : 'Price/Sqm'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'المساحة' : 'Area'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {units.map((unit) => (
                    <tr key={unit.id} className={cn('transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', selectedIds.has(unit.id) && 'bg-card dark:bg-[#0A0A0A]')}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(unit.id)}>
                          {selectedIds.has(unit.id) ? (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-2xl bg-estate-gold text-black text-xs font-bold">✓</span>
                          ) : (
                            <span className="inline-flex h-4 w-4 rounded border border-gray-500" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{unit.name}</p>
                        <p className="text-xs text-gray-500">{unit.area} {ar ? 'م²' : 'sqm'}</p>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-gray-400">{unit.project?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {editingUnitId === unit.id ? (
                          <Input
                            type="number"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="h-8 w-36 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="font-medium text-estate-gold">{formatEGP(unit.price)}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-gray-400">{formatEGP(unit.pricePerSqm)}{ar ? '/متر' : '/sqm'}</span>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-gray-400">{unit.area} {ar ? 'م²' : 'sqm'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                          STATUS_COLORS[unit.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                        )}>
                          {statusLabel(unit.status, ar)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {editingUnitId === unit.id ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setShowEditConfirm(true)} className="text-green-400 hover:text-green-300">
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingUnitId(null); setEditPrice(''); setEditReason(''); setShowEditConfirm(false) }} className="text-gray-400 hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => startEdit(unit)} className="text-gray-400 hover:text-foreground">
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => fetchHistory(unit.id)} className="text-gray-400 hover:text-estate-gold">
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
