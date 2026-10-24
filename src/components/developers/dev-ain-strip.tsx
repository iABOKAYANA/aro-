'use client'

import { Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'

/**
 * عين strip for the developer page (the page itself stays a server
 * component; language comes from the client context like the rest of the
 * site). Questions deep-link into the chat (?q= auto-sends) where the
 * developer-scoped plural turn answers from the catalog — published
 * projects with real links, honest where data is missing.
 */
export function DevAinStrip({ developerName }: { developerName: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <section
      aria-label={ar ? `اسأل عين عن ${developerName}` : `Ask Ain about ${developerName}`}
      className="mb-8 rounded-2xl border border-estate-gold/30 bg-estate-gold/5 p-4"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-estate-navy dark:text-estate-gold">
          <Sparkles className="h-4 w-4 shrink-0" />
          {ar ? 'اسأل عين عن مشاريع المطوّر ده' : 'Ask Ain about this developer'}
        </p>
        <nav className="flex flex-wrap gap-2" aria-label={ar ? 'أسئلة جاهزة' : 'Ready questions'}>
          {[
            ar ? `ايه مشاريع ${developerName}؟` : `What projects does ${developerName} have?`,
            ar ? `مشاريع ${developerName} امتى تسليمها؟` : `When are ${developerName} projects delivered?`,
          ].map((question) => (
            <a
              key={question}
              href={`/ai-tools/chat?q=${encodeURIComponent(question)}`}
              className="inline-flex min-h-11 items-center rounded-full border border-estate-gold/40 bg-white px-3.5 text-sm font-medium text-estate-navy transition-colors hover:bg-estate-gold hover:text-[#0F1A2C] md:min-h-8 dark:border-estate-gold/30 dark:bg-black dark:text-estate-gold dark:hover:text-black"
            >
              {question}
            </a>
          ))}
        </nav>
      </div>
    </section>
  )
}
