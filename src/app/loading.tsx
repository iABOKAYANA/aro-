export default function Loading() {
  return (
    <div className="relative flex min-h-[60vh] items-center justify-center overflow-hidden">
      <div className="mashrabiya pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-estate-gold/25 border-t-estate-gold" />
        <p className="section-kicker">GHAYA</p>
      </div>
    </div>
  )
}
