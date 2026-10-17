'use client'

import Link from 'next/link'
import { Smartphone } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'

/**
 * App-forward panel for the PUBLIC buyer site (zero login there).
 * Replaces every "sign in to …" buyer prompt on the public host:
 * accounts, saved searches, watch alerts and appointment history live in
 * the Ghaya mobile app — with contact as the anonymous alternative.
 * Console/`all` hosts keep their real sign-in flows; this never renders there.
 */
export function AppAccountPanel({ compact = false }: { compact?: boolean }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  if (compact) {
    return (
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {ar ? (
          <>
            الحسابات والتفضيلات في تطبيق غاية — حمّله وتابع من هناك. محتاج مساعدة؟{' '}
            <Link href="/contact" className="font-semibold text-estate-gold hover:underline">
              كلّمنا
            </Link>
          </>
        ) : (
          <>
            Accounts & saved stuff live in the Ghaya app — download it and pick up from there. Need help?{' '}
            <Link href="/contact" className="font-semibold text-estate-gold hover:underline">
              Contact us
            </Link>
          </>
        )}
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-estate-gold/25 bg-white/[0.04] p-10 text-center dark:border-[#D4A843]/25">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-estate-gold/10">
        <Smartphone className="h-7 w-7 text-estate-gold" />
      </div>
      <h2 className="mb-1 text-lg font-semibold">
        {ar ? 'حسابك في تطبيق غاية' : 'Your account lives in the Ghaya app'}
      </h2>
      <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">
        {ar
          ? 'الحسابات والتفضيلات في تطبيق غاية — حمّله وتابع من هناك. ولو محتاج أي مساعدة، كلّمنا أو ابعتلنا واتساب وهنظبطك.'
          : 'Accounts & saved stuff live in the Ghaya app — download it and pick up from there. Need a hand? Contact us or reach out on WhatsApp and we’ll sort you out.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/projects"
          className="rounded-full bg-estate-gold px-5 py-2.5 text-sm font-semibold text-[#0F1A2C] hover:brightness-110"
        >
          {ar ? 'تصفّح المشاريع' : 'Browse projects'}
        </Link>
        <Link
          href="/contact"
          className="rounded-full border border-estate-gold/40 px-5 py-2.5 text-sm font-semibold text-estate-gold transition-colors hover:bg-estate-gold hover:text-[#0F1A2C]"
        >
          {ar ? 'كلّمنا' : 'Contact us'}
        </Link>
      </div>
    </div>
  )
}
