'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'

/**
 * Reader-respecting chat auto-scroll.
 *
 * 1. NEVER scrolls on mount/open — the page opens where the user is
 *    (the old mount-run scrollIntoView yanked every visitor to the bottom).
 * 2. Scrolls the chat PANEL only (`container.scrollTop`). `scrollIntoView`
 *    also scrolls every ancestor — that is the "the whole page jumps down"
 *    bug on both open and every streamed token.
 * 3. Follows new content only while the reader is already near the bottom;
 *    scrolling up to read stops the yanking until they return.
 * 4. The user's own send re-sticks (their fresh message deserves the follow).
 */
export function useChatAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  deps: Array<unknown>,
) {
  const firstRun = useRef(true)
  const stick = useRef(true)

  // Track whether the reader is at the panel's bottom (their own scrolling).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef])

  // Follow new messages/tokens — container-only, never the page.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const el = containerRef.current
    if (!el || !stick.current) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  /** Call when the user sends — their message re-sticks the follow. */
  const restick = useCallback(() => {
    stick.current = true
  }, [])

  return { restick }
}
