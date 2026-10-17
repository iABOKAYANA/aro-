import { Metadata } from 'next'
import { requirePortalUser } from '@/lib/portal'
import DeveloperSubmitClient from './submit-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Submit a project',
  description:
    'Submit a new project for review. It goes in as PENDING and stays invisible to the public until approved.',
  robots: { index: false },
}

export default async function DeveloperSubmitPage() {
  await requirePortalUser('DEVELOPER')
  return <DeveloperSubmitClient />
}
