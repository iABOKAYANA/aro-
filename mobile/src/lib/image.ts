import { API_URL } from '@/api/config';

/**
 * CMS images are stored site-relative on the website (e.g.
 * `/images/uploads/cover.webp`) and resolved by the browser against the
 * Next.js origin — the app has to do the same against the API host or the
 * image never loads.
 *
 * - falsy → `undefined` (caller renders its fallback)
 * - absolute `http(s)` → returned as-is
 * - anything else → joined onto `API_URL` (leading slashes stripped so the
 *   result never contains a doubled `//`)
 */
export function imageUrl(src?: string | null): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src)) return src;
  return `${API_URL}/${src.replace(/^\/+/, '')}`;
}
