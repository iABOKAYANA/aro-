/**
 * Phase-3 wave-2 remediation regression tests (one file, three areas).
 *
 *  1. Mail outbox lives OUTSIDE the web-served tree (`data/outbox`, never
 *     `public/...`) and no longer logs recipient addresses.
 *  2. The sync in-memory limiter keeps byte-identical behavior (middleware
 *     calls it synchronously — it cannot await Redis).
 *  3. `getClientIp` honors header precedence by default and drops
 *     client-influenced headers in strict mode (`TRUSTED_PROXY_CIDRS` set).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { getClientIp, rateLimit, rateLimitReset } from '@/lib/rate-limit'
import { sendMail } from '@/lib/mailer'

const root = process.cwd()
const src = (p: string) => readFileSync(join(root, p), 'utf8')

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

// ─── 1. Outbox outside public/ ──────────────────────────────────────────────

describe('outbox lives outside the web root', () => {
  it('writer + reader point at data/outbox, never public/uploads/outbox', () => {
    for (const f of ['src/lib/mailer.ts', 'src/app/api/ceo/outbox/route.ts']) {
      const s = src(f)
      expect(s).toContain(`join(process.cwd(), 'data', 'outbox')`)
      expect(s).not.toContain('public/uploads/outbox')
    }
  })

  it('writer logs no recipient addresses', () => {
    // Server logs are broadly retained; queued mail holds real addresses.
    expect(src('src/lib/mailer.ts')).not.toContain('console.info')
  })

  it('sendMail persists under data/outbox and never under public/', async () => {
    const prev = process.env.EMAIL_DRIVER
    process.env.EMAIL_DRIVER = 'outbox'
    const before = new Set(await readdir(join(root, 'public')).catch(() => [] as string[]))
    void before
    let id: string | undefined
    try {
      const res = await sendMail({
        to: 'outbox-probe@example.com',
        subject: 'wave2-outbox-probe',
        text: 'probe',
      })
      expect(res.ok).toBe(true)
      expect(res.driver).toBe('outbox')
      id = res.id
      expect(typeof id).toBe('string')

      const written = JSON.parse(
        await readFile(join(root, 'data', 'outbox', `${id}.json`), 'utf8'),
      ) as { to: string[]; subject: string }
      expect(written.to).toEqual(['outbox-probe@example.com'])
      expect(written.subject).toBe('wave2-outbox-probe')

      // Nothing with this id may exist anywhere under the served tree.
      const hits: string[] = []
      const sweep = async (dir: string) => {
        for (const e of await readdir(join(root, dir)).catch(() => [] as string[])) {
          if (e === `${id}.json`) hits.push(join(dir, e))
        }
      }
      await sweep('public')
      await sweep(join('public', 'uploads'))
      expect(hits).toEqual([])
    } finally {
      if (prev === undefined) delete process.env.EMAIL_DRIVER
      else process.env.EMAIL_DRIVER = prev
      if (id) await unlink(join(root, 'data', 'outbox', `${id}.json`)).catch(() => {})
    }
  })
})

// ─── 2. Sync limiter behavior unchanged ─────────────────────────────────────

describe('sync in-memory rateLimit semantics', () => {
  const key = (n: string) => `wave2:${n}:${Math.random().toString(36).slice(2)}`

  it('first hit opens a window; exhaustion flips ok; reset clears', () => {
    const k = key('basic')
    const first = rateLimit(k, { limit: 3, windowMs: 60_000 })
    expect(first).toEqual({ ok: true, remaining: 2, resetAt: first.resetAt })

    expect(rateLimit(k, { limit: 3, windowMs: 60_000 }).ok).toBe(true)
    const third = rateLimit(k, { limit: 3, windowMs: 60_000 })
    expect(third.ok).toBe(true)
    expect(third.remaining).toBe(0)
    expect(third.resetAt).toBe(first.resetAt) // same window, no re-anchor

    const over = rateLimit(k, { limit: 3, windowMs: 60_000 })
    expect(over.ok).toBe(false)
    expect(over.remaining).toBe(0)

    rateLimitReset(k)
    const fresh = rateLimit(k, { limit: 3, windowMs: 60_000 })
    expect(fresh).toEqual({ ok: true, remaining: 2, resetAt: fresh.resetAt })
  })

  it('keys are independent', () => {
    const a = key('a')
    const b = key('b')
    rateLimit(a, { limit: 1, windowMs: 60_000 })
    expect(rateLimit(a, { limit: 1, windowMs: 60_000 }).ok).toBe(false)
    expect(rateLimit(b, { limit: 1, windowMs: 60_000 }).ok).toBe(true)
    rateLimitReset(a)
    rateLimitReset(b)
  })
})

// ─── 3. getClientIp ─────────────────────────────────────────────────────────

describe('getClientIp', () => {
  const prev = process.env.TRUSTED_PROXY_CIDRS
  afterEach(() => {
    if (prev === undefined) delete process.env.TRUSTED_PROXY_CIDRS
    else process.env.TRUSTED_PROXY_CIDRS = prev
  })

  it('default: vercel > real-ip > xff-first-entry > local', () => {
    delete process.env.TRUSTED_PROXY_CIDRS
    expect(getClientIp(headers({}))).toBe('local')
    expect(getClientIp(headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1')
    expect(getClientIp(headers({ 'x-forwarded-for': '  3.3.3.3  ' }))).toBe('3.3.3.3')
    expect(getClientIp(headers({ 'x-forwarded-for': '   ' }))).toBe('local')
    expect(
      getClientIp(headers({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' })),
    ).toBe('9.9.9.9')
    expect(
      getClientIp(
        headers({
          'x-vercel-forwarded-for': '7.7.7.7',
          'x-real-ip': '9.9.9.9',
          'x-forwarded-for': '1.1.1.1',
        }),
      ),
    ).toBe('7.7.7.7')
  })

  it('empty TRUSTED_PROXY_CIDRS = current behavior', () => {
    process.env.TRUSTED_PROXY_CIDRS = '   '
    expect(getClientIp(headers({ 'x-forwarded-for': '1.1.1.1' }))).toBe('1.1.1.1')
  })

  it('strict (TRUSTED_PROXY_CIDRS set): platform header or local only', () => {
    process.env.TRUSTED_PROXY_CIDRS = '10.0.0.0/8, 192.168.0.0/16'
    // Client-influenced headers are ignored — a caller can no longer pick
    // its own rate-limit bucket via XFF.
    expect(getClientIp(headers({ 'x-forwarded-for': '1.1.1.1' }))).toBe('local')
    expect(getClientIp(headers({ 'x-real-ip': '9.9.9.9' }))).toBe('local')
    expect(
      getClientIp(
        headers({ 'x-vercel-forwarded-for': '7.7.7.7', 'x-forwarded-for': '1.1.1.1' }),
      ),
    ).toBe('7.7.7.7')
    expect(getClientIp(headers({}))).toBe('local')
  })

  it('web authorize() exposes no account-state oracle', () => {
    const s = src('src/lib/auth.ts').toLowerCase()
    expect(s).not.toContain('deactivated')
    expect(s).not.toContain('account is ')
    expect(s).toContain('invalid credentials')
  })
})
