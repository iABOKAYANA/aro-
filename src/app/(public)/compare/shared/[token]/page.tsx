import { Metadata } from 'next'
import Link from 'next/link'
import { GitCompareArrows, Link2Off } from 'lucide-react'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { Reveal } from '@/components/design'
import CompareView from '../../compare-view'

export const dynamic = 'force-dynamic'

const TOKEN_RE = /^[A-Za-z0-9_-]{7,128}$/

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function loadShared(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const row = await db.sharedComparison.findUnique({ where: { token } })
  if (!row) return null
  const projectIds = parseIds(row.projectIds).slice(0, 4)
  if (projectIds.length === 0) return null
  // Names for the WhatsApp-friendly title — only live, visible, priced projects.
  const projects = await db.project.findMany({
    where: {
      id: { in: projectIds },
      ...PUBLIC_PROJECT_WHERE,
    },
    select: { id: true, name: true, coverImage: true },
  })
  const byId = new Map(projects.map((p) => [p.id, p]))
  const live = projectIds.map((id) => byId.get(id)).filter((p) => p !== undefined)
  if (live.length === 0) return null
  return { projectIds, live: live as { id: string; name: string; coverImage: string | null }[] }
}

export async function generateMetadata({
  params,
}: {
  params: { token: string }
}): Promise<Metadata> {
  const shared = await loadShared(params.token).catch(() => null)
  if (!shared) {
    return { title: 'Shared comparison', robots: { index: false } }
  }
  const names = shared.live.map((p) => p.name).join(' × ')
  const description = `حد بعتلك مقارنة بين ${shared.live.map((p) => p.name).join(' و ')} على غاية — قارن الأسعار وخطط السداد والمرافق جنب بعض.`
  const image = shared.live.map((p) => p.coverImage).find((src) => src?.startsWith('http'))
  return {
    title: `${names} — مقارنة متشيّرة`,
    description,
    robots: { index: false },
    openGraph: {
      title: `مقارنة مشاريع: ${names} | GHAYA`,
      description,
      url: `/compare/shared/${params.token}`,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  }
}

/** Friendly dead-link panel — never a raw error, in either language. */
function DeadLink() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center sm:p-10">
      <Link2Off className="mx-auto h-8 w-8 text-gray-500" />
      <h2 className="font-display mt-4 text-2xl font-semibold text-white">اللينك ده مش شغال</h2>
      <p className="mt-1 text-sm text-gray-500">This share link doesn&apos;t work</p>
      <p className="mt-2 text-sm text-gray-400">
        يمكن اتمسح — اختار مشاريع واعمل مقارنة جديدة.
        <br />
        It may have been deleted — pick projects and start a fresh comparison.
      </p>
      <Link
        href="/compare"
        className="gold-shimmer mt-6 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-estate-gold px-5 py-2 text-sm font-semibold text-[#0F1A2C] transition-colors hover:brightness-110 sm:min-h-0"
      >
        <GitCompareArrows className="h-4 w-4" />
        روح للمقارنة · Go to compare
      </Link>
    </div>
  )
}

export default async function SharedComparePage({ params }: { params: { token: string } }) {
  const shared = await loadShared(params.token).catch(() => null)

  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        {!shared ? (
          <DeadLink />
        ) : (
          <>
            <Reveal>
            <div className="mb-6 text-center sm:mb-8">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
                <GitCompareArrows className="h-3 w-3" /> مقارنة متشيّرة · Shared comparison
              </span>
              <h1 className="font-display display-1">حد بعتلك المقارنة دي</h1>
              <p className="mt-1 text-lg text-muted-foreground">Someone sent you this comparison</p>
              <p className="mx-auto mt-3 max-w-2xl break-words text-base text-muted-foreground sm:text-lg">
                {shared.live.map((p) => p.name).join(' × ')} — الأسعار وخطط السداد والمرافق جنب بعض.
              </p>
              <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
                Prices, payment plans and amenities side by side.
              </p>
              <Link
                href="/compare"
                className="mt-4 inline-block text-sm text-estate-gold underline-offset-4 hover:underline"
              >
                اعمل مقارنتك انت كمان · Make your own comparison
              </Link>
            </div>
            </Reveal>

            {/* Same table as /compare — reused, not duplicated. */}
            <CompareView ids={shared.projectIds.join(',')} />
          </>
        )}
      </div>
    </div>
  )
}
