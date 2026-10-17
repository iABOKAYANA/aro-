import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiFetch } from '@/api/client';
import { useAuth } from '@/auth/auth-context';

/**
 * Data-reading hook every list/detail screen is built on.
 *
 * - one `GET` per `path`, re-issued whenever `path` or the session changes
 * - loading / error / pull-to-refresh handled once instead of per screen
 * - a failed *refresh* keeps the previous data on screen instead of blanking a
 *   page the user is already reading; a failed *first* load shows the error
 * - the in-flight request is **aborted** when `path` changes or the screen
 *   unmounts, so navigating away from a list can neither paint stale rows onto
 *   the next screen nor leave a spinner resolving into nothing
 */
export function useApi<T>(path: string | null, enabled = true) {
  const { session } = useAuth();
  const token = session?.token ?? null;
  const cookieName = session?.cookieName ?? null;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [refreshing, setRefreshing] = useState(false);

  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(
    async (mode: 'first' | 'refresh' = 'first'): Promise<void> => {
      // Deliberately no setState before the first `await`: on the initial load
      // the effect below must not synchronously cascade renders.
      if (!path || !enabled) return;

      // Supersede whatever this path was still waiting on — typing another
      // character in a search box must not let the older response win.
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;

      if (mode === 'refresh') setRefreshing(true);

      try {
        const result = await apiFetch<T>(path, { token, cookieName, signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
      } catch (e) {
        // An abort is the caller changing their mind, not a failure — report
        // nothing so a superseded response never overwrites a newer one.
        if (controller.signal.aborted) return;
        const message = e instanceof ApiError ? e.message : 'Something went wrong.';
        setError(message);
      } finally {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path, enabled, token, cookieName]
  );

  useEffect(() => {
    void load('first');
    return () => {
      // Unmount or path change: stop the request and detach its callbacks.
      inflight.current?.abort();
      inflight.current = null;
    };
  }, [load]);

  /** Re-fetch keeping the current rows visible while it runs. */
  const refresh = useCallback(() => load('refresh'), [load]);

  return {
    data,
    error,
    /** True only while there is nothing to show yet. */
    loading: loading && data === null,
    refreshing,
    refresh,
    /** Replace local data after a mutation, without a round trip. */
    setData,
  };
}

/**
 * Fire-and-forget mutation helper — POST/PATCH/DELETE with a consistent
 * `{ message }` / `{ error }` error surface and the session attached.
 */
export function useMutation() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
      setBusy(true);
      try {
        return await apiFetch(path, {
          method,
          token: session?.token,
          cookieName: session?.cookieName,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } finally {
        setBusy(false);
      }
    },
    [session?.token, session?.cookieName]
  );

  return { busy, run };
}
