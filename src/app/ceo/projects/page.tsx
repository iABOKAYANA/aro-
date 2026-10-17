'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEGP, cn } from '@/lib/utils'
import ImageInput from '../components/image-input'
import StagingInbox from '../components/staging-inbox'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import {
  Search, Plus, ChevronDown, ChevronUp, Grid3X3, List, ChevronLeft,
  ChevronRight, MoreVertical, Trash2, Eye, Edit, Archive, RotateCcw,
  CheckCircle, XCircle, Send, Globe, FileText, X, Filter, SlidersHorizontal, AlertTriangle
} from 'lucide-react'
import { Reveal } from '@/components/design'

function safeJsonArray(val: string | null | undefined): string[] {
  if (!val) return []
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : [] } catch { return [] }
}

const approvalStatuses = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'] as const

const approvalColor: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  APPROVED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
  PUBLISHED: 'bg-green-500/20 text-green-400 border-green-500/30',
  HIDDEN: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ARCHIVED: 'bg-gray-600/20 text-gray-500 border-gray-600/30',
}

const constructionColor: Record<string, string> = {
  COMING_SOON: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  UNDER_CONSTRUCTION: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  DELIVERED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  SOLD_OUT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const statusActions: Record<string, string[]> = {
  DRAFT: ['submit'],
  PENDING: ['approve', 'reject'],
  APPROVED: ['publish'],
  REJECTED: ['submit', 'archive'],
  PUBLISHED: ['unpublish', 'archive'],
  HIDDEN: ['publish', 'archive'],
  ARCHIVED: ['restore'],
}

const actionLabels: Record<string, string> = {
  submit: 'Submit for Review', approve: 'Approve', reject: 'Reject',
  publish: 'Publish', unpublish: 'Unpublish', archive: 'Archive', restore: 'Restore',
}

const actionLabelsAr: Record<string, string> = {
  submit: 'ابعت للمراجعة', approve: 'وافق', reject: 'ارفض',
  publish: 'انشر', unpublish: 'اشيل النشر', archive: 'أرشف', restore: 'رجّع',
}

const PTYPE_AR: Record<string, string> = {
  APARTMENT: 'شقة', VILLA: 'فيلا', TOWNHOUSE: 'تاونهاوس', PENTHOUSE: 'بنتهاوس',
  STUDIO: 'استوديو', DUPLEX: 'دوبلكس', LAND: 'أرض', COMMERCIAL: 'تجاري',
}

const LTYPE_AR: Record<string, string> = {
  SALE: 'بيع', RENT: 'إيجار', INSTALLMENT: 'تقسيط',
}

const CONSTRUCTION_AR: Record<string, string> = {
  COMING_SOON: 'جاي قريب', UNDER_CONSTRUCTION: 'تحت الإنشاء', DELIVERED: 'اتسلّم', SOLD_OUT: 'اتباع كله',
}

const actionColors: Record<string, string> = {
  submit: 'text-blue-400 hover:bg-blue-500/10',
  approve: 'text-green-400 hover:bg-green-500/10',
  reject: 'text-red-400 hover:bg-red-500/10',
  publish: 'text-green-400 hover:bg-green-500/10',
  unpublish: 'text-yellow-400 hover:bg-yellow-500/10',
  archive: 'text-orange-400 hover:bg-orange-500/10',
  restore: 'text-purple-400 hover:bg-purple-500/10',
}

const propertyTypes = ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'STUDIO', 'DUPLEX', 'LAND', 'COMMERCIAL']
const listingTypes = ['SALE', 'RENT', 'INSTALLMENT']

interface Project {
  id: string; name: string; nameArabic?: string; tagline?: string; description?: string;
  approvalStatus: string; status?: string; developerId: string; developer?: { name: string };
  propertyTypes?: string; listingTypes?: string; startPrice?: number; endPrice?: number;
  totalUnits?: number; totalArea?: number; isFeatured?: boolean; isActive?: boolean;
  createdAt: string; images?: string; address?: string; city?: { name: string };
  governorate?: { nameArabic: string }; cityId?: string; governorateId?: string;
  downPaymentMin?: number; installmentYears?: number;
}

