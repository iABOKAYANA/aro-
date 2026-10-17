export const metadata = {
  title: 'Not Found',
  description: 'Page not found',
}

export default function NotFound() {
  return (
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div className="mashrabiya pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
      <div className="relative">
        <p className="section-kicker">GHAYA</p>
        <h1 className="font-display gold-shimmer mt-3 text-7xl text-estate-gold">404</h1>
        <h2 className="font-display mt-4 text-2xl">Page Not Found</h2>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <hr className="gold-hairline mx-auto my-6 max-w-xs" />
        <a
          href="/"
          className="mt-6 inline-block rounded-full bg-estate-gold px-6 py-3 font-medium text-white hover:bg-estate-gold-dark transition-colors"
        >
          Go Home
        </a>
      </div>
    </div>
  )
}
