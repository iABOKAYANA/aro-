import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * The app's one key–value store, with a platform-shaped hole in the middle.
 *
 * `expo-secure-store` is native-only: its web module is `export default {}`,
 * so *every* call into it throws `... is not a function` in a browser. That
 * surfaced as sign-in failing outright on `expo start --web` — `saveSession()`
 * rejected, and the login screen showed the raw TypeError instead of a user.
 *
 * So: **Keychain / Keystore on iOS and Android, `localStorage` on web.**
 *
 * The web half is a deliberate, scoped downgrade. A browser has no keychain —
 * `localStorage` is the only durable place a document-scoped origin has — and
 * the value is the same session JWT the website already hands to its own JS
 * during the login round trip. It is readable by anything running on this
 * origin, exactly like the language and currency choices the website keeps in
 * `localStorage` today. Native builds, where the token would otherwise sit in
 * plaintext AsyncStorage, are untouched: they still go through the Keychain.
 *
 * Every export is fail-soft. Storage that refuses to open (private browsing,
 * disabled cookies, quota) must degrade to "did not persist" — never to a
 * crash or a sign-in that appears to fail.
 */

const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  // Static rendering evaluates this bundle with no DOM at all.
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Safari private mode historically threw on property access.
    return null;
  }
}

/** Reads a stored string, or `null` when it is absent or unreadable. */
export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return webStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

/** Persists a string. Resolves even when storage is unavailable. */
export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.setItem(key, value);
    } catch {
      // Quota or a blocked store — the value simply does not outlive the tab.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value).catch(() => {});
}

/** Removes a key. Resolves whether or not the key was there. */
export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.removeItem(key);
    } catch {
      // Nothing to clean up if the store is unreachable.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key).catch(() => {});
}
