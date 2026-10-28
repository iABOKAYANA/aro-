'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/language-context'
import { useCompare } from '@/lib/compare'
import { cn } from '@/lib/utils'

const HIDDEN_PREFIXES = ['/ceo', '/dashboard', '/auth', '/ai-tools/chat']

type CtaConfig = {
  enabled: boolean
  whatsappNumber: string
  messageEn: string
  messageAr: string
  labelEn: string
  labelAr: string
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

/**
 * Global WhatsApp CTA bubble — mounted once in <Providers/> so every
 * public page inherits it. Placement stacks ABOVE the "Ask EYN" FAB on the
 * SAME side (EYN sits bottom-6, this bubble bottom-24) so it never collides
 * with the back-to-top button or the FloatingContactCta pills, which live on
 * the opposite side: contact/back-to-top bottom-6..bottom-40 on one side,
 * EYN + WhatsApp bottom-6/bottom-24 on the other. RTL mirrors both stacks.
 * Hidden on console/auth/chat routes, when disabled, or when no valid number
 * is configured. Pure wa.me deep link, no prefetch.
 */
export function WhatsAppBubble() {
  const pathname = usePathname() || ''
  const { lang } = useLanguage()
  const isRtl = lang === 'ar'
  const [cta, setCta] = useState<CtaConfig | null>(null)
  const { items } = useCompare()
  const trayUp = items.length > 0

  useEffect(() => {
    let cancelled = false
    fetch('/api/public-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.cta) setCta(data.cta as CtaConfig)
      })
      .catch(() => {
        /* fail-soft: bubble simply stays hidden */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null
  if (!cta?.enabled) return null
  const digits = (cta.whatsappNumber || '').replace(/\D/g, '')
  if (digits.length < 7) return null

  const message = (isRtl ? cta.messageAr || cta.messageEn : cta.messageEn || cta.messageAr) || ''
  const label = (isRtl ? cta.labelAr || cta.labelEn : cta.labelEn || cta.labelAr) || 'WhatsApp'
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={cn(
        'group fixed z-[60] flex h-14 w-14 max-sm:h-14 max-sm:w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl ring-1 ring-black/10 transition-transform duration-300 hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none dark:ring-white/20 bottom-[max(6rem,calc(env(safe-area-inset-bottom)+4.5rem))]',
        // Compare tray showing → keep one slot above عين's lifted slot.
        trayUp && 'max-sm:bottom-[max(12.5rem,calc(env(safe-area-inset-bottom)+11rem))]',
        isRtl ? 'left-6' : 'right-6'
      )}
    >
      <WhatsAppGlyph className="h-6 w-6" />
      <span
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-[#25D366]/30 bg-card px-3 py-1.5 text-xs font-semibold text-foreground opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100',
          isRtl ? 'left-full ml-3' : 'right-full mr-3'
        )}
      >
        {label}
      </span>
    </a>
  )
}
