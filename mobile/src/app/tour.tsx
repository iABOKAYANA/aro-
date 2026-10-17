import Constants from 'expo-constants';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Btn, Empty, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { createStyles } from '@/lib/theme';

// Pinned viewer assets — runtime CDN only, so zero bundle/build impact: no npm
// dependency to compile and no `window` access at import time. Both URLs
// returned HTTP 200 when this feature was built (pannellum's npm `latest`
// is 2.5.7; 2.5.6 is pinned because its build/ layout was verified).
const PANNELLUM_CSS = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
const PANNELLUM_JS = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';

/** After this many WebView failures we stop swapping views and stay on the static fallback. */
const MAX_WEBVIEW_ERRORS = 2;

/**
 * `true` only for `http://` hosts that can plausibly be LAN testing
 * (localhost + RFC 1918 private ranges, optional port). Everything else over
 * plain HTTP is rejected — panorama URLs must be `https://`.
 */
const LAN_HTTP_HOST =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?([/?#]|$)/i;

/**
 * URL gate: never crash on weird input, never mount a WebView for it.
 * Accepts `https://` anywhere, plus `http://` for LAN testing only.
 */
function isValidPanoramaUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return false;
  if (/^https:\/\//i.test(value)) return true;
  if (/^http:\/\//i.test(value)) return LAN_HTTP_HOST.test(value);
  return false;
}

/**
 * Expo Go ships no native WebView module (`react-native-webview` needs a dev
 * build), so mounting one there renders a native-module error. `appOwnership`
 * is `expo` only inside Expo Go and `null` elsewhere (dev builds included),
 * which makes it the exact gate — `executionEnvironment` would also match dev
 * builds and is deliberately not used here.
 */
function isExpoGo(): boolean {
  try {
    return (Constants.appOwnership as string | null) === 'expo';
  } catch {
    return false;
  }
}

/**
 * Inline pannellum page: drag-to-look + pinch-zoom. Any failure — CDN
 * unreachable, library missing, or the panorama itself unloadable — posts
 * `pano-error` back so the screen can swap to its friendly error state.
 */
function buildHtml(panoramaUrl: string): string {
  const urlJson = JSON.stringify(panoramaUrl);
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${PANNELLUM_CSS}" />
<style>html,body,#pano{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#080e1a}</style>
</head><body><div id="pano"></div>
<script src="${PANNELLUM_JS}"></script>
<script>
(function () {
  function fail() {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pano-error' })); } catch (e) {}
  }
  if (!window.pannellum) { fail(); return; }
  try {
    var viewer = window.pannellum.viewer('pano', {
      type: 'equirectangular',
      panorama: ${urlJson},
      autoLoad: true,
      showControls: false,
      compass: false
    });
    viewer.on('error', fail);
  } catch (e) { fail(); }
})();
</script></body></html>`;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Interactive 360° viewer — route `/tour` (registered in `_layout.tsx`).
 *
 * CONTRACT (entry buttons get wired by a follow-up agent — keep exact):
 * params `url` (panorama image URL, required) + `title` (optional label).
 * A missing `url` or a failed load renders a friendly empty/error state
 * instead of the viewer.
 *
 * Failure modes, each with a graceful render:
 * - missing `url` → `pano.empty` state (unchanged).
 * - invalid `url` (non-http(s), empty, garbage) → `pano.invalid` state; no
 *   WebView is ever mounted for it.
 * - Expo Go (`appOwnership === 'expo'`, no native WebView module) → the
 *   WebView is never mounted; the panorama renders as a zoomable static
 *   photo with an explanatory note.
 * - WebView/CDN/panorama failure (native error, HTTP error, or pannellum
 *   `pano-error`: CDN offline, blocked, bad image) → static-photo fallback.
 *   After ≥2 failures we stay on the fallback with a one-line note instead
 *   of swapping views on every error.
 * - static photo also unloadable → `pano.failed` state with open-in-browser.
 */
export default function TourScreen() {
  const styles = useStyles();
  const { t, align } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string | string[]; title?: string | string[] }>();
  const url = firstParam(params.url).trim();
  const title = firstParam(params.title).trim();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);
  const [webviewErrors, setWebviewErrors] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  // Dedupes the several signals one broken mount can emit (onError +
  // onHttpError + pannellum postMessage) so a single incident counts once.
  const countedAttempt = useRef(-1);

  const inExpoGo = useMemo(() => isExpoGo(), []);
  const valid = isValidPanoramaUrl(url);
  const html = useMemo(() => (valid ? buildHtml(url) : null), [url, valid]);
  const exhausted = webviewErrors >= MAX_WEBVIEW_ERRORS;
  // Static-photo fallback: Expo Go (WebView never mounts there) or the
  // WebView already reported a failure. Kept mounted once shown — no silent
  // retry loops; the user retries explicitly.
  const showFallback = valid && !imageFailed && (inExpoGo || webviewErrors >= 1);

  function reportWebError() {
    if (countedAttempt.current === attempt) return;
    countedAttempt.current = attempt;
    setLoading(false);
    setWebviewErrors((n) => Math.min(n + 1, MAX_WEBVIEW_ERRORS));
  }

  /** Back to the interactive viewer (dev builds). Resets the error budget. */
  function retryViewer() {
    countedAttempt.current = -1;
    setImageFailed(false);
    setImageLoading(true);
    setLoading(true);
    setWebviewErrors(0);
    setAttempt((n) => n + 1);
  }

  /** The static photo failed too — reload it (and the viewer outside Expo Go). */
  function retryAll() {
    if (inExpoGo) {
      setImageFailed(false);
      setImageLoading(true);
      setAttempt((n) => n + 1);
    } else {
      retryViewer();
    }
  }

  function openInBrowser() {
    void Linking.openURL(url).catch(() => {});
  }

  if (!url || !html) {
    const invalid = url.length > 0;
    return (
      <Screen>
        <Stack.Screen options={{ title: t('pano.title') }} />
        <Empty
          title={t(invalid ? 'pano.invalid' : 'pano.empty')}
          message={t(invalid ? 'pano.invalidHint' : 'pano.emptyHint')}
          action={<Btn title={t('common.back')} onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  if (showFallback) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: title || t('pano.title') }} />
        {title ? <Text style={[styles.caption, align]}>{title}</Text> : null}
        <Text style={[styles.hint, align]}>{t('pano.staticHint')}</Text>
        <ScrollView
          style={styles.staticWrap}
          contentContainerStyle={styles.staticContent}
          minimumZoomScale={1}
          maximumZoomScale={4}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}>
          <Image
            key={attempt}
            source={{ uri: url }}
            style={styles.staticImage}
            resizeMode="contain"
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageLoading(false);
              setImageFailed(true);
            }}
          />
          {imageLoading ? (
            <View style={styles.staticLoading}>
              <ActivityIndicator size="large" />
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.fallbackFoot}>
          <Text style={[styles.hint, align]}>
            {t(inExpoGo ? 'pano.expoGoNote' : exhausted ? 'pano.gaveUpNote' : 'pano.failedHint')}
          </Text>
          <View style={styles.actions}>
            {inExpoGo ? null : <Btn title={t('common.retry')} onPress={retryViewer} />}
            <Btn title={t('pano.openBrowser')} variant="ghost" onPress={openInBrowser} />
          </View>
        </View>
      </View>
    );
  }

  if (imageFailed) {
    return (
      <Screen>
        <Stack.Screen options={{ title: title || t('pano.title') }} />
        <Empty
          title={t('pano.failed')}
          message={t('pano.failedHint')}
          action={
            <View style={styles.actions}>
              <Btn title={t('common.retry')} onPress={retryAll} />
              <Btn title={t('pano.openImage')} variant="ghost" onPress={openInBrowser} />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: title || t('pano.title') }} />
      {title ? <Text style={[styles.caption, align]}>{title}</Text> : null}
      <Text style={[styles.hint, align]}>{t('pano.hint')}</Text>
      <WebView
        key={attempt}
        style={styles.viewer}
        // Tight navigation gate: this page is our own inline pannellum HTML
        // and never navigates legitimately. Subresource loads (CDN JS/CSS,
        // the panorama image itself) are unaffected — only top-level
        // navigations are filtered, so a compromised/hijacked CDN script
        // cannot bounce the viewer to an attacker page.
        originWhitelist={['https://cdn.jsdelivr.net/*']}
        javaScriptEnabled
        // Pannellum needs no DOM storage, and inline HTML needs no file
        // access — both stay off to shrink the renderer surface.
        domStorageEnabled={false}
        allowFileAccess={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        source={{ html }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={reportWebError}
        onHttpError={reportWebError}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (data?.type === 'pano-error') reportWebError();
          } catch {
            // Non-JSON chatter from the page — ignore.
          }
        }}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
          <Text style={[styles.hint, align]}>{t('pano.loading')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    caption: { color: t.foreground, fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingTop: 12 },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 6 },
    viewer: { flex: 1, backgroundColor: '#080e1a' },
    loading: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#080e1a',
    },
    staticWrap: { flex: 1, backgroundColor: '#080e1a' },
    staticContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    staticImage: { width: '100%', aspectRatio: 2 },
    staticLoading: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackFoot: { paddingHorizontal: 16, paddingBottom: 16 },
    actions: { gap: 8, marginTop: 12 },
  }),
);
