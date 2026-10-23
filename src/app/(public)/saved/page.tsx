import type { Metadata } from 'next'
import { SavedClient } from './saved-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Saved Projects',
  description: 'Your saved GHAYA REAL ESTATE projects — all in one place.',
  robots: { index: false, follow: false },
}

export default function SavedPage() {
  return <SavedClient />
}
