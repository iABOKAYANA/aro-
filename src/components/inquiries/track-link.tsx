'use client'

import Link from 'next/link'
import { useFeatureFlag } from '@/components/flags/flags-provider'

/** Flag-gated "track your inquiry" link shown after a successful submit. */
export function TrackLink({ trackUrl, ar }: { trackUrl: string; ar: boolean }) {
  const enabled = useFeatureFlag('inquiry_tracking')
  if (!enabled) return null
  return (
    <Link
      href={trackUrl}
      className="mt-3 inline-block rounded-xl border border-estate-gold/40 px-4 py-2 text-sm text-estate-gold hover:bg-estate-gold/10"
    >
      {ar ? 'تتبع حالة استفسارك من هنا ←' : 'Track your inquiry here →'}
    </Link>
  )
}
