/**
 * Host routing: one codebase, two webs (public buyer site vs staff console).
 *
 * Edge-safe (plain string ops only) so both `src/middleware.ts` and server
 * components can import it. No dependencies.
 */

export type AppType = 'public' | 'console' | 'all'

/** Console hostname when `CONSOLE_HOST` is unset. */
export const DEFAULT_CONSOLE_HOST = 'console.estateai.eg'

/** Env name that overrides the console hostname. */
export const CONSOLE_HOST_ENV = 'CONSOLE_HOST'

export function getConsoleHost(): string {
  const raw = process.env[CONSOLE_HOST_ENV]?.trim()
  return raw || DEFAULT_CONSOLE_HOST
}

/**
 * Normalize a `Host` header value to a bare lowercase hostname:
 * strips port, proxies' host lists (first entry wins), trailing dot.
 * IPv6 (`::1`, `[::1]`) is preserved, not mistaken for host:port.
 */
function hostnameOf(host: string | null | undefined): string {
  if (!host) return ''
  let h = host.split(',')[0].trim().toLowerCase()
  if (h.startsWith('[')) {
    const end = h.indexOf(']')
    h = end >= 0 ? h.slice(1, end) : h.replace(/^\[|\]$/g, '')
    return h
  }
  const colons = (h.match(/:/g) || []).length
  if (colons === 1) h = h.split(':')[0]
  return h.trim().replace(/\.$/, '')
}

/**
 * `localhost` / `127.0.0.1` / `::1` / `*.vercel.app` → `'all'`
 * (dev/preview unaffected); else the configured console host or any
 * `console.*` subdomain → `'console'`; everything else → `'public'`.
 * Unknown/empty host fails open to `'all'` (today's behavior).
 */
export function getAppType(host: string | null | undefined, consoleHost?: string): AppType {
  const name = hostnameOf(host)
  if (!name) return 'all'
  if (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '::1' ||
    name.endsWith('.vercel.app') ||
    name === 'vercel.app'
  ) {
    return 'all'
  }
  const consoleName = (consoleHost ?? getConsoleHost())
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
  if (name === consoleName || name.startsWith('console.')) return 'console'
  return 'public'
}

/** Staff routes blocked on the PUBLIC host (redirected to the console host). */
export const HOST_GATED_PREFIXES = ['/ceo', '/broker', '/developer', '/dashboard']

/**
 * Buyer-account page routes with zero anonymous value on the PUBLIC host.
 * `/auth/*` (login/register/…) has no login on the public buyer site;
 * `/saved-searches` is 100% session-backed (its API 401s anonymously).
 * Both 307 to `/` on public hosts only. NEVER includes `/api/*`.
 */
export const PUBLIC_ACCOUNT_REDIRECT_PREFIXES = ['/auth', '/saved-searches']

/** Exact-or-boundary prefix match (`/auth` never matches `/author`). */
export function isPublicAccountRoute(pathname: string): boolean {
  return PUBLIC_ACCOUNT_REDIRECT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

/** Exact-or-boundary prefix match (`/broker` never matches `/brokerage`). */
export function isHostGatedRoute(pathname: string): boolean {
  return HOST_GATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

/**
 * Deployment mode: which web this Vercel deployment serves.
 * `public` = buyers site, `console` = staff console, `all` = everything
 * (localhost, preview, or a single-deployment setup).
 */
export type AppMode = 'public' | 'console' | 'all'

/** Env name that selects the deployment mode. */
export const APP_MODE_ENV = 'APP_MODE'

/**
 * Edge-safe (plain string read of a static env var, same pattern as
 * `getConsoleHost`). Unknown/empty fails open to `'all'` (today's behavior).
 */
export function getAppMode(): AppMode {
  const raw = process.env[APP_MODE_ENV]?.trim().toLowerCase()
  if (raw === 'public' || raw === 'console' || raw === 'all') return raw
  return 'all'
}

/**
 * Staff-route redirect gate: fires only when BOTH agree — the hostname says
 * `'public'` AND the deployment mode is not `'console'`. The console
 * deployment (`APP_MODE=console`) serves every route (staff need project
 * pages too), so it never redirects; `public`/`all` keep today's
 * 307-to-console behavior for host-derived public traffic.
 */
export function shouldRedirectToConsole(appType: AppType, appMode: AppMode): boolean {
  return appType === 'public' && appMode !== 'console'
}
