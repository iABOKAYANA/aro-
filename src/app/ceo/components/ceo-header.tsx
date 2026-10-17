'use client'

import { Search, Calendar, Zap } from 'lucide-react'
import CeoNotifications from './ceo-notifications'
import NotificationBell from '@/components/notification-bell'
import { useLanguage } from '@/lib/language-context'

// Client-side header content for the CEO layout (server layout can't read lang).
export default function CeoHeader() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const today = new Date().toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      <div className="flex items-center gap-3">
        <Calendar className="h-4 w-4 text-gray-500" />
        <span className="text-sm text-gray-400">{today}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder={ar ? 'دوّر…' : 'Search...'}
            className="w-40 bg-transparent text-sm text-gray-300 outline-none placeholder:text-muted-foreground"
          />
        </div>

        <CeoNotifications />

        <NotificationBell linkHref="/ceo/deals" />

        <button className="gold-shimmer flex items-center gap-2 rounded-full bg-gradient-to-r from-estate-gold to-estate-gold-dark px-3 py-1.5 text-sm font-semibold text-[#0F1A2C] shadow-lg shadow-estate-gold/20 transition-all hover:shadow-estate-gold/30">
          <Zap className="h-4 w-4" />
          {ar ? 'إجراء سريع' : 'Quick Action'}
        </button>
      </div>
    </>
  )
}
