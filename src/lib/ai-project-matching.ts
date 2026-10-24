/** A minimal public-catalog identity needed for safe project-name matching. */
export interface ProjectNameCandidate {
  id: string
  slug: string
  name: string
  nameArabic?: string | null
}

export interface ProjectNameMatch<T extends ProjectNameCandidate> {
  project: T
  score: number
  matchedAlias: string
}

const GENERIC_NAME_WORDS = new Set([
  'the', 'project', 'projects', 'compound', 'compounds', 'residence', 'residences',
  'phase', 'development', 'developments', 'group', 'properties', 'property', 'egypt',
  'new', 'city', 'cairo', 'el', 'al', 'by', 'for',
  'مشروع', 'مشاريع', 'كمبوند', 'كمباوند', 'مرحله', 'المرحله', 'مدينه', 'المدينه', 'نيو', 'كايرو', 'سيتي',
  'للتطوير', 'التطوير', 'مصر', 'الجديده', 'القاهره',
])

// Arabic AREA words that many catalog names carry as locational filler
// ("Moon Residences التجمع الخامس", "مول W55 الشيخ زايد"). A client typing
// "شقة في التجمع" names a PLACE, not one of these projects — so filler never
// counts as name evidence. Normalized forms (ة→ه, أ→ا, ى→ي).
const LOCATION_FILLER_WORDS = new Set([
  'التجمع', 'الخامس', 'السادس', 'العاشر', 'الشيخ', 'زايد', 'الزايد',
  'العلمين', 'الساحل', 'الشمالي', 'الشماليه', 'مطروح', 'السخنه',
  'الغردقه', 'الجونه', 'المعادي', 'القاهره', 'الجديده', 'التمليك',
])

function isNameFiller(token: string): boolean {
  return token.length < 3 || GENERIC_NAME_WORDS.has(token) || LOCATION_FILLER_WORDS.has(token)
}

export function normalizeProjectName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    // Arabic punctuation shares the \u0600-\u06FF block the keep-class
    // below preserves — strip it explicitly or it glues onto tokens
    // ("بارک؟" stops being one typo away from "بارك").
    .replace(/[\u061F\u060C\u061B\u061E\u06D4?!.,،؛]/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True for a single insertion, deletion or substitution (useful for typos). */
function differsByOneCharacter(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false

  let i = 0
  let j = 0
  let differences = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    differences++
    if (differences > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  if (i < a.length || j < b.length) differences++
  return differences <= 1
}

function tokenMatchScore(aliasToken: string, queryTokens: string[]): number {
  let best = 0
  for (const token of queryTokens) {
    if (aliasToken === token) return 1
    // Don't fuzzy-match short tokens: common words otherwise collide with
    // many unrelated project names. Long enough names tolerate one typo.
    const minLength = /[\u0600-\u06FF]/.test(aliasToken) ? 4 : 5
    if (aliasToken.length >= minLength && token.length >= minLength && differsByOneCharacter(aliasToken, token)) {
      best = Math.max(best, 0.8)
    }
  }
  return best
}

function scoreAlias(query: string, alias: string): number {
  const normalizedAlias = normalizeProjectName(alias)
  if (normalizedAlias.length < 3) return 0
  if (` ${query} `.includes(` ${normalizedAlias} `)) return 10_000 + normalizedAlias.length

  const aliasTokens = [...new Set(normalizedAlias
    .split(' ')
    .filter((token) => !isNameFiller(token)))]
  const queryTokens = query.split(' ').filter((token) => !isNameFiller(token))
  if (aliasTokens.length === 0 || queryTokens.length === 0) return 0

  const tokenScores = aliasTokens.map((token) => tokenMatchScore(token, queryTokens))
  const matchedIndexes = tokenScores.map((score, index) => score > 0 ? index : -1).filter((index) => index >= 0)
  const matched = matchedIndexes.map((index) => tokenScores[index])
  const coverage = matched.length / aliasTokens.length
  const hasDistinctiveMatch = matchedIndexes.some((index) => aliasTokens[index].length >= 4)
  let evidenceScore = 100 + matched.length * 20 + Math.round(matched.reduce((sum, score) => sum + score, 0) * 10) +
    matchedIndexes.reduce((sum, index) => sum + aliasTokens[index].length, 0)

  if (aliasTokens.length === 1) {
    const token = aliasTokens[0]
    if (matched.length !== 1 || !hasDistinctiveMatch || (tokenScores[0] < 1 && token.length < 5)) return 0
    return evidenceScore
  }

  // A short reference such as "Eastown" may still identify one catalog
  // project: exactly ONE strong token matched and it is a name word (≥5
  // chars — area words are already stripped above). Ties are returned
  // together so the caller asks the client instead of guessing.
  const standalone = matched.length === 1 &&
    matchedIndexes.some((index) => aliasTokens[index].length >= 5 && tokenScores[index] >= 0.8)
  if (matched.length < 1 || (coverage < 0.6 && !standalone) || !hasDistinctiveMatch) return 0
  // An alias fully covered by the reference ("هايد بارك" names exactly the
  // bare compound, not its suffix variants) wins the family tie.
  if (coverage === 1) evidenceScore += 30
  // Score the evidence, not the full catalog-name length. A partial "Eastown"
  // mention must not outrank another exact Eastown candidate just because one
  // project's display name happens to have more words.
  return evidenceScore
}

function acronymForName(value: string): string {
  const words = normalizeProjectName(value).split(' ').filter((word) => word.length > 1)
  return words.length >= 2 ? words.map((word) => word[0]).join('') : ''
}

/**
 * Rank catalog candidates for ONE user-supplied project reference. Exact
 * English/Arabic names and slugs win; a one-character typo is tolerated only
 * on distinctive name tokens. Ties are preserved for disambiguation.
 */
export function resolveProjectName<T extends ProjectNameCandidate>(
  input: string,
  candidates: T[],
): ProjectNameMatch<T>[] {
  const query = normalizeProjectName(input)
  if (query.length < 3) return []

  const ranked = candidates
    .map((project) => {
      const aliases = [project.name, project.nameArabic || '', project.slug, acronymForName(project.name)]
      let best: ProjectNameMatch<T> | null = null
      for (const alias of aliases) {
        const score = scoreAlias(query, alias)
        if (score > 0 && (!best || score > best.score)) {
          best = { project, score, matchedAlias: alias }
        }
      }
      return best
    })
    .filter((match): match is ProjectNameMatch<T> => match !== null)
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name))

  if (ranked.length === 0) return []
  const highest = ranked[0].score
  return ranked.filter((match) => match.score === highest)
}
