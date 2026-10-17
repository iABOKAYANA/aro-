import { Metadata } from 'next'
import AboutView from './about-view'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about GHAYA REAL ESTATE - the leading AI-powered real estate platform in Egypt.',
}

export default function AboutPage() {
  return <AboutView />
}
