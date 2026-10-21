'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Client-side mirror of the feature flags. The provider fetches the public
 * flags endpoint once on mount; `useFeatureFlag` reads it. Every flag defaults
 * to true so a fetch failure never hides features (fail-open, same as server).
 */

const FlagsContext = createContext<Record<string, boolean> | null>(null)

export function FlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/feature-flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.flags) setFlags(d.flags as Record<string, boolean>)
      })
      .catch(() => {})
    return () => {
      alive = false
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
