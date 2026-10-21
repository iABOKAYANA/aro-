import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getClientIp, rateLimit, rateLimitReset } from '@/lib/rate-limit'
import { getAppMode, getAppType, getConsoleHost, isHostGatedRoute, isPublicAccountRoute, shouldRedirectToConsole, type AppMode, type AppType } from '@/lib/app-type'

const CEO_ROUTES = ['/ceo']
const ADMIN_ROLES = ['/admin']
const BROKER_ROUTES = ['/broker']
const DEVELOPER_ROUTES = ['/developer']
const SELLER_ROUTES = ['/seller']
const BUYER_ROUTES = ['/buyer']
const DASHBOARD_ROUTES = ['/dashboard']

const PROTECTED_ROUTES = [
  ...CEO_ROUTES,
  ...ADMIN_ROLES,
  ...BROKER_ROUTES,
  ...DEVELOPER_ROUTES,
  ...SELLER_ROUTES,
  ...BUYER_ROUTES,
  ...DASHBOARD_ROUTES,
]

const ROLE_ACCESS: Record<string, string[]> = {
  // CEO keeps sight of every area, including the role portals it manages.
  CEO: ['/ceo', '/admin', '/dashboard', '/broker', '/developer', '/seller', '/buyer'],
  ADMIN: ['/admin', '/dashboard'],
  BROKER: ['/dashboard', '/broker'],
  DEVELOPER: ['/dashboard', '/developer'],
  SELLER: ['/dashboard', '/seller'],
  BUYER: ['/dashboard', '/buyer'],
}

/* ─── Brute-force protection for the auth surface ───────── */
// path → { limit, windowMs }. Everything else under /api/auth falls back to
// the generous default below.
const AUTH_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // credentials callback == the actual "Sign In" attempt
  '/api/auth/callback/credentials': { limit: 10, windowMs: 5 * 60_000 },
  '/api/auth/register': { limit: 5, windowMs: 60 * 60_000 },
  '/api/auth/request-access': { limit: 5, windowMs: 60 * 60_000 },
  '/api/auth/change-password': { limit: 5, windowMs: 10 * 60_000 },
}
const AUTH_DEFAULT = { limit: 60, windowMs: 60_000 }

function clientIp(request: NextRequest): string {
  // Single shared extractor (src/lib/rate-limit.ts) — Vercel headers first,
  // `x-forwarded-for` first-entry only as fallback. See its doc comment.
  return getClientIp(request.headers)
}

/* ─── CORS, for the Expo app's web build only ────────────── */

/**
 * The Expo app's **web** bundle is served from its own origin (Metro runs on
 * 8081, the API on 3000), so every call it makes is cross-origin and the
 * browser enforces CORS before the request is even sent — `fetch` fails with
 * `TypeError: Failed to fetch` and no `Access-Control-Allow-Origin` ever comes
 * back. Native iOS and Android have no such rule, so this exists purely so the
 * app can be driven from a desktop browser during development.
 *
 * **Allowlisted, never `*`.** `*` is illegal the moment credentials are
 * involved, and the app's own requests carry `X-Session-Token` plus the
 * session cookie. The origin is echoed back verbatim with `Vary: Origin`, so a
 * shared cache can never hand one origin's permission to another.
 *
 * Loopback on any port covers `localhost:8081` / `127.0.0.1:3000`; the RFC1918
 * ranges cover opening that same bundle from a phone on the LAN. No *public*
 * origin can match, and a LAN host can already reach the API directly — so
 * this grants the browser nothing the network did not already.
 */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const RFC1918 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

/** The request's origin when (and only when) it is one we trust. */
function allowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null

  let host: string
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    host = url.hostname
  } catch {
    return null
  }

  return LOCAL_HOSTNAMES.has(host) || RFC1918.test(host) ? origin : null
}

