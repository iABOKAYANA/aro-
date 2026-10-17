'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import ApplyButton from '@/components/careers/apply-button'

type Job = {
  id: string
  title: string
  titleArabic: string | null
  department: string
  location: string
  type: string
  description: string
  descriptionArabic: string | null
  salaryMin: number | null
  salaryMax: number | null
}

const TYPE_LABELS_EN: Record<string, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
}

const TYPE_LABELS_AR: Record<string, string> = {
  FULL_TIME: 'دوام كامل',
  PART_TIME: 'دوام جزئي',
  CONTRACT: 'تعاقد',
  INTERNSHIP: 'تدريب',
}

export default function JobView({ job, requirements, salary }: { job: Job; requirements: string[]; salary: string | null }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const TYPE_LABELS = ar ? TYPE_LABELS_AR : TYPE_LABELS_EN
  const title = ar && job.titleArabic ? job.titleArabic : job.title

  return (
    <div className="min-h-screen bg-estate-bg-dark dark:bg-black">
      <div className="container px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/careers"
            className="mb-8 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-estate-gold"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {ar ? 'ارجع للوظايف' : 'Back to Careers'}
          </Link>

          <Reveal>
          <div className="rounded-2xl border border-estate-gold/20 bg-white/5 p-8 transition-colors dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-estate-gold/10 px-3 py-1 font-medium text-estate-gold">
                    {job.department}
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-gray-400">{job.location}</span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-gray-400">
                    {TYPE_LABELS[job.type] || job.type}
                  </span>
                </div>
                <h1 className="font-display display-3 text-white">{title}</h1>
                {salary && <p className="mt-2 text-sm text-gray-400">{ar ? `${salary} جنيه في الشهر` : `${salary} EGP / month`}</p>}
              </div>

              <div className="flex-shrink-0">
                <ApplyButton jobId={job.id} jobTitle={title} />
              </div>
            </div>

            <hr className="gold-hairline my-7" />

            <section className="space-y-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">{ar && job.descriptionArabic ? job.descriptionArabic : job.description}</p>

              {requirements.length > 0 && (
                <>
                  <h2 className="font-display pt-3 text-lg text-white">{ar ? 'المطلوب' : 'Requirements'}</h2>
                  <ul className="space-y-2">
                    {requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                        <svg
                          className="mt-0.5 h-4 w-4 flex-shrink-0 text-estate-gold"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        {req}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
          </Reveal>
        </div>
      </div>
    </div>
  )
}
