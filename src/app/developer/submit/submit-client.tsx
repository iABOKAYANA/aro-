'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Plus } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { SubmitProjectForm, type ProjectRow } from '@/components/portal/developer-portal'

export default function DeveloperSubmitClient() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [created, setCreated] = useState<ProjectRow | null>(null)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
        <Link
          href="/developer"
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-estate-gold/60 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          {ar ? 'رجوع لبوابة المطور' : 'Back to developer portal'}
        </Link>

        {created ? (
          <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.06] p-8 text-center sm:p-12">
            <BadgeCheck className="mx-auto h-14 w-14 text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">
              {ar ? `«${created.name}» اتبعت للمراجعة` : `“${created.name}” sent for review`}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-500 sm:text-base dark:text-gray-400">
              {ar
                ? 'المشروع نزل PENDING ومش هيظهر للناس إلا بعد ما الإدارة توافق عليه. هتلاقيه في قايمة تقديماتك في بوابة المطور.'
                : 'The project is now PENDING and stays invisible to the public until management approves it. You’ll find it in your submissions list in the developer portal.'}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/developer"
                className="inline-flex items-center gap-1.5 rounded-2xl bg-estate-gold px-8 py-3.5 text-sm font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold/90"
              >
                {ar ? 'رجوع لتقديماتي' : 'Back to my submissions'}
              </Link>
              <button
                type="button"
                onClick={() => setCreated(null)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-8 py-3.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-estate-gold/60 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:text-white"
              >
                <Plus className="h-4 w-4" />
                {ar ? 'قدّم مشروع تاني' : 'Submit another project'}
              </button>
            </div>
          </div>
        ) : (
          <SubmitProjectForm onCreated={setCreated} />
        )}
      </div>
    </div>
  )
}
