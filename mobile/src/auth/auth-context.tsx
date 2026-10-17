import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { apiFetch } from '@/api/client';
import { clearSession, loadSession, saveSession, type AuthUser, type MobileSession } from '@/api/session';
import { revokePush } from '@/lib/push';

/** CEO and ADMIN act as every role — same rule the web enforces. */
export const SUPER_ROLES = ['CEO', 'ADMIN'] as const;

type Status = 'loading' | 'signedIn' | 'signedOut';

type AuthContextValue = {
  status: Status;
  user: AuthUser | null;
  session: MobileSession | null;
  /** Throws with a human-readable message on failure. */
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the session from the server (used on app foreground). */
  refresh: () => Promise<void>;
  /** True when the user holds any of these roles — super roles always pass. */
  hasRole: (...roles: string[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type RawSession = {
  user?: { id?: string; name?: string; email?: string; image?: string | null; role?: string };
};

function fromRawSession(raw: AuthUser, server: RawSession['user']): AuthUser {
  if (!server?.id) return raw;
  return {
    ...raw,
    id: server.id,
    name: server.name ?? raw.name,
    email: server.email ?? raw.email,
    avatar: server.image ?? raw.avatar,
    role: server.role ?? raw.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const signOut = useCallback(async () => {
    // Revoke push **first**: `/api/mobile/push-token` is session-gated, so the
    // device can only take itself off the list while the token still works.
    // Failures are swallowed inside, so this can never block the sign-out.
    if (session) await revokePush({ token: session.token, cookieName: session.cookieName });
    await clearSession();
    setSession(null);
    setStatus('signedOut');
  }, [session]);

  const refresh = useCallback(async () => {
    const stored = await loadSession();
    if (!stored) {
      setSession(null);
      setStatus('signedOut');
      return;
    }

    try {
      const data = await apiFetch<RawSession>('/api/auth/session', {
        cookieName: stored.cookieName,
        token: stored.token,
      });

      // The endpoint answers `{}` for an invalid/expired token rather than 401.
      if (!data?.user?.id) {
        await clearSession();
        setSession(null);
        setStatus('signedOut');
        return;
      }

      const next: MobileSession = { ...stored, user: fromRawSession(stored.user, data.user) };
      await saveSession(next);
      setSession(next);
      setStatus('signedIn');
    } catch {
      // Offline (or server restarting): keep what we have instead of logging
      // the user out of an app that merely lost signal for a second.
      setSession(stored);
      setStatus('signedIn');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<{
      token: string;
      cookieName: string;
      user: AuthUser;
    }>('/api/mobile/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const next: MobileSession = {
      token: result.token,
      cookieName: result.cookieName,
      user: result.user,
    };
    await saveSession(next);
    setSession(next);
    setStatus('signedIn');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      signIn,
      signOut,
      refresh,
      hasRole: (...roles: string[]) => {
        const role = session?.user?.role;
        if (!role) return false;
        if ((SUPER_ROLES as readonly string[]).includes(role)) return true;
        return roles.includes(role);
      },
    }),
    [status, session, signIn, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
