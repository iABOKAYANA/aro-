import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { getItemAsync, setItemAsync } from '@/lib/storage';

/**
 * Optional app lock: device auth (biometrics, with the OS device-PIN fallback)
 * gates the signed-in session on this device.
 *
 * The honest gap this closes: the session JWT lives in SecureStore, which the
 * OS releases to the app as soon as the device itself is unlocked. Without
 * this gate, anyone holding an unlocked phone walks straight into a signed-in
 * account. When the user opts in here, the session is never *released* to the
 * UI — cold start or return-from-background — until device auth succeeds.
 *
 * Design:
 * - Default OFF, persisted as `ghaya.appLock` (`'1'` / absent) via the same
 *   fail-soft storage every other device-local choice uses.
 * - `locked` starts true on cold start whenever the flag is on; the overlay in
 *   `_layout` covers the whole tree (fail-closed: nothing beneath is visible
 *   or tappable until `unlock()` succeeds).
 * - Foreground-after-background re-locks after a 30s grace so quick app
 *   switches (copy a code, check a message) do not nag; longer absences do.
 * - `authenticateAsync` keeps the OS default `disableDeviceFallback: false`,
 *   so after failed biometric attempts the system offers the device
 *   PIN/passcode — biometrics with device-PIN fallback per OS, no custom
 *   fallback UI to get wrong.
 * - No-hardware path: `supported` resolves false (no scanner, nothing
 *   enrolled, web, or any throw) and the settings toggle hides itself — a
 *   device that cannot lock never pretends it can.
 * - Failed auth stays locked with a retry button plus a "sign out" escape, so
 *   a user who can no longer authenticate is never stranded.
 */

const FLAG_KEY = 'ghaya.appLock';

/** Grace before a background→foreground return re-locks. Reported: 30s. */
export const APP_LOCK_GRACE_MS = 30_000;

type AppLockContextValue = {
  /** User opted in (persisted). */
  enabled: boolean;
  /** Device can actually do device auth. False → hide the toggle. */
  supported: boolean;
  /** Still resolving flag + hardware probe. */
  loading: boolean;
  /** True when the gate must cover the app. */
  locked: boolean;
  /** True while the OS prompt is up. */
  authenticating: boolean;
  /** Last auth failure as a raw code, for the overlay to message on. */
  lastError: string | null;
  /** Run the OS prompt; success clears `locked`. Never throws. */
  unlock: (promptMessage?: string) => Promise<boolean>;
  /** Opt in (authenticates first: prove you can unlock before locking). */
  enable: (promptMessage?: string) => Promise<boolean>;
  /** Opt out. No auth needed — you are already inside. */
  disable: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

async function probeSupport(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    return (
      hardware && enrolled !== LocalAuthentication.SecurityLevel.NONE
    );
  } catch {
    // A probe that throws is a device that cannot lock — never crash boot.
    return false;
  }
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  // Cold start: read the flag + probe hardware. Locked-from-boot when opted
  // in; the actual session check happens in the overlay (no session → no gate
  // needed, and the flag alone must never trap a signed-out visitor).
  useEffect(() => {
    let live = true;
    (async () => {
      const [raw, support] = await Promise.all([getItemAsync(FLAG_KEY), probeSupport()]);
      if (!live) return;
      const on = raw === '1';
      setEnabled(on);
      setSupported(support);
      // Fail-closed only where it matters: opted in AND capable. An opted-in
      // device that lost its biometrics (reset, hardware change) drops to
      // unsupported → overlay hides, session usable — reported, not stranded.
      setLocked(on && support);
      setLoading(false);
    })().catch(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  const unlock = useCallback(async (promptMessage?: string): Promise<boolean> => {
    setAuthenticating(true);
    setLastError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        ...(promptMessage ? { promptMessage } : null),
        // disableDeviceFallback defaults to false → OS offers device PIN /
        // passcode after failed biometrics. Stated explicitly so the fallback
        // survives a future reader "simplifying" the call.
        disableDeviceFallback: false,
      });
      if (result.success) {
        backgroundedAt.current = null;
        setLocked(false);
        return true;
      }
      setLastError(result.success === false && 'error' in result ? result.error : 'unknown');
      return false;
    } catch {
      setLastError('unknown');
      return false;
    } finally {
      setAuthenticating(false);
    }
  }, []);

  const enable = useCallback(
    async (promptMessage?: string): Promise<boolean> => {
      // Prove the device authed before persisting the flag — opting into a lock
      // you cannot open would strand you at the next cold start.
      const ok = await unlock(promptMessage);
      if (!ok) return false;
      await setItemAsync(FLAG_KEY, '1');
      setEnabled(true);
      setLocked(false);
      return true;
    },
    [unlock],
  );
  const disable = useCallback(async (): Promise<void> => {
    await setItemAsync(FLAG_KEY, '0');
    setEnabled(false);
    setLocked(false);
    setLastError(null);
  }, []);

  // Foreground-after-background: re-lock past the grace. Records the moment
  // the app leaves the foreground; on return, a quick switch stays unlocked.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const away = backgroundedAt.current;
        backgroundedAt.current = null;
        if (away == null) return;
        setEnabled((isOn) => {
          if (isOn && Date.now() - away > APP_LOCK_GRACE_MS) setLocked(true);
          return isOn;
        });
      }
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<AppLockContextValue>(
    () => ({ enabled, supported, loading, locked, authenticating, lastError, unlock, enable, disable }),
    [enabled, supported, loading, locked, authenticating, lastError, unlock, enable, disable],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used inside <AppLockProvider>');
  return ctx;
}
