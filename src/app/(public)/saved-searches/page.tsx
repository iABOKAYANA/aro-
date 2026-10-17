import { Metadata } from 'next'
import { languageAlternates } from '@/lib/site'
import SavedSearchesView from './saved-searches-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Saved Searches & Alerts',
  description:
    'Manage your saved property searches and get notified as soon as a matching project goes live.',
  alternates: languageAlternates('/saved-searches'),
  robots: { index: false },
}

export default function SavedSearchesPage() {
  return <SavedSearchesView />
}
