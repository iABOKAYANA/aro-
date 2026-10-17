import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Investment Calculator',
  description: 'Calculate ROI, rental yields, cash-on-cash returns, and property appreciation for Egyptian real estate investments.',
}

export default function InvestmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
