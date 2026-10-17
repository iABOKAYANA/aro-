import { NextResponse } from 'next/server'

/**
 * Shared cursor-pagination primitives for the CEO list endpoints
 * (`GET /api/ceo/users`, `/api/ceo/developers`, `/api/ceo/brokers`).
 *
 * Contract (identical on all three routes):
 * - Without `?cursor=` / `?limit=`: legacy behavior — full list, unchanged shape.
 * - With either param: `{ items: [...same per-item shape...], nextCursor: string | null }`.
 * - `limit` defaults to 50, clamped to 1–100. Non-numeric limits fall back to 50 (never 400).
 * - `cursor` is opaque: base64url-encoded JSON of the anchor values (never raw ids
 *   in the URL). A present-but-undecodable cursor returns 400, never 500.
 */
export const CEO_DEFAULT_PAGE_LIMIT = 50
export const CEO_MAX_PAGE_LIMIT = 100

export function parsePageLimit(raw: string | null): number {
  if (raw === null) return CEO_DEFAULT_PAGE_LIMIT
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return CEO_DEFAULT_PAGE_LIMIT
  return Math.min(CEO_MAX_PAGE_LIMIT, Math.max(1, n))
}

export function encodePageCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/** @throws on any malformed input — callers map this to a 400, never a 500. */
export function decodePageCursor(raw: string): Record<string, unknown> {
  const json = Buffer.from(raw, 'base64url').toString('utf8')
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid cursor payload')
  }
  return parsed as Record<string, unknown>
}

export function invalidCursorResponse() {
  return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
}
