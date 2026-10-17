'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

export default function AuthErrorPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4">
      <div className="mashrabiya pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
      <Reveal className="relative text-center">
        <p className="section-kicker">{ar ? 'غاية' : 'GHAYA'}</p>
        <h1 className="font-display display-2 mt-3 text-red-600 dark:text-red-400">{ar ? 'في مشكلة في الدخول' : 'Authentication Error'}</h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          {ar ? 'حصلت مشكلة وانت بتسجّل الدخول. جرّب تاني.' : 'Something went wrong during authentication. Please try again.'}
        </p>
        <hr className="gold-hairline mx-auto my-6 max-w-xs" />
        <Link
          href="/auth/login"
          className="gold-shimmer mt-6 inline-block rounded-full bg-estate-gold px-6 py-3 font-medium text-white hover:bg-estate-gold-dark transition-colors"
        >
          {ar ? 'ارجع للدخول' : 'Back to Login'}
        </Link>
      </Reveal>
    </div>
  )
}
