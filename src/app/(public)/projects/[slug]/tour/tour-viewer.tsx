'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useLanguage } from '@/lib/language-context';

// Pinned viewer assets — runtime CDN injection only, so this component never
// touches `window` at import time and adds nothing to the build bundle: no
// npm dependency, no `next/dynamic` with `ssr: false` needed. Both URLs
// returned HTTP 200 when this feature was built (pannellum's npm `latest`
// is 2.5.7; 2.5.6 is pinned because its build/ layout was verified).
const CSS_URL = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
const JS_URL = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';

/**
 * After this many viewer failures we stop swapping views and stay on the
 * static-photo fallback with a one-line note — mirrors mobile's
 * `MAX_WEBVIEW_ERRORS` budget in `mobile/src/app/tour.tsx`.
 */
const MAX_VIEWER_ERRORS = 2;

/**
 * `true` only for `http://` hosts that can plausibly be LAN testing
 * (localhost + RFC 1918 private ranges, optional port). Everything else over
 * plain HTTP is rejected — panorama URLs must be `https://`.
 */
const LAN_HTTP_HOST =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?([/?#]|$)/i;

/**
 * URL gate: never crash on weird input, never mount a viewer for it.
 * Accepts `https://` anywhere, plus `http://` for LAN testing only.
 */
function isValidPanoramaUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return false;
  if (/^https:\/\//i.test(value)) return true;
  if (/^http:\/\//i.test(value)) return LAN_HTTP_HOST.test(value);
  return false;
}

declare global {
  interface Window {
    pannellum?: any;
  }
}

let pannellumPromise: Promise<void> | null = null;

/** Inject the pannellum CSS + JS once per page lifetime. */
function loadPannellum(): Promise<void> {
  if (pannellumPromise) return pannellumPromise;
  pannellumPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'));
      return;
    }
    if (window.pannellum) {
      resolve();
      return;
    }
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = JS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('pannellum failed to load'));
    document.head.appendChild(script);
  });
  return pannellumPromise;
}

function ThumbLabel({ url, index }: { url: string; index: number }) {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const short = (() => {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || url;
    } catch {
      return url;
    }
  })();
  return <>{ar ? `مشهد ${index + 1} — ${short}` : `Scene ${index + 1} — ${short}`}</>;
}

