'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type RevealProps = {
  children: ReactNode
  /** Extra classes merged onto the wrapper. */
  className?: string
  /** Transition delay in ms (stagger siblings: 0 / 80 / 160 …). */
  delay?: number
  /** Vertical travel distance in px. Default 24. Ignored by `wipe`. */
  distance?: number
  /** `rise` (default fade + rise) or `wipe` (dramatic clip-path reveal). */
  variant?: 'rise' | 'wipe'
  as?: 'div' | 'section' | 'span'
}

// Tiny scroll-reveal: fades + rises content on first intersection, once.
// Reduced-motion safe: renders visible immediately, no observer work.
// Usage: <Reveal delay={80}><h2 className="display-2">…</h2></Reveal>
// Wipe usage: <Reveal variant="wipe"><img … /></Reveal> (best on imagery)
// Import: import { Reveal } from '@/components/design/Reveal'
export function Reveal({ children, className, delay = 0, distance = 24, variant = 'rise', as = 'div' }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const Tag = as as 'div'
  const style: CSSProperties = {
    ['--reveal-distance' as string]: `${distance}px`,
    ...(visible && delay > 0 ? { transitionDelay: `${delay}ms` } : null),
  }

  return (
    <Tag ref={ref} style={style} className={cn('reveal', variant === 'wipe' && 'reveal-wipe', visible && 'reveal-visible', className)}>
      {children}
    </Tag>
  )
}
