import { cn } from '@/lib/utils'

/**
 * GHAYA mark — a gold dome of nested petals topped by a 4-point star,
 * drawn as a vector stand-in for the brand logo (public/images/ghaya-logo.png).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={36}
      height={36}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-9 w-9', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ghaya-gold" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8C874" />
          <stop offset="1" stopColor="#B8922E" />
        </linearGradient>
      </defs>
      {/* 4-point star */}
      <path
        d="M32 2 L34.6 9.4 L42 12 L34.6 14.6 L32 22 L29.4 14.6 L22 12 L29.4 9.4 Z"
        fill="url(#ghaya-gold)"
      />
      {/* outer dome */}
      <path
        d="M11 58 C11 34 18 22 32 16 C46 22 53 34 53 58"
        stroke="url(#ghaya-gold)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* middle petals */}
      <path d="M20 58 C20 38 24 30 32 25" stroke="url(#ghaya-gold)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M44 58 C44 38 40 30 32 25" stroke="url(#ghaya-gold)" strokeWidth="2.6" strokeLinecap="round" />
      {/* inner petals */}
      <path d="M28 58 C28 45 29 39 32 35" stroke="url(#ghaya-gold)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M36 58 C36 45 35 39 32 35" stroke="url(#ghaya-gold)" strokeWidth="2.2" strokeLinecap="round" />
      {/* base */}
      <path d="M11 58 H53" stroke="url(#ghaya-gold)" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  )
}

/** Full lockup: mark + GHAYA / REAL ESTATE wordmark. */
export function BrandLogo({
  className,
  markClassName,
  wordmarkClassName,
  hideWordmarkOnMobile = false,
}: {
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  hideWordmarkOnMobile?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark className={cn('shrink-0', markClassName)} />
      <span className={cn('flex flex-col leading-none', hideWordmarkOnMobile && 'hidden sm:flex', wordmarkClassName)}>
        <span className="font-serif text-lg font-bold tracking-wide text-estate-gold">GHAYA</span>
        <span className="mt-0.5 text-[9px] font-medium tracking-[0.3em] text-gray-500 dark:text-neutral-400">
          REAL ESTATE
        </span>
      </span>
    </span>
  )
}
