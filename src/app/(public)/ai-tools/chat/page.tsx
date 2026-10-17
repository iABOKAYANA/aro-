import { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { SearchProvider } from '@/components/search/search-context'
// Chat widget (+ property grid / comparison table / payment breakdown)
// splits out; still server-rendered via default SSR.
const FullPageChat = dynamic(
  () => import('@/components/search/full-page-chat').then((mod) => mod.FullPageChat)
)

export const metadata: Metadata = {
  title: 'AI Property Assistant | GHAYA REAL ESTATE',
  description: 'Chat with our AI assistant for personalized property recommendations.',
}

export default function AIChatPage() {
  return (
    <div className="h-[calc(100vh-4rem)] h-[calc(100dvh-4rem)] sm:h-[calc(100vh-4rem)] sm:h-[calc(100dvh-4rem)]">
      <SearchProvider>
        <FullPageChat />
      </SearchProvider>
    </div>
  )
}
