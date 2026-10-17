// Guard for CEO image-URL fields (avatar / logo / coverImage).
// next/image throws at runtime on non-URL values (e.g. a bare email pasted
// into an avatar field), so reject anything that is not an absolute http(s)
// URL or a site-relative path. Empty input is handled by callers (→ null).
export function isValidImageUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/'))
  )
}