interface Developer { id: string; name: string }
interface StatusCounts { [key: string]: number }

interface Filters {
  search: string; approvalStatus: string; sort: string; order: string;
  page: number; limit: number; developerId: string; propertyType: string;
  minPrice: string; maxPrice: string;
}

interface ProjectForm {
  name: string; nameArabic: string; tagline: string; description: string;
  developerId: string; status: string; propertyTypes: string; listingTypes: string;
  startPrice: string; endPrice: string; governorateId: string; cityId: string;
  address: string; totalUnits: string; totalArea: string;
  downPaymentMin: string; installmentYears: string; isFeatured: boolean; isActive: boolean;
  coverImage: string;
}

const emptyForm: ProjectForm = {
  name: '', nameArabic: '', tagline: '', description: '', developerId: '', status: 'DRAFT',
  propertyTypes: '', listingTypes: '', startPrice: '', endPrice: '', governorateId: '',
  cityId: '', address: '', totalUnits: '', totalArea: '', downPaymentMin: '',
  installmentYears: '', isFeatured: false, isActive: true, coverImage: '',
}

export default function CEOProjectsPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [projects, setProjects] = useState<Project[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({})
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ projectId: string; reason: string } | null>(null)
  const [deleteModal, setDeleteModal] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Top-level tab: live projects vs the WhatsApp staging review queue.
  const [mainTab, setMainTab] = useState<'projects' | 'staging'>('projects')
  const [filters, setFilters] = useState<Filters>({
    search: '', approvalStatus: 'ALL', sort: 'createdAt', order: 'desc',
    page: 1, limit: 20, developerId: '', propertyType: '', minPrice: '', maxPrice: '',
  })

  const fetchProjects = useCallback(async (f: Filters) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f.search) params.set('search', f.search)
      if (f.approvalStatus !== 'ALL') params.set('approvalStatus', f.approvalStatus)
      params.set('sort', f.sort)
      params.set('order', f.order)
      params.set('page', String(f.page))
      params.set('limit', String(f.limit))
      if (f.developerId) params.set('developerId', f.developerId)
      if (f.propertyType) params.set('propertyType', f.propertyType)
      if (f.minPrice) params.set('minPrice', f.minPrice)
      if (f.maxPrice) params.set('maxPrice', f.maxPrice)
      const res = await fetch(`/api/ceo/projects?${params}`)
      const data = await res.json()
      setProjects(data.projects || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
      setStatusCounts(data.statusCounts || {})
    } catch { setProjects([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProjects(filters) }, [filters, fetchProjects])

  // Honor the notification deep-link (?approvalStatus=PENDING) so the CEO
  // lands directly on the pending queue instead of an unfiltered list.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('approvalStatus')
      if (q && (approvalStatuses as readonly string[]).includes(q.toUpperCase())) {
        setFilters(prev => prev.approvalStatus === 'ALL' ? { ...prev, approvalStatus: q.toUpperCase(), page: 1 } : prev)
      }
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetch('/api/ceo/developers').then(r => r.json()).then(d => setDevelopers(d.developers || d || [])).catch(() => {})
  }, [])

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }))
  }

  const toggleOrder = () => setFilters(prev => ({ ...prev, order: prev.order === 'asc' ? 'desc' : 'asc', page: 1 }))

  const handleCreate = async () => {
    if (!form.name || !form.developerId) return
    setSubmitting(true)
    try {
      await fetch('/api/ceo/projects', {
        method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, startPrice: form.startPrice ? Number(form.startPrice) : undefined, endPrice: form.endPrice ? Number(form.endPrice) : undefined, totalUnits: form.totalUnits ? Number(form.totalUnits) : undefined, totalArea: form.totalArea ? Number(form.totalArea) : undefined, downPaymentMin: form.downPaymentMin ? Number(form.downPaymentMin) : undefined, installmentYears: form.installmentYears ? Number(form.installmentYears) : undefined }),
      })
      setShowForm(false); setForm(emptyForm); fetchProjects(filters)
    } catch { } finally { setSubmitting(false) }
  }

  const handleStatus = async (projectId: string, action: string, reason?: string) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/ceo/projects/${projectId}/status`, {
        method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setActionError((data as any)?.error || (ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.'))
        return
      }
    } catch {
      setActionError(ar ? 'الحركة دي منفعتش، جرّب تاني.' : 'That action failed, please try again.')
      return
    }
    setOpenMenu(null); setRejectModal(null); fetchProjects(filters)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/ceo/projects/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    setDeleteModal(null); fetchProjects(filters)
  }

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', approvalColor[status] || approvalColor.DRAFT)}>{statusLabel(status, ar)}</span>
  )

  const ConstructionBadge = ({ status }: { status?: string }) => {
    if (!status) return null
    return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', constructionColor[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30')}>{ar ? CONSTRUCTION_AR[status] || status.replace(/_/g, ' ') : status.replace(/_/g, ' ')}</span>
  }

  const ProjectCard = ({ project }: { project: Project }) => {
    const images = safeJsonArray(project.images)
    const pTypes = safeJsonArray(project.propertyTypes)
    const lTypes = safeJsonArray(project.listingTypes)
    const actions = statusActions[project.approvalStatus] || []

    return (
      <Card className="bg-card dark:bg-[#0A0A0A] backdrop-blur-sm border border-border dark:border-[#262626] hover:border-[#D4A843]/30 transition-all">
        <div className="relative h-40 bg-card dark:bg-[#0A0A0A] rounded-t-2xl overflow-hidden cursor-pointer" onClick={() => router.push(`/ceo/projects/${project.id}`)}>
          {images.length > 0 ? (
            <Image src={images[0]} alt={project.name} fill className="h-full w-full object-cover" sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600"><FileText size={32} /></div>
          )}
          <div className="absolute top-2 left-2 flex gap-1"><StatusBadge status={project.approvalStatus} /></div>
          {project.status && <div className="absolute top-2 right-2"><ConstructionBadge status={project.status} /></div>}
        </div>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="cursor-pointer" onClick={() => router.push(`/ceo/projects/${project.id}`)}>
              <h3 className="text-gray-200 font-semibold text-sm truncate">{project.name}</h3>
              {project.nameArabic && <p className="text-gray-400 text-xs truncate">{project.nameArabic}</p>}
            </div>
            <div className="relative">
              <button className="p-1 text-gray-400 hover:text-gray-200 rounded-full hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === project.id ? null : project.id) }}>
                <MoreVertical size={16} />
              </button>
              {openMenu === project.id && (
                <div className="absolute right-0 top-8 z-50 w-48 bg-[#0f1a2e] border border-border dark:border-[#262626] rounded-2xl shadow-xl py-1" onClick={(e) => e.stopPropagation()}>
                  <button className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A] flex items-center gap-2" onClick={() => router.push(`/ceo/projects/${project.id}`)}><Eye size={14} /> {ar ? 'شوف التفاصيل' : 'View Details'}</button>
                  {actions.map(a => (
                    <button key={a} className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2', actionColors[a])}
                      onClick={() => a === 'reject' ? setRejectModal({ projectId: project.id, reason: '' }) : handleStatus(project.id, a)}>
                      {a === 'submit' && <Send size={14} />} {a === 'approve' && <CheckCircle size={14} />}
                      {a === 'reject' && <XCircle size={14} />} {a === 'publish' && <Globe size={14} />}
                      {a === 'unpublish' && <Globe size={14} />} {a === 'archive' && <Archive size={14} />}
                      {a === 'restore' && <RotateCcw size={14} />} {ar ? actionLabelsAr[a] : actionLabels[a]}
                    </button>
                  ))}
                  <button className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 border-t border-border dark:border-[#262626] mt-1" onClick={() => setDeleteModal(project.id)}><Trash2 size={14} /> {ar ? 'احذف' : 'Delete'}</button>
                </div>
              )}
            </div>
          </div>
          <p className="text-gray-500 text-xs">{project.developer?.name || (ar ? 'مطوّر مش معروف' : 'Unknown Developer')}</p>
          {(project.startPrice || project.endPrice) && (
            <p className="text-[#D4A843] text-sm font-semibold">
              {project.startPrice ? formatEGP(project.startPrice) : ''} {project.endPrice && project.startPrice ? '-' : ''} {project.endPrice ? formatEGP(project.endPrice) : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {pTypes.map(t => <span key={t} className="text-xs bg-card dark:bg-[#0A0A0A] text-gray-400 px-1.5 py-0.5 rounded-full">{ar ? PTYPE_AR[t] || t.replace(/_/g, ' ') : t.replace(/_/g, ' ')}</span>)}
            {lTypes.map(t => <span key={t} className="text-xs bg-[#D4A843]/10 text-[#D4A843] px-1.5 py-0.5 rounded-full">{ar ? LTYPE_AR[t] || t : t}</span>)}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a1220] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Reveal>
            <p className="section-kicker">{ar ? 'لوحة المدير · المشاريع' : 'CEO Console · Projects'}</p>
            <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة المشاريع' : 'Projects Management'}</h1>
            <p className="text-gray-400 text-sm">{ar ? 'اتحكم وراجع كل المشاريع العقارية' : 'Manage and review all real estate projects'}</p>
            <hr className="gold-hairline mt-4" />
          </Reveal>
          <Button onClick={() => { setShowForm(!showForm); setForm(emptyForm) }} className="bg-[#D4A843] hover:bg-[#D4A843]/90 text-black font-semibold">
            <Plus size={16} className="mr-2" /> {ar ? 'مشروع جديد' : 'New Project'}
          </Button>
        </div>

        {/* Main tabs: live projects vs WhatsApp staging inbox */}
        <div className="flex gap-2">
          {([
            { key: 'projects', label: ar ? 'المشاريع' : 'Projects', labelEn: 'Projects' },
            { key: 'staging', label: ar ? 'وارد واتساب' : 'WhatsApp inbox', labelEn: 'WhatsApp inbox' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={cn('px-4 py-2 rounded-2xl text-sm font-semibold transition-colors border',
                mainTab === t.key
                  ? 'bg-[#D4A843] text-black border-[#D4A843]'
                  : 'bg-card dark:bg-[#0A0A0A] text-gray-400 border-border dark:border-[#262626] hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>

        {mainTab === 'staging' ? (
          <StagingInbox />
        ) : (
          <>
        {/* Status Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {approvalStatuses.map(s => {
            const count = s === 'ALL' ? total : (statusCounts[s] || 0)
            return (
              <button key={s} onClick={() => updateFilter('approvalStatus', s)}
                className={cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors', filters.approvalStatus === s ? 'bg-[#D4A843] text-black' : 'bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A]')}>
                {s === 'ALL' ? (ar ? 'الكل' : 'ALL') : statusLabel(s, ar)} <span className="ml-1 opacity-70">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Loud pending queue banner — CEO never hunts for approvals */}
        {(statusCounts.PENDING || 0) > 0 && filters.approvalStatus !== 'PENDING' && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3" role="alert">
            <AlertTriangle size={18} className="text-yellow-400 shrink-0" />
            <p className="text-sm text-yellow-200">
              {ar ? `عندك ${statusCounts.PENDING} مشروع مستني موافقتك — دوس عشان تراجعهم.` : `You have ${statusCounts.PENDING} project${statusCounts.PENDING === 1 ? '' : 's'} waiting for your approval.`}
            </p>
            <button
              onClick={() => updateFilter('approvalStatus', 'PENDING')}
              className="ml-auto rounded-full bg-[#D4A843] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#D4A843]/90"
            >
              {ar ? 'شوف اللي مستني' : 'Review pending'}
            </button>
          </div>
        )}

        {/* Action error feedback — never fail silently */}
        {actionError && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
            <XCircle size={16} className="shrink-0" />
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="ml-auto text-red-300/70 hover:text-red-200" aria-label={ar ? 'اقفل' : 'Dismiss'}><X size={16} /></button>
          </div>
        )}

        {/* Create Form */}
        {showForm && (
          <Card className="bg-card dark:bg-[#0A0A0A] backdrop-blur-sm border border-border dark:border-[#262626]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold text-foreground">{ar ? 'اعمل مشروع جديد' : 'Create New Project'}</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input placeholder={ar ? 'اسم المشروع *' : 'Project Name *'} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'الاسم بالعربي' : 'Name Arabic'} value={form.nameArabic} onChange={e => setForm(f => ({ ...f, nameArabic: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'الشعار' : 'Tagline'} value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'الوصف' : 'Description'} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <select value={form.developerId} onChange={e => setForm(f => ({ ...f, developerId: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] text-foreground rounded-xl px-3 py-2 text-sm">
                  <option value="">{ar ? 'اختار المطوّر *' : 'Select Developer *'}</option>
                  {developers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] text-foreground rounded-xl px-3 py-2 text-sm">
                  {['DRAFT', 'PENDING', 'APPROVED'].map(s => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
                </select>
                <Input placeholder={ar ? 'السعر المبدئي' : 'Start Price'} type="number" value={form.startPrice} onChange={e => setForm(f => ({ ...f, startPrice: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'السعر النهائي' : 'End Price'} type="number" value={form.endPrice} onChange={e => setForm(f => ({ ...f, endPrice: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'رقم المحافظة' : 'Governorate ID'} value={form.governorateId} onChange={e => setForm(f => ({ ...f, governorateId: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'رقم المدينة' : 'City ID'} value={form.cityId} onChange={e => setForm(f => ({ ...f, cityId: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'العنوان' : 'Address'} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'عدد الوحدات' : 'Total Units'} type="number" value={form.totalUnits} onChange={e => setForm(f => ({ ...f, totalUnits: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'المساحة الكلية (م²)' : 'Total Area (sqm)'} type="number" value={form.totalArea} onChange={e => setForm(f => ({ ...f, totalArea: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'أقل مقدم (%)' : 'Down Payment Min (%)'} type="number" value={form.downPaymentMin} onChange={e => setForm(f => ({ ...f, downPaymentMin: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'سنين التقسيط' : 'Installment Years'} type="number" value={form.installmentYears} onChange={e => setForm(f => ({ ...f, installmentYears: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'أنواع العقارات (افصل بفاصلة)' : 'Property Types (comma separated)'} value={form.propertyTypes} onChange={e => setForm(f => ({ ...f, propertyTypes: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                <Input placeholder={ar ? 'أنواع الإعلان (افصل بفاصلة)' : 'Listing Types (comma separated)'} value={form.listingTypes} onChange={e => setForm(f => ({ ...f, listingTypes: e.target.value }))} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
              </div>
              <div className="mt-4">
                <ImageInput label={ar ? 'صورة الغلاف (ارفع ملف أو حط لينك)' : 'Cover Image (upload a file or paste a URL)'} value={form.coverImage} onChange={v => setForm(f => ({ ...f, coverImage: v }))} />
              </div>
              <div className="flex items-center gap-4 mt-4">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))} className="accent-[#D4A843]" /> {ar ? 'مميز' : 'Featured'}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-[#D4A843]" /> {ar ? 'نشط' : 'Active'}
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border dark:border-[#262626] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">{ar ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={handleCreate} disabled={submitting || !form.name || !form.developerId} className="gold-shimmer bg-[#D4A843] hover:bg-[#D4A843]/90 text-black font-semibold">
                  {submitting ? (ar ? 'بيتعمل…' : 'Creating...') : (ar ? 'اعمل المشروع' : 'Create Project')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search & Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <Input placeholder={ar ? 'دوّر على المشاريع…' : 'Search projects...'} value={filters.search} onChange={e => updateFilter('search', e.target.value)}
              className="pl-9 bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
          </div>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="border-border dark:border-[#262626] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <Filter size={16} className="mr-1" /> {ar ? 'الفلاتر' : 'Filters'} {showFilters ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
          </Button>
          <div className="flex items-center gap-2">
            <select value={filters.sort} onChange={e => updateFilter('sort', e.target.value)} className="bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] text-foreground rounded-xl px-3 py-2 text-sm">
              <option value="createdAt">{ar ? 'اتعمل' : 'Created'}</option><option value="name">{ar ? 'الاسم' : 'Name'}</option><option value="startPrice">{ar ? 'السعر' : 'Price'}</option>
            </select>
            <Button variant="outline" onClick={toggleOrder} className="border-border dark:border-[#262626] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A] px-2">
              {filters.order === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
          </div>
          <div className="flex bg-card dark:bg-[#0A0A0A] rounded-2xl border border-border dark:border-[#262626] p-0.5">
            <button onClick={() => setViewMode('grid')} className={cn('p-1.5 rounded-full', viewMode === 'grid' ? 'bg-[#D4A843] text-black' : 'text-gray-400')}><Grid3X3 size={16} /></button>
            <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded-full', viewMode === 'list' ? 'bg-[#D4A843] text-black' : 'text-gray-400')}><List size={16} /></button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card className="bg-card dark:bg-[#0A0A0A] backdrop-blur-sm border border-border dark:border-[#262626]">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select value={filters.developerId} onChange={e => updateFilter('developerId', e.target.value)} className="bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] text-foreground rounded-xl px-3 py-2 text-sm">
                  <option value="">{ar ? 'كل المطوّرين' : 'All Developers'}</option>
                  {developers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={filters.propertyType} onChange={e => updateFilter('propertyType', e.target.value)} className="bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] text-foreground rounded-xl px-3 py-2 text-sm">
                  <option value="">{ar ? 'كل أنواع العقارات' : 'All Property Types'}</option>
                  {propertyTypes.map(t => <option key={t} value={t}>{ar ? PTYPE_AR[t] || t.replace(/_/g, ' ') : t.replace(/_/g, ' ')}</option>)}
                </select>
                <div className="flex gap-2">
                  <Input placeholder={ar ? 'أقل سعر' : 'Min Price'} type="number" value={filters.minPrice} onChange={e => updateFilter('minPrice', e.target.value)} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                  <Input placeholder={ar ? 'أعلى سعر' : 'Max Price'} type="number" value={filters.maxPrice} onChange={e => updateFilter('maxPrice', e.target.value)} className="bg-card dark:bg-[#0A0A0A] border-border dark:border-[#262626] text-foreground placeholder:text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Projects */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#D4A843] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="bg-card dark:bg-[#0A0A0A] backdrop-blur-sm border border-border dark:border-[#262626]">
            <CardContent className="p-12 text-center">
              <FileText size={40} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">{ar ? 'مفيش مشاريع' : 'No projects found'}</p>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        ) : (
          <Card className="bg-card dark:bg-[#0A0A0A] backdrop-blur-sm border border-border dark:border-[#262626] overflow-hidden">
            <div className="divide-y divide-border dark:divide-[#262626]">
              {projects.map(p => {
                const actions = statusActions[p.approvalStatus] || []
                return (
                  <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => router.push(`/ceo/projects/${p.id}`)}>
                    <div className="w-16 h-12 bg-card dark:bg-[#0A0A0A] rounded-2xl flex-shrink-0 overflow-hidden">
                      {safeJsonArray(p.images).length > 0 ? <Image src={safeJsonArray(p.images)[0]} alt={p.name} width={64} height={48} className="h-full w-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600"><FileText size={16} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-gray-200 text-sm font-medium truncate">{p.name}</h3>
                        <StatusBadge status={p.approvalStatus} />
                        {p.status && <ConstructionBadge status={p.status} />}
                      </div>
                      <p className="text-gray-500 text-xs truncate">{p.developer?.name}</p>
                    </div>
                    {(p.startPrice || p.endPrice) && (
                      <p className="text-[#D4A843] text-sm font-semibold whitespace-nowrap">
                        {p.startPrice ? formatEGP(p.startPrice) : ''} {p.endPrice && p.startPrice ? '-' : ''} {p.endPrice ? formatEGP(p.endPrice) : ''}
                      </p>
                    )}
                    <p className="text-gray-500 text-xs whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString(ar ? 'ar-EG' : undefined)}</p>
                    <div className="relative" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)} className="p-1.5 text-gray-400 hover:text-gray-200 rounded-full hover:bg-card dark:hover:bg-[#0A0A0A]"><MoreVertical size={16} /></button>
                      {openMenu === p.id && (
                        <div className="absolute right-0 top-8 z-50 w-48 bg-[#0f1a2e] border border-border dark:border-[#262626] rounded-2xl shadow-xl py-1">
                          <button className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A] flex items-center gap-2" onClick={() => router.push(`/ceo/projects/${p.id}`)}><Eye size={14} /> {ar ? 'شوف التفاصيل' : 'View Details'}</button>
                          {actions.map(a => (
                            <button key={a} className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2', actionColors[a])}
                              onClick={() => a === 'reject' ? setRejectModal({ projectId: p.id, reason: '' }) : handleStatus(p.id, a)}>
                              {a === 'submit' && <Send size={14} />} {a === 'approve' && <CheckCircle size={14} />}
                              {a === 'reject' && <XCircle size={14} />} {a === 'publish' && <Globe size={14} />}
                              {a === 'unpublish' && <Globe size={14} />} {a === 'archive' && <Archive size={14} />}
                              {a === 'restore' && <RotateCcw size={14} />} {ar ? actionLabelsAr[a] : actionLabels[a]}
                            </button>
                          ))}
                          <button className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 border-t border-border dark:border-[#262626] mt-1" onClick={() => setDeleteModal(p.id)}><Trash2 size={14} /> {ar ? 'احذف' : 'Delete'}</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">{ar ? `${total} مشروع في الكل` : `${total} total projects`}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} className="border-border dark:border-[#262626] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"><ChevronLeft size={16} /></Button>
              <span className="text-gray-300 text-sm">{ar ? `صفحة ${filters.page} من ${totalPages}` : `Page ${filters.page} of ${totalPages}`}</span>
              <Button variant="outline" disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} className="border-border dark:border-[#262626] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"><ChevronRight size={16} /></Button>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRejectModal(null)}>
          <Card className="bg-[#0f1a2e] border border-border dark:border-[#262626] w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-foreground font-semibold">{ar ? 'ارفض المشروع' : 'Reject Project'}</h3>
              <textarea placeholder={ar ? 'سبب الرفض (مطلوب)' : 'Reason for rejection (required)'} value={rejectModal.reason} onChange={e => setRejectModal(r => r ? { ...r, reason: e.target.value } : null)}
                className="w-full h-24 bg-card dark:bg-[#0A0A0A] border border-border dark:border-[#262626] rounded-2xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-[#D4A843]" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectModal(null)} className="border-border dark:border-[#262626] text-gray-300">{ar ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={() => handleStatus(rejectModal.projectId, 'reject', rejectModal.reason)} disabled={!rejectModal.reason} className="bg-red-500 hover:bg-red-600 text-white">{ar ? 'ارفض' : 'Reject'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteModal(null)}>
          <Card className="bg-[#0f1a2e] border border-border dark:border-[#262626] w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-foreground font-semibold">{ar ? 'احذف المشروع' : 'Delete Project'}</h3>
              <p className="text-gray-400 text-sm">{ar ? 'متأكد عايز تمسح المشروع ده؟ الحركة دي مبتتراجعش.' : 'Are you sure you want to delete this project? This action cannot be undone.'}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteModal(null)} className="border-border dark:border-[#262626] text-gray-300">{ar ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={() => handleDelete(deleteModal)} className="bg-red-500 hover:bg-red-600 text-white">{ar ? 'احذف' : 'Delete'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
