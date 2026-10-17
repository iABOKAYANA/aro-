import { Metadata } from 'next'
import { verifyPreviewToken } from '@/lib/developer-preview'
import { db } from '@/lib/db'
import { ProjectDetail } from '@/components/projects/project-detail'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Private project preview',
  description: 'A privately shared project preview.',
  robots: { index: false },
}

interface PreviewPageProps {
  params: { token: string }
}

// Validates the signed token server-side (same verifier the API door
// GET /api/developer/preview/[token] uses: 410 expired / 404 invalid).
// Valid → existing project-detail read-only + share-preview banner.
// Invalid → friendly dead-link panel, never raw errors.
export default async function DeveloperPreviewPage({ params }: PreviewPageProps) {
  const check = verifyPreviewToken(decodeURIComponent(params.token))
  if (!check.ok) {
    return <DeadLink expired={check.reason === 'expired'} />
  }

  const project = await db.project.findUnique({
    where: { id: check.projectId },
    include: {
      developer: true,
      governorate: true,
      city: true,
      district: true,
      units: {
        orderBy: { price: 'asc' },
        include: {
          phase: { select: { name: true } },
        },
      },
      phases: {
        orderBy: { sortOrder: 'asc' },
      },
      paymentPlans: {
        include: { milestones: { orderBy: { sortOrder: 'asc' } } },
      },
      amenities: {
        include: { amenity: true },
      },
      nearbyPlaces: true,
      masterPlanImages: { orderBy: { sortOrder: 'asc' } },
      brochures: true,
    },
  })
  if (!project) {
    return <DeadLink expired={false} />
  }

  return (
    <div>
      <div className="border-b border-amber-400/30 bg-amber-400/10">
        <p className="container px-4 py-2.5 text-center text-xs leading-relaxed text-amber-700 dark:text-amber-200">
          دي معاينة خاصة مشتركة من صاحب المشروع — للفرجة بس ومش للتداول العام. اللينك شغال ٧ أيام من لحظة ما اتعمل.
          <span className="mt-0.5 block opacity-80">
            Private shared preview from the project owner — view only, not for public sharing. This link works for 7 days from minting.
          </span>
        </p>
      </div>
      <ProjectDetail project={project} />
    </div>
  )
}

function DeadLink({ expired }: { expired: boolean }) {
  return (
    <div className="container px-4 py-24">
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center">
        <p className="text-sm font-medium text-estate-gold">GHAYA · معاينة خاصة · Private preview</p>
        <h1 className="font-display mt-3 text-2xl font-bold text-white">
          {expired ? 'اللينك ده خلص' : 'اللينك ده مش شغال'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-400">
          {expired
            ? 'لينك المعاينة بيشتغل ٧ أيام بس من لحظة ما اتعمل — اطلب لينك جديد من صاحب المشروع.'
            : 'لينك المعاينة ده غلط أو اتلغى — اتأكد إنك ناسخ اللينك كامل، أو اطلب لينك جديد من صاحب المشروع.'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {expired
            ? 'Preview links last 7 days from minting — ask the project owner for a fresh one.'
            : 'This preview link is invalid — make sure you copied the full link, or ask the project owner for a new one.'}
        </p>
      </div>
    </div>
  )
}
