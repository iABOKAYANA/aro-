/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Edge/middleware safe (no imports from Node-only APIs, no shared mutable
 * module state across isolates is required for correctness — each isolate
 * keeps its own map, which is fine: it only ever *under*-counts).
 *
 * Not a distributed limiter: for a multi-instance deployment swap the Map
 * for Redis. Everything else in this file stays the same.
 */

import type { Redis } from '@upstash/redis'

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const MAX_BUCKETS = 10_000

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
    if (buckets.size < MAX_BUCKETS) break
  }
}

export type RateLimitResult = {
  ok: boolean
  /** Requests still allowed inside the current window. */
  remaining: number
  /** Epoch ms when the window resets — send as `Retry-After`. */
  resetAt: number
}

/**
 * One client-IP extractor every limiter uses (middleware + API routes).
 *
 * Header precedence (first non-empty wins):
 *   1. `x-vercel-forwarded-for` — set by Vercel's edge from the actual peer;
 *      the platform-controlled value, so it cannot be spoofed through Vercel.
 *   2. `x-real-ip` — likewise set by Vercel (and most reverse proxies) to the
 *      client IP. Single value, no list parsing.
 *   3. `x-forwarded-for` first entry — generic fallback for non-Vercel
 *      deployments. Client-influenced (any hop can prepend values), so it is
 *      only ever a rate-limit *key*, never an auth decision.
 *   4. `'local'` — nothing forwarded (local dev / direct connection).
 *
 * Strict mode (`TRUSTED_PROXY_CIDRS` non-empty): steps 2–3 are skipped and the
 * result is the platform header or `'local'`. Rationale: `x-forwarded-for`
 * and `x-real-ip` arrive as plain headers — on a direct connection the client
 * sets them freely, so trusting them lets any caller pick its own rate-limit
 * bucket (limit evasion) or squat in a victim's bucket (selective 429s).
 *
 * RESIDUAL (stated plainly): this function receives headers only — never the
 * transport peer address — so it CANNOT verify the request actually traversed
 * a listed CIDR. `TRUSTED_PROXY_CIDRS` is therefore a trust toggle, not a
 * check: setting it means "an edge I operate strips/forges these headers, so
 * stop reading the client-influenced ones". The CIDR allowlisting itself must
 * live at that edge/proxy (or WAF); nothing in this repo performs it.
 * What verifiably bounds the damage today (grep `getClientIp`): every caller
 * feeds the result ONLY into `rateLimit(...)` keys (middleware auth throttle
 * + ~15 API routes). No authentication, authorization, or identity branch
 * reads it — worst case is rate-limit evasion/sharing, never privilege
 * escalation. Which edge overwrites what in prod was NOT verified from this
 * repo (no edge config checked in) — confirm before relying on step 1.
 *
 * Takes `Headers` so both edge middleware (`NextRequest.headers`) and route
 * handlers (`Request.headers`) can pass straight through. Only the first
 * comma-separated entry is ever used; empty/whitespace values fall through.
 */
export function getClientIp(headers: Pick<Headers, 'get'>): string {
  const firstEntry = (raw: string | null): string | null => {
    if (!raw) return null
    const entry = raw.split(',')[0].trim()
    return entry || null
  }

  const vercel = firstEntry(headers.get('x-vercel-forwarded-for'))
  if (vercel) return vercel
  // Strict mode: distrust client-influenced headers (see above). Read per
  // call (not module load) so tests and edge isolates see the current env.
  if ((process.env.TRUSTED_PROXY_CIDRS ?? '').trim() !== '') return 'local'
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return firstEntry(headers.get('x-forwarded-for')) ?? 'local'
}

export function rateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now()
  prune(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { ok: true, remaining: limit - 1, resetAt }
  }

  bucket.count += 1
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  }
}

/**
 * Forget a key entirely — call after a *successful* login so a legit user who
 * mistyped their password twice never sits on a stale counter.
 */
export function rateLimitReset(key: string) {
  buckets.delete(key)
}

