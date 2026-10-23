'use client'
import { useState, useEffect, useCallback } from 'react'
import NextImage from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEGP, cn } from '@/lib/utils'
import ImageInput, { UploadButton } from '../../components/image-input'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import {
  ArrowLeft, Save, X, Edit3, Eye, EyeOff, Check, XCircle, Send,
  Loader2, MapPin, Building2, Users, Heart, MessageSquare, DollarSign,
  Image, FileText, Settings, Search, ChevronDown, AlertTriangle,
  Calendar, Globe, Upload, Plus, Trash2, RefreshCw, Archive, Shield,
  Star, TrendingUp, Map, Tag, Camera, Video, Layout, Activity, Clock, Layers, GitBranch
} from 'lucide-react'
import { Reveal } from '@/components/design'

function safeJsonArray(val: string | null | undefined): string[] {
  if (!val) return []
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : [] } catch { return [] }
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  APPROVED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
  PUBLISHED: 'bg-green-500/20 text-green-400 border-green-500/30',
  HIDDEN: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ARCHIVED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const CONSTRUCTION_COLORS: Record<string, string> = {
  PLANNING: 'bg-purple-500/20 text-purple-400',
  UNDER_CONSTRUCTION: 'bg-blue-500/20 text-blue-400',
  NEAR_COMPLETION: 'bg-cyan-500/20 text-cyan-400',
  READY_TO_MOVE: 'bg-green-500/20 text-green-400',
  DELIVERED: 'bg-emerald-500/20 text-emerald-400',
}

const CONSTRUCTION_AR: Record<string, string> = {
  PLANNING: 'تخطيط',
  UNDER_CONSTRUCTION: 'تحت الإنشاء',
  NEAR_COMPLETION: 'قرب التسليم',
  READY_TO_MOVE: 'جاهز للسكن',
  DELIVERED: 'اتسلّم',
  COMING_SOON: 'جاي قريب',
  SOLD_OUT: 'اتباع كله',
}

// Units section (mirrors the field list + validation idiom of the CEO units
// page at src/app/ceo/units/page.tsx — writes reuse /api/ceo/units).
const UNIT_TYPES = ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'DUPLEX', 'PENTHOUSE', 'STUDIO']
const LISTING_TYPES = ['SALE', 'RENT']
const UNIT_STATUSES = ['AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN', 'SUSPENDED']

const UNIT_TYPE_AR: Record<string, string> = {
  APARTMENT: 'شقة', VILLA: 'فيلا', TOWNHOUSE: 'تاونهاوس',
  DUPLEX: 'دوبلكس', PENTHOUSE: 'بنتهاوس', STUDIO: 'استوديو',
}

const LISTING_TYPE_AR: Record<string, string> = {
  SALE: 'بيع', RENT: 'إيجار',
}

const UNIT_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-500/20 text-green-400 border-green-500/30',
  RESERVED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  SOLD: 'bg-[#D4A843]/20 text-[#D4A843] border-[#D4A843]/30',
  HIDDEN: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  SUSPENDED: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const EMPTY_UNIT_FORM = {
  name: '',
  unitType: 'APARTMENT',
  listingType: 'SALE',
  area: '',
  bedrooms: '',
  bathrooms: '',
  price: '',
  floorPlan: '',
  status: 'AVAILABLE',
}

type Tab = 'overview' | 'units' | 'phases' | 'hierarchy' | 'pricing' | 'content' | 'media' | 'location' | 'seo' | 'settings' | 'audit'
type ProjectData = any

function Badge({ label, colors }: { label: string; colors: string }) {
  return <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium border', colors)}>{label}</span>
}

function StatCard({ icon: Icon, label, value, color = 'text-foreground' }: { icon: any; label: string; value: any; color?: string }) {
  return (
    <div className="bg-card dark:bg-[#0A0A0A] rounded-2xl border border-border dark:border-[#262626] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-[#D4A843]" />
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <div className={cn('text-xl font-bold', color)}>{value}</div>
    </div>
  )
}

function EditableField({
  label, value, onChange, type = 'text', disabled, multiline, rows = 3, prefix
}: {
  label: string; value: any; onChange: (v: any) => void; type?: string; disabled?: boolean;
  multiline?: boolean; rows?: number; prefix?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-muted-foreground text-sm">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{prefix}</span>}
        {multiline ? (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={rows}
            className={cn(
              'w-full bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] rounded-2xl px-3 py-2 text-foreground text-sm',
              'focus:outline-none focus:border-[#D4A843] resize-none',
              disabled && 'opacity-60 cursor-not-allowed',
              prefix && 'pl-8'
            )}
          />
        ) : (
          <Input
            type={type}
            value={value || ''}
            onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
            disabled={disabled}
            className={cn(
              'bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground',
              disabled && 'opacity-60 cursor-not-allowed',
              prefix && 'pl-8'
            )}
          />
        )}
      </div>
    </div>
  )
}

const SECTION_FIELDS: Record<string, string[]> = {
  pricing: ['startPrice', 'endPrice', 'pricePerSqm', 'downPaymentMin', 'installmentYears', 'compoundArea'],
  content: ['tagline', 'taglineArabic', 'description', 'descriptionArabic'],
  media: ['coverImage', 'videoUrl', 'virtualTourUrl', 'gallery', 'masterPlanImages', 'panoramaImages'],
  location: ['governorateId', 'cityId', 'districtId', 'address', 'latitude', 'longitude', 'googleMapsUrl'],
  seo: ['metaTitle', 'metaDescription'],
  settings: ['isFeatured', 'isVerified', 'isActive', 'featuredRank', 'completionPercent', 'totalUnits', 'totalArea', 'deliveryTerms', 'deliveryDate', 'developerId'],
}

function getFieldsForSection(section: string): string[] {
  return SECTION_FIELDS[section] || []
}

