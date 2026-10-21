'use client'

import { useEffect } from 'react'
import { captureVisitSource } from '@/lib/visit-source'

/** Mounts once per app: records first-touch attribution (utm/referrer/landing). */
export function VisitSourceTracker() {
  useEffect(() => {
    captureVisitSource()
  }, [])
  return null
}
