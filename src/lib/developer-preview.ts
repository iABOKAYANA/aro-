import { createHmac, timingSafeEqual } from 'node:crypto'

// ─── Developer project preview tokens (no new table) ───
// Token: `v1.<expiryUnixSec>.<projectId>.<hmacHex>`
// HMAC-SHA256 over `<projectId>.<expiry>` with the existing server secret
// (AUTH_SECRET || NEXTAUTH_SECRET — the same secret src/lib/auth.ts uses).
// 7-day expiry. cuid projectIds contain no dots, so splitting on '.' is safe.

const TOKEN_VERSION = 'v1'
const TOKEN_TTL_SEC = 7 * 24 * 3600

function signingSecret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null
}

export function mintPreviewToken(projectId: string): { token: string; expiresAt: Date } | { error: 'missing-secret' } {
  const secret = signingSecret()
  if (!secret) return { error: 'missing-secret' }
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
  const payload = `${projectId}.${exp}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return { token: `${TOKEN_VERSION}.${exp}.${projectId}.${sig}`, expiresAt: new Date(exp * 1000) }
}

export function verifyPreviewToken(
  token: string
): { ok: true; projectId: string } | { ok: false; reason: 'invalid' | 'expired' } {
  const secret = signingSecret()
  if (!secret) return { ok: false, reason: 'invalid' }
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return { ok: false, reason: 'invalid' }
  const [, expRaw, projectId, sig] = parts
  if (!projectId || !/^\d+$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) {
    return { ok: false, reason: 'invalid' }
  }
  const exp = parseInt(expRaw, 10)
  const expected = createHmac('sha256', secret).update(`${projectId}.${exp}`).digest('hex')
  try {
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return { ok: false, reason: 'invalid' }
    }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' }
  return { ok: true, projectId }
}
