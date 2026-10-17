import { Metadata } from 'next'
import CookiesView from './cookies-view'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'GHAYA REAL ESTATE cookie policy - how we use cookies and similar technologies.',
}

export default function CookiesPage() {
  return <CookiesView />
}
