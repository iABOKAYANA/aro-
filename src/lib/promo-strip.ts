// Strip a partner's self-promotional sentences from imported catalog copy.
//
// Nawy's catalogue text is salted with their own promo ("Call us on 15211…",
// "تواصل معنا في ناوي على رقم 15211…", "Why Get Your Home with Nawy?").
// Running those on our pages advertises a competitor, so any *sentence*
// carrying a promo marker is dropped at import time. This mirrors the
// one-time cleanup that was run over the live catalog (1770 descriptions,
// 2085 sentences removed, 0 remaining markers).
const PROMO_MARKERS = ['15211', 'ناوي', 'nawy']
const PROMO_INLINE: Array<[RegExp, string]> = [
  [/\s*[«"“]?ناوي[»"”]?\s*ناو(?=\s)/g, ' '], // "ناوي ناو" brand artifact
  [/\s*Nawy\s*Now(?=[\s,])/g, ' '],
]
const PROMO_SENT_SPLIT = /(?<=[.!؟?])\s+|\n+/

export function stripNawyPromo(text: string | null | undefined): string {
  if (!text || !PROMO_MARKERS.some((m) => text.toLowerCase().includes(m))) return text ?? ''
  let t = text
  for (const [rx, rep] of PROMO_INLINE) t = t.replace(rx, rep)
  const kept = t
    .split(PROMO_SENT_SPLIT)
    .filter((s) => s && !PROMO_MARKERS.some((m) => s.toLowerCase().includes(m)))
  return kept
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[،,؛;:]+/, '')
    .trim()
}
