import { API_URL } from './config';

/**
 * Thin HTTP layer for the mobile app.
 *
 * The whole app talks to the **same** Next.js API the website uses, authenticating
 * with the same JWT a browser login mints — only the transport differs. No
 * parallel mobile backend, no duplicated permission logic: whatever the web
 * allows or denies, the app allows or denies, at the same moment.
 *
 * The token rides in `X-Session-Token` rather than `Cookie` on purpose. The
 * `Cookie` header is a forbidden request header in browsers, and React Native
 * delegates to native cookie stacks (NSURLSession / OkHttp) that may drop or
 * rewrite a hand-written one. Middleware folds our header back into a real
 * session cookie before any route handler runs (src/middleware.ts), so
 * downstream everything behaves exactly as it does for a browser.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type SessionCredentials = {
  token?: string | null;
  cookieName?: string | null;
};

export type ApiOptions = RequestInit & SessionCredentials;

function sessionHeaders({ token }: SessionCredentials): Record<string, string> {
  if (!token) return {};
  // encodeURIComponent: the JWE is base64url + '.', but padding and separators
  // must survive an HTTP header round-trip untouched.
  return { 'X-Session-Token': encodeURIComponent(token) };
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, cookieName: _unused, headers, body, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      body,
      headers: {
        Accept: 'application/json',
        // CSRF marker the website middleware expects on cookie-authed
        // mutations. Mobile authenticates via X-Session-Token (not cookies),
        // so the gate ignores token-authed requests — this header changes
        // nothing for the app, it just keeps both clients on one contract.
        'X-Requested-With': 'XMLHttpRequest',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...sessionHeaders({ token }),
        ...(headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    // An abort is a deliberate supersede/unmount, not a network failure —
    // surface it as such so callers never show "Cannot reach the server" for a
    // request they themselves cancelled.
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    // No response at all — server down, wrong IP, no network.
    throw new ApiError(0, 'Cannot reach the server. Check your connection and API address.');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const record = payload as { error?: unknown; message?: unknown } | null;
    const raw = record?.error ?? record?.message;
    const message =
      typeof raw === 'string' && raw
        ? raw
        : response.status === 401
          ? 'Your session has expired. Please sign in again.'
          : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}
