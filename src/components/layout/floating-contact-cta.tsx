'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Phone } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { toTelHref, toWhatsAppHref } from '@/lib/contact-cta'
import { cn } from '@/lib/utils'

/**
 * Floating contact CTAs — the WhatsApp bubble + the phone-call button.
 * Mounted inside PageWidgets, so it shows on all public pages and stays
 * hidden on /ceo, /dashboard and /auth. Hidden-until-set: renders nothing
 * unless GET /api/public-config returns a non-empty cta number.
 * Stacked vertically above the "Ask Ain" bubble on the same side, so the
 * buttons never overlap each other, Ain, or back-to-top. RTL-safe.
 * Hover/focus expands each pill (CSS-only max-width transition, fixed
 * positioning so page content never shifts) to reveal its number, always
 * LTR. Touch: tap follows the link as before.
 */
export function FloatingContactCta() {
  const { lang } = useLanguage()
  const isRtl = lang === 'ar'
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/public-config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return
        const cta = data?.cta
        if (cta && typeof cta === 'object') {
          if (typeof cta.phone === 'string') setPhone(cta.phone.trim())
          if (typeof cta.whatsapp === 'string') setWhatsapp(cta.whatsapp.trim())
        }
      })
      .catch(() => {
        /* fail-soft: stay hidden */
      })
    return () => {
      alive = false
    }
  }, [])

  const items = (
    [
      {
        key: 'whatsapp',
        number: whatsapp,
        href: toWhatsAppHref(whatsapp),
        label: isRtl ? `كلمنا واتساب — ${whatsapp}` : `Chat on WhatsApp — ${whatsapp}`,
        Icon: MessageCircle,
        external: true,
      },
      {
        key: 'phone',
        number: phone,
        href: toTelHref(phone),
        label: isRtl ? 'اتصل بينا' : 'Call us',
        Icon: Phone,
        external: false,
      },
    ] as const
  ).filter((b) => b.href !== null)

  if (items.length === 0) return null

  return (
    <>
      {items.map((b, i) => (
        <a
          key={b.key}
          href={b.href as string}
          {...(b.external ? { target: '_blank', rel: 'noopener' } : {})}
          aria-label={b.label}
          className={cn(
            'group fixed z-[60] flex h-12 max-w-[3rem] items-center overflow-hidden whitespace-nowrap rounded-full bg-estate-navy text-estate-gold shadow-xl ring-1 ring-estate-gold/40 transition-all duration-300 hover:max-w-[260px] hover:bg-estate-gold hover:text-estate-navy focus-visible:max-w-[260px] focus-visible:bg-estate-gold focus-visible:text-estate-navy focus-within:max-w-[260px] focus-within:bg-estate-gold focus-within:text-estate-navy dark:bg-black dark:hover:bg-estate-gold dark:hover:text-black dark:focus-visible:bg-estate-gold dark:focus-visible:text-black dark:focus-within:bg-estate-gold dark:focus-within:text-black',
            isRtl ? 'right-6' : 'left-6',
            i === 0 ? 'bottom-[max(6rem,calc(env(safe-area-inset-bottom)+4.5rem))]' : 'bottom-[max(10rem,calc(env(safe-area-inset-bottom)+8.5rem))]'
          )}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center">
            <b.Icon className="h-5 w-5 shrink-0" />
          </span>
          <span
            dir="ltr"
            className="max-w-0 overflow-hidden text-sm font-semibold tabular-nums opacity-0 transition-all duration-300 group-hover:me-4 group-hover:max-w-[200px] group-hover:opacity-100 group-focus-visible:me-4 group-focus-visible:max-w-[200px] group-focus-visible:opacity-100 group-focus-within:me-4 group-focus-within:max-w-[200px] group-focus-within:opacity-100"
          >
            {b.number}
          </span>
        </a>
      ))}
    </>
  )
}
