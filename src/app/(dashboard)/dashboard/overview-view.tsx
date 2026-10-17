'use client'

import Link from 'next/link'
import { Building2, Users, MessageSquare, Brain, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'
import LeadProtectionSummary from '@/components/lead-protection-summary'

export type OverviewStatKey = 'projects' | 'units' | 'inquiries' | 'leads'

const STAT_ICONS = {
  projects: Building2,
  units: Eye,
  inquiries: MessageSquare,
  leads: Users,
} as const

export default function DashboardOverviewView({
  stats,
  isBroker,
  showLeads,
}: {
  stats: Array<{ key: OverviewStatKey; value: number }>
  isBroker: boolean
  showLeads: boolean
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const labelFor = (key: OverviewStatKey): string => {
    switch (key) {
      case 'projects':
        return ar ? 'إجمالي المشاريع' : 'Total Projects'
      case 'units':
        return ar ? 'الوحدات المتاحة' : 'Available Units'
      case 'inquiries':
        return ar ? 'الاستفسارات' : 'Inquiries'
      case 'leads':
        return ar ? (isBroker ? 'الليدز بتوعي' : 'الليدز') : isBroker ? 'My Leads' : 'Leads'
    }
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker={ar ? 'لوحة تحكم غاية' : 'GHAYA dashboard'}
          title={ar ? 'نظرة عامة' : 'Overview'}
          description={ar ? 'أهلاً بيك في لوحة تحكم غاية' : 'Welcome to your GHAYA dashboard'}
        />
      </Reveal>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = STAT_ICONS[stat.key]
          return (
            <Reveal key={stat.key} delay={Math.min(index, 4) * 80}>
            <Card className="border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{labelFor(stat.key)}</p>
                    <p className="font-display mt-1 text-3xl">{stat.value.toLocaleString('en-US')}</p>
                  </div>
                  <div className="rounded-2xl bg-estate-gold/10 p-3">
                    <Icon className="h-6 w-6 text-estate-gold" />
                  </div>
                </div>
              </CardContent>
            </Card>
            </Reveal>
          )
        })}
      </div>

      <hr className="gold-hairline" />

      {showLeads && <LeadProtectionSummary />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal>
        <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <CardHeader>
            <CardTitle className="font-display">{ar ? 'إجراءات سريعة' : 'Quick Actions'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/projects"><Building2 className="mr-2 h-4 w-4" /> {ar ? 'اتفرج على المشاريع' : 'Browse Projects'}</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/dashboard/inquiries"><MessageSquare className="mr-2 h-4 w-4" /> {ar ? 'شوف الاستفسارات' : 'View Inquiries'}</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/ai-tools"><Brain className="mr-2 h-4 w-4" /> {ar ? 'أدوات الذكاء الاصطناعي' : 'AI Tools'}</Link>
            </Button>
          </CardContent>
        </Card>
        </Reveal>

        <Reveal delay={120}>
        <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <CardHeader>
            <CardTitle className="font-display">{ar ? 'إحصائيات المنصة' : 'Platform Stats'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {ar
                ? 'انت بتتصفح لوحة تحكم غاية للعقارات. استخدم القايمة الجانبية عشان تتنقل بين الأقسام المختلفة.'
                : 'You\u2019re browsing the GHAYA REAL ESTATE dashboard. Use the sidebar to navigate to different sections.'}
            </p>
          </CardContent>
        </Card>
        </Reveal>
      </div>
    </div>
  )
}
