import { useEffect, useState } from 'react';

import { API_URL } from '@/api/config';
import type { Lang } from '@/i18n';

/**
 * No-auth public config reader — the mobile twin of the website's
 * `WhatsAppBubble` fetch (`src/components/layout/whatsapp-bubble.tsx`).
 *
 * Contract (see `src/app/api/public-config/route.ts`, read-only): the route
 * answers with NO auth and returns ONLY safe whitelisted keys —
 * `{ currency, currencyRates, cta: { enabled, whatsappNumber, messageEn,
 * messageAr, labelEn, labelAr } }`. Anything else on the payload is ignored.
 *
 * Fail-soft by design: any fetch failure resolves to `null` and every
 * consumer hides (never an error strip, never a dead button).
 */

/** Live shape of `GET /api/public-config` → `cta`. */
export type PublicCta = {
  enabled: boolean;
  whatsappNumber: string;
  messageEn: string;
  messageAr: string;
  labelEn: string;
  labelAr: string;
};

type PublicConfigPayload = {
  cta?: Partial<PublicCta> | null;
  // currency / currencyRates and any future safe keys are ignored here.
};

/** How long a fetched block is reused before the next screen revalidates. */
const TTL_MS = 5 * 60 * 1000;

let cached: { at: number; value: PublicCta | null } | null = null;
let inflight: Promise<PublicCta | null> | null = null;

function normalise(raw: Partial<PublicCta> | null | undefined): PublicCta | null {
  if (!raw || typeof raw !== 'object') return null;
  // Same sanitise the route applies: digits-only number, hard caps.
  return {
    enabled: raw.enabled === true,
    whatsappNumber: String(raw.whatsappNumber ?? '').replace(/\D/g, '').slice(0, 15),
    messageEn: String(raw.messageEn ?? '').slice(0, 500),
    messageAr: String(raw.messageAr ?? '').slice(0, 500),
    labelEn: String(raw.labelEn ?? '').slice(0, 120),
    labelAr: String(raw.labelAr ?? '').slice(0, 120),
  };
}

/** One shared request no matter how many screens ask — never throws. */
export function loadPublicCta(): Promise<PublicCta | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value);
  if (!inflight) {
    inflight = fetch(`${API_URL}/api/public-config`, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? (res.json() as Promise<PublicConfigPayload>) : null))
      .then((payload) => normalise(payload?.cta))
      .catch(() => null)
      .then((value) => {
        cached = { at: Date.now(), value };
        inflight = null;
        return value;
      });
  }
  return inflight;
}

/** Reactive view of the CTA block — `null` while loading or on any failure. */
export function usePublicCta(): PublicCta | null {
  const [cta, setCta] = useState<PublicCta | null>(() =>
    cached && Date.now() - cached.at < TTL_MS ? cached.value : null,
  );

  useEffect(() => {
    let cancelled = false;
    // loadPublicCta never rejects (failure → null), so no catch needed.
    void loadPublicCta().then((value) => {
      if (!cancelled) setCta(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return cta;
}

/**
 * Visibility rule, identical to the website bubble: enabled AND a diallable
 * number (7+ digits). Disabled / empty / short / failed-fetch → hidden.
 */
export function isCtaVisible(cta: PublicCta | null): boolean {
  if (!cta || !cta.enabled) return false;
  return cta.whatsappNumber.replace(/\D/g, '').length >= 7;
}

/** Language pick with fallback — same order the website bubble uses. */
export function ctaMessage(cta: PublicCta, lang: Lang): string {
  return lang === 'ar' ? cta.messageAr || cta.messageEn : cta.messageEn || cta.messageAr;
}

/** Language pick with fallback to the caller's default label. */
export function ctaLabel(cta: PublicCta, lang: Lang, fallback: string): string {
  const label = lang === 'ar' ? cta.labelAr || cta.labelEn : cta.labelEn || cta.labelAr;
  return label || fallback;
}

/** Pure `wa.me` deep link — no API, no auto-send. Null when hidden. */
export function ctaUrl(cta: PublicCta, lang: Lang): string | null {
  if (!isCtaVisible(cta)) return null;
  const digits = cta.whatsappNumber.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(ctaMessage(cta, lang))}`;
}
