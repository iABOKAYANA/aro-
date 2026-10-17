import { requireCEO } from '@/lib/ceo-auth'
import CEOSidebar from './components/ceo-sidebar'
import CeoHeader from './components/ceo-header'

export default async function CEOLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { session } = await requireCEO()
  const user = session.user

  return (
    <div className="flex h-screen overflow-hidden bg-card dark:bg-black">
      <CEOSidebar userName={user?.name} userEmail={user?.email} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-border dark:border-[#262626] bg-card dark:bg-black/80 px-6 backdrop-blur-xl">
          <CeoHeader />
        </header>

        <main className="relative flex-1 overflow-y-auto bg-card dark:bg-black p-6">
          <div aria-hidden="true" className="mashrabiya pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  )
}
