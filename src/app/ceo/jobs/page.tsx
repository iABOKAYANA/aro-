'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import {
  Briefcase,
  Plus,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  Inbox,
  X,
  ChevronDown,
  ChevronUp,
  MapPin,
  Users,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type Job = {
  id: string
  title: string
  titleArabic: string | null
  slug: string
  department: string
  location: string
  type: string
  description: string
  descriptionArabic: string | null
  requirements: string
  salaryMin: number | null
  salaryMax: number | null
  isPublished: boolean
  createdAt: string
  updatedAt: string
  applications?: { id: string }[]
}

type JobForm = {
  title: string
  titleArabic: string
  slug: string
  department: string
  location: string
  type: string
  description: string
  descriptionArabic: string
  requirements: string
  salaryMin: string
  salaryMax: string
  isPublished: boolean
}

const emptyForm: JobForm = {
  title: '',
  titleArabic: '',
  slug: '',
  department: '',
  location: '',
  type: 'FULL_TIME',
  description: '',
  descriptionArabic: '',
  requirements: '',
  salaryMin: '',
  salaryMax: '',
  isPublished: false,
}

const JOB_TYPES = [
  { value: 'FULL_TIME', label: 'Full Time', labelAr: 'دوام كامل' },
  { value: 'PART_TIME', label: 'Part Time', labelAr: 'دوام جزئي' },
  { value: 'CONTRACT', label: 'Contract', labelAr: 'عقد' },
  { value: 'INTERNSHIP', label: 'Internship', labelAr: 'تدريب' },
]

const TYPE_COLORS: Record<string, string> = {
  FULL_TIME: 'bg-green-500/15 text-green-400 border-green-500/30',
  PART_TIME: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  CONTRACT: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  INTERNSHIP: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
}

