import { Metadata } from 'next'
import AIToolsView from './ai-tools-view'

export const metadata: Metadata = {
  title: 'AI Tools | GHAYA REAL ESTATE',
  description: 'Powerful AI tools to help you find, analyze, and invest in Egyptian real estate.',
}

export default function AIToolsPage() {
  return <AIToolsView />
}
