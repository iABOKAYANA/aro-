import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type SectionHeaderAction = {
  label: string
  href: string
}

type SectionHeaderProps = {
  /** Small gold eyebrow label, e.g. "New Cairo" / "القاهرة الجديدة". */
  kicker: string
  /** Huge display headline — page sections render this in `font-display`. */
  title: ReactNode
  /** Supporting line under the title. */
  description?: ReactNode
  /** Optional trailing link, pinned to the inline-end (dir-aware). */
  action?: SectionHeaderAction
  /** Logical alignment; `start` follows reading direction in RTL. Default 'start'. */
  align?: 'start' | 'center'
  className?: string
}

// THE one section-header pattern every page adopts (application waves).
// Dir-aware: uses text-start / logical margins, never physical left/right.
// Usage:
//   <SectionHeader kicker="Featured" title={<span className="display-2">Own the view</span>} description="…" action={{ label: 'View all', href: '/units' }} />
// Import: import { SectionHeader } from '@/components/design/SectionHeader'
export function SectionHeader({ kicker, title, description, action, align = 'start', className }: SectionHeaderProps) {
  const centered = align === 'center'
  return (
    <div className={cn('max-w-3xl', centered && 'mx-auto text-center', !centered && 'text-start', className)}>
      <p className="section-kicker">{kicker}</p>
      <h2 className="font-display display-2 mt-3 text-balance">{title}</h2>
      {description ? (
        <p className={cn('mt-4 text-base leading-8 text-muted-foreground', centered && 'mx-auto max-w-2xl')}>{description}</p>
      ) : null}
      {action ? (
        <div className={cn('mt-5', centered ? 'flex justify-center' : 'flex justify-start')}>
          <Link
            href={action.href}
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#8a6d1f] underline-offset-4 hover:underline dark:text-[#E8C56D]"
          >
            {action.label}
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100">
              →
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  )
}
