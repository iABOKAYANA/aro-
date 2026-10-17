import { Platform } from 'react-native';

/**
 * Where the Next.js app (the single source of truth) lives.
 *
 * - iOS **simulator** reaches the host's `localhost` directly.
 * - **Android emulator** sees the host as `10.0.2.2`.
 * - A **real phone** must use the machine's LAN IP, e.g.
 *   `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000`.
 *
 * Production points at PROD_API_URL — same API, no code change.
 */

/** Canonical production origin (also baked into preview/production EAS builds via eas.json `env`). */
export const PROD_API_URL = 'https://ghayaestate.com';

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000')
).replace(/\/+$/, '');

/**
 * True when the app talks to a local or LAN API — loopback, the Android
 * emulator alias, or an RFC 1918 private address — i.e. a dev machine, not
 * production. A physical phone on `EXPO_PUBLIC_API_URL=http://192.168.x:3000`
 * is dev; only the public production origin is prod.
 */
const DEV_HOST_PATTERN =
  /(^|\.)localhost$|^127\.0\.0\.1$|^10\.0\.2\.2$|^192\.168\.\d{1,3}\.\d{1,3}$|^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/;

function apiHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export const IS_DEV = DEV_HOST_PATTERN.test(apiHostname(API_URL));
