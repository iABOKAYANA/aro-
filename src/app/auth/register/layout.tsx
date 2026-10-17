import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your GHAYA REAL ESTATE account. Access AI-powered property search, save favorites, and connect with brokers.',
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
