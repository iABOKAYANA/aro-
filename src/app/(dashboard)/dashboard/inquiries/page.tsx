'use client'

import { useState, useEffect } from 'react'
import { Search, MessageSquare, Phone, Mail } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

interface Inquiry {
  id: string
  name: string
  email: string | null
  phone: string
  message: string | null
  type: string
  status: string
  source: string
  createdAt: string
  unit: { name: string } | null
}

const statusColors: Record<string, string> = {
  NEW: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400',
  CONTACTED: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400',
  QUALIFIED: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  SCHEDULED: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-400',
  CONVERTED: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  LOST: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-gray-300',
}

const STATUS_LABEL_AR: Record<string, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  QUALIFIED: 'مؤهل',
  SCHEDULED: 'متحدد له معاد',
  CONVERTED: 'اتحوّل لعميل',
  LOST: 'ضاع',
  CLOSED: 'مقفول',
}

const TYPE_LABEL_AR: Record<string, string> = {
  GENERAL: 'عام',
  VIEWING: 'معاينة',
  CALLBACK: 'كلمني',
  PURCHASE: 'شرا',
  RENT: 'إيجار',
  INVESTMENT: 'استثمار',
}

const SOURCE_LABEL_AR: Record<string, string> = {
  WEBSITE: 'الموقع',
  DIRECT_CALL: 'مكالمة مباشرة',
  REFERRAL: 'ترشيح',
  SOCIAL_MEDIA: 'سوشيال ميديا',
}

export default function DashboardInquiriesPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/inquiries')
      .then((r) => r.json())
      .then((data) => { setInquiries(data.inquiries || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = inquiries.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) || i.phone.includes(search)
  )

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker={ar ? 'تواصل العملا' : 'Client messages'}
          title={ar ? 'الاستفسارات' : 'Inquiries'}
          description={ar ? 'إدارة استفسارات العملا' : 'Manage customer inquiries'}
        />
      </Reveal>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={ar ? 'دوّر في الاستفسارات...' : 'Search inquiries...'} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">{ar ? 'بيحمّل...' : 'Loading...'}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">{ar ? 'لسه مفيش استفسارات' : 'No inquiries yet'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((inquiry) => (
            <Card key={inquiry.id} className="card-hover border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{inquiry.name}</h3>
                      <Badge className={statusColors[inquiry.status] || ''}>{ar ? STATUS_LABEL_AR[inquiry.status] || inquiry.status.replace(/_/g, ' ') : inquiry.status}</Badge>
                      <Badge variant="secondary">{ar ? TYPE_LABEL_AR[inquiry.type] || inquiry.type.replace(/_/g, ' ') : inquiry.type.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{inquiry.phone}</span>
                      {inquiry.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{inquiry.email}</span>}
                    </div>
                    {inquiry.message && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{inquiry.message}</p>}
                    {inquiry.unit && <p className="mt-1 text-xs text-muted-foreground">{ar ? `بخصوص: ${inquiry.unit.name}` : `Regarding: ${inquiry.unit.name}`}</p>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{ar ? `المصدر: ${SOURCE_LABEL_AR[inquiry.source] || inquiry.source.replace(/_/g, ' ')}` : `Source: ${inquiry.source.replace(/_/g, ' ')}`}</p>
                    <p>{new Date(inquiry.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