export default function CEOProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [project, setProject] = useState<ProjectData>(null)
  const [editData, setEditData] = useState<Record<string, any>>({})
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [newMpUrl, setNewMpUrl] = useState('')
  const [newPanoUrl, setNewPanoUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  // Phase-launch spotlight state (phases tab): busy phase id, error surfaced
  // on the row, and per-phase launch-date drafts before they are saved.
  const [launchBusy, setLaunchBusy] = useState<string | null>(null)
  const [launchBusyPhaseId, setLaunchBusyPhaseId] = useState<string | null>(null)
  const [launchErr, setLaunchErr] = useState<string | null>(null)
  const [launchDateDraft, setLaunchDateDraft] = useState<Record<string, string>>({})
  const [hierarchy, setHierarchy] = useState<any>(null)
  const [hierarchyLoading, setHierarchyLoading] = useState(false)
  const [hierarchyBusy, setHierarchyBusy] = useState(false)
  const [hierarchyError, setHierarchyError] = useState<string | null>(null)
  const [selectedChildId, setSelectedChildId] = useState('')
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [unitModal, setUnitModal] = useState<null | { id?: string }>(null)
  const [unitForm, setUnitForm] = useState({ ...EMPTY_UNIT_FORM })
  const [unitError, setUnitError] = useState<string | null>(null)
  const [unitSaving, setUnitSaving] = useState(false)

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/ceo/projects/${id}`)
      const data = await res.json()
      setProject(data.project)
      setEditData(data.project)
    } catch { } finally { setLoading(false) }
  }, [id])

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true)
    try {
      const res = await fetch(`/api/ceo/activity?entity=Project&entityId=${id}`)
      const data = await res.json()
      setAuditLogs(data.logs || data.activities || [])
    } catch { } finally { setAuditLoading(false) }
  }, [id])

  const fetchHierarchy = useCallback(async () => {
    setHierarchyLoading(true)
    setHierarchyError(null)
    try {
      const res = await fetch(`/api/ceo/projects/${id}/hierarchy`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || (ar ? 'معرفناش نحمّل هيكل المشروع.' : 'Could not load project structure.'))
      setHierarchy(data)
    } catch (error: any) {
      setHierarchyError(error?.message || (ar ? 'معرفناش نحمّل هيكل المشروع.' : 'Could not load project structure.'))
    } finally {
      setHierarchyLoading(false)
    }
  }, [id, ar])

  useEffect(() => { fetchProject() }, [fetchProject])
  useEffect(() => { if (activeTab === 'audit') fetchAuditLogs() }, [activeTab, fetchAuditLogs])
  useEffect(() => { if (activeTab === 'hierarchy') fetchHierarchy() }, [activeTab, fetchHierarchy])

  const handleSave = async (section: string) => {
    setSaving(true)
    try {
      const fields = getFieldsForSection(section)
      const payload: any = {}
      fields.forEach((f: string) => { payload[f] = editData[f] })
      payload.reason = `Updated ${section} section`
      await fetch(`/api/ceo/projects/${id}`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      await fetchProject()
      setEditingSection(null)
    } catch { } finally { setSaving(false) }
  }

  const togglePhaseLaunch = async (phase: any) => {
    setLaunchBusy(phase.id)
    setLaunchBusyPhaseId(phase.id)
    setLaunchErr(null)
    try {
      const launchDate = (launchDateDraft[phase.id] ?? (phase.launchDate ? String(phase.launchDate).slice(0, 10) : '')) || null
      const res = await fetch(`/api/ceo/projects/${id}/phases`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseId: phase.id, isLaunch: !phase.isLaunch, launchDate }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setLaunchErr((data as any)?.error || (ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.'))
        return
      }
      await fetchProject()
    } catch {
      setLaunchErr(ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.')
    } finally {
      setLaunchBusy(null)
    }
  }

  const saveHierarchy = async (payload: Record<string, unknown>) => {
    setHierarchyBusy(true)
    setHierarchyError(null)
    try {
      const res = await fetch(`/api/ceo/projects/${id}/hierarchy`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setHierarchyError(data?.error || (ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.'))
        return false
      }
      await Promise.all([fetchHierarchy(), fetchProject()])
      return true
    } catch {
      setHierarchyError(ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.')
      return false
    } finally {
      setHierarchyBusy(false)
    }
  }

  const removeChildProject = async (child: any) => {
    const message = ar
      ? `هتفصل «${child.nameArabic || child.name}» من المشروع الأم، وهيظهر تاني كمشروع مستقل لو حالته تسمح. متأكد؟`
      : `Remove “${child.name}” from this parent? It may become a standalone listing again if published. Continue?`
    if (typeof window !== 'undefined' && !window.confirm(message)) return
    await saveHierarchy({ action: 'remove', childProjectId: child.id })
  }

  const handleStatusAction = async (action: string, reason?: string) => {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/ceo/projects/${id}/status`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: String(action).toLowerCase(), reason }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setActionError((data as any)?.error || (ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.'))
        return
      }
      // Publishing an archived project: reactivate + label honestly. When no
      // verifiable price exists the row stays invisible to the public — the
      // CEO must hear that, not a silent failure.
      if (action === 'publish' && (data as any)?.publiclyVisible === false) {
        setActionError(ar
          ? 'اتفعّلت النشر رسميًا، بس المشروع مش هيظهر للعامة لحد ما يكون له سعر مسجل (سعر بداية أو وحدة بسعر أو مشروع فرعي بسعر). سجّل السعر وهيظهر فورًا.'
          : 'Publishing is recorded, but the project stays hidden until it has a verifiable price (start price, a priced unit, or a priced child). Add a price and it goes live instantly.')
      }
      await fetchProject()
      setRejectModal(false)
      setRejectReason('')
    } catch {
      setActionError(ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.')
    } finally { setActionLoading(false) }
  }

  const handleDelete = async () => {
    if (!confirm(ar ? 'متأكد عايز تمسح المشروع ده؟' : 'Are you sure you want to delete this project?')) return
    try {
      await fetch(`/api/ceo/projects/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      router.push('/ceo/projects')
    } catch { }
  }

  const updateField = (field: string, value: any) => setEditData((prev) => ({ ...prev, [field]: value }))

  const projectUnits: any[] = Array.isArray(project?.units) ? project.units : []

  const openAddUnit = () => {
    setUnitForm({ ...EMPTY_UNIT_FORM })
    setUnitError(null)
    setUnitModal({})
  }

  const openEditUnit = (u: any) => {
    setUnitForm({
      name: u.name || '',
      unitType: u.unitType || 'APARTMENT',
      listingType: u.listingType || 'SALE',
      area: u.area != null ? String(u.area) : '',
      bedrooms: u.bedrooms != null ? String(u.bedrooms) : '',
      bathrooms: u.bathrooms != null ? String(u.bathrooms) : '',
      price: u.price != null ? String(u.price) : '',
      floorPlan: u.floorPlan || '',
      status: u.status || 'AVAILABLE',
    })
    setUnitError(null)
    setUnitModal({ id: u.id })
  }

  const validateUnitForm = (): string | null => {
    if (!unitForm.name.trim()) return ar ? 'اسم الوحدة مطلوب.' : 'Unit name is required.'
    const area = Number(unitForm.area)
    if (!unitForm.area.trim() || isNaN(area) || area <= 0) return ar ? 'المساحة لازم تكون رقم أكبر من صفر.' : 'Area must be a number greater than zero.'
    const price = Number(unitForm.price)
    if (!unitForm.price.trim() || isNaN(price) || price < 0) return ar ? 'السعر لازم يكون رقم (صفر أو أكتر).' : 'Price must be a number (zero or more).'
    for (const key of ['bedrooms', 'bathrooms'] as const) {
      const raw = unitForm[key].trim()
      if (raw && (isNaN(Number(raw)) || Number(raw) < 0)) {
        return ar
          ? (key === 'bedrooms' ? 'عدد الأوض لازم يكون صفر أو أكتر.' : 'عدد الحمامات لازم يكون صفر أو أكتر.')
          : (key === 'bedrooms' ? 'Bedrooms must be zero or more.' : 'Bathrooms must be zero or more.')
      }
    }
    return null
  }

  const handleUnitSave = async () => {
    const validationError = validateUnitForm()
    if (validationError) { setUnitError(validationError); return }
    setUnitSaving(true)
    setUnitError(null)
    try {
      const isEdit = !!unitModal?.id
      const payload: Record<string, any> = {
        name: unitForm.name.trim(),
        unitType: unitForm.unitType,
        listingType: unitForm.listingType,
        area: Number(unitForm.area),
        price: Number(unitForm.price),
        ...(unitForm.bedrooms.trim() ? { bedrooms: Number(unitForm.bedrooms) } : {}),
        ...(unitForm.bathrooms.trim() ? { bathrooms: Number(unitForm.bathrooms) } : {}),
        ...(unitForm.floorPlan.trim() ? { floorPlan: unitForm.floorPlan.trim() } : {}),
        ...(isEdit ? { id: unitModal!.id, status: unitForm.status } : { projectId: id }),
      }
      const res = await fetch('/api/ceo/units', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setUnitError((data as any)?.error || (ar ? 'معرفناش نحفظ الوحدة — حاول تاني.' : 'Failed to save unit — please try again.'))
        return
      }
      setUnitModal(null)
      await fetchProject()
    } catch {
      setUnitError(ar ? 'معرفناش نحفظ الوحدة — حاول تاني.' : 'Failed to save unit — please try again.')
    } finally { setUnitSaving(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-card dark:bg-black">
      <Loader2 className="w-8 h-8 text-[#D4A843] animate-spin" />
    </div>
  )

  if (!project) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-card dark:bg-black">
      <p className="text-muted-foreground">{ar ? 'المشروع مش موجود' : 'Project not found'}</p>
      <Button onClick={() => router.push('/ceo/projects')} className="bg-[#D4A843] text-black">{ar ? 'ارجع للمشاريع' : 'Back to Projects'}</Button>
    </div>
  )

  const approvalStatus = project.approvalStatus || 'DRAFT'
  const constructionStatus = project.status || 'PLANNING'
  const gallery = editingSection === 'media' && editData.gallery !== undefined
    ? safeJsonArray(editData.gallery)
    : safeJsonArray(project.gallery)
  const masterPlans: { id?: string; url: string; caption?: string | null }[] =
    (editingSection === 'media' && editData.masterPlanImages !== undefined
      ? editData.masterPlanImages
      : project.masterPlanImages) || []
  // 360° panoramas are kept as a plain URL array while editing (the PATCH
  // route stringifies them like `gallery`); otherwise parsed from the project.
  const panos: string[] = Array.isArray(editData.panoramaImages)
    ? editData.panoramaImages
    : safeJsonArray(project.panoramaImages)
  const propertyTypes = safeJsonArray(editData.propertyTypes)
  const listingTypes = safeJsonArray(editData.listingTypes)
  const keywords = safeJsonArray(editData.keywords)
  const availableUnits = project.units?.filter((u: any) => u.status === 'AVAILABLE' || u.status === 'Vacant').length || 0

  const tabs: { id: Tab; label: string; labelAr: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', labelAr: 'نظرة عامة', icon: Layout },
    { id: 'units', label: 'Units', labelAr: 'الوحدات', icon: Building2 },
    { id: 'phases', label: 'Phases', labelAr: 'المراحل', icon: Layers },
    { id: 'hierarchy', label: 'Project Structure', labelAr: 'هيكل المشروع', icon: GitBranch },
    { id: 'pricing', label: 'Pricing', labelAr: 'الأسعار', icon: DollarSign },
    { id: 'content', label: 'Content', labelAr: 'المحتوى', icon: FileText },
    { id: 'media', label: 'Media', labelAr: 'الميديا', icon: Camera },
    { id: 'location', label: 'Location', labelAr: 'المكان', icon: Map },
    { id: 'seo', label: 'SEO', labelAr: 'SEO', icon: Search },
    { id: 'settings', label: 'Settings', labelAr: 'الإعدادات', icon: Settings },
    { id: 'audit', label: 'Audit Log', labelAr: 'سجل التدقيق', icon: Activity },
  ]

  const getStatusActions = () => {
    const actions: { label: string; labelAr: string; action: string; variant: string; icon: any }[] = []
    switch (approvalStatus) {
      case 'DRAFT':
        actions.push({ label: 'Submit for Review', labelAr: 'ابعت للمراجعة', action: 'submit', variant: 'bg-[#D4A843] text-black hover:bg-[#D4A843]/90', icon: Send })
        break
      case 'PENDING':
        actions.push({ label: 'Approve', labelAr: 'وافق', action: 'approve', variant: 'bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90', icon: Check })
        actions.push({ label: 'Reject', labelAr: 'ارفض', action: 'reject', variant: 'bg-red-600 text-white hover:bg-red-700', icon: XCircle })
        break
      case 'APPROVED':
        actions.push({ label: 'Publish', labelAr: 'انشر', action: 'publish', variant: 'bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90', icon: Eye })
        actions.push({ label: 'Reject', labelAr: 'ارفض', action: 'reject', variant: 'bg-red-600 text-white hover:bg-red-700', icon: XCircle })
        break
      case 'REJECTED':
        actions.push({ label: 'Resubmit', labelAr: 'ابعت تاني', action: 'submit', variant: 'bg-[#D4A843] text-black hover:bg-[#D4A843]/90', icon: Send })
        break
      case 'PUBLISHED':
        actions.push({ label: 'Unpublish', labelAr: 'اشيل النشر', action: 'unpublish', variant: 'bg-orange-600 text-white hover:bg-orange-700', icon: EyeOff })
        break
      case 'HIDDEN':
        actions.push({ label: 'Publish', labelAr: 'انشر', action: 'publish', variant: 'bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90', icon: Eye })
        break
      case 'ARCHIVED':
        // Two paths out of the archive: back to draft, or straight to
        // published (single-click — the server flips isActive too; the
        // response tells the CEO if a recorded price is still missing).
        actions.push({ label: 'Publish now', labelAr: 'انشر فورًا', action: 'publish', variant: 'bg-green-600 text-white hover:bg-green-500', icon: Eye })
        actions.push({ label: 'Restore', labelAr: 'رجّع كمسودة', action: 'restore', variant: 'bg-[#D4A843] text-black hover:bg-[#D4A843]/90', icon: RefreshCw })
        break
    }
    return actions
  }

  return (
    <div className="min-h-screen bg-card dark:bg-black">
      {/* Header */}
      <div className="border-b border-border dark:border-[#262626] bg-card dark:bg-black px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/ceo/projects')} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />{ar ? 'رجوع' : 'Back'}
            </Button>
            <Reveal>
              <p className="section-kicker">{ar ? 'لوحة المدير · المشروع' : 'CEO Console · Project'}</p>
              <h1 className="font-display display-3 text-foreground">{project.name}</h1>
              {project.nameArabic && <p className="text-muted-foreground text-sm">{project.nameArabic}</p>}
              <hr className="gold-hairline mt-4" />
            </Reveal>
          </div>
          <div className="flex items-center gap-3">
            <Badge label={statusLabel(approvalStatus, ar)} colors={STATUS_COLORS[approvalStatus] || STATUS_COLORS.DRAFT} />
            <Badge label={ar ? CONSTRUCTION_AR[constructionStatus] || constructionStatus?.replace(/_/g, ' ') : constructionStatus?.replace(/_/g, ' ')} colors={CONSTRUCTION_COLORS[constructionStatus] || ''} />
          </div>
        </div>
      </div>

      {/* Status Action Bar */}
      <div className="border-b border-border dark:border-[#262626] bg-card dark:bg-black px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          {getStatusActions().map((btn) => (
            <Button
              key={btn.action}
              onClick={() => btn.action === 'reject' ? setRejectModal(true) : handleStatusAction(btn.action)}
              disabled={actionLoading}
              className={cn(btn.variant, 'flex items-center gap-2 text-sm')}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <btn.icon className="w-4 h-4" />}
              {ar ? btn.labelAr : btn.label}
            </Button>
          ))}
          <div className="ml-auto">
            <Button onClick={handleDelete} variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4 mr-1" />{ar ? 'احذف' : 'Delete'}
            </Button>
          </div>
        </div>
        {actionError && (
          <div className="max-w-7xl mx-auto mt-2 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="ml-auto text-red-300/70 hover:text-red-200" aria-label={ar ? 'اقفل' : 'Dismiss'}><X className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setEditingSection(null) }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-[#D4A843]/15 text-[#D4A843] border border-[#D4A843]/30'
                  : 'text-muted-foreground hover:text-muted-foreground hover:bg-card dark:hover:bg-[#0A0A0A]'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {ar ? tab.labelAr : tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatCard icon={Eye} label={ar ? 'المشاهدات' : 'Views'} value={project.viewCount || 0} />
              <StatCard icon={Heart} label={ar ? 'المفضلة' : 'Favorites'} value={project.favoriteCount || 0} />
              <StatCard icon={MessageSquare} label={ar ? 'الاستفسارات' : 'Inquiries'} value={project.inquiryCount || 0} />
              <StatCard icon={Building2} label={ar ? 'كل الوحدات' : 'Total Units'} value={project.totalUnits || 0} />
              <StatCard icon={Check} label={ar ? 'المتاح' : 'Available'} value={availableUnits} color="text-green-400" />
              <StatCard icon={TrendingUp} label={ar ? 'نسبة الإنجاز' : 'Completion'} value={`${project.completionPercent || 0}%`} color="text-[#D4A843]" />
            </div>
            {project.tagline && (
              <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
                <CardContent className="p-4">
                  <p className="text-muted-foreground text-sm mb-1">{ar ? 'السطر المميز' : 'Tagline'}</p>
                  <p className="text-foreground">{project.tagline}</p>
                  {project.taglineArabic && <p className="text-muted-foreground mt-1" dir="rtl">{project.taglineArabic}</p>}
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
                <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">{ar ? 'المطوّر' : 'Developer'}</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  <p className="text-foreground font-medium">{project.developer?.companyName || (ar ? 'غير متاح' : 'N/A')}</p>
                  {project.developer?.user && <p className="text-muted-foreground text-sm mt-1">{project.developer.user.name || project.developer.user.email}</p>}
                </CardContent>
              </Card>
              <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
                <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">{ar ? 'المكان' : 'Location'}</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  <p className="text-foreground">{[project.address, project.district?.name, project.city?.name, project.governorate?.name].filter(Boolean).join(ar ? '، ' : ', ') || (ar ? 'غير متاح' : 'N/A')}</p>
                </CardContent>
              </Card>
              <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
                <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">{ar ? 'التواريخ' : 'Dates'}</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-1">
                  <p className="text-muted-foreground text-sm">{ar ? 'اتعمل:' : 'Created:'} <span className="text-foreground">{project.createdAt ? new Date(project.createdAt).toLocaleDateString(ar ? 'ar-EG' : undefined) : (ar ? 'غير متاح' : 'N/A')}</span></p>
                  <p className="text-muted-foreground text-sm">{ar ? 'اتحدّث:' : 'Updated:'} <span className="text-foreground">{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(ar ? 'ar-EG' : undefined) : (ar ? 'غير متاح' : 'N/A')}</span></p>
                  {project.publishedAt && <p className="text-muted-foreground text-sm">{ar ? 'اتنشر:' : 'Published:'} <span className="text-foreground">{new Date(project.publishedAt).toLocaleDateString(ar ? 'ar-EG' : undefined)}</span></p>}
                </CardContent>
              </Card>
              <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
                <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">{ar ? 'الأسعار والوحدات' : 'Pricing & Units'}</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-1">
                  <p className="text-muted-foreground text-sm">{ar ? 'المدى:' : 'Range:'} <span className="text-foreground">{formatEGP(project.startPrice)} - {formatEGP(project.endPrice)}</span></p>
                  <p className="text-muted-foreground text-sm">{ar ? 'للمتر:' : 'Per Sqm:'} <span className="text-foreground">{formatEGP(project.pricePerSqm)}</span></p>
                  <p className="text-muted-foreground text-sm">{ar ? 'المقدم:' : 'Down Payment:'} <span className="text-foreground">{project.downPaymentMin}%</span></p>
                  <p className="text-muted-foreground text-sm">{ar ? 'التقسيط:' : 'Installments:'} <span className="text-foreground">{project.installmentYears} {ar ? 'سنة' : 'years'}</span></p>
                </CardContent>
              </Card>
            </div>
            {project.amenities?.length > 0 && (
              <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
                <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">{ar ? `المرافق (${project.amenities.length})` : `Amenities (${project.amenities.length})`}</CardTitle></CardHeader>
                <CardContent className="pt-0 flex flex-wrap gap-2">
                  {project.amenities.map((a: any) => (
                    <span key={a.id || a.amenity?.id} className="px-3 py-1 bg-[#D4A843]/10 text-[#D4A843] rounded-full text-xs border border-[#D4A843]/20">
                      {a.amenity?.name || a.name}
                    </span>
                  ))}
                </CardContent>
              </Card>
            )}
            {project.paymentPlans?.length > 0 && (
              <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
                <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">{ar ? `خطط الدفع (${project.paymentPlans.length})` : `Payment Plans (${project.paymentPlans.length})`}</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {project.paymentPlans.map((plan: any) => (
                    <div key={plan.id} className="p-3 bg-card dark:bg-[#0A0A0A] rounded-2xl border border-border dark:border-[#262626]">
                      <p className="text-foreground font-medium text-sm">{plan.name}</p>
                      {plan.milestones?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {plan.milestones.map((m: any, i: number) => (
                            <p key={i} className="text-muted-foreground text-xs">{m.label || (ar ? `مرحلة ${i + 1}` : `Milestone ${i + 1}`)}: {m.percentage || m.amount}%</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {project.rejectionReason && (
              <Card className="bg-red-500/10 border-red-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-400 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-medium">{ar ? 'سبب الرفض' : 'Rejection Reason'}</span>
                  </div>
                  <p className="text-red-300/80 text-sm">{project.rejectionReason}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Units Tab */}
        {activeTab === 'units' && (
          <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-foreground text-lg">
                {ar ? `الوحدات (${projectUnits.length})` : `Units (${projectUnits.length})`}
              </CardTitle>
              <Button size="sm" onClick={openAddUnit} className="gold-shimmer bg-[#D4A843] text-black hover:bg-[#D4A843]/90">
                <Plus className="w-4 h-4 mr-1" />{ar ? 'أضف وحدة' : 'Add Unit'}
              </Button>
            </CardHeader>
            <CardContent>
              {projectUnits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Building2 className="w-10 h-10 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">{ar ? 'لسه مفيش وحدات في المشروع ده.' : 'No units in this project yet.'}</p>
                  <Button size="sm" onClick={openAddUnit} className="bg-[#D4A843] text-black hover:bg-[#D4A843]/90">
                    <Plus className="w-4 h-4 mr-1" />{ar ? 'أضف أول وحدة' : 'Add the first unit'}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border dark:border-[#262626]">
                        <th className="px-3 py-2 font-medium text-muted-foreground">{ar ? 'الوحدة' : 'Unit'}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">{ar ? 'النوع' : 'Type'}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">{ar ? 'السعر' : 'Price'}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">{ar ? 'المساحة' : 'Area'}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">{ar ? 'الحالة' : 'Status'}</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">{ar ? 'تعديل' : 'Edit'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border dark:divide-[#262626]">
                      {projectUnits.map((u: any) => (
                        <tr key={u.id} className="hover:bg-card dark:hover:bg-[#0A0A0A] transition-colors">
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground">{u.name}</p>
                            {(u.bedrooms != null || u.bathrooms != null) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {u.bedrooms != null ? `${u.bedrooms} ${ar ? 'أوض' : 'bd'}` : ''}
                                {u.bedrooms != null && u.bathrooms != null ? ' · ' : ''}
                                {u.bathrooms != null ? `${u.bathrooms} ${ar ? 'حمّام' : 'ba'}` : ''}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{ar ? UNIT_TYPE_AR[u.unitType] || u.unitType : u.unitType}</td>
                          <td className="px-3 py-2.5 font-medium text-[#D4A843]">{formatEGP(u.price)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{u.area} {ar ? 'م²' : 'sqm'}</td>
                          <td className="px-3 py-2.5">
                            <Badge label={statusLabel(u.status, ar)} colors={UNIT_STATUS_COLORS[u.status] || UNIT_STATUS_COLORS.HIDDEN} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Button size="sm" variant="ghost" onClick={() => openEditUnit(u)} className="text-[#D4A843] hover:bg-[#D4A843]/10">
                              <Edit3 className="w-4 h-4 mr-1" />{ar ? 'تعديل' : 'Edit'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pricing Tab */}
        {activeTab === 'phases' && (
          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'مراحل المشروع' : 'Project Phases'}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {ar
                  ? 'الترحلة دي كلها جوه المشروع نفسه — مفيش مرحلة بتظهر كمشروع مستقل قدام الناس. زرار 🚀 اللونش بيحوّل المرحلة لسطر مميز جوه صفحة المشروع، تعمله براحتك وقت ما تحب.'
                  : 'All phases live INSIDE this project — none of them ever shows as a standalone project. The 🚀 launch toggle spotlights a phase within this project\'s page, whenever you decide.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {(project.phases?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {ar ? 'مفيش مراحل مسجلة للمشروع ده.' : 'No phases recorded for this project.'}
                </p>
              ) : (
                project.phases.map((ph: any) => {
                  const unitCount = project.units?.filter((u: any) => u.phaseId === ph.id).length || 0
                  const busy = launchBusy === ph.id
                  const draft = launchDateDraft[ph.id] ?? (ph.launchDate ? String(ph.launchDate).slice(0, 10) : '')
                  return (
                    <div key={ph.id} className={cn('rounded-xl border p-4', ph.isLaunch ? 'border-[#D4A843]/50 bg-[#D4A843]/5' : '')}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold break-words">{ph.nameArabic || ph.name}</span>
                            {ph.nameArabic && ph.name !== ph.nameArabic && <span className="text-xs text-muted-foreground">{ph.name}</span>}
                            <span className={cn('rounded-full px-2 py-0.5 text-xs', CONSTRUCTION_COLORS[ph.status] || 'bg-gray-500/20 text-gray-400')}>
                              {CONSTRUCTION_AR[ph.status] || ph.status}
                            </span>
                            {ph.isLaunch && <span className="rounded-full bg-[#D4A843]/20 px-2 py-0.5 text-xs text-[#D4A843]">🚀 {ar ? 'لونش' : 'Launch'}</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>{ar ? `الوحدات: ${unitCount}` : `Units: ${unitCount}`}</span>
                            {ph.startPrice != null && <span>{ar ? 'يبدأ من' : 'From'} {formatEGP(ph.startPrice)}</span>}
                            {ph.endPrice != null && <span>{ar ? 'حتى' : 'To'} {formatEGP(ph.endPrice)}</span>}
                            {ph.deliveryDate && (
                              <span>{ar ? 'التسليم' : 'Delivery'}: {new Date(ph.deliveryDate).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'long' })}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={draft}
                            onChange={(e) => setLaunchDateDraft((m) => ({ ...m, [ph.id]: e.target.value }))}
                            disabled={busy}
                            className="rounded-lg border border-gray-300 bg-transparent px-2 py-1.5 text-xs dark:border-[#262626]"
                            aria-label={ar ? 'تاريخ اللونش' : 'Launch date'}
                          />
                          <Button
                            size="sm"
                            variant={ph.isLaunch ? 'outline' : 'default'}
                            disabled={busy}
                            onClick={() => togglePhaseLaunch(ph)}
                            className="min-h-[32px] whitespace-nowrap"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ph.isLaunch ? <X className="h-4 w-4" /> : null}
                            <span className="ml-1">{ph.isLaunch ? (ar ? 'إلغاء اللونش' : 'Remove launch') : (ar ? '🚀 اعمل لونش' : '🚀 New launch')}</span>
                          </Button>
                        </div>
                      </div>
                      {launchErr && launchBusyPhaseId === ph.id && (
                        <p className="mt-2 text-xs text-red-400">{launchErr}</p>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'hierarchy' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{ar ? 'المشروع الأم والمشاريع التابعة' : 'Parent and nested projects'}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {ar
                    ? 'علّم المشروع كمشروع أم، وبعدها اختار مشاريع من نفس المطوّر عشان تظهر جواه بدل ما تظهر لوحدها للزوار.'
                    : 'Mark this as a parent, then add projects from the same developer. Nested projects appear inside this project, not as standalone public listings.'}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {hierarchyError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{hierarchyError}</span>
                  </div>
                )}

                {hierarchyLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#D4A843]" /></div>
                ) : hierarchy ? (
                  <>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 dark:border-[#262626]">
                      <input
                        type="checkbox"
                        checked={!!hierarchy.project.isParent}
                        disabled={hierarchyBusy || (!!hierarchy.project.parentProjectId && !hierarchy.project.isParent) || (!!hierarchy.project.isParent && hierarchy.project.childProjects.length > 0)}
                        onChange={(e) => saveHierarchy({ isParent: e.target.checked })}
                        className="mt-1 h-4 w-4 accent-[#D4A843]"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold">{ar ? 'خلّي المشروع ده مشروع أم' : 'Make this a parent project'}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {hierarchy.project.parentProjectId
                            ? (ar ? 'افصل المشروع من أبيه الأول قبل ما تخليه مشروع أم.' : 'Detach this project from its parent before making it a parent.')
                            : hierarchy.project.isParent && hierarchy.project.childProjects.length > 0
                              ? (ar ? 'افصل المشاريع التابعة الأول قبل إلغاء صفة المشروع الأم.' : 'Detach the nested projects before turning off parent status.')
                              : (ar ? 'تقدر تفعّله حتى لو مفيش مشاريع تابعة لسه.' : 'You can enable this even before adding any nested projects.')}
                        </span>
                      </span>
                      {hierarchyBusy && <Loader2 className="ms-auto h-4 w-4 animate-spin text-[#D4A843]" />}
                    </label>

                    {hierarchy.project.parentProject && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4A843]/30 bg-[#D4A843]/5 p-4">
                        <div>
                          <p className="text-xs text-muted-foreground">{ar ? 'المشروع الأم الحالي' : 'Current parent'}</p>
                          <p className="font-semibold">{ar ? hierarchy.project.parentProject.nameArabic || hierarchy.project.parentProject.name : hierarchy.project.parentProject.name}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => router.push(`/ceo/projects/${hierarchy.project.parentProject.id}`)}>
                            {ar ? 'افتح المشروع الأم' : 'Open parent'}
                          </Button>
                          <Button variant="outline" size="sm" disabled={hierarchyBusy} onClick={() => removeChildProject({ ...hierarchy.project, name: hierarchy.project.nameArabic || hierarchy.project.name })}>
                            {ar ? 'افصل من الأب' : 'Detach from parent'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {hierarchy.project.isParent && !hierarchy.project.parentProjectId && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-semibold">{ar ? `المشاريع جوه المشروع الأم (${hierarchy.project.childProjects.length})` : `Projects inside this parent (${hierarchy.project.childProjects.length})`}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ar ? 'المشاريع التابعة هتفضل محفوظة، لكنها مش هتظهر كصفحات مستقلة للزوار.' : 'Nested projects remain in the catalog, but won’t appear as standalone public pages.'}
                          </p>
                        </div>

                        {hierarchy.project.childProjects.length > 0 ? (
                          <div className="space-y-2">
                            {hierarchy.project.childProjects.map((child: any) => (
                              <div key={child.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 dark:border-[#262626]">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{ar ? child.nameArabic || child.name : child.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {child.approvalStatus} · {child._count?.units ?? 0} {ar ? 'وحدة' : 'units'}
                                    {child.startPrice != null ? ` · ${formatEGP(child.startPrice)}` : ''}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" onClick={() => router.push(`/ceo/projects/${child.id}`)}>
                                    {ar ? 'افتح' : 'Open'}
                                  </Button>
                                  <Button variant="ghost" size="sm" disabled={hierarchyBusy} onClick={() => removeChildProject(child)} className="text-red-400 hover:bg-red-500/10 hover:text-red-300">
                                    <X className="me-1 h-4 w-4" />{ar ? 'افصل' : 'Detach'}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-xl border border-dashed border-border py-5 text-center text-sm text-muted-foreground dark:border-[#262626]">
                            {ar ? 'لسه مفيش مشاريع متضافة جوه المشروع الأم.' : 'No projects have been added to this parent yet.'}
                          </p>
                        )}

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <select
                            value={selectedChildId}
                            onChange={(e) => setSelectedChildId(e.target.value)}
                            disabled={hierarchyBusy}
                            className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground dark:border-[#262626]"
                          >
                            <option value="">{ar ? 'اختار مشروع تضيفه هنا…' : 'Choose a project to nest…'}</option>
                            {(hierarchy.candidates || [])
                              .filter((candidate: any) => candidate.id !== id && candidate.parentProjectId !== hierarchy.project.id)
                              .map((candidate: any) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {ar ? candidate.nameArabic || candidate.name : candidate.name}
                                  {candidate.parentProject ? ` — ${ar ? 'حاليًا جوه' : 'currently in'} ${candidate.parentProject.name}` : ''}
                                  {` · ${candidate.approvalStatus}`}
                                </option>
                              ))}
                          </select>
                          <Button
                            disabled={hierarchyBusy || !selectedChildId}
                            onClick={async () => {
                              const ok = await saveHierarchy({ action: 'assign', childProjectId: selectedChildId })
                              if (ok) setSelectedChildId('')
                            }}
                            className="bg-[#D4A843] text-black hover:bg-[#D4A843]/90"
                          >
                            {hierarchyBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plus className="me-2 h-4 w-4" />}
                            {ar ? 'ضيف للمشروع الأم' : 'Add to parent'}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {ar ? 'الاختيار مقصور على مشاريع نفس المطوّر، ومفيش تداخل أكتر من مستوى واحد.' : 'Only projects from the same developer are eligible; nesting is limited to one level.'}
                        </p>
                      </div>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'pricing' && (
          <SectionCard
            title={ar ? 'الأسعار والدفع' : 'Pricing & Payment'} section="pricing" editingSection={editingSection}
            onEdit={() => { setEditingSection('pricing'); setEditData(project) }}
            onSave={() => handleSave('pricing')} onCancel={() => setEditingSection(null)} saving={saving} ar={ar}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EditableField label={ar ? 'السعر المبدئي' : 'Start Price'} value={editData.startPrice} onChange={(v) => updateField('startPrice', v)} type="number" disabled={editingSection !== 'pricing'} prefix="EGP" />
              <EditableField label={ar ? 'السعر النهائي' : 'End Price'} value={editData.endPrice} onChange={(v) => updateField('endPrice', v)} type="number" disabled={editingSection !== 'pricing'} prefix="EGP" />
              <EditableField label={ar ? 'سعر المتر' : 'Price per Sqm'} value={editData.pricePerSqm} onChange={(v) => updateField('pricePerSqm', v)} type="number" disabled={editingSection !== 'pricing'} prefix="EGP" />
              <EditableField label={ar ? 'أقل مقدم %' : 'Min Down Payment %'} value={editData.downPaymentMin} onChange={(v) => updateField('downPaymentMin', v)} type="number" disabled={editingSection !== 'pricing'} />
              <EditableField label={ar ? 'سنين التقسيط' : 'Installment Years'} value={editData.installmentYears} onChange={(v) => updateField('installmentYears', v)} type="number" disabled={editingSection !== 'pricing'} />
              <EditableField label={ar ? 'مساحة الكمبوند (م²)' : 'Compound Area (sqm)'} value={editData.compoundArea} onChange={(v) => updateField('compoundArea', v)} type="number" disabled={editingSection !== 'pricing'} />
            </div>
          </SectionCard>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <SectionCard
            title={ar ? 'المحتوى' : 'Content'} section="content" editingSection={editingSection}
            onEdit={() => { setEditingSection('content'); setEditData(project) }}
            onSave={() => handleSave('content')} onCancel={() => setEditingSection(null)} saving={saving} ar={ar}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EditableField label={ar ? 'السطر المميز' : 'Tagline'} value={editData.tagline} onChange={(v) => updateField('tagline', v)} disabled={editingSection !== 'content'} />
              <EditableField label={ar ? 'السطر المميز (عربي)' : 'Tagline (Arabic)'} value={editData.taglineArabic} onChange={(v) => updateField('taglineArabic', v)} disabled={editingSection !== 'content'} />
            </div>
            <EditableField label={ar ? 'الوصف' : 'Description'} value={editData.description} onChange={(v) => updateField('description', v)} disabled={editingSection !== 'content'} multiline rows={5} />
            <EditableField label={ar ? 'الوصف (عربي)' : 'Description (Arabic)'} value={editData.descriptionArabic} onChange={(v) => updateField('descriptionArabic', v)} disabled={editingSection !== 'content'} multiline rows={5} />
          </SectionCard>
        )}

        {/* Media Tab */}
        {activeTab === 'media' && (
          <SectionCard
            title={ar ? 'الميديا' : 'Media'} section="media" editingSection={editingSection}
            onEdit={() => {
              setEditingSection('media')
              setEditData({ ...project, panoramaImages: safeJsonArray(project.panoramaImages) })
              setNewPanoUrl('')
            }}
            onSave={() => handleSave('media')} onCancel={() => setEditingSection(null)} saving={saving} ar={ar}
          >
            <ImageInput
              label={ar ? 'صورة الغلاف (ارفع ملف أو حط لينك)' : 'Cover Image (upload a file or paste a URL)'}
              value={editData.coverImage || ''}
              onChange={(v) => updateField('coverImage', v)}
              disabled={editingSection !== 'media'}
            />
            <EditableField label={ar ? 'لينك الفيديو' : 'Video URL'} value={editData.videoUrl} onChange={(v) => updateField('videoUrl', v)} disabled={editingSection !== 'media'} />
            <EditableField label={ar ? 'لينك الجولة الافتراضية' : 'Virtual Tour URL'} value={editData.virtualTourUrl} onChange={(v) => updateField('virtualTourUrl', v)} disabled={editingSection !== 'media'} />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-muted-foreground text-sm">{ar ? 'لينكات الجاليري (كل واحد في سطر)' : 'Gallery URLs (one per line)'}</label>
                <UploadButton
                  disabled={editingSection !== 'media'}
                  onUploaded={(url) => updateField('gallery', JSON.stringify([...gallery, url]))}
                >
                  {ar ? 'ارفع وضيف' : 'Upload & add'}
                </UploadButton>
              </div>
              <textarea
                value={gallery.join('\n')}
                onChange={(e) => updateField('gallery', JSON.stringify(e.target.value.split('\n').filter(Boolean)))}
                disabled={editingSection !== 'media'}
                rows={4}
                className={cn(
                  'w-full bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] rounded-2xl px-3 py-2 text-foreground text-sm',
                  'focus:outline-none focus:border-[#D4A843] resize-none',
                  editingSection !== 'media' && 'opacity-60 cursor-not-allowed'
                )}
              />
            </div>
            {gallery.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {gallery.map((url: string, i: number) => (
                  <div key={i} className="relative aspect-video bg-card dark:bg-[#0A0A0A] rounded-2xl border border-border dark:border-[#262626] overflow-hidden flex items-center justify-center">
                    {url ? <NextImage src={url} alt={`Project image ${i + 1}`} fill className="h-full w-full object-cover" sizes="(max-width: 768px) 50vw, 25vw" /> : <Image className="w-6 h-6 text-muted-foreground" />}
                  </div>
                ))}
              </div>
            )}

            {/* 360° panorama images */}
            <div className="space-y-1.5 border-t border-border dark:border-[#262626] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-muted-foreground text-sm">{ar ? `صور بانوراما 360° (${panos.length})` : `360° Panorama Images (${panos.length})`}</label>
                <div className="flex items-center gap-2">
                  <input
                    value={newPanoUrl}
                    onChange={(e) => setNewPanoUrl(e.target.value)}
                    placeholder={ar ? 'حط لينك صورة 360°' : 'Paste 360° image URL'}
                    disabled={editingSection !== 'media'}
                    className="h-8 w-44 rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#D4A843] focus:outline-none disabled:opacity-60"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={editingSection !== 'media' || !newPanoUrl.trim()}
                    onClick={() => {
                      updateField('panoramaImages', [...panos, newPanoUrl.trim()])
                      setNewPanoUrl('')
                    }}
                    className="h-8 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
                  >
                    {ar ? 'ضيف اللينك' : 'Add URL'}
                  </Button>
                </div>
              </div>
              {panos.length > 0 ? (
                <ul className="space-y-1.5">
                  {panos.map((url: string, i: number) => (
                    <li key={`${i}-${url}`} className="flex items-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url}</span>
                      <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-[#D4A843] hover:underline">
                        {ar ? 'افتح' : 'Open'}
                      </a>
                      {editingSection === 'media' ? (
                        <button
                          type="button"
                          onClick={() => updateField('panoramaImages', panos.filter((_, j) => j !== i))}
                          className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:text-red-400"
                          aria-label={ar ? 'اشيل صورة البانوراما' : 'Remove panorama image'}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {ar ? 'لسه مفيش صور 360° — حط لينك ودوس ضيف اللينك وبعدين احفظ.' : 'No 360° images yet — paste a URL, press Add URL, then Save.'}
                </p>
              )}
            </div>

            {/* Master Plan images */}
            <div className="space-y-1.5 border-t border-border dark:border-[#262626] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-muted-foreground text-sm">{ar ? `صور الماستر بلان (${masterPlans.length})` : `Master Plan Images (${masterPlans.length})`}</label>
                <div className="flex items-center gap-2">
                  <input
                    value={newMpUrl}
                    onChange={(e) => setNewMpUrl(e.target.value)}
                    placeholder={ar ? 'حط لينك الصورة' : 'Paste image URL'}
                    disabled={editingSection !== 'media'}
                    className="h-8 w-44 rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#D4A843] focus:outline-none disabled:opacity-60"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={editingSection !== 'media' || !newMpUrl.trim()}
                    onClick={() => {
                      updateField('masterPlanImages', [...masterPlans, { url: newMpUrl.trim(), caption: '' }])
                      setNewMpUrl('')
                    }}
                    className="h-8 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
                  >
                    {ar ? 'ضيف اللينك' : 'Add URL'}
                  </Button>
                  <UploadButton
                    disabled={editingSection !== 'media'}
                    onUploaded={(url) => updateField('masterPlanImages', [...masterPlans, { url, caption: '' }])}
                  >
                    {ar ? 'ارفع وضيف' : 'Upload & add'}
                  </UploadButton>
                </div>
              </div>
              {masterPlans.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {masterPlans.map((mp, i) => (
                    <div key={mp.id || i} className="overflow-hidden rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]">
                      <div className="flex aspect-video items-center justify-center bg-card dark:bg-[#0A0A0A]">
                        <NextImage src={mp.url} alt={mp.caption || `Master plan ${i + 1}`} width={640} height={360} className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="flex items-center gap-1 p-1.5">
                        <input
                          value={mp.caption || ''}
                          placeholder={ar ? 'كابشن' : 'Caption'}
                          disabled={editingSection !== 'media'}
                          onChange={(e) =>
                            updateField('masterPlanImages', masterPlans.map((m, j) => (j === i ? { ...m, caption: e.target.value } : m)))
                          }
                          className="h-7 min-w-0 flex-1 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#D4A843] focus:outline-none disabled:opacity-60"
                        />
                        <button
                          type="button"
                          disabled={editingSection !== 'media'}
                          onClick={() => updateField('masterPlanImages', masterPlans.filter((_, j) => j !== i))}
                          className="rounded-full p-1 text-gray-400 transition-colors hover:text-red-400 disabled:opacity-40"
                          aria-label={ar ? 'اشيل صورة الماستر بلان' : 'Remove master plan image'}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {ar ? 'لسه مفيش صور ماستر بلان — ارفع ملف أو حط لينك وبعدين دوس احفظ.' : 'No master plan images yet — upload a file or paste a URL, then press Save.'}
                </p>
              )}
            </div>
          </SectionCard>
        )}

        {/* Location Tab */}
        {activeTab === 'location' && (
          <SectionCard
            title={ar ? 'المكان' : 'Location'} section="location" editingSection={editingSection}
            onEdit={() => { setEditingSection('location'); setEditData(project) }}
            onSave={() => handleSave('location')} onCancel={() => setEditingSection(null)} saving={saving} ar={ar}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EditableField label={ar ? 'العنوان' : 'Address'} value={editData.address} onChange={(v) => updateField('address', v)} disabled={editingSection !== 'location'} />
              <EditableField label={ar ? 'خط العرض' : 'Latitude'} value={editData.latitude} onChange={(v) => updateField('latitude', v)} type="number" disabled={editingSection !== 'location'} />
              <EditableField label={ar ? 'خط الطول' : 'Longitude'} value={editData.longitude} onChange={(v) => updateField('longitude', v)} type="number" disabled={editingSection !== 'location'} />
              <EditableField label={ar ? 'لينك جوجل مابس' : 'Google Maps URL'} value={editData.googleMapsUrl} onChange={(v) => updateField('googleMapsUrl', v)} disabled={editingSection !== 'location'} />
              <EditableField label={ar ? 'رقم المحافظة' : 'Governorate ID'} value={editData.governorateId} onChange={(v) => updateField('governorateId', v)} disabled={editingSection !== 'location'} />
              <EditableField label={ar ? 'رقم المدينة' : 'City ID'} value={editData.cityId} onChange={(v) => updateField('cityId', v)} disabled={editingSection !== 'location'} />
              <EditableField label={ar ? 'رقم الحي' : 'District ID'} value={editData.districtId} onChange={(v) => updateField('districtId', v)} disabled={editingSection !== 'location'} />
            </div>
          </SectionCard>
        )}

        {/* SEO Tab */}
        {activeTab === 'seo' && (
          <SectionCard
            title="SEO" section="seo" editingSection={editingSection}
            onEdit={() => { setEditingSection('seo'); setEditData(project) }}
            onSave={() => handleSave('seo')} onCancel={() => setEditingSection(null)} saving={saving} ar={ar}
          >
            <EditableField label={ar ? 'عنوان الميتا' : 'Meta Title'} value={editData.metaTitle} onChange={(v) => updateField('metaTitle', v)} disabled={editingSection !== 'seo'} />
            <EditableField label={ar ? 'وصف الميتا' : 'Meta Description'} value={editData.metaDescription} onChange={(v) => updateField('metaDescription', v)} disabled={editingSection !== 'seo'} multiline rows={3} />
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">{ar ? 'الكلمات (افصل بفاصلة)' : 'Keywords (comma separated)'}</label>
              <Input
                value={keywords.join(', ')}
                onChange={(e) => updateField('keywords', JSON.stringify(e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)))}
                disabled={editingSection !== 'seo'}
                className={cn('bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground', editingSection !== 'seo' && 'opacity-60')}
              />
            </div>
          </SectionCard>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <SectionCard
            title={ar ? 'الإعدادات' : 'Settings'} section="settings" editingSection={editingSection}
            onEdit={() => { setEditingSection('settings'); setEditData(project) }}
            onSave={() => handleSave('settings')} onCancel={() => setEditingSection(null)} saving={saving} ar={ar}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EditableField label={ar ? 'عدد الوحدات' : 'Total Units'} value={editData.totalUnits} onChange={(v) => updateField('totalUnits', v)} type="number" disabled={editingSection !== 'settings'} />
              <EditableField label={ar ? 'المساحة (م²)' : 'Total Area (sqm)'} value={editData.totalArea} onChange={(v) => updateField('totalArea', v)} type="number" disabled={editingSection !== 'settings'} />
              <EditableField label={ar ? 'نسبة الإنجاز %' : 'Completion %'} value={editData.completionPercent} onChange={(v) => updateField('completionPercent', v)} type="number" disabled={editingSection !== 'settings'} />
              <EditableField label={ar ? 'معاد التسليم' : 'Delivery Date'} value={editData.deliveryDate?.split('T')[0] || ''} onChange={(v) => updateField('deliveryDate', v)} type="date" disabled={editingSection !== 'settings'} />
            </div>
            <EditableField label={ar ? 'شروط التسليم' : 'Delivery Terms'} value={editData.deliveryTerms} onChange={(v) => updateField('deliveryTerms', v)} disabled={editingSection !== 'settings'} multiline rows={3} />
            <div className="flex flex-wrap gap-6 mt-2">
              {[
                { field: 'isFeatured', label: 'Featured', labelAr: 'مميز', icon: Star },
                { field: 'isVerified', label: 'Verified', labelAr: 'متوثّق', icon: Shield },
                { field: 'isActive', label: 'Active', labelAr: 'نشط', icon: Eye },
              ].map(({ field, label, labelAr, icon: Icon }) => (
                <label key={field} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editData[field]}
                    onChange={(e) => updateField(field, e.target.checked)}
                    disabled={editingSection !== 'settings'}
                    className="w-4 h-4 rounded-2xl border-border dark:border-[#262626] text-[#D4A843] focus:ring-[#D4A843]"
                  />
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground text-sm">{ar ? labelAr : label}</span>
                </label>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
            <CardHeader><CardTitle className="text-foreground text-lg">{ar ? 'سجل التدقيق' : 'Audit Log'}</CardTitle></CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#D4A843] animate-spin" /></div>
              ) : auditLogs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{ar ? 'مفيش سجلات تدقيق' : 'No audit logs found'}</p>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="p-3 bg-card dark:bg-[#0A0A0A] rounded-2xl border border-border dark:border-[#262626]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-foreground text-sm font-medium">{log.action || log.type}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">{log.createdAt ? new Date(log.createdAt).toLocaleString(ar ? 'ar-EG' : undefined) : ''}</span>
                      </div>
                      {log.description && <p className="text-muted-foreground text-xs mt-1">{log.description}</p>}
                      {log.user && <p className="text-muted-foreground text-xs mt-1">{ar ? 'بواسطة' : 'by'} {log.user.name || log.user.email}</p>}
                      {log.changes && <p className="text-muted-foreground text-xs mt-1 font-mono">{typeof log.changes === 'string' ? log.changes : JSON.stringify(log.changes)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Unit Add/Edit Modal — same fields as the CEO units page form */}
      {unitModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-card dark:bg-black border border-border dark:border-[#262626] rounded-3xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {unitModal.id
                  ? (ar ? 'تعديل الوحدة' : 'Edit Unit')
                  : (ar ? 'أضف وحدة للمشروع' : 'Add Unit to Project')}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setUnitModal(null)} className="text-muted-foreground">
                <X className="w-4 h-4" />
              </Button>
            </div>
            {unitError && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{unitError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <EditableField label={ar ? 'اسم الوحدة *' : 'Unit Name *'} value={unitForm.name} onChange={(v) => setUnitForm((f) => ({ ...f, name: v }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-muted-foreground text-sm">{ar ? 'نوع الوحدة *' : 'Unit Type *'}</label>
                <select
                  value={unitForm.unitType}
                  onChange={(e) => setUnitForm((f) => ({ ...f, unitType: e.target.value }))}
                  className="w-full bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] rounded-2xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-[#D4A843]"
                >
                  {UNIT_TYPES.map((t) => (
                    <option key={t} value={t}>{ar ? UNIT_TYPE_AR[t] || t : t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-muted-foreground text-sm">{ar ? 'نوع الإعلان *' : 'Listing Type *'}</label>
                <select
                  value={unitForm.listingType}
                  onChange={(e) => setUnitForm((f) => ({ ...f, listingType: e.target.value }))}
                  className="w-full bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] rounded-2xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-[#D4A843]"
                >
                  {LISTING_TYPES.map((t) => (
                    <option key={t} value={t}>{ar ? LISTING_TYPE_AR[t] || t : t}</option>
                  ))}
                </select>
              </div>
              <EditableField label={ar ? 'المساحة (م²) *' : 'Area (sqm) *'} value={unitForm.area} onChange={(v) => setUnitForm((f) => ({ ...f, area: v }))} type="number" />
              <EditableField label={ar ? 'السعر (جنيه) *' : 'Price (EGP) *'} value={unitForm.price} onChange={(v) => setUnitForm((f) => ({ ...f, price: v }))} type="number" />
              <EditableField label={ar ? 'أوض النوم' : 'Bedrooms'} value={unitForm.bedrooms} onChange={(v) => setUnitForm((f) => ({ ...f, bedrooms: v }))} type="number" />
              <EditableField label={ar ? 'الحمامات' : 'Bathrooms'} value={unitForm.bathrooms} onChange={(v) => setUnitForm((f) => ({ ...f, bathrooms: v }))} type="number" />
              {unitModal.id && (
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-sm">{ar ? 'الحالة' : 'Status'}</label>
                  <select
                    value={unitForm.status}
                    onChange={(e) => setUnitForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] rounded-2xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-[#D4A843]"
                  >
                    {UNIT_STATUSES.map((s) => (
                      <option key={s} value={s}>{statusLabel(s, ar)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="md:col-span-2">
                <EditableField label={ar ? 'لينك المخطط' : 'Floor Plan URL'} value={unitForm.floorPlan} onChange={(v) => setUnitForm((f) => ({ ...f, floorPlan: v }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setUnitModal(null)} className="text-muted-foreground">{ar ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={handleUnitSave} disabled={unitSaving} className="gold-shimmer bg-[#D4A843] text-black hover:bg-[#D4A843]/90">
                {unitSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                {ar ? 'احفظ' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-card dark:bg-black border border-border dark:border-[#262626] rounded-3xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-semibold text-foreground">{ar ? 'ارفض المشروع' : 'Reject Project'}</h3>
            </div>
            <p className="text-muted-foreground text-sm">{ar ? 'اكتب سبب رفض المشروع.' : 'Please provide a reason for rejecting this project.'}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder={ar ? 'سبب الرفض…' : 'Rejection reason...'}
              className="w-full bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] rounded-2xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-red-500 resize-none"
            />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => { setRejectModal(false); setRejectReason('') }} className="text-muted-foreground">{ar ? 'إلغاء' : 'Cancel'}</Button>
              <Button
                onClick={() => handleStatusAction('reject', rejectReason)}
                disabled={!rejectReason.trim() || actionLoading}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {ar ? 'ارفض' : 'Reject'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionCard({
  title, section, editingSection, onEdit, onSave, onCancel, saving, children, ar
}: {
  title: string; section: string; editingSection: string | null;
  onEdit: () => void; onSave: () => void; onCancel: () => void; saving: boolean;
  children: React.ReactNode; ar: boolean
}) {
  const isEditing = editingSection === section
  return (
    <Card className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-foreground text-lg">{title}</CardTitle>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" onClick={onSave} disabled={saving} className="gold-shimmer bg-[#D4A843] text-black hover:bg-[#D4A843]/90">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                {ar ? 'احفظ' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel} className="text-muted-foreground">
                <X className="w-4 h-4 mr-1" />{ar ? 'إلغاء' : 'Cancel'}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={onEdit} className="text-[#D4A843] hover:bg-[#D4A843]/10">
              <Edit3 className="w-4 h-4 mr-1" />{ar ? 'تعديل' : 'Edit'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
