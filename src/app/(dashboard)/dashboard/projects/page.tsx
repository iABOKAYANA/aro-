'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Plus, Search, Building2, Eye, Edit, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'
import { MilestoneDialog } from '@/components/projects/milestone-dialog'

interface Project {
  id: string
  name: string
  slug: string
  status: string
  startPrice: number | null
  totalUnits: number | null
  completionPercent: number | null
  viewCount: number
  favoriteCount: number
  isFeatured: boolean
  governorate: { name: string } | null
  city: { name: string } | null
  developer: { companyName: string }
}

const STATUS_LABEL_AR: Record<string, string> = {
  AVAILABLE: 'متاح',
  UNDER_CONSTRUCTION: 'تحت الإنشاء',
  COMING_SOON: 'قريب',
  DELIVERED: 'اتسلّم',
  SOLD_OUT: 'خلص',
}

export default function DashboardProjectsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { data: session } = useSession()
  const role = ((session?.user as { role?: string } | undefined)?.role) || ''
  const canSubmitMilestones = ['DEVELOPER', 'CEO', 'ADMIN'].includes(role)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => { setProjects(data.projects || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Reveal className="flex-1">
          <SectionHeader
            kicker={ar ? 'المحفظة العقارية' : 'Portfolio'}
            title={ar ? 'المشاريع' : 'Projects'}
            description={ar ? 'إدارة مشاريعك العقارية' : 'Manage your property projects'}
          />
        </Reveal>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={ar ? 'دوّر على المشاريع...' : 'Search projects...'} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {role === 'DEVELOPER' && (
          <Link
            href="/developer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-xs font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold/90"
          >
            <Plus className="h-4 w-4" /> {ar ? 'قدّم مشروع جديد' : 'Submit new project'}
          </Link>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">{ar ? 'بيحمّل...' : 'Loading...'}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">{ar ? 'مفيش مشاريع' : 'No projects found'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <Card key={project.id} className="card-hover border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Badge variant={
                    project.status === 'AVAILABLE' ? 'success' :
                    project.status === 'UNDER_CONSTRUCTION' ? 'info' : 'secondary'
                  }>
                    {ar ? STATUS_LABEL_AR[project.status] || project.status.replace(/_/g, ' ') : project.status.replace(/_/g, ' ')}
                  </Badge>
                  {project.isFeatured && <Badge variant="gold">{ar ? 'مميز' : 'Featured'}</Badge>}
                </div>
                <Link href={`/projects/${project.slug}`} className="font-semibold hover:text-estate-gold transition-colors">
                  {project.name}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {project.city?.name || project.governorate?.name || (ar ? 'غير متحدد' : 'N/A')} · {project.developer.companyName}
                </p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-semibold text-estate-gold">
                    {project.startPrice ? formatEGP(project.startPrice) : (ar ? 'غير متحدد' : 'N/A')}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{project.totalUnits || 0} {ar ? 'وحدات' : 'units'}</span>
                    <span>·</span>
                    <span>{project.viewCount.toLocaleString()} {ar ? 'مشاهدة' : 'views'}</span>
                  </div>
                </div>
                {project.completionPercent !== null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{ar ? 'نسبة الإنجاز' : 'Completion'}</span>
                      <span>{project.completionPercent}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-estate-gold" style={{ width: `${project.completionPercent}%` }} />
                    </div>
                  </div>
                )}
                {canSubmitMilestones && (
                  <div className="mt-3">
                    <MilestoneDialog projectId={project.id} projectName={project.name} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
