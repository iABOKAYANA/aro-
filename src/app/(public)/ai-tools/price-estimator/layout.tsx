import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Property Price Estimator',
  description: 'Get AI-powered property valuations for any property in Egypt. Estimate fair market value based on area, location, and comparable sales.',
}

export default function PriceEstimatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
