import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loginSchema, registerSchema } from '@/lib/validations'

const root = process.cwd()
const src = (p: string) => readFileSync(join(root, p), 'utf8')

// Mirrors the relative-only guard in src/app/auth/login/page.tsx.
function safeCallbackUrl(raw: string | null): string {
  const v = raw || '/dashboard'
  return v.startsWith('/') && !v.startsWith('//') ? v : '/dashboard'
}

describe('FIX 1 — callbackUrl open redirect guard', () => {
  it('keeps relative targets', () => {
    expect(safeCallbackUrl('/dashboard')).toBe('/dashboard')
    expect(safeCallbackUrl('/deals/123')).toBe('/deals/123')
  })

  it('rejects absolute, protocol-relative, and empty targets', () => {
    expect(safeCallbackUrl('https://evil.example/x')).toBe('/dashboard')
    expect(safeCallbackUrl('//evil.example/x')).toBe('/dashboard')
    expect(safeCallbackUrl('javascript:alert(1)')).toBe('/dashboard')
    expect(safeCallbackUrl(null)).toBe('/dashboard')
  })

  it('login page source enforces the relative-only guard', () => {
    const s = src('src/app/auth/login/page.tsx')
    expect(s).toContain("startsWith('/')")
    expect(s).toContain("startsWith('//')")
  })
})

describe('FIX 4 — password minimums on set paths', () => {
  it('registerSchema enforces min-10 for NEW passwords', () => {
    const base = {
      name: 'Ahmed',
      email: 'a@b.com',
      confirmPassword: 'secret123',
    }
    expect(
      registerSchema.safeParse({ ...base, password: 'secret123', confirmPassword: 'secret123' })
        .success,
    ).toBe(false) // 9 chars → rejected
    expect(
      registerSchema.safeParse({ ...base, password: 'secret1234', confirmPassword: 'secret1234' })
        .success,
    ).toBe(true) // 10 chars → accepted
  })

  it('loginSchema floor stays min-6 (no lockout of existing users)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'secret' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '12345' }).success).toBe(false)
  })

  it('server set paths enforce min-10', () => {
    expect(src('src/app/api/auth/change-password/route.ts')).toContain('newPassword.length < 10')
    expect(src('src/app/api/ceo/create-user/route.ts')).toContain('password.length < 10')
    expect(src('src/app/api/ceo/invitations/route.ts')).toContain('password.length < 10')
  })

  it('dashboard settings client check matches min-10', () => {
    expect(src('src/app/(dashboard)/dashboard/settings/page.tsx')).toContain(
      'form.newPassword.length < 10',
    )
  })
})

describe('FIX 2 + FIX 3 — generic auth/invite messages (no oracles)', () => {
  it('mobile login exposes no deactivated-status oracle', () => {
    const s = src('src/app/api/mobile/auth/login/route.ts').toLowerCase()
    expect(s).not.toContain('deactivated')
    expect(s).not.toContain('account is ')
    expect(s).toContain('invalid credentials')
  })

  it('invite endpoints expose no already-registered / pending-invite oracle', () => {
    for (const f of [
      'src/app/api/auth/invite/route.ts',
      'src/app/api/ceo/invitations/route.ts',
    ]) {
      const s = src(f).toLowerCase()
      expect(s).not.toContain('already registered')
      expect(s).not.toContain('already exists')
      expect(s).not.toContain('already been sent')
      expect(s).not.toContain('pending inv')
      expect(s).toContain('409')
    }
  })
})

describe('FIX 5 + FIX 6 + FIX 7 — session age, throttles, demo block', () => {
  it('mobile session ceiling is 7d, not 30d', () => {
    const s = src('src/app/api/mobile/auth/login/route.ts')
    expect(s).toContain('7 * 24 * 60 * 60')
    expect(s).not.toContain('30 * 24 * 60 * 60')
  })

  it('invite / create-user routes are rate-limited', () => {
    expect(src('src/app/api/auth/invite/route.ts')).toContain('rateLimit(')
    expect(src('src/app/api/ceo/invitations/route.ts')).toContain('rateLimit(')
    expect(src('src/app/api/ceo/create-user/route.ts')).toContain('rateLimit(')
  })

  it('login page shows no demo credentials', () => {
    const s = src('src/app/auth/login/page.tsx')
    expect(s).not.toContain('password123')
    expect(s).not.toContain('Demo accounts')
  })
})
