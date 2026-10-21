'use client'

import Link from 'next/link'
import { FileText } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { useFeatureFlag } from '@/components/flags/flags-provider'

/** Flag-gated link to the printable one-pager card for this unit. */
export function UnitCardPdfLink({ slug }: { slug: string }) {
  const enabled = useFeatureFlag('unit_card_pdf')
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  if (!enabled) return null
  return (
    <Link
      href={`/units/${slug}/card`}
      target="_blank"
      rel="noreferrer"
      className="mb-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border hover:border-estate-gold/50 text-sm md:min-h-0"
    >
      <FileText className="h-4 w-4" />
      {ar ? 'بطاقة الوحدة (للطباعة PDF)' : 'Unit card (print / PDF)'}
    </Link>
  )
}