/** Headers every allowlisted response carries. */
const CORS_BASE: Record<string, string> = {
  // `X-Session-Token` is what makes this app not-a-browser; `Content-Type:
  // application/json` is what makes every write a preflight.
  'Access-Control-Allow-Headers':
    'Accept, Content-Type, Authorization, X-Session-Token, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
}

/** Stamp a response with this request's CORS grant. No-ops off a trusted origin. */
function withCors(response: NextResponse, origin: string | null): NextResponse {  if (!origin) return response
  response.headers.set('Access-Control-Allow-Origin', origin)
  // Caches must not replay one origin's grant to another. It sticks on the
  // responses middleware itself writes (preflight, the 429 above); on a
  // pass-through the router rewrites `Vary` after us and drops it. That is
  // tolerable rather than dangerous — this grant only ever fires for loopback
  // and LAN origins, where there is no shared cache in the path, and a browser
  // that did receive a mismatched grant rejects it outright.
  response.headers.append('Vary', 'Origin')
  for (const [name, value] of Object.entries(CORS_BASE)) {
    response.headers.set(name, value)
  }
  return response
}

/* ─── CSRF defense: cookie-authed browser mutations ─── */

/**
 * Methods that change state. Everything else (GET/HEAD/OPTIONS) is
 * read-only and never gated.
 */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Session-minting endpoints are exempt: they run before any session exists
 * (or refresh one from credentials), carry their own defenses (next-auth's
 * synchronizer csrfToken on the callback/* + signout endpoints, strict rate
 * limits on register/mobile-login), and — critically — the next-auth browser
 * client cannot attach a custom header to its internal callback POSTs. A
 * stale session cookie lingering in the browser must never lock the user out
 * of logging back in.
 */
const CSRF_EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/mobile/auth/',
  // `/api/csp-report`: the browser (not app code) POSTs violation reports —
  // it cannot attach X-Requested-With, and logged-in sessions would 403 on
  // their own cookies. Forging a report gains nothing: the endpoint is
  // unauthenticated and appends only to an ignored JSONL log (own rate limit).
  '/api/csp-report',
]

/**
 * Returns a 403 response when this request looks like a cross-site forgery,
 * or `null` when it may proceed. Gates ONLY on the conjunction:
 *
 *   mutation method AND /api/ path AND session cookie present
 *   AND no X-Session-Token AND X-Requested-With missing/wrong
 *
 * - Mobile (X-Session-Token) and public/anonymous (no session cookie) traffic
 *   is unaffected, with or without the header.
 * - A plain `<form>` posted by an attacker's site cannot set a custom header,
 *   so the browser's request arrives cookied but headerless — and is refused.
 */
function csrfRejection(request: NextRequest): NextResponse | null {
  if (!MUTATION_METHODS.has(request.method)) return null
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/api/')) return null
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null
  if (request.headers.get('x-session-token')) return null
  if (!hasSessionCookie(request)) return null
  if (request.headers.get('x-requested-with') === 'XMLHttpRequest') return null
  return NextResponse.json(
    {
      error:
        'Forbidden. Please refresh the page and try again. / ممنوع. حدّث الصفحة وحاول تاني.',
    },
    { status: 403 }
  )
}