export function TourViewer({
  images,
  startIndex = 0,
  backHref,
  backLabel,
}: {
  images: string[];
  startIndex?: number;
  backHref: string;
  backLabel: string;
}) {
  const { lang, dir } = useLanguage();
  const ar = lang === 'ar';
  const clampedStart = Number.isFinite(startIndex) ? Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0)) : 0;
  const [index, setIndex] = useState(clampedStart);
  const [retryTick, setRetryTick] = useState(0);
  const [failures, setFailures] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  // Dedupes the several signals one broken mount can emit (viewer `error`
  // events can fire more than once) so a single incident counts once.
  const countedKey = useRef<string | null>(null);

  const target = images[index];
  const targetValid = typeof target === 'string' && isValidPanoramaUrl(target);
  const failed = failures >= 1;
  const exhausted = failures >= MAX_VIEWER_ERRORS;
  // Static-photo fallback: the viewer already reported a failure. Kept
  // mounted once shown — no silent retry loops; the user retries explicitly.
  const showFallback = targetValid && !imgFailed && failed;
  const attemptKey = `${index}-${retryTick}`;

  function pickScene(i: number) {
    countedKey.current = null;
    setImgFailed(false);
    setFailures(0);
    setIndex(i);
  }

  /** Back to the interactive viewer. Resets the error budget. */
  function retryViewer() {
    countedKey.current = null;
    setImgFailed(false);
    setFailures(0);
    setRetryTick((n) => n + 1);
  }

  function reportViewerError() {
    if (countedKey.current === attemptKey) return;
    countedKey.current = attemptKey;
    setFailures((n) => Math.min(n + 1, MAX_VIEWER_ERRORS));
  }

  useEffect(() => {
    // Invalid URL or already on the static fallback — the viewer is never
    // mounted here. Tear down any half-initialised viewer from a previous
    // scene so it can't linger behind the fallback.
    if (!targetValid || showFallback) {
      try {
        viewerRef.current?.destroy?.();
      } catch {
        // Tearing down a viewer that never finished loading — nothing to do.
      }
      viewerRef.current = null;
      return;
    }
    let cancelled = false;
    if (!mountRef.current) return;
    const mount = mountRef.current;
    loadPannellum()
      .then(() => {
        if (cancelled || !window.pannellum) {
          if (!cancelled) reportViewerError();
          return;
        }
        try {
          try {
            viewerRef.current?.destroy?.();
          } catch {
            // A half-initialised viewer — safe to drop and rebuild.
          }
          mount.innerHTML = '';
          const viewer = window.pannellum.viewer(mount, {
            type: 'equirectangular',
            panorama: target,
            autoLoad: true,
            showControls: true,
            compass: false,
          });
          viewer.on('error', () => {
            if (!cancelled) reportViewerError();
          });
          viewerRef.current = viewer;
        } catch {
          if (!cancelled) reportViewerError();
        }
      })
      .catch(() => {
        if (!cancelled) reportViewerError();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptKey, images, targetValid, showFallback]);

  useEffect(
    () => () => {
      try {
        viewerRef.current?.destroy?.();
      } catch {
        // Tearing down a viewer that never finished loading — nothing to do.
      }
    },
    [],
  );

  if (images.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold text-foreground">{ar ? 'لسه مفيش صور 360°' : 'No 360° images yet'}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {ar
            ? 'المشروع ده لسه مفيهوش أي صور بانوراما. عدي علينا بعدين أو اتفرج على معرض الصور بدلها.'
            : 'This project has no panorama images attached. Check back later or explore the photo gallery instead.'}
        </p>
        <Link href={backHref} className="mt-2 rounded-full bg-estate-gold px-4 py-2 text-sm font-semibold text-[#0F1A2C] hover:bg-estate-gold-dark">
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir={dir}>
      <div className="kenburns relative overflow-hidden rounded-2xl border border-border bg-black" style={{ height: '62vh' }}>
        {targetValid && !showFallback && !imgFailed ? (
          <div ref={mountRef} className="h-full w-full" />
        ) : null}

        {!targetValid ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
            <p className="font-semibold text-white">{ar ? 'لينك البانوراما مش سليم' : 'Panorama link is not valid'}</p>
            <p className="max-w-md text-sm text-white/60" dir={ar ? 'rtl' : 'ltr'}>
              {ar
                ? 'شكل لينك الجولة دي بايظ. اطلب لينك جديد بيبدأ بـ https://.'
                : 'This tour link looks broken. Ask for a fresh link that starts with https://.'}
            </p>
          </div>
        ) : null}

        {showFallback ? (
          <Image
            key={attemptKey}
            src={target}
            alt={ar ? `معاينة ثابتة — مشهد ${index + 1} من ${images.length}` : `Static preview — scene ${index + 1} of ${images.length}`}
            fill
            className="h-full w-full object-contain animate-kenburns"
            sizes="100vw"
            onError={() => setImgFailed(true)}
          />
        ) : null}

        {/* Cinematic framing — vignette over the viewer/fallback (visual only,
            pointer-events none so pannellum drag + controls keep working). */}
        <div className="cine-vignette" aria-hidden="true" />

        {imgFailed && targetValid ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
            <p className="font-semibold text-white">{ar ? 'مقدرناش نحمّل صورة الـ360°' : 'Could not load the 360° image'}</p>
            <p className="text-sm text-white/60">
              {ar ? 'اتأكد من النت أو جرّب بانوراما تانية.' : 'Check your connection or try another panorama.'}
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={retryViewer}
                className="rounded-full bg-estate-gold px-4 py-2 text-sm font-semibold text-[#0F1A2C] hover:bg-estate-gold-dark"
              >
                {ar ? 'حاول تاني' : 'Try again'}
              </button>
              <a
                href={target}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                {ar ? 'افتح الصورة في تاب جديدة' : 'Open image in a new tab'}
              </a>
            </div>
          </div>
        ) : null}
      </div>

      {showFallback ? (
        <div className="space-y-1 text-center">
          <div className="flex justify-center">
            <p className="cine-kicker">
              {ar
                ? `معاينة ثابتة — قرّب بالسكرول أو بصوابعك · مشهد ${index + 1} من ${images.length}`
                : `Static preview — scroll or pinch to zoom · scene ${index + 1} of ${images.length}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <p className="w-full text-xs text-muted-foreground">
              {exhausted
                ? (ar ? 'عارض الـ360° عطل أكتر من مرة — عارضين البانوراما كصورة بدلها.' : 'The interactive viewer kept failing — showing the panorama as a photo instead.')
                : (ar ? 'اتأكد من النت أو جرّب بانوراما تانية.' : 'Check your connection or try another scene.')}
            </p>
            <button
              type="button"
              onClick={retryViewer}
              className="rounded-full bg-estate-gold px-4 py-2 text-sm font-semibold text-[#0F1A2C] hover:bg-estate-gold-dark"
            >
              {ar ? 'حاول تاني' : 'Try again'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <p className="cine-kicker">
            {ar ? 'اسحب عشان تبص حواليك · قرّب بالسكرول أو بصوابعك' : 'Drag to look around · scroll or pinch to zoom'}
          </p>
        </div>
      )}

      {images.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {images.map((url, i) => (
            <button
              key={`${i}-${url}`}
              type="button"
              onClick={() => pickScene(i)}
              className={
                i === index
                  ? 'max-w-full truncate rounded-full border border-estate-gold/50 bg-estate-gold/15 px-3 py-1 text-xs text-estate-gold-dark dark:text-estate-gold'
                  : 'max-w-full truncate rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/70'
              }
            >
              <ThumbLabel url={url} index={i} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
