/**
 * Phase 3 (second tree) remediation regression tests — ONE file.
 *
 *  FIX 4 — no-dep allowlist sanitizer (src/lib/html-sanitize.ts):
 *          strips script / event-handlers / javascript: URLs, keeps
 *          p/strong and the rest of the CMS allowlist. Applied on write
 *          in POST/PATCH of /api/blog and /api/press (source-asserted).
 *  FIX 5 — AI create_inquiry: model-supplied userId ignored (forced from
 *          server session; anon → null), bad phone/name rejected.
 *  FIX 2 — /api/csp-report validator: legacy + Reporting-API shapes → 201,
 *          garbage/oversized → 400, GET → 405 (route exercised with mocked
 *          fs + limiter — no disk writes).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsState = vi.hoisted(() => ({ lines: [] as string[] }))
const rateState = vi.hoisted(() => ({ ok: true }))
const created = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: unknown }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers,
    }),
  },
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  appendFile: vi.fn(async (_p: unknown, line: unknown) => {
    fsState.lines.push(String(line))
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '127.0.0.1',
  rateLimit: () => (rateState.ok
    ? { ok: true, remaining: 59, resetAt: Date.now() + 60_000 }
    : { ok: false, remaining: 0, resetAt: Date.now() + 60_000 }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    inquiry: {
      create: vi.fn(async ({ data }: any) => {
        created.rows.push(data)
        return { id: 'inq-1', ...data }
      }),
    },
  },
}))

vi.mock('@/lib/search', () => ({
  searchProjects: vi.fn(),
  searchUnits: vi.fn(),
  getProjectBySlug: vi.fn(),
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeHtml } from '@/lib/html-sanitize'
import { toolCreateInquiry } from '@/lib/ai-tools'
import { POST as cspPost, GET as cspGet } from '@/app/api/csp-report/route'
import { db } from '@/lib/db'

const root = process.cwd()
const src = (p: string) => readFileSync(join(root, p), 'utf8')
const mdb: any = db

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  fsState.lines.length = 0
  created.rows.length = 0
  rateState.ok = true
  vi.clearAllMocks()
})

// ─── FIX 4: sanitizer ──────────────────────────────────────

describe('FIX 4 — html sanitizer', () => {
  it('strips script tags and their content, keeps p/strong', () => {
    const out = sanitizeHtml('<p>Hello <strong>world</strong></p><script>alert(1)</script>')
    expect(out).toBe('<p>Hello <strong>world</strong></p>')
  })

  it('strips event handlers and style attributes', () => {
    expect(sanitizeHtml('<p onclick="alert(1)" style="color:red">x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtml('<img src="https://example.com/a.png" onerror="alert(1)">'))
      .toBe('<img src="https://example.com/a.png">')
  })

  it('strips javascript: URLs but keeps http(s) links', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>')
    expect(sanitizeHtml('<a href="https://example.com/x">click</a>'))
      .toBe('<a href="https://example.com/x">click</a>')
  })

  it('drops iframe/object/embed with content, drops data: images', () => {
    expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>after')).toBe('after')
    expect(sanitizeHtml('<object data="x"></object>after')).toBe('after')
    expect(sanitizeHtml('<img src="data:image/svg+xml,<svg></svg>">after')).toBe('after')
  })

  it('keeps the CMS allowlist (h2/ul/li/blockquote/img-http)', () => {
    const out = sanitizeHtml(
      '<h2>T</h2><ul><li>a</li></ul><blockquote>q</blockquote><img src="https://example.com/a.png" alt="a">',
    )
    expect(out).toContain('<h2>T</h2>')
    expect(out).toContain('<ul><li>a</li></ul>')
    expect(out).toContain('<blockquote>q</blockquote>')
    expect(out).toContain('<img src="https://example.com/a.png" alt="a">')
  })

  it('blog + press POST/PATCH sanitize content on write', () => {
    for (const f of ['src/app/api/blog/route.ts', 'src/app/api/press/route.ts']) {
      const s = src(f)
      expect(s).toContain('sanitizeHtml(content)')
      expect(s).toContain('sanitizeHtml(rest.content)')
      // Render paths untouched — no raw-HTML injection in the API routes.
      expect(s).not.toContain('__html')
    }
  })
})

// ─── FIX 5: create_inquiry ─────────────────────────────────

describe('FIX 5 — create_inquiry ignores model userId, validates input', () => {
  it('rejects a bad phone and writes nothing', async () => {
    const res = await toolCreateInquiry({ name: 'Sara', phone: '123' }, { userId: 'u1' })
    expect(res.success).toBe(false)
    expect(mdb.inquiry.create).not.toHaveBeenCalled()
  })

  it('rejects letter-garbage phones and short names', async () => {
    const badPhone = await toolCreateInquiry({ name: 'Sara', phone: 'abc1234567' }, { userId: 'u1' })
    expect(badPhone.success).toBe(false)
    const badName = await toolCreateInquiry({ name: 'S', phone: '01012345678' }, { userId: 'u1' })
    expect(badName.success).toBe(false)
    expect(mdb.inquiry.create).not.toHaveBeenCalled()
  })

  it('forces userId from the server session, ignoring the model value', async () => {
    const res = await toolCreateInquiry(
      { name: 'Sara', phone: '01012345678', userId: 'evil-user' },
      { userId: 'real-user', role: 'BUYER' },
    )
    expect(res.success).toBe(true)
    expect(mdb.inquiry.create).toHaveBeenCalledTimes(1)
    expect(created.rows[0].userId).toBe('real-user')
  })

  it('anon callers create unattributed inquiries (null), as today', async () => {
    const res = await toolCreateInquiry({ name: 'Sara', phone: '01012345678', userId: 'evil-user' })
    expect(res.success).toBe(true)
    expect(created.rows[0].userId).toBeNull()
  })
})

// ─── FIX 2: csp-report validator ───────────────────────────

describe('FIX 2 — csp-report intake validation', () => {
  it('accepts the legacy csp-report shape → 201 + JSONL append', async () => {
    const res: any = await cspPost(postReq({ 'csp-report': { 'document-uri': 'https://x.example/', 'violated-directive': 'script-src' } }))
    expect(res.status).toBe(201)
    expect(fsState.lines).toHaveLength(1)
    expect(JSON.parse(fsState.lines[0]).report['csp-report']['violated-directive']).toBe('script-src')
  })

  it('accepts the Reporting-API shape → 201', async () => {
    const res: any = await cspPost(postReq({ type: 'csp-violation', body: { blockedURL: 'https://evil.example/x.js' } }))
    expect(res.status).toBe(201)
  })

  it('rejects garbage / invalid JSON / oversized bodies → 400, writes nothing', async () => {
    expect((await cspPost(postReq({ hello: 'world' })) as any).status).toBe(400)
    expect((await cspPost(postReq('not json{{{')) as any).status).toBe(400)
    const big = { 'csp-report': { 'document-uri': 'https://x.example/' }, pad: 'x'.repeat(11 * 1024) }
    expect((await cspPost(postReq(big)) as any).status).toBe(400)
    expect(fsState.lines).toHaveLength(0)
  })

  it('rate-limited callers → 429 and GET → 405', async () => {
    rateState.ok = false
    const rl: any = await cspPost(postReq({ 'csp-report': { 'document-uri': 'https://x.example/' } }))
    expect(rl.status).toBe(429)
    expect((await cspGet() as any).status).toBe(405)
  })
})