function rateLimitAuth(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl
  const spec = AUTH_LIMITS[pathname] ?? AUTH_DEFAULT
  const ip = clientIp(request)
  const key = `auth:${ip}:${pathname}`
  const result = rateLimit(key, spec)

  if (result.ok) return null

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
  return NextResponse.json(
    {
      error: 'Too many attempts. Please wait a moment and try again.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(spec.limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // CORS grant for this request, if any. It is null for every non-API path and
  // for every origin outside the allowlist, in which case `withCors` below is
  // a pass-through and the rest of this function behaves exactly as before.
  const origin = pathname.startsWith('/api/') ? allowedOrigin(request) : null

  // Preflight has to be settled before anything else: route handlers are free
  // to reject OPTIONS outright, and a failed preflight means the real request
  // is never sent at all. It carries no credentials, so there is nothing else
  // to forward — answer it and get out of the way.
  if (origin && request.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 204 }), origin)
  }

  // 0.5 Host routing — one codebase, two webs. Localhost / 127.0.0.1 /
  //    *.vercel.app resolve to 'all' (dev/preview unaffected, never
  //    redirected); the console host (CONSOLE_HOST, default
  //    console.estateai.eg) or any `console.*` subdomain is 'console' and
  //    serves everything; anything else is 'public'. The APP_MODE deployment
  //    mode combines with the hostname (both must agree): APP_MODE=console
  //    never redirects (staff need project pages too, so the console serves
  //    all); APP_MODE=public/all keep the 307 below for host-derived public
  //    traffic. Public staff routes 307 to the console host preserving
  //    path+query — the public deployment owns no console UI, but the
  //    console deployment does, so deep links keep working across the two
  //    deployments instead of dead-ending on a 404. Auth/CORS/rate-limit
  //    behavior below is otherwise untouched.
  const consoleHost = getConsoleHost()
  const appType = getAppType(request.headers.get('host'), consoleHost)
  const appMode = getAppMode()
  if (isHostGatedRoute(pathname) && shouldRedirectToConsole(appType, appMode)) {
    const target = new URL(request.url)
    target.protocol = 'https:'
    target.host = consoleHost
    target.port = ''
    return NextResponse.redirect(target, 307)
  }

  // 0.6 Public buyer site has ZERO login. On the PUBLIC host only, page
  //    routes under `/auth/*` (login/register/request-access/error) 307 to
  //    `/` (home — friendlier than 404; buyers are never sent to the console
  //    login). `/saved-searches` is entirely session-backed (its API 401s
  //    anonymously) with no anonymous value, so it goes home too.
  //    Console/`all` hosts: unchanged (pass through below). NEVER `/api/*`
  //    (the mobile app + public anonymous features depend on it).
  if (appType === 'public' && isPublicAccountRoute(pathname)) {
    return NextResponse.redirect(new URL('/', request.url), 307)
  }

  // 0. CSRF gate — a cookied browser mutation without the custom header is a
  //    suspected forgery. Runs before auth/rate-limit branches so nothing
  //    downstream can be reached by one; the 403 still carries the CORS grant.
  if (pathname.startsWith('/api/')) {
    const rejected = csrfRejection(request)
    if (rejected) return withCors(rejected, origin)
  }

  // 1. Auth endpoints — always checked, regardless of matcher shortcuts.
  if (pathname.startsWith('/api/auth/')) {
    const limited = rateLimitAuth(request)
    if (limited) return withCors(limited, origin)

    // Holding a live session means the credentials flow already succeeded at
    // some point — forget the failed-attempt counter for that IP so a user who
    // fat-fingered their password is never punished after logging in.
    if (
      pathname === '/api/auth/session' &&
      (hasSessionCookie(request) || mobileSessionHeaders(request))
    ) {
      rateLimitReset(`auth:${clientIp(request)}:/api/auth/callback/credentials`)
    }

    return withCors(forwardMobileSession(request, appType, appMode), origin)
  }

  // 2. Mobile app — splice its header token into a real session cookie before
  //    anything downstream (including every `auth()` call) looks at the request.
  const mobileHeaders = mobileSessionHeaders(request)
  if (mobileHeaders) {
    // Stamp the host-derived app type and the deployment mode alongside the
    // spliced cookie so server components branch the chrome without any
    // extra round-trip.
    mobileHeaders.set('x-app-type', appType)
    mobileHeaders.set('x-app-mode', appMode)
    return withCors(NextResponse.next({ request: { headers: mobileHeaders } }), origin)
  }

  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  if (!isProtected) return withCors(nextWithAppType(request, appType, appMode), origin)

  const session = getSessionToken(request)

  if (!session) {
    const url = new URL('/auth/login', request.url)
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  // 2. Role gate — ROLE_ACCESS used to be declared but never enforced, so any
  //    signed-in user could open /ceo, /broker or /developer.
  const role = await readRoleFromSessionToken(session.token, session.salt)

  // Fail closed. A token we cannot read is not a session we trust — expired
  // cookie, wrong secret, corrupted value. Redirect to /auth/login rather than
  // /dashboard so we can never ping-pong: /dashboard sits behind this gate too.
  if (!role) {
    const url = new URL('/auth/login', request.url)
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  // `USER` is the legacy value still written by prisma/seed.ts and by the
  // registration form (src/lib/validations.ts); it has always meant "buyer".
  const normalized = role === 'USER' ? 'BUYER' : role

  // Default deny. The old `if (allowed && ...)` granted *unrestricted* access
  // to any role missing from ROLE_ACCESS — so a freshly registered `USER`
  // account walked straight into /ceo/*. Unknown roles now get the dashboard
  // and nothing else.
  const allowed = ROLE_ACCESS[normalized] ?? ['/dashboard']

  if (!allowed.some((prefix) => pathname.startsWith(prefix))) {
    // Distinguish "wrong door" from "no door": send them to the area they do own.
    return NextResponse.redirect(new URL(allowed[0], request.url))
  }

  return nextWithAppType(request, appType, appMode)
}

/**
 * `next()` with the host-derived app type and the deployment mode stamped on
 * the request headers so server components (layout → Providers →
 * Navbar/Footer) can branch the chrome SSR-safely. Pass-through only;
 * redirects re-run middleware on the target and stamp their own.
 */
function nextWithAppType(request: NextRequest, appType: AppType, appMode: AppMode): NextResponse {
  const headers = new Headers(request.headers)
  headers.set('x-app-type', appType)
  headers.set('x-app-mode', appMode)
  // Original request path so the root layout can hard-404 pages whose feature
  // the CEO switched off (before any stream flush → real 404 status).
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

/** Every name auth.js may have written the session under, in read order. */
const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const

/**
 * Returns the token *and* the name it arrived under — the name doubles as the
 * HKDF salt auth.js used to encrypt it (see `readRoleFromSessionToken`).
 */
function getSessionToken(request: NextRequest): { token: string; salt: string } | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value
    if (value) return { token: value, salt: name }
  }
  return null
}

