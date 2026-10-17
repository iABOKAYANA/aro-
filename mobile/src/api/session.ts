import { deleteItemAsync, getItemAsync, setItemAsync } from '@/lib/storage';

/**
 * The mobile session is literally the website's session JWT.
 *
 * We keep it in the iOS Keychain / Android Keystore (never AsyncStorage, which
 * is plaintext) and replay it as `X-Session-Token` on every API call, where
 * middleware turns it back into a normal session cookie. On web the same value
 * lands in `localStorage` — see `@/lib/storage` for why that is the only
 * option a browser leaves us, and what it costs.
 */

const KEY = 'ghaya.session';

export type MobileSession = {
  token: string;
  cookieName: string;
  user: AuthUser;
};

export type AuthUser = {
  id: string;
  name: string;
  nameArabic?: string | null;
  email: string;
  avatar?: string | null;
  role: string;
  preferredLang?: string;
  preferredCurrency?: string;
};

export async function loadSession(): Promise<MobileSession | null> {
  try {
    const raw = await getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MobileSession;
    if (!parsed?.token || !parsed?.cookieName || !parsed?.user) return null;
    return parsed;
  } catch {
    // Corrupted entry — treat as signed out rather than crashing at boot.
    await deleteItemAsync(KEY).catch(() => {});
    return null;
  }
}

export async function saveSession(session: MobileSession): Promise<void> {
  // Never rejects: a device that refuses to write must not block a sign-in that
  // otherwise succeeded. The session is then simply in memory until the app is
  // backgrounded away, which beats showing the user a Keychain error they have
  // no way to act on.
  await setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await deleteItemAsync(KEY).catch(() => {});
}