/* ─── Redis-backed distributed limiter (opt-in, async twins) ─────
 *
 * The sync `rateLimit` / `rateLimitReset` above stay exactly as-is: they are
 * called synchronously from edge middleware + 15 API routes, and a sync
 * function physically cannot await a Redis round-trip. The Redis path is
 * therefore exposed as async twins (`rateLimitAsync` / `rateLimitResetAsync`)
 * with identical key/window/count semantics. Wiring a caller over is a
 * one-word diff (`await rateLimitAsync(...)`); until then every existing
 * caller keeps working untouched, with or without Redis configured.
 *
 * BACKEND SELECTION (lazy, per isolate):
 *   - Both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set →
 *     shared Redis backend via `Redis.fromEnv()` (singleton per isolate).
 *   - Either missing (local dev, preview without the integration) → the sync
 *     in-memory `rateLimit` is called directly: byte-identical behavior.
 *   - Any Redis error at call time (network, auth, timeout) → falls back to
 *     in-memory for that call (fail-OPEN: a limiter outage must never 500
 *     real traffic; worst case it under-counts, same as today per-isolate).
 *
 * OWNER SETUP — paste these two values in Vercel → Project → Settings →
 * Environment Variables (values come from the Upstash dashboard / Vercel
 * Marketplace Upstash integration; no code change or redeploy beyond that):
 *   - `UPSTASH_REDIS_REST_URL`
 *   - `UPSTASH_REDIS_REST_TOKEN`
 * No account / no vars → everything works as today (in-memory). Nothing else
 * reads these names.
 *
 * SEMANTICS PARITY with the in-memory path (same key, same fixed window —
 * note: despite the old "sliding-window" header, both implementations are a
 * fixed window anchored at the first request after expiry):
 *   - Redis key = the consumer key verbatim (`auth:<ip>:<path>`, `apply:<ip>`,
 *     …). No prefix is added, so dashboards show exactly what callers pass.
 *   - One MULTI/EXEC transaction per check: INCR + PEXPIRE(key, windowMs, NX)
 *     + PTTL. NX sets the TTL only when the key has none, so the window is
 *     anchored at the first request — exactly like the in-memory bucket. The
 *     transaction is atomic server-side (no Lua needed): concurrent first-hits
 *     serialize, counts are exact, and exactly one window wins. Accepted race:
 *     none that matters — INCR and the NX expiry land in the same atomic unit,
 *     so a counter can never outlive its window and a window can never drop
 *     its counter.
 *   - resetAt = Date.now() + PTTL (≈ first-hit + windowMs; off by <1 RTT,
 *     conservative for Retry-After). If PTTL ever reports missing (defensive;
 *     cannot happen right after INCR), falls back to now + windowMs.
 *   - Count mapping identical: first hit → { ok: true, remaining: limit-1 };
 *     later → { ok: count <= limit, remaining: max(0, limit-count) }.
 *   - windowMs is clamped to ≥1ms for the Redis path only: PEXPIRE 0 would
 *     delete the key and pin count at 1 (fail-open divergence). No caller
 *     passes <60s today.
 *
 * Edge-safe: @upstash/redis is fetch-based (no Node-only APIs); the client is
 * constructed lazily inside the enabled path only, so module load never throws
 * when the env vars are absent.
 */

/** True when both Upstash REST env vars are present (Redis path active). */
export function isRedisRateLimitEnabled(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  )
}

/** Per-isolate singleton. `undefined` = not attempted yet; `null` = disabled. */
let redisClientSingleton: Redis | null | undefined

function getRedisClient(): Promise<Redis | null> {
  if (redisClientSingleton !== undefined)
    return Promise.resolve(redisClientSingleton)
  // Env check first: without vars we never even load '@upstash/redis'.
  // Dynamic import keeps the package out of the middleware hot-path bundle:
  // the sync `rateLimit` path never reaches here, so it never loads Redis.
  // Only the async twins pay the import cost, on first use with vars set.
  if (!isRedisRateLimitEnabled()) {
    redisClientSingleton = null
    return Promise.resolve(redisClientSingleton)
  }
  return import('@upstash/redis')
    .then(({ Redis }) => {
      try {
        // retry:false → a Redis outage fails fast into the in-memory fallback
        // instead of stalling every rate-limited request on REST retries.
        redisClientSingleton = isRedisRateLimitEnabled()
          ? Redis.fromEnv({ retry: false })
          : null
      } catch {
        redisClientSingleton = null
      }
      return redisClientSingleton
    })
    .catch(() => {
      redisClientSingleton = null
      return redisClientSingleton
    })
}

/**
 * Async twin of `rateLimit`: Redis fixed-window when
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, otherwise —
 * and on any Redis error — the identical in-memory path. Same options,
 * same result shape.
 */
export async function rateLimitAsync(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): Promise<RateLimitResult> {
  const client = await getRedisClient()
  if (!client) return rateLimit(key, { limit, windowMs })

  const now = Date.now()
  const ttl = Math.max(1, Math.floor(windowMs))
  try {
    const [count, , ttlMs] = await client
      .multi()
      .incr(key)
      .pexpire(key, ttl, 'NX')
      .pttl(key)
      .exec()
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: now + (ttlMs >= 0 ? ttlMs : windowMs),
    }
  } catch {
    // Fail open to the per-isolate map — same under-counting as today.
    return rateLimit(key, { limit, windowMs })
  }
}

/**
 * Async twin of `rateLimitReset`: best-effort Redis DEL (when enabled) plus
 * an unconditional in-memory clear, so mixed sync/async callers during
 * migration can never leave a stale counter behind.
 */
export async function rateLimitResetAsync(key: string): Promise<void> {
  const client = await getRedisClient()
  if (client) {
    try {
      await client.del(key)
    } catch {
      // Best-effort only; the memory clear below still runs.
    }
  }
  rateLimitReset(key)
}
