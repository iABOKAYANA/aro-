'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatEGP } from '@/lib/utils'
import ExportCsvBtn from '@/components/ui/export-csv'
import {
  Search,
  Building2,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Inbox,
  Eye,
  EyeOff,
  Edit2,
  X,
  Check,
  CheckSquare,
  Square,
  ArrowUpDown,
  BedDouble,
  Bath,
  Ruler,
} from 'lucide-react'
import { UploadButton } from '../components/image-input'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import { Reveal } from '@/components/design'

type Unit = {
  id: string
  name: string
  slug: string
  unitType: string
  listingType: string
  area: number
  bedrooms: number
  bathrooms: number
  price: number
  floorPlan: string | null
  status: string
  isHidden: boolean
  isSample: boolean
  createdAt: string
  project: { id: string; name: string } | null
}

type Project = {
  id: string
  name: string
}

const STATUS_TABS = ['ALL', 'AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN', 'SUSPENDED'] as const

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-500/15 text-green-400 border-green-500/30',
  RESERVED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  SOLD: 'bg-[#D4A843]/15 text-[#D4A843] border-[#D4A843]/30',
  HIDDEN: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  SUSPENDED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const STATUS_DOTS: Record<string, string> = {
  AVAILABLE: 'bg-green-400',
  RESERVED: 'bg-yellow-400',
  SOLD: 'bg-[#D4A843]',
  HIDDEN: 'bg-gray-400',
  SUSPENDED: 'bg-red-400',
}

const UNIT_TYPES = ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'DUPLEX', 'PENTHOUSE', 'STUDIO']
const LISTING_TYPES = ['SALE', 'RENT']

const UTYPE_AR: Record<string, string> = {
  APARTMENT: 'شقة', VILLA: 'فيلا', TOWNHOUSE: 'تاونهاوس',
  DUPLEX: 'دوبلكس', PENTHOUSE: 'بنتهاوس', STUDIO: 'استوديو',
}

const LTYPE_AR: Record<string, string> = {
  SALE: 'بيع', RENT: 'إيجار',
}

type FormData = {
  projectId: string
  name: string
  unitType: string
  listingType: string
  area: string
  bedrooms: string
  bathrooms: string
  price: string
  floorPlan: string
  isSample: boolean
}

const emptyForm: FormData = {
  projectId: '',
  name: '',
  unitType: 'APARTMENT',
  listingType: 'SALE',
  area: '',
  bedrooms: '',
  bathrooms: '',
  price: '',
  floorPlan: '',
  isSample: false,
}

