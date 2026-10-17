import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import Constants from 'expo-constants';
import type * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';

import { apiFetch, type SessionCredentials } from '@/api/client';
import { resolveLink } from '@/lib/links';

type NotificationResponse = Notifications.NotificationResponse;

/**
 * Push registration + tap-to-open.
 *
 * `expo-notifications` is iOS/Android only, and importing it on web throws at
 * module scope — so every entry point here loads it lazily and treats a
 * failure as "push unavailable", never as an app crash. The whole feature is
 * an enhancement: a device that cannot register still gets every notification
 * in the in-app inbox.
 *
 * The token is *not* cached in storage. It is cheap to re-read from the OS,
 * and keeping the authoritative copy server-side (one row per device, deleted
 * on sign-out) means an uninstalled app stops receiving pushes instead of
 * silently swallowing them forever.
 */

type NotificationsModule = typeof Notifications;

let modulePromise: Promise<NotificationsModule | null> | null = null;
let handlerInstalled = false;

/** Lazily load the native module; `null` on web or if it fails to link. */
function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return Promise.resolve(null);
  if (!modulePromise) {
    modulePromise = import('expo-notifications')
      .then((mod) => {
        if (!handlerInstalled) {
          mod.setNotificationHandler({
            handleNotification: async () => ({
              shouldPlaySound: false,
              shouldSetBadge: false,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
          handlerInstalled = true;
        }
        return mod;
      })
      .catch(() => null);
  }
  return modulePromise;
}

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'no-project-id' | 'denied' | 'failed' };

function expoProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromConfig = extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return fromConfig ?? null;
}

/**
 * Ask for permission and hand the resulting Expo token to the API.
 *
 * Safe to call on every launch: an already-granted permission is a no-op
 * prompt, and the server upserts rather than duplicates.
 *
 * `credentials` is **not optional in practice**: `POST /api/mobile/push-token`
 * is gated by `requireActor()`, so a call without the live session is a 401
 * that this function reports as a generic failure. Both call sites must pass
 * the session or the device never registers at all.
 */
export async function registerForPush(credentials: SessionCredentials = {}): Promise<PushRegistration> {
  const mod = await loadNotifications();
  if (!mod) return { ok: false, reason: 'unsupported' };

  const projectId = expoProjectId();
  if (!projectId) {
    // No EAS project linked yet — `npx eas init` mints one and writes it here.
    return { ok: false, reason: 'no-project-id' };
  }

  try {
    // Android 13+ shows no permission dialog until a channel exists.
    if (Platform.OS === 'android') {
      await mod.setNotificationChannelAsync('default', {
        name: 'GHAYA notifications',
        importance: mod.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#D4A843',
      });
    }

    const current = await mod.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      status = (await mod.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const token = (await mod.getExpoPushTokenAsync({ projectId })).data;

    await apiFetch('/api/mobile/push-token', {
      method: 'POST',
      // The route is session-gated; without this the server answers 401 and
      // the device silently never appears in PushSubscription.
      token: credentials.token,
      cookieName: credentials.cookieName,
      body: JSON.stringify({
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceName: Constants.deviceName ?? null,
      }),
    });

    return { ok: true, token };
  } catch (e) {
    console.warn('[push] registration failed:', e);
    return { ok: false, reason: 'failed' };
  }
}

/** Revoke this device — called on sign-out so a shared phone goes quiet. */
export async function unregisterPush(
  token: string | null | undefined,
  credentials: SessionCredentials = {}
): Promise<void> {
  if (!token || Platform.OS === 'web') return;
  try {
    await apiFetch(`/api/mobile/push-token?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      // Same gate as registration — and this has to run *before* the session
      // is cleared, or the server rejects the revocation.
      token: credentials.token,
      cookieName: credentials.cookieName,
    });
  } catch {
    // Best effort: a leftover row is pruned the first time Expo rejects it.
  }
}

/**
 * Sign this device out of push delivery.
 *
 * Resolves the token from the OS rather than from storage (the app deliberately
 * never caches it) and revokes it **while the session is still valid**, so a
 * signed-out phone stops buzzing instead of keeping a row the API can no longer
 * attribute to anyone. Every failure path is swallowed: losing this race must
 * never block the sign-out the user asked for.
 */
export async function revokePush(credentials: SessionCredentials): Promise<void> {
  if (Platform.OS === 'web') return;
  const mod = await loadNotifications();
  if (!mod) return;
  const projectId = expoProjectId();
  // No EAS project linked ⇒ registration never succeeded ⇒ nothing to revoke.
  if (!projectId) return;

  try {
    const { status } = await mod.getPermissionsAsync();
    // Permission never granted ⇒ no token was ever handed to the server.
    if (status !== 'granted') return;
    const token = (await mod.getExpoPushTokenAsync({ projectId })).data;
    await unregisterPush(token, credentials);
  } catch {
    // Unresolvable token — nothing actionable, and sign-out proceeds regardless.
  }
}

/**
 * Open the screen a tapped notification points at.
 *
 * Mounted once in the root layout. It also replays the *cold-start* response —
 * a notification tapped while the app was terminated would otherwise be
 * dropped before any listener existed.
 */
export function useNotificationNavigation() {
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    function open(response: NotificationResponse | null | undefined) {
      if (!response) return;
      const content = response.notification?.request?.content;
      const requestId = response.notification?.request?.identifier;
      // The same response is delivered once to the listener and once on boot.
      if (requestId && handled.current === requestId) return;
      if (requestId) handled.current = requestId;
      if (response.actionIdentifier && response.actionIdentifier !== 'user') return;

      const data = (content?.data ?? {}) as { link?: unknown; url?: unknown };
      const raw = typeof data.link === 'string' ? data.link : typeof data.url === 'string' ? data.url : null;
      const target: Href | null = resolveLink(raw);
      if (target) router.push(target);
    }

    void (async () => {
      const mod = await loadNotifications();
      if (!mod || cancelled) return;

      const initial = await mod.getLastNotificationResponseAsync();
      open(initial);

      subscription = mod.addNotificationResponseReceivedListener(open);
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);
}
