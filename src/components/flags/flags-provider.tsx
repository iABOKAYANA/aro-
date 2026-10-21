'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Client-side mirror of the feature flags. The provider fetches the public
 * flags endpoint once on mount — then re-checks every 60s and whenever the
 * tab regains focus, so a switch the CEO flips lands on open tabs in seconds
 * (a closed feature disappears from in front of people, not just on reload).
 * `useFeatureFlag` reads the map. Every flag defaults to true so a fetch
 * failure never hides features (fail-open, same as the server).
 */

const FlagsContext = createContext<Record<string, boolean> | null>(null)

async function loadFlags(): Promise<Record<string, boolean> | null> {
  try {
    const r = await fetch('/api/feature-flags', { cache: 'no-store' })
    if (!r.ok) return null
    const d = await r.json()
    return d?.flags && typeof d.flags === 'object' ? (d.flags as Record<string, boolean>) : null
  } catch {
    return null
  }
}

export function FlagsProvider({ children, initial }: { children: ReactNode; initial?: Record<string, boolean> }) {
  const [flags, setFlags] = useState<Record<string, boolean> | null>(initial || null)

  useEffect(() => {
    let alive = true
    loadFlags().then((f) => {
      if (alive && f) setFlags(f)
    })
    // Re-check periodically + on focus so toggles propagate to open tabs.
    const interval = setInterval(() => {
      loadFlags().then((f) => {
        if (alive && f) setFlags(f)
      })
    }, 60_000)
    const onFocus = () => {
      loadFlags().then((f) => {
        if (alive && f) setFlags(f)
      })
    }
    window.addEventListener('focus', onFocus)
    const onVis = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>
}

/** Read one flag on the client. Defaults to true until/unless the API says off. */
export function useFeatureFlag(key: string): boolean {
  const flags = useContext(FlagsContext)
  if (!flags || !(key in flags)) return true
  return flags[key] === true
}
