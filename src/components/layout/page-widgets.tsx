'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ArrowUp, Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { cn } from '@/lib/utils'
import { FloatingContactCta } from '@/components/layout/floating-contact-cta'

const HIDDEN_PREFIXES = ['/ceo', '/dashboard', '/auth', '/ai-tools/chat']

/** Global page widgets: scroll progress bar, back-to-top, and the floating "Ain" AI shortcut. */
export function PageWidgets() {
  const pathname = usePathname() || ''
  const { lang } = useLanguage()
  const isRtl = lang === 'ar'
  const [progress, setProgress] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      setProgress(max > 0 ? (doc.scrollTop / max) * 100 : 0)
      setScrolled(doc.scrollTop > 600)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null

  // Project/unit detail pages render a sticky mobile booking bar (~80px tall,
  // lg:hidden). Lift the bottom widgets above it on small screens so the
  // "Ask Ain" bubble and back-to-top never cover the booking CTA. Desktop
  // (lg:) keeps the exact same position as every other page.
  const hasStickyBar = /^\/(projects|units)\/[^/]+\/?$/.test(pathname)
  const bottomPos = hasStickyBar
    ? 'bottom-[max(6rem,calc(env(safe-area-inset-bottom)+4.5rem))] lg:bottom-[max(1.5rem,env(safe-area-inset-bottom))]'
    : 'bottom-[max(1.5rem,env(safe-area-inset-bottom))]'

  return (
    <>
      {/*1 · Scroll progress bar */}
      <div
        className={cn(
          'fixed top-0 z-[60] h-[3px] bg-gradient-to-r from-estate-gold-dark via-estate-gold to-estate-gold-light transition-[width] duration-150 ease-out',
          isRtl ? 'right-0' : 'left-0'
        )}
        style={{ width: `${progress}%` }}
        aria-hidden
      />

      {/*2 · Back to top */}
      <button
        type="button"
        aria-label={isRtl ? 'الرجوع لأعلى الصفحة' : 'Back to top'}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={cn(
          'fixed z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-estate-gold text-[#0F1A2C] shadow-lg shadow-estate-gold/30 transition-all duration-300 hover:bg-estate-gold-dark',
          bottomPos,
          isRtl ? 'right-6' : 'left-6',
          scrolled ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        )}
      >
        <ArrowUp className="h-5 w-5" />
      </button>

      {/*3 · Floating "Ask Ain" AI shortcut */}
      {pathname !== '/ai-tools/chat' && (
        <Link
          href="/ai-tools/chat"
          aria-label={isRtl ? 'اسأل مساعدك العقاري «عين»' : 'Ask your real-estate assistant Ain'}
          className={cn(
            'group fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-estate-navy text-estate-gold shadow-xl ring-1 ring-estate-gold/40 transition-all duration-300 hover:bg-estate-gold hover:text-estate-navy dark:bg-black dark:hover:bg-estate-gold dark:hover:text-black',
            bottomPos,
            isRtl ? 'left-6' : 'right-6'
          )}
        >
          <Sparkles className="h-6 w-6" />
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-estate-gold/30 bg-card px-3 py-1.5 text-xs font-semibold text-foreground opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100',
              isRtl ? 'left-full ml-3' : 'right-full mr-3'
            )}
          >
            {isRtl ? 'اسأل «عين»' : 'Ask “Ain”'}
          </span>
        </Link>
      )}

      {/*4 · Floating contact CTAs (WhatsApp + call). Hidden until the CEO sets a number. */}
      <FloatingContactCta />
    </>
  )
}