function hasSessionCookie(request: NextRequest): boolean {
  return getSessionToken(request) !== null
}

/** Header the Expo app (iOS/Android) authenticates with. */
const MOBILE_SESSION_HEADER = 'x-session-token'

/**
 * The name auth.js will look the session cookie up under in this environment —
 * `__Secure-` prefixed only when the configured base URL is https. Mirrors
 * `useSecureCookies` in @auth/core, and must match `sessionCookieName()` in
 * src/app/api/mobile/auth/login/route.ts or nothing could ever decrypt it.
 */
function sessionCookieNameFor(request: NextRequest): string {
  const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin
  return /^https:/i.test(base) ? '__Secure-authjs.session-token' : 'authjs.session-token'
}

/**
 * Turns the mobile app's `X-Session-Token` header into an ordinary session
 * cookie, or returns `null` when there is nothing to do.
 *
 * The app cannot simply send `Cookie` itself: browsers forbid the header, and
 * React Native's networking sits on native cookie stacks (NSURLSession on iOS,
 * OkHttp on Android) that are free to drop or overwrite a hand-written Cookie.
 * A bespoke header is the one thing every platform passes through untouched,
 * so we accept it and splice it in *here* — before any route handler runs.
 * After this point the request is indistinguishable from a browser's, which is
 * exactly the point: one session, one permission model, two clients.
 *
 * Returns `null` when a real cookie is already present, so a client that
 * managed to send both is never given a duplicate pair.
 */
