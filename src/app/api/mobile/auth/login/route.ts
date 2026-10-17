import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { encode } from 'next-auth/jwt'
import { db } from '@/lib/db'
import { getClientIp, rateLimit, rateLimitReset } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Mobile entry point — the Expo app (iOS + Android) signs in here.
 *
 * It mints **the very same JWT a browser login mints**, so the app then talks
 * to every existing `/api/*` route with `Cookie: <cookieName>=<token>` and gets
 * byte-identical behaviour: same session, same `role`, same permissions, same
 * rows. Nothing is duplicated and nothing is proxied — the two clients are the
 * same session seen from two places.
 *
 * Rate-limited the same way `/api/auth/callback/credentials` is.
 */

const SPEC = { limit: 8, windowMs: 5 * 60_000 }
// 7-day session ceiling — matches the web session maxAge in src/lib/auth.ts.
// A stolen mobile JWT is useful for a week, not a month.
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60

function clientIp(req: NextRequest): string {
  // Shared extractor (src/lib/rate-limit.ts) — signature kept, callers untouched.
  return getClientIp(req.headers)
}

/**
 * auth.js names the session cookie **and uses that name as the HKDF salt** that
 * encrypts the JWT, so getting it wrong yields a token nothing can decrypt.
 *
 * Mirrors auth.js's own resolution: `useSecureCookies` defaults to whether the
 * configured base URL is https, hence the `__Secure-` prefix in production.
 */
function sessionCookieName(req: NextRequest): string {
  const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL || req.nextUrl.origin
  const secure = /^https:/i.test(base)
  return secure ? '__Secure-authjs.session-token' : 'authjs.session-token'
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const key = `mobile-login:${ip}`
  const result = rateLimit(key, SPEC)

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
          'X-RateLimit-Limit': String(SPEC.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  try {
    const user = await db.user.findUnique({ where: { email } })

    // Same checks as the web `authorize()` callback — a suspended account must
    // not be able to walk in through the app. All failure paths return the
    // identical generic message + 401 so suspended vs. wrong-password vs.
    // unknown-email are indistinguishable (no account-enumeration oracle).
    if (!user || !user.passwordHash || !user.isActive || user.status !== 'ACTIVE') {
      // Still run a dummy compare when there is no hash to compare, so the
      // timing of "unknown email" roughly matches "wrong password".
      if (!user?.passwordHash) await bcrypt.compare(password, '$2b$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
      else if (!user.isActive || user.status !== 'ACTIVE') {
        // Compare against the real hash even for suspended accounts so a
        // suspended account with the right password takes ~as long as a
        // normal bad-password attempt.
        await bcrypt.compare(password, user.passwordHash)
      }
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server is missing AUTH_SECRET' }, { status: 500 })
    }

    const cookieName = sessionCookieName(req)
    const secure = cookieName.startsWith('__Secure-')

    // `encode()` fills in iat/exp/jti; we only supply the claims. `role` is
    // refreshed from the DB on every request by the `jwt` callback anyway, but
    // carrying it here means middleware can gate the very first call.
    const token = await encode({
      token: {
        sub: user.id,
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.avatar ?? null,
        role: user.role,
        phone: user.phone ?? null,
        status: user.status,
      },
      secret,
      salt: cookieName,
      maxAge: MAX_AGE_SECONDS,
    })

    // Forget the failed-attempt counter — a real login just succeeded.
    rateLimitReset(key)

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    return NextResponse.json(
      {
        token,
        cookieName,
        expiresInSeconds: MAX_AGE_SECONDS,
        user: {
          id: user.id,
          name: user.name,
          nameArabic: user.nameArabic,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          preferredLang: user.preferredLang,
          preferredCurrency: user.preferredCurrency,
        },
      },
      {
        status: 200,
        headers: {
          // Also usable by any client that keeps a real cookie jar.
          'Set-Cookie': `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${
            secure ? '; Secure' : ''
          }; Max-Age=${MAX_AGE_SECONDS}`,
        },
      }
    )
  } catch (error) {
    console.error('Mobile login error:', error)
    return NextResponse.json({ error: 'Failed to sign in' }, { status: 500 })
  }
}
