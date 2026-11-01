import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicModel3D } from '@/lib/models3d'

import Model3DViewerRoot from '@/components/models3d/viewer-root'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

/**
 * GET /3d/<model id> — the public premium 3D experience. The route itself is
 * the gate: master switch OFF, DRAFT row, or an unpublished/removed source
 * all 404 exactly like a page that never existed. Nothing links here from
 * public navigation while the feature is private.
 */
export default async function Model3DPage({ params }: PageProps) {
  const model = await getPublicModel3D(params.id)
  if (!model) notFound()
  return <Model3DViewerRoot model={model} />
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const model = await getPublicModel3D(params.id)
  if (!model) {
    return { title: 'Not Found', robots: { index: false, follow: false, nocache: true } }
  }
  const name = model.labelAr || model.labelEn || ''
  return {
    title: name || undefined,
    // The 3D experience is never indexed — published or not, it stays off
    // search results by design so no private-stage URL can ever surface.
    robots: { index: false, follow: false, nocache: true },
  }
}
