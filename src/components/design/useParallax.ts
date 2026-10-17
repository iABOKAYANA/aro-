'use client'

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

type UseParallaxResult<T extends HTMLElement> = {
  /** Attach to the layer to drift (add `data-parallax` alongside it). */
  ref: RefObject<T | null>
  /** Pass to the same element's `style` — carries `--parallax-y`. */
  style: CSSProperties
}

// Tiny scroll-parallax: drifts the attached layer at `speed` × scroll offset.
// rAF-throttled scroll/resize listeners, passive. Reduced-motion → static.
// SSR-safe: identical first paint (style starts at 0px on server AND first
// client render); listeners engage only post-mount via the mounted gate, so
// there is no hydration mismatch and no `window` read during render.
// Consumes the existing `[data-parallax]` rule in globals.css, which maps
// --parallax-y to a GPU-cheap translate3d.
// Usage:
//   const { ref, style } = useParallax<HTMLDivElement>(0.25)
//   <div ref={ref} style={style} data-parallax className="kenburns absolute inset-0">…</div>
// Import: import { useParallax } from '@/components/design/useParallax'
export function useParallax<T extends HTMLElement>(speed = 0.25): UseParallaxResult<T> {
  const ref = useRef<T | null>(null)
  const [mounted, setMounted] = useState(false)
  const [y, setY] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let ticking = false
    const update = () => {
      ticking = false
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const offset = rect.top + rect.height / 2 - window.innerHeight / 2
      setY(Math.round(offset * speed * -1))
    }
    const requestUpdate = () => {
      if (ticking) return
      ticking = true
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => {
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      cancelAnimationFrame(raf)
    }
  }, [mounted, speed])

  return {
    ref,
    style: { ['--parallax-y' as string]: `${y}px` } as CSSProperties,
  }
}
