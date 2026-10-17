'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import ApplyButton from '@/components/careers/apply-button'

type JobCard = {
  id: string
  title: string
  titleArabic: string | null
  slug: string
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

export default function CareersView({ jobs }: { jobs: JobCard[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const TYPE_LABELS = ar ? TYPE_LABELS_AR : TYPE_LABELS_EN

  return (
    <div className="min-h-screen bg-estate-bg-dark dark:bg-black">
      <section className="cine-hero" style={{ height: '60svh', minHeight: '420px', maxHeight: '600px' }}>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center px-4 text-center">
          <Reveal className="flex flex-col items-center">
            <p className="cine-kicker">{ar ? 'انضم للفريق' : 'Join the team'}</p>
            <h1 className="cine-title mt-4">{ar ? 'الوظايف' : 'Careers'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#faf7ef]/85">
              {ar ? 'انضم لينا وغيّر معانا شكل العقارات في مصر بالذكاء الاصطناعي' : "Join us in transforming Egypt's real estate landscape with AI"}
            </p>
          </Reveal>
        </div>
      </section>
      <div className="container px-4 py-12">
        <div className="mx-auto max-w-4xl">

          {jobs.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-lg text-gray-400">{ar ? 'مفيش وظايف مفتوحة دلوقتي.' : 'No open positions at the moment.'}</p>
              <p className="mt-2 text-sm text-gray-500">
                {ar ? 'احنا على طول بندوّر على ناس شاطرة. عدّي علينا كمان شوية.' : "We're always looking for talented people. Check back later."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job, index) => (
                <Reveal key={job.id} delay={Math.min(index, 3) * 80}>
                <div
                  className="group rounded-2xl border border-white/10 bg-white/5 p-6 transition-all hover:border-estate-gold/40 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#262626] dark:bg-[#0A0A0A] dark:hover:border-[#D4A843]/40"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h2 className="font-display text-lg text-white group-hover:text-estate-gold">
                        <Link href={`/careers/${job.slug}`} className="hover:underline">
                          {ar && job.titleArabic ? job.titleArabic : job.title}
                        </Link>
                      </h2>

                      <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                        {ar && job.descriptionArabic ? job.descriptionArabic : job.description}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
                          {job.department}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs text-gray-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                          </svg>
                          {job.location}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs text-gray-400">
                          {TYPE_LABELS[job.type] || job.type}
                        </span>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <ApplyButton jobId={job.id} jobTitle={ar && job.titleArabic ? job.titleArabic : job.title} />
                    </div>
                  </div>
                </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
