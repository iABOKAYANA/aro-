// Generic text-repair helpers for imported catalog text.
// Conservative by design: only removes well-understood scrape
// artifacts and never invents or rewrites text.

// An ASCII-Latin phrase (1–5 words) immediately repeated with zero
// space between the copies, e.g. "Emaar MisrEmaar Misr". Both outer
// edges must sit on a word boundary, so separated repeats ("very
// very"), newlines between copies, and Arabic-script text never match.
const JAMMED_PHRASE =
  /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9'’&.-]*(?: [A-Za-z0-9'’&.-]+){0,4}?)\1(?![A-Za-z0-9])/g

/**
 * Collapse an immediate, no-space repetition of an ASCII-Latin phrase
 * that HTML stripping produced by concatenating a heading with its own
 * opening ("Emaar MisrEmaar Misr has been" → "Emaar Misr has been").
 *
 * Conservative guards:
 *  - the repeated phrase must contain a space or be ≥6 chars, so short
 *    tokens ("isis") are never merged;
 *  - only applies when the result is at least 2 chars shorter;
 *  - separated repeats ("very very") are untouched (a space sits
 *    between the copies);
 *  - Arabic-script text is untouched (Latin-only pattern).
 */
export function collapseJammedDuplicates(text: string): string {
  if (!text) return text
  let out = text
  for (let pass = 0; pass < 5; pass++) {
    const next = out.replace(JAMMED_PHRASE, (match, phrase: string) => {
      if (!phrase.includes(' ') && phrase.length < 6) return match
      if (match.length - phrase.length < 2) return match
      return phrase
    })
    if (next === out) break
    out = next
  }
  return out
}