export default function CEOUnitsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [units, setUnits] = useState<Unit[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<FormData>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatusValue, setBulkStatusValue] = useState('AVAILABLE')
  const [showBulkPanel, setShowBulkPanel] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchUnits = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeTab !== 'ALL') params.set('status', activeTab)
      const res = await fetch(`/api/ceo/units?${params}`)
      if (!res.ok) throw new Error('Failed to fetch units')
      const data = await res.json()
      setUnits(data.units || [])
    } catch (err) {
      console.error('Failed to fetch units:', err)
      setError(ar ? 'معرفناش نجيب الوحدات — حاول تاني.' : 'Failed to fetch units')
    } finally {
      setLoading(false)
    }
  }, [search, activeTab, ar])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/ceo/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchUnits()
  }, [fetchUnits])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const statusCounts = units.reduce(
    (acc, unit) => {
      acc[unit.status] = (acc[unit.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const createUnit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/ceo/units', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          area: Number(formData.area),
          bedrooms: Number(formData.bedrooms),
          bathrooms: Number(formData.bathrooms),
          price: Number(formData.price),
          isSample: formData.isSample === true,
        }),
      })
      if (!res.ok) throw new Error('Failed to create unit')
      setShowCreateForm(false)
      setFormData(emptyForm)
      await fetchUnits()
    } catch (err) {
      console.error('Failed to create unit:', err)
      alert(ar ? 'معرفناش نعمل الوحدة — حاول تاني.' : 'Failed to create unit')
    } finally {
      setSubmitting(false)
    }
  }

  const updateUnit = async (id: string) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/ceo/units', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          ...editForm,
          area: editForm.area ? Number(editForm.area) : undefined,
          bedrooms: editForm.bedrooms ? Number(editForm.bedrooms) : undefined,
          bathrooms: editForm.bathrooms ? Number(editForm.bathrooms) : undefined,
          price: editForm.price ? Number(editForm.price) : undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to update unit')
      setEditingId(null)
      setEditForm({})
      await fetchUnits()
    } catch (err) {
      console.error('Failed to update unit:', err)
      alert(ar ? 'معرفناش نحدّث الوحدة — حاول تاني.' : 'Failed to update unit')
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/ceo/units', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      await fetchUnits()
    } catch (err) {
      console.error('Failed to update status:', err)
      alert(ar ? 'معرفناش نحدّث الحالة — حاول تاني.' : 'Failed to update status')
    }
  }

  const toggleHide = async (id: string) => {
    setTogglingId(id)
    try {
      const unit = units.find((u) => u.id === id)
      const res = await fetch('/api/ceo/units', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isHidden: !unit?.isHidden }),
      })
      if (!res.ok) throw new Error('Failed to toggle visibility')
      await fetchUnits()
    } catch (err) {
      console.error('Failed to toggle visibility:', err)
      alert(ar ? 'معرفناش نغيّر الظهور — حاول تاني.' : 'Failed to toggle visibility')
    } finally {
      setTogglingId(null)
    }
  }

  const toggleSample = async (id: string) => {
    try {
      const unit = units.find((u) => u.id === id)
      const res = await fetch('/api/ceo/units', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isSample: !unit?.isSample }),
      })
      if (!res.ok) throw new Error('Failed to toggle sample flag')
      await fetchUnits()
    } catch (err) {
      console.error('Failed to toggle sample flag:', err)
      alert(ar ? 'معرفناش نغيّر علامة النموذج — حاول تاني.' : 'Failed to toggle sample flag')
    }
  }

  const deleteUnit = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/ceo/units?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) throw new Error('Failed to delete unit')
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      await fetchUnits()
    } catch (err) {
      console.error('Failed to delete unit:', err)
      alert(ar ? 'معرفناش نمسح الوحدة — حاول تاني.' : 'Failed to delete unit')
    } finally {
      setDeletingId(null)
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
    if (selectedIds.size === units.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(units.map((u) => u.id)))
    }
  }

  const bulkUpdateStatus = async () => {
    const ids = Array.from(selectedIds)
    try {
      await Promise.all(
        ids.map((id) =>
          fetch('/api/ceo/units', {
            method: 'PATCH',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: bulkStatusValue }),
          })
        )
      )
      setSelectedIds(new Set())
      setShowBulkPanel(false)
      await fetchUnits()
    } catch (err) {
      console.error('Bulk update failed:', err)
      alert(ar ? 'التحديث الجماعي فشل — حاول تاني.' : 'Bulk update failed')
    }
  }

  const bulkDelete = async () => {
    if (!confirm(ar ? `امسح ${selectedIds.size} وحدة؟` : `Delete ${selectedIds.size} unit(s)?`)) return
    const ids = Array.from(selectedIds)
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/ceo/units?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } }))
      )
      setSelectedIds(new Set())
      setShowBulkPanel(false)
      await fetchUnits()
    } catch (err) {
      console.error('Bulk delete failed:', err)
      alert(ar ? 'المسح الجماعي فشل — حاول تاني.' : 'Bulk delete failed')
    }
  }

  const bulkHide = async () => {
    const ids = Array.from(selectedIds)
    try {
      await Promise.all(
        ids.map((id) =>
          fetch('/api/ceo/units', {
            method: 'PATCH',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, isHidden: true }),
          })
        )
      )
      setSelectedIds(new Set())
      setShowBulkPanel(false)
      await fetchUnits()
    } catch (err) {
      console.error('Bulk hide failed:', err)
      alert(ar ? 'الإخفاء الجماعي فشل — حاول تاني.' : 'Bulk hide failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الوحدات' : 'CEO Console · Units'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة الوحدات' : 'Unit Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'اتحكم في كل وحدات العقارات في مشاريعك' : 'Manage all property units across your projects'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex gap-2">
          <Button onClick={fetchUnits} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button onClick={() => setShowCreateForm(!showCreateForm)} className="bg-estate-gold text-black hover:bg-estate-gold/90">
            <Plus className="mr-2 h-4 w-4" />
            {ar ? 'وحدة جديدة' : 'New Unit'}
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{ar ? 'اعمل وحدة جديدة' : 'Create New Unit'}</h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowCreateForm(false); setFormData(emptyForm) }} className="text-gray-400 hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'المشروع' : 'Project'}</label>
                <select
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold/50 focus:outline-none"
                >
                  <option value="" className="bg-[#0a1220]">{ar ? 'اختار المشروع' : 'Select project'}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#0a1220]">{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'اسم الوحدة' : 'Unit Name'}</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Unit A-101"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'نوع الوحدة' : 'Unit Type'}</label>
                <select
                  value={formData.unitType}
                  onChange={(e) => setFormData({ ...formData, unitType: e.target.value })}
                  className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold/50 focus:outline-none"
                >
                  {UNIT_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-[#0a1220]">{ar ? UTYPE_AR[t] || t : t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'نوع الإعلان' : 'Listing Type'}</label>
                <select
                  value={formData.listingType}
                  onChange={(e) => setFormData({ ...formData, listingType: e.target.value })}
                  className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold/50 focus:outline-none"
                >
                  {LISTING_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-[#0a1220]">{ar ? LTYPE_AR[t] || t : t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'المساحة (م²)' : 'Area (sqm)'}</label>
                <Input
                  type="number"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  placeholder="0"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'أوض النوم' : 'Bedrooms'}</label>
                <Input
                  type="number"
                  value={formData.bedrooms}
                  onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                  placeholder="0"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'الحمامات' : 'Bathrooms'}</label>
                <Input
                  type="number"
                  value={formData.bathrooms}
                  onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                  placeholder="0"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'السعر (جنيه)' : 'Price (EGP)'}</label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-400">{ar ? 'المخطط (ارفع أو حط لينك)' : 'Floor Plan (upload or paste URL)'}</label>
                <div className="flex gap-2">
                  <Input
                    value={formData.floorPlan}
                    onChange={(e) => setFormData({ ...formData, floorPlan: e.target.value })}
                    placeholder="https://…/floor-plan.png"
                    className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                  />
                  <UploadButton onUploaded={(url) => setFormData((f) => ({ ...f, floorPlan: url }))}>
                    {ar ? 'ارفع' : 'Upload'}
                  </UploadButton>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.isSample}
                    onChange={(e) => setFormData({ ...formData, isSample: e.target.checked })}
                    className="h-4 w-4 accent-[#D4A843]"
                  />
                  {ar ? 'نموذج استرشادي (وحدة عرض — مش بتتباع)' : 'Showcase sample model (display only — not bookable)'}
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  {ar
                    ? 'الوحدة الاسترشادية بتظهر في قسم النماذج بس، ومبتدخلش في البحث ولا الأعداد ولا الحجز.'
                    : 'A sample model shows in the models section only — never in search, counts, or booking.'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowCreateForm(false); setFormData(emptyForm) }} className="border-border dark:border-[#262626] text-gray-400 hover:text-foreground">
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={createUnit} disabled={submitting || !formData.name} className="gold-shimmer bg-estate-gold text-black hover:bg-estate-gold/90">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {ar ? 'اعمل الوحدة' : 'Create Unit'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Tabs */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {STATUS_TABS.map((tab) => {
          const count = tab === 'ALL' ? units.length : (statusCounts[tab] || 0)
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-2xl border p-4 text-left transition-all duration-200',
                activeTab === tab
                  ? 'border-estate-gold/30 bg-estate-gold/10'
                  : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] hover:border-border dark:hover:border-[#262626] hover:bg-card dark:hover:bg-[#0A0A0A]'
              )}
            >
              <div className="flex items-center gap-2">
                {tab !== 'ALL' && <div className={cn('h-2 w-2 rounded-full', STATUS_DOTS[tab])} />}
                <span className="text-xs font-medium text-gray-400">{tab === 'ALL' ? (ar ? 'الكل' : 'ALL') : statusLabel(tab, ar)}</span>
              </div>
              <p className={cn('mt-2 text-2xl font-bold', activeTab === tab ? 'text-estate-gold' : 'text-foreground')}>
                {count}
              </p>
            </button>
          )
        })}
      </div>

      {/* Search & Bulk Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder={ar ? 'دوّر باسم الوحدة أو المشروع…' : 'Search by unit name, project...'}
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-gray-400">{ar ? `${selectedIds.size} مختارين` : `${selectedIds.size} selected`}</span>
              <Button onClick={() => setShowBulkPanel(!showBulkPanel)} variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
                {ar ? 'إجراءات جماعية' : 'Bulk Actions'}
              </Button>
              <Button onClick={() => setSelectedIds(new Set())} variant="ghost" size="sm" className="text-gray-400 hover:text-foreground">
                {ar ? 'اشيل التحديد' : 'Clear'}
              </Button>
            </>
          )}

          {/* `units` is already server-filtered by the search + status tab. */}
          <ExportCsvBtn
            filename="ceo-units"
            rows={units.map((u) => ({
              name: u.name,
              slug: u.slug,
              project: u.project?.name ?? '',
              unitType: u.unitType,
              listingType: u.listingType,
              area: u.area,
              bedrooms: u.bedrooms,
              bathrooms: u.bathrooms,
              price: u.price,
              status: u.status,
              isHidden: u.isHidden,
              isSample: (u as { isSample?: boolean }).isSample ?? false,
              floorPlan: u.floorPlan,
              createdAt: u.createdAt,
            }))}
            columns={[
              { key: 'name', label: ar ? 'الوحدة' : 'Unit' },
              { key: 'slug', label: ar ? 'الرابط' : 'Slug' },
              { key: 'project', label: ar ? 'المشروع' : 'Project' },
              { key: 'unitType', label: ar ? 'النوع' : 'Type' },
              { key: 'listingType', label: ar ? 'الإعلان' : 'Listing' },
              { key: 'area', label: ar ? 'المساحة (م²)' : 'Area (m²)' },
              { key: 'bedrooms', label: ar ? 'أوض النوم' : 'Bedrooms' },
              { key: 'bathrooms', label: ar ? 'الحمامات' : 'Bathrooms' },
              { key: 'price', label: ar ? 'السعر (جنيه)' : 'Price (EGP)' },
              { key: 'status', label: ar ? 'الحالة' : 'Status' },
              { key: 'isHidden', label: ar ? 'مستخبية' : 'Hidden' },
              { key: 'isSample', label: ar ? 'استرشادي' : 'Sample' },
              { key: 'floorPlan', label: ar ? 'المخطط' : 'Floor plan' },
              { key: 'createdAt', label: ar ? 'اتعملت' : 'Created' },
            ]}
          />
        </div>
      </div>

      {/* Bulk Actions Panel */}
      {showBulkPanel && selectedIds.size > 0 && (
        <Card className="border-estate-gold/20 bg-estate-gold/5 backdrop-blur-sm">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm font-medium text-estate-gold">{ar ? 'إجراءات جماعية:' : 'Bulk Actions:'}</span>
            <select
              value={bulkStatusValue}
              onChange={(e) => setBulkStatusValue(e.target.value)}
              className="rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5 text-sm text-foreground focus:border-estate-gold/50 focus:outline-none"
            >
              {['AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN', 'SUSPENDED'].map((s) => (
                <option key={s} value={s} className="bg-[#0a1220]">{statusLabel(s, ar)}</option>
              ))}
            </select>
            <Button size="sm" onClick={bulkUpdateStatus} className="gold-shimmer bg-estate-gold text-black hover:bg-estate-gold/90">
              {ar ? 'طبّق الحالة' : 'Apply Status'}
            </Button>
            <Button size="sm" onClick={bulkHide} variant="outline" className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10">
              <EyeOff className="mr-1 h-3.5 w-3.5" />
              {ar ? 'اخفي الكل' : 'Hide All'}
            </Button>
            <Button size="sm" onClick={bulkDelete} variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {ar ? 'امسح الكل' : 'Delete All'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchUnits} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && units.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش وحدات' : 'No units found'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search criteria') : (ar ? 'مفيش وحدات مطابقة للفلاتر الحالية' : 'No units match the current filters')}
          </p>
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
                      <button onClick={toggleSelectAll} className="flex items-center">
                        {selectedIds.size === units.length && units.length > 0 ? (
                          <CheckSquare className="h-4 w-4 text-estate-gold" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الوحدة' : 'Unit'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'المشروع' : 'Project'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'النوع' : 'Type'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'المساحة' : 'Area'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'أوض/حمامات' : 'Beds/Baths'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'السعر' : 'Price'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'التاريخ' : 'Date'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {units.map((unit) => (
                    <tr key={unit.id} className={cn('transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', selectedIds.has(unit.id) && 'bg-card dark:bg-[#0A0A0A]')}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(unit.id)}>
                          {selectedIds.has(unit.id) ? (
                            <CheckSquare className="h-4 w-4 text-estate-gold" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-500" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {editingId === unit.id ? (
                          <div className="space-y-1.5">
                            <Input
                              value={editForm.name || unit.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="h-8 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={editForm.floorPlan ?? unit.floorPlan ?? ''}
                                onChange={(e) => setEditForm({ ...editForm, floorPlan: e.target.value })}
                                placeholder={ar ? 'لينك المخطط' : 'Floor plan URL'}
                                className="h-8 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-xs text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <UploadButton
                                onUploaded={(url) => setEditForm((f) => ({ ...f, floorPlan: url }))}
                              >
                                {ar ? 'ارفع' : 'Upload'}
                              </UploadButton>
                            </div>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400">
                              <input
                                type="checkbox"
                                checked={editForm.isSample ?? unit.isSample ?? false}
                                onChange={(e) => setEditForm({ ...editForm, isSample: e.target.checked })}
                                className="h-3.5 w-3.5 accent-[#D4A843]"
                              />
                              {ar ? 'نموذج استرشادي' : 'Sample model'}
                            </label>
                          </div>
                        ) : (
                          <div>
                            <p className="font-medium text-foreground">{unit.name}</p>
                            {unit.isSample && (
                              <span className="mt-1 inline-flex items-center rounded-full border border-[#D4A843]/40 bg-[#D4A843]/10 px-2 py-0.5 text-[11px] font-medium text-[#D4A843]">
                                {ar ? 'استرشادي' : 'Sample'}
                              </span>
                            )}
                            <p className="text-xs text-gray-500 lg:hidden">{ar ? UTYPE_AR[unit.unitType] || unit.unitType : unit.unitType}</p>
                            {unit.floorPlan && (
                              <a
                                href={unit.floorPlan}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-flex items-center gap-1 text-xs text-estate-gold hover:underline"
                              >
                                <Ruler className="h-3 w-3" />
                                {ar ? 'المخطط' : 'Floor plan'}
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-gray-400">{unit.project?.name || '—'}</span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-gray-400">{ar ? UTYPE_AR[unit.unitType] || unit.unitType : unit.unitType}</span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-gray-300">{unit.area} {ar ? 'م²' : 'sqm'}</span>
                      </td>
                      <td className="hidden px-4 py-3 xl:table-cell">
                        <div className="flex items-center gap-3 text-gray-400">
                          <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{unit.bedrooms}</span>
                          <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{unit.bathrooms}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {editingId === unit.id ? (
                          <Input
                            type="number"
                            value={editForm.price || unit.price}
                            onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                            className="h-8 w-32 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="font-medium text-estate-gold">{formatEGP(unit.price)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative group">
                          <span
                            className={cn(
                              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                              STATUS_COLORS[unit.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[unit.status])} />
                            {statusLabel(unit.status, ar)}
                          </span>
                          <div className="absolute left-0 top-full z-20 mt-1 hidden w-40 rounded-2xl border border-border dark:border-[#262626] bg-[#1a2535] p-1 shadow-xl group-hover:block">
                            {['AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN', 'SUSPENDED'].map((s) => (
                              <button
                                key={s}
                                onClick={() => updateStatus(unit.id, s)}
                                disabled={unit.status === s}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition-colors',
                                  unit.status === s ? 'bg-card dark:bg-[#0A0A0A] text-estate-gold' : 'text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]',
                                  unit.status === s && 'opacity-50 cursor-not-allowed'
                                )}
                              >
                                <span className={cn('h-2 w-2 rounded-full', STATUS_DOTS[s])} />
                                {statusLabel(s, ar)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 xl:table-cell">
                        <span className="text-gray-400">
                          {new Date(unit.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {editingId === unit.id ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => updateUnit(unit.id)} disabled={submitting} className="text-green-400 hover:text-green-300">
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditForm({}) }} className="text-gray-400 hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setEditingId(unit.id); setEditForm({ name: unit.name, price: String(unit.price) }) }}
                                className="text-gray-400 hover:text-foreground"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleSample(unit.id)}
                                title={ar ? 'نموذج استرشادي' : 'Toggle sample model'}
                                className={unit.isSample ? 'text-[#D4A843] hover:text-[#D4A843]' : 'text-gray-400 hover:text-[#D4A843]'}
                              >
                                <Building2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleHide(unit.id)}
                                disabled={togglingId === unit.id}
                                className="text-gray-400 hover:text-yellow-400"
                              >
                                {unit.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { if (confirm(ar ? `امسح "${unit.name}"؟` : `Delete "${unit.name}"?`)) deleteUnit(unit.id) }}
                                disabled={deletingId === unit.id}
                                className="text-gray-400 hover:text-red-400"
                              >
                                {deletingId === unit.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
