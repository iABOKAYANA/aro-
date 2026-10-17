'use client'

import { useState } from 'react'
import {
  BarChart3, Handshake, DollarSign, Shield, Building2, Settings, Scale,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import OverviewTab from './components/overview-tab'
import DealsTab from './components/deals-tab'
import CommissionsTab from './components/commissions-tab'
import ProtectionTab from './components/protection-tab'
import PartnershipsTab from './components/partnerships-tab'
import SettingsTab from './components/settings-tab'
import DisputesPanel from './components/disputes-panel'
import { Reveal } from '@/components/design'

const TABS = [
  { key: 'overview', label: 'Overview', ar: 'نظرة عامة', icon: BarChart3 },
  { key: 'deals', label: 'Deals', ar: 'الصفقات', icon: Handshake },
  { key: 'commissions', label: 'Commissions', ar: 'العمولات', icon: DollarSign },
  { key: 'protection', label: 'Protection', ar: 'الحماية', icon: Shield },
  { key: 'partnerships', label: 'Partnerships', ar: 'الشراكات', icon: Building2 },
  { key: 'disputes', label: 'Disputes', ar: 'النزاعات', icon: Scale },
  { key: 'settings', label: 'Settings', ar: 'الإعدادات', icon: Settings },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function CeoDealsPage() {
  const [tab, setTab] = useState<TabKey>('overview')
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الصفقات والنمو' : 'CEO Console · Deals'}</p>
          <h1 className="font-display display-3 text-foreground">
            {ar ? <>حماية الليدز <span className="text-estate-gold">و</span> مركز الصفقات</> : <>Lead Protection <span className="text-estate-gold">&amp;</span> Deal Center</>}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {ar ? 'الليدز • الصفقات • العمولات • الحماية • الشراكات — مطبقة من السيرفر ومتسجلة في التدقيق' : 'Leads • Deals • Commissions • Protection • Partnerships — server-enforced, audit-logged'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-1.5">
        {TABS.map((item) => {
          const active = tab === item.key
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
                active
                  ? 'bg-estate-gold/15 text-estate-gold shadow-[inset_0_0_20px_rgba(212,168,67,0.05)]'
                  : 'text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-gray-200'
              )}
            >
              <item.icon className={cn('h-4 w-4', active ? 'text-estate-gold' : 'text-gray-500')} />
              <span>{ar ? item.ar : item.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'deals' && <DealsTab />}
      {tab === 'commissions' && <CommissionsTab />}
      {tab === 'protection' && <ProtectionTab />}
      {tab === 'partnerships' && <PartnershipsTab />}
      {tab === 'disputes' && <DisputesPanel />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}
