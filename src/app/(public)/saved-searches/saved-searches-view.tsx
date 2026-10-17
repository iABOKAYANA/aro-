'use client'

import Link from 'next/link'
import SavedSearchesList from '@/components/saved-searches/saved-searches-list'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

export default function SavedSearchesView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="container px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <Reveal className="flex-1">
              <SectionHeader
                kicker={ar ? 'تنبيهات' : 'Alerts'}
                title={ar ? 'عمليات البحث المحفوظة' : 'Saved searches'}
                description={
                  ar
                    ? 'احنا بنراقب السوق عشانك وبنبعتلك تنبيه جوه التطبيق أول ما مشروع جديد يطابق واحد من دول.'
                    : 'We watch the market for you and send an in-app notification the moment a new project matches one of these.'
                }
              />
            </Reveal>
            <Link
              href="/projects"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10"
            >
              {ar ? 'ارجع للمشاريع' : 'Back to projects'}
            </Link>
          </div>

          <SavedSearchesList />
        </div>
      </div>
    </div>
  )
}
