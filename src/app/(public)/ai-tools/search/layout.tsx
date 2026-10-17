import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI Property Search',
  description: 'Search Egyptian properties using natural language with our AI-powered search. Describe what you want and get instant results.',
}

export default function AISearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