export default function CEOJobsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<JobForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/jobs?limit=100&all=true')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      const data = await res.json()
      // The API answers { items, total, page, totalPages } — older code
      // assigned that object straight into state and crashed on .filter().
      setJobs(Array.isArray(data) ? data : data.items || data.jobs || [])
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
      setError(ar ? 'معرفناش نجيب الوظايف — حاول تاني.' : 'Failed to fetch jobs')
    } finally {
      setLoading(false)
    }
  }, [ar])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  const handleTitleChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: prev.slug === generateSlug(prev.title) || prev.slug === '' ? generateSlug(value) : prev.slug,
    }))
  }

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) return
    setSubmitting(true)
    try {
      const requirementsArray = form.requirements
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
      const payload = {
        ...form,
        requirements: JSON.stringify(requirementsArray),
        salaryMin: form.salaryMin ? parseFloat(form.salaryMin) : null,
        salaryMax: form.salaryMax ? parseFloat(form.salaryMax) : null,
      }
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create job')
      setShowForm(false)
      setForm(emptyForm)
      await fetchJobs()
    } catch (err) {
      console.error('Failed to create job:', err)
      alert(ar ? 'معرفناش نعمل الوظيفة — حاول تاني.' : 'Failed to create job')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePublish = async (job: Job) => {
    setTogglingId(job.id)
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, isPublished: !job.isPublished }),
      })
      if (!res.ok) throw new Error('Failed to update job')
      await fetchJobs()
    } catch (err) {
      console.error('Failed to update job:', err)
      alert(ar ? 'معرفناش نحدّث الوظيفة — حاول تاني.' : 'Failed to update job')
    } finally {
      setTogglingId(null)
    }
  }

  const deleteJob = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/jobs?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) throw new Error('Failed to delete job')
      setExpandedId(null)
      await fetchJobs()
    } catch (err) {
      console.error('Failed to delete job:', err)
      alert(ar ? 'معرفناش نمسح الوظيفة — حاول تاني.' : 'Failed to delete job')
    } finally {
      setDeletingId(null)
    }
  }

  const parseRequirements = (val: string): string[] => {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
      return []
    } catch {
      return []
    }
  }

  const filteredJobs = jobs.filter((job) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      job.title.toLowerCase().includes(q) ||
      job.department.toLowerCase().includes(q) ||
      job.location.toLowerCase().includes(q)
    )
  })

  const publishedCount = jobs.filter((j) => j.isPublished).length
  const totalApplications = jobs.reduce((sum, j) => sum + (j.applications?.length || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الوظائف' : 'CEO Console · Jobs'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة الوظايف' : 'Jobs Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'اتحكم في إعلانات الوظايف وتابع المتقدمين' : 'Manage job postings and track applications'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex gap-2">
          <Button onClick={fetchJobs} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button onClick={() => setShowForm(!showForm)} className="bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
            <Plus className="mr-2 h-4 w-4" />
            {ar ? 'وظيفة جديدة' : 'New Job'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Jobs', labelAr: 'كل الوظايف', value: jobs.length, color: 'text-blue-400 bg-blue-500/10', icon: <Briefcase className="h-5 w-5" /> },
          { label: 'Published', labelAr: 'منشورين', value: publishedCount, color: 'text-green-400 bg-green-500/10', icon: <CheckCircle2 className="h-5 w-5" /> },
          { label: 'Applications', labelAr: 'المتقدمين', value: totalApplications, color: 'text-purple-400 bg-purple-500/10', icon: <Users className="h-5 w-5" /> },
          { label: 'Departments', labelAr: 'الأقسام', value: [...new Set(jobs.map((j) => j.department))].length, color: 'text-estate-gold bg-estate-gold/10', icon: <MapPin className="h-5 w-5" /> },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', stat.color)}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{ar ? stat.labelAr : stat.label}</p>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border dark:border-[#262626] pb-4">
            <CardTitle className="text-lg text-foreground">{ar ? 'إعلان وظيفة جديد' : 'New Job Posting'}</CardTitle>
            <button onClick={() => { setShowForm(false); setForm(emptyForm) }} className="rounded-full p-1 text-gray-500 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'العنوان *' : 'Title *'}</label>
                <Input
                  value={form.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={ar ? 'اكتب عنوان الوظيفة…' : 'Enter job title...'}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'العنوان (بالعربي)' : 'Title (Arabic)'}</label>
                <Input
                  value={form.titleArabic}
                  onChange={(e) => setForm({ ...form, titleArabic: e.target.value })}
                  placeholder="العنوان بالعربية"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الرابط' : 'Slug'}</label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="auto-generated-from-title"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'القسم' : 'Department'}</label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. Sales, Marketing, Engineering"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'المكان' : 'Location'}</label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Cairo, Egypt"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'نوع الوظيفة' : 'Job Type'}</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold focus:outline-none"
                >
                  {JOB_TYPES.map((t) => (
                    <option key={t.value} value={t.value} className="bg-[#0a1220]">
                      {ar ? t.labelAr : t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'أقل مرتب (جنيه)' : 'Salary Min (EGP)'}</label>
                <Input
                  type="number"
                  value={form.salaryMin}
                  onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                  placeholder="0"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'أعلى مرتب (جنيه)' : 'Salary Max (EGP)'}</label>
                <Input
                  type="number"
                  value={form.salaryMax}
                  onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                  placeholder="0"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'المتطلبات (افصل بفاصلة)' : 'Requirements (comma-separated)'}</label>
              <Input
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                placeholder={ar ? 'مثال: خبرة ٣ سنين، مؤهل عالي، إنجليزي كويس' : "e.g. 3+ years experience, Bachelor's degree, English fluency"}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الوصف *' : 'Description *'}</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={5}
                placeholder={ar ? 'اوصف الدور والمسؤوليات…' : 'Describe the job role and responsibilities...'}
                className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:outline-none focus:ring-1 focus:ring-estate-gold/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الوصف (بالعربي)' : 'Description (Arabic)'}</label>
              <textarea
                value={form.descriptionArabic}
                onChange={(e) => setForm({ ...form, descriptionArabic: e.target.value })}
                rows={3}
                placeholder="وصف الدور الوظيفي بالعربية..."
                className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:outline-none focus:ring-1 focus:ring-estate-gold/20"
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{ar ? 'انشر فورًا' : 'Publish immediately'}</p>
                <p className="text-xs text-gray-500">{ar ? 'شغّلها عشان تنشر أو سيبها مسودة' : 'Toggle to publish or save as draft'}</p>
              </div>
              <button
                onClick={() => setForm({ ...form, isPublished: !form.isPublished })}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  form.isPublished ? 'bg-estate-gold' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    form.isPublished ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm) }} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleSubmit} disabled={!form.title.trim() || !form.description.trim() || submitting} className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {ar ? 'بيتعمل…' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {ar ? 'اعمل الوظيفة' : 'Create Job'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بالعنوان أو القسم أو المكان…' : 'Search jobs by title, department, or location...'}
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

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchJobs} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {!loading && !error && filteredJobs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش وظايف' : 'No jobs found'}</p>
          <p className="mt-1 text-sm text-gray-500">{search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search') : (ar ? 'اعمل أول إعلان وظيفة' : 'Create your first job posting')}</p>
        </div>
      )}

      {!loading && !error && filteredJobs.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'العنوان' : 'Title'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'القسم' : 'Department'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'المكان' : 'Location'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 sm:table-cell">{ar ? 'النوع' : 'Type'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 sm:table-cell">{ar ? 'المتقدمين' : 'Applications'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filteredJobs.map((job) => {
                    const isExpanded = expandedId === job.id
                    return (
                      <>
                        <tr
                          key={job.id}
                          onClick={() => setExpandedId(isExpanded ? null : job.id)}
                          className={cn('cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', isExpanded && 'bg-muted')}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                                <Briefcase className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate max-w-[180px] sm:max-w-none">{job.title}</p>
                                {job.titleArabic && (
                                  <p className="text-xs text-gray-500 truncate max-w-[180px] sm:max-w-none">{job.titleArabic}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <span className="text-gray-400">{job.department}</span>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <MapPin className="h-3 w-3" />
                              {job.location}
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <Badge className={cn('border text-xs', TYPE_COLORS[job.type] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300')}>
                              {ar ? JOB_TYPES.find((t) => t.value === job.type)?.labelAr || job.type : JOB_TYPES.find((t) => t.value === job.type)?.label || job.type}
                            </Badge>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <Users className="h-3 w-3" />
                              {job.applications?.length || 0}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePublish(job) }}
                              disabled={togglingId === job.id}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                                job.isPublished
                                  ? 'border-green-500/30 bg-green-500/15 text-green-400 hover:bg-green-500/20'
                                  : 'border-yellow-500/30 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/20'
                              )}
                            >
                              {togglingId === job.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : job.isPublished ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {job.isPublished ? (ar ? 'منشور' : 'Published') : (ar ? 'مسودة' : 'Draft')}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => togglePublish(job)}
                                disabled={togglingId === job.id}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {job.isPublished ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => deleteJob(job.id)}
                                disabled={deletingId === job.id}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                              >
                                {deletingId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : job.id)}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${job.id}-expanded`}>
                            <td colSpan={7} className="border-b border-border dark:border-[#262626] bg-white/[0.02] px-4 py-5">
                              <div className="grid gap-6 lg:grid-cols-2">
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'تفاصيل الوظيفة' : 'Job Details'}</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'الرابط' : 'Slug'}</span>
                                      <span className="text-gray-300">{job.slug}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'المرتب' : 'Salary Range'}</span>
                                      <span className="text-gray-300">
                                        {job.salaryMin != null && job.salaryMax != null
                                          ? (ar ? `${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()} جنيه` : `${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()} EGP`)
                                          : (ar ? 'مش متحدد' : 'Not specified')}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'اتعملت' : 'Created'}</span>
                                      <span className="text-gray-300">{new Date(job.createdAt).toLocaleDateString(ar ? 'ar-EG' : undefined)}</span>
                                    </div>
                                  </div>
                                  {parseRequirements(job.requirements).length > 0 && (
                                    <div>
                                      <p className="mb-1 text-xs text-gray-500">{ar ? 'المتطلبات' : 'Requirements'}</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {parseRequirements(job.requirements).map((req, i) => (
                                          <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-gray-300">
                                            {req}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'الوصف' : 'Description'}</h4>
                                  <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-3">
                                    <p className="whitespace-pre-wrap text-sm text-gray-300">{job.description}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