function mobileSessionHeaders(request: NextRequest): Headers | null {
  const token = request.headers.get(MOBILE_SESSION_HEADER)
  if (!token) return null
  if (hasSessionCookie(request)) return null

  const headers = new Headers(request.headers)
  const pair = `${sessionCookieNameFor(request)}=${encodeURIComponent(token)}`
  const existing = headers.get('cookie')
  headers.set('cookie', existing ? `${existing}; ${pair}` : pair)
  return headers
}

/** `next()` with the mobile token folded in when the caller used one. */
function forwardMobileSession(request: NextRequest, appType?: AppType, appMode?: AppMode): NextResponse {
  const headers = mobileSessionHeaders(request)
  if (headers) {
    if (appType) headers.set('x-app-type', appType)
    if (appMode) headers.set('x-app-mode', appMode)
    return NextResponse.next({ request: { headers } })
  }
  return appType ? nextWithAppType(request, appType, appMode ?? getAppMode()) : NextResponse.next()
}

/**
 * Decode the next-auth session cookie without hitting the DB (impossible at the
 * edge anyway). `next-auth/jwt`'s `decode` is jose-based and edge-safe.
 *
 * **The salt is the cookie name, not the secret.** auth.js derives the JWE key
 * with `salt = options.cookies.sessionToken.name`; passing `AUTH_SECRET` here
 * made every decode throw `no matching decryption secret`, the catch returned
 * `null`, and the role gate below was skipped — so *any* signed-in user could
 * load `/ceo/*`. Reproduced against a real session cookie before this fix:
 * `salt: 'authjs.session-token'` decrypts, `salt: AUTH_SECRET` throws.
 *
 * Falls back over every accepted name (and finally the secret) so renaming the
 * cookie or flipping `useSecureCookies` can never silently disable the gate.
 */
async function readRoleFromSessionToken(
  token: string,
  primarySalt: string
): Promise<string | null> {
  try {
    // Imported lazily so a missing/invalid secret never throws at module load.
    const { decode } = await import('next-auth/jwt')
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
    if (!secret) return null

    const salts = [...new Set<string>([primarySalt, ...SESSION_COOKIE_NAMES, secret])]
    for (const salt of salts) {
      try {
        const payload = await decode({ token, secret, salt })
        const role = (payload as Record<string, unknown> | null)?.role
        if (typeof role === 'string') return role
      } catch {
        // Wrong salt for this token — try the next candidate.
      }
    }
    return null
  } catch {
    return null
  }
}

export const config = {
  matcher: [
    // ALLOWLIST by design — static assets never enter middleware: this list
    // matches only the route groups below, so `_next/static`, `_next/image`,
    // `favicon.ico` and every extension-served file under /public skip
    // middleware entirely (Next serves them before this regex is consulted).
    // Converting to the docs' negative-lookahead idiom
    // `/((?!_next/static|...).*)` would EXPAND coverage to `/`, `/projects`
    // and every other page — a behavior change, not an optimization.
    '/ceo/:path*',
    '/admin/:path*',
    '/broker/:path*',
    '/developer/:path*',
    '/seller/:path*',
    '/buyer/:path*',
    '/dashboard/:path*',
    // Page routes with a public-host 307 to `/` (zero-login public site).
    // `:path*` matches zero segments, so the bare `/auth` and
    // `/saved-searches` entries previously listed here were redundant.
    '/auth/:path*',
    '/saved-searches/:path*',
    // Every API path enters middleware, because the Expo app's **web** bundle
    // runs on its own origin (8081) and its very first request is an OPTIONS
    // preflight that no session header is attached to yet — a matcher guarded
    // on `x-session-token` would never see it. Ordinary website traffic costs
    // one origin parse here: nothing in this file reads or buffers a request
    // body, so multipart uploads still pass straight through to the route.
    // (`/api/auth/:path*` was listed separately before; `/api/:path*` subsumes
    // it — the union of matched URLs is unchanged by dropping it.)
    '/api/:path*',
  ],
}
