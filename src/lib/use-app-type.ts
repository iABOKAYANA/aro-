'use client'

import { useEffect, useState } from 'react'
import { getAppType, type AppType } from '@/lib/app-type'

/**
 * Host-derived app type for deep client components (no prop drilling).
 *
 * Source of truth is the `data-app-type` stamp the root layout writes on
 * `<body>` server-side (same derive as middleware). Falls back to the
 * hostname rule when the stamp is absent (e.g. tests). `null` until mounted
 * so the first client paint matches SSR — callers must treat `null` as
 * "not resolved yet" and render nothing auth-related until then.
 */
export function useAppType(): AppType | null {
  const [appType, setAppType] = useState<AppType | null>(null)

  useEffect(() => {
    const stamped = document.body?.dataset?.appType
    if (stamped === 'public' || stamped === 'console' || stamped === 'all') {
      setAppType(stamped)
      return
    }
    setAppType(getAppType(window.location.host))
  }, [])

  return appType
}

/** True only once resolved on the PUBLIC buyer host. */
export function useIsPublicSite(): boolean {
  return useAppType() === 'public'
}
