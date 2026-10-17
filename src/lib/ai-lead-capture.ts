// ─── AI chat upsells: proactive compare nudge + slot-filling lead capture ──
// Pure logic only (no db imports) so it stays unit-testable and portable.
// DB/message plumbing lives in the chat route; this module decides + formats.
//
// Design notes:
// - The web clients (full-page-chat, chat-search) and mobile (assistant.tsx)
//   render per-message chips as STATIC badges only — no client supports
//   one-tap quick-action replies. So the compare "one-tap" is a
//   natural-language offer ("قول أيوه قارن") + deterministic handling of the
//   affirmation for the shown pair. Mobile contract stays text-only.
// - Lead state is server-driven: the route persists it in the latest
//   assistant AIMessage.metadata JSON (`leadCapture`), never in logs.
//   Partial PII (name/phone) is never console-logged anywhere here.

export type ChatLang = 'ar' | 'en'

// ─── Egyptian phone validation ─────────────────────────────────
// Strict mobile idiom: 01xxxxxxxxx — 11 digits, prefixes 010/011/012/015.
// (The create_inquiry tool itself stays loose; this gate runs BEFORE submit
// so the user is re-asked inline instead of failing at the tool.)

const AR_INDIC = '٠١٢٣٤٥٦٧٨٩'
const FA_INDIC = '۰۱۲۳۴۵۶۷۸۹'

function latinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(AR_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_INDIC.indexOf(d)))
}

/** Normalize to local 11-digit form, or null when no digit run exists. */
export function normalizeEgyptianPhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const digits = latinDigits(input).replace(/\D/g, '')
  if (!digits) return null
  let local = digits
  if (local.startsWith('0020')) local = local.slice(4)
  else if (local.startsWith('20') && local.length === 12) local = local.slice(2)
  // Country-code form drops the trunk 0: +20 100 … → local 0100 …
  if (local.length === 10 && local.startsWith('1')) local = `0${local}`
  return local
}

export function isValidEgyptianPhone(input: unknown): boolean {
  const n = normalizeEgyptianPhone(input)
  return !!n && /^01[0125]\d{8}$/.test(n)
}

/** First Egyptian-mobile-looking run inside free text (spaces/dashes ok). */
export function extractEgyptianPhone(text: string): string | null {
  if (typeof text !== 'string') return null
  const latin = latinDigits(text)
  // Direct run with optional separators: 01X + 8 more digits.
  const m = latin.match(/01[0125][\s\-().]*\d[\s\-().]*\d[\s\-().]*\d[\s\-().]*\d[\s\-().]*\d[\s\-().]*\d[\s\-().]*\d[\s\-().]*\d/)
  if (m) {
    const n = normalizeEgyptianPhone(m[0])
    if (n && /^01[0125]\d{8}$/.test(n)) return n
  }
  return null
}

// ─── Name validation ───────────────────────────────────────────

export function isValidLeadName(input: unknown): boolean {
  if (typeof input !== 'string') return false
  const t = input.trim().replace(/\s+/g, ' ')
  if (t.length < 2 || t.length > 120) return false
  // At least one letter (Arabic or Latin) — pure numbers/symbols are out.
  if (!/[A-Za-z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(t)) return false
  // Phone-like strings are not names (the phone step handles those).
  if (/^[\d\s+\-().]+$/.test(t)) return false
  if (isValidEgyptianPhone(t)) return false
  return true
}

// Strips "my name is X and my number is …" wrappers down to a name candidate.
const NAME_PREFIXES = ['اسمي', 'إسمي', 'انا', 'أنا', 'my name is', 'i am', "i'm", 'name']
const NAME_SUFFIXES = ['ورقمي', 'و رقمى', 'رقمي', 'رقمى', 'رقم', 'موبايلي', 'تليفوني', 'and my number is', 'my number is']

export function extractNameAndPhone(text: string): { name: string; phone: string } | null {
  if (typeof text !== 'string') return null
  const phone = extractEgyptianPhone(text)
  if (!phone) return null
  let rest = latinDigits(text)
  // Remove the matched phone run (digits + nearby separators).
  rest = rest.replace(/01[0125][\d\s\-().]*\d{8}/, ' ')
  rest = rest.replace(/[+\-().\d]/g, ' ')
  const words = rest.split(/\s+/).filter(Boolean)
  // Peel connector words off both ends.
  let start = 0
  let end = words.length
  const low = (w: string) => w.toLowerCase()
  while (start < end && NAME_PREFIXES.includes(low(words[start]))) start++
  while (end > start && NAME_SUFFIXES.includes(low(words[end - 1]))) end--
  const candidate = words.slice(start, end).join(' ').trim()
  if (!isValidLeadName(candidate)) return null
  return { name: candidate, phone }
}

// ─── Trigger / cancel / confirm detection ──────────────────────

const LEAD_TRIGGER_RES = [
  /عايز\s+أ?حجز/, /عاوز\s+أ?حجز/, /أ?حجز\s+معاينة/, /عايز\s+معاينة/,
  /عايز\s+زيارة/, /عايز\s+أزور/, /احجز\s*لي/, /احجز(ي)?\s/,
  /كلمني/, /كلموني/, /عايز\s+حد\s+يكلمني/,
  /اتصل\s+(بيا|بيّا|عليا|عليّا)/, /اتصلوا?/,
  /مهتم/, /عايز\s+أشتري/, /عايز\s+اشتري/, /عايز\s+شراء/,
  /i\s+want\s+to\s+book/, /book\s+a\s+(viewing|visit)/, /schedule\s+a\s+(viewing|visit)/,
  /\bcall\s+me\b/, /\bcontact\s+me\b/, /\bi'?m\s+interested\b/, /\bi\s+want\s+to\s+buy\b/,
  /talk\s+to\s+a\s+broker/, /speak\s+with\s+(a\s+)?broker/,
]

// "How do I book?" is a how-to question (site grounding answers it) — not a
// lead. Without this exclusion every booking question would start capture.
const HOWTO_RES = [/ازاي/, /ازاى/, /إزاي/, /كيف/, /طريقة\s+الحجز/, /how\s+(do|can|to)\b/, /\bhow\b.*\bbook\b/]

export function isLeadTrigger(message: string): boolean {
  if (typeof message !== 'string' || !message.trim()) return false
  if (HOWTO_RES.some((r) => r.test(message))) return false
  return LEAD_TRIGGER_RES.some((r) => r.test(message.toLowerCase()) || r.test(message))
}

const CANCEL_RES = [/إلغاء/, /الغاء/, /الغي/, /كنسل/, /\bcancel\b/i, /بلاش/, /مش\s+عايز(\s+احجز|\s+أحجز|\s+اكمل|\s+أكمل)?$/]

export function isCancelMessage(message: string): boolean {
  if (typeof message !== 'string' || !message.trim()) return false
  return CANCEL_RES.some((r) => r.test(message))
}

const YES_RES = [
  /أكّ?د/, /اكد/, /أيوه/, /ايوه/, /أيوة/, /ايوة/, /تمام/, /موافق/,
  /نعم/, /^(اه|آه)$/, /\byes\b/i, /\bconfirm\b/i, /^ok(ay)?$/i, /\byeah\b/i, /\byep\b/i,
]
const NO_RES = [/^(لا|لأ|لاء)$/, /\bno\b/i]

export function isConfirmYes(message: string): boolean {
  if (typeof message !== 'string' || !message.trim()) return false
  const t = message.trim()
  if (isCancelMessage(t)) return false
  return YES_RES.some((r) => r.test(t))
}

export function isConfirmNo(message: string): boolean {
  if (typeof message !== 'string' || !message.trim()) return false
  const t = message.trim()
  return NO_RES.some((r) => r.test(t))
}

// ─── Compare affirmation ───────────────────────────────────────
// Short "yes, compare" replies refer to the pair the assistant just showed.
// Explicit named comparisons ("قارن بين X و Y …" with project names) are LONG
// and stay on the normal LLM compare path — only short affirmations are
// intercepted here. Bare affirmations ("أيوه") count only when the previous
// assistant turn carried a compare nudge.

const COMPARE_WORD_RES = [/قارن/, /مقارن/, /compare/i]
const BARE_AFFIRM_RES = [/^(أيوه|ايوه|أيوة|ايوة|اه|آه|تمام|ماشي|ياريت|yes|yeah|yep|ok|okay)$/i]

export function isCompareAffirm(message: string, lastAssistantContent?: string | null): boolean {
  if (typeof message !== 'string' || !message.trim()) return false
  const t = message.trim()
  if (HOWTO_RES.some((r) => r.test(t))) return false
  const hasCompareWord = COMPARE_WORD_RES.some((r) => r.test(t))
  if (hasCompareWord && t.length <= 30) return true
  if (BARE_AFFIRM_RES.some((r) => r.test(t))) {
    if (typeof lastAssistantContent === 'string' && COMPARE_WORD_RES.some((r) => r.test(lastAssistantContent))) {
      return true
    }
  }
  return false
}

// ─── Lead slot machine ─────────────────────────────────────────

export type LeadStage = 'awaiting_name' | 'awaiting_phone' | 'awaiting_confirm'

export interface LeadState {
  stage: LeadStage
  name?: string
  phone?: string
  /** Consecutive invalid answers on the CURRENT slot. */
  retries: number
}

/** 2 re-asks max on a slot, then a human handoff (3rd invalid → handoff). */
export const LEAD_MAX_RETRIES = 2

export type LeadAction =
  | 'ask_name'
  | 'ask_phone'
  | 'ask_confirm'
  | 'repeat_confirm'
  | 'submit'
  | 'cancelled'
  | 'handoff'

export interface LeadDecision {
  action: LeadAction
  state: LeadState | null // null = capture over (submitted/cancelled/handed off)
  name?: string
  phone?: string
}

function failed(state: LeadState): { retries: number; handoff: boolean } {
  const retries = (state.retries || 0) + 1
  return { retries, handoff: retries > LEAD_MAX_RETRIES }
}

export function decideLeadStep(state: LeadState, rawMessage: string): LeadDecision {
  const message = (rawMessage || '').trim()

  if (isCancelMessage(message)) {
    return { action: 'cancelled', state: null }
  }

  if (state.stage === 'awaiting_name') {
    // "اسمي أحمد ورقمي 010…" — both slots in one turn → straight to confirm.
    const combo = extractNameAndPhone(message)
    if (combo) {
      return {
        action: 'ask_confirm',
        state: { stage: 'awaiting_confirm', name: combo.name, phone: combo.phone, retries: 0 },
        name: combo.name,
        phone: combo.phone,
      }
    }
    // Phone-first: stash it, still need the name.
    const phoneOnly = isValidEgyptianPhone(message) ? normalizeEgyptianPhone(message)! : null
    if (phoneOnly) {
      return { action: 'ask_name', state: { stage: 'awaiting_name', phone: phoneOnly, retries: 0 }, phone: phoneOnly }
    }
    if (isValidLeadName(message)) {
      const name = message.replace(/\s+/g, ' ')
      if (state.phone) {
        return {
          action: 'ask_confirm',
          state: { stage: 'awaiting_confirm', name, phone: state.phone, retries: 0 },
          name,
          phone: state.phone,
        }
      }
      return { action: 'ask_phone', state: { stage: 'awaiting_phone', name, retries: 0 }, name }
    }
    const f = failed(state)
    if (f.handoff) return { action: 'handoff', state: null }
    return { action: 'ask_name', state: { ...state, retries: f.retries } }
  }

  if (state.stage === 'awaiting_phone') {
    const phone = isValidEgyptianPhone(message) ? normalizeEgyptianPhone(message)! : extractEgyptianPhone(message)
    if (phone && /^01[0125]\d{8}$/.test(phone)) {
      return {
        action: 'ask_confirm',
        state: { stage: 'awaiting_confirm', name: state.name, phone, retries: 0 },
        name: state.name,
        phone,
      }
    }
    const f = failed(state)
    if (f.handoff) return { action: 'handoff', state: null }
    return { action: 'ask_phone', state: { ...state, retries: f.retries } }
  }

  // awaiting_confirm
  if (isConfirmYes(message)) {
    return { action: 'submit', state: null, name: state.name, phone: state.phone }
  }
  if (isConfirmNo(message)) {
    return { action: 'cancelled', state: null }
  }
  return {
    action: 'repeat_confirm',
    state,
    name: state.name,
    phone: state.phone,
  }
}

// ─── Reply copy (Egyptian AR / EN) ─────────────────────────────

export interface LeadReplyArgs {
  name?: string
  phone?: string
  waHref?: string | null
  retries?: number
  phoneSaved?: boolean
}

export function formatLeadReply(action: LeadAction, lang: ChatLang, args: LeadReplyArgs = {}): string {
  const ar = lang === 'ar'
  const { name, phone, waHref, phoneSaved } = args
  switch (action) {
    case 'ask_name':
      if (phoneSaved) {
        return ar
          ? 'تمام، سجّلت رقمك 👍 واسمك الكريم إيه؟'
          : 'Got it, saved your number 👍 What name should I book under?'
      }
      return ar
        ? 'تمام 👍 تحب أحجز لك معاينة. ممكن اسمك الكريم؟'
        : 'Great 👍 I can book that viewing for you. What\u2019s your name?'
    case 'ask_phone': {
      const hello = name ? (ar ? `أهلاً ${name} 👋 ` : `Hi ${name} 👋 `) : ''
      return ar
        ? `${hello}ابعتلي رقم موبايلك المصري (11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015) عشان نأكد الحجز.`
        : `${hello}Send me your Egyptian mobile number (11 digits starting with 010, 011, 012 or 015) to confirm the booking.`
    }
    case 'ask_confirm':
    case 'repeat_confirm': {
      const prefix = action === 'repeat_confirm'
        ? ar ? 'دي البيانات اللي عندي — أكّدها 👇\n' : 'Here\u2019s what I have — please confirm 👇\n'
        : ''
      return ar
        ? `${prefix}أكّد بياناتك:\n• الاسم: ${name}\n• الموبايل: ${phone}\nقول "أكّد" عشان أسجّل الطلب، أو "إلغاء" لو عايز تلغي.`
        : `${prefix}Please confirm your details:\n• Name: ${name}\n• Mobile: ${phone}\nSay "yes" to submit, or "cancel" to abort.`
    }
    case 'submit':
      // Filled by the route after the inquiry row exists (includes WhatsApp).
      return formatLeadSuccess(lang, { name, phone, waHref })
    case 'cancelled':
      return ar
        ? 'تمام، لغيت الطلب 👍 لو احتجت أي حاجة تانية أنا موجود.'
        : 'Done, I\u2019ve cancelled the request 👍 I\u2019m here if you need anything else.'
    case 'handoff': {
      const wa = waHref
        ? ar ? `\nلو تحب تكمل مع حد من الفريق مباشرة: ${waHref}` : `\nTo continue with the team directly: ${waHref}`
        : ''
      return ar
        ? `مفيش مشكلة خالص — ممكن تكمّل بياناتك مع حد من الفريق وهيساعدك على طول.${wa}`
        : `No problem at all — the team can take your details directly and help right away.${wa}`
    }
  }
}

export function formatLeadSuccess(lang: ChatLang, args: { name?: string; phone?: string; waHref?: string | null }): string {
  const ar = lang === 'ar'
  const base = ar
    ? `✅ تم يا ${args.name}، سجّلنا طلبك وهنكلمك على ${args.phone} خلال 24 ساعة.`
    : `✅ Done ${args.name}, your request is registered — we\u2019ll call you on ${args.phone} within 24 hours.`
  if (args.waHref) {
    return ar
      ? `${base}\nلو مستعجل كمل على واتساب: ${args.waHref}`
      : `${base}\nIn a hurry? Continue on WhatsApp: ${args.waHref}`
  }
  return base
}

export function formatLeadToolError(lang: ChatLang, waHref?: string | null): string {
  const ar = lang === 'ar'
  const wa = waHref
    ? ar ? `\nجرّب تكمل على واتساب: ${waHref}` : `\nYou can continue on WhatsApp: ${waHref}`
    : ''
  return ar
    ? `حصلت مشكلة وأنا بسجّل الطلب — جرّب تاني بعد شوية.${wa}`
    : `Something went wrong while saving your request — please try again shortly.${wa}`
}

// ─── Proactive compare nudge ───────────────────────────────────

export interface NudgeBlock {
  type: string
  projects?: Array<{ name?: string }>
}

export function extractCompareCandidates(blocks: NudgeBlock[] | undefined): string[] {
  if (!Array.isArray(blocks)) return []
  for (const b of blocks) {
    if (b?.type === 'property_grid' && Array.isArray(b.projects) && b.projects.length >= 2) {
      const names = b.projects.slice(0, 2).map((p) => (typeof p?.name === 'string' ? p.name.trim() : '')).filter(Boolean)
      if (names.length >= 2) return names as string[]
    }
  }
  return []
}

export function buildCompareNudge(lang: ChatLang, a: string, b: string): string {
  return lang === 'ar'
    ? `عايز أقارن لك **${a}** و **${b}** جنب بعض؟ قول "أيوه قارن".`
    : `Want me to compare **${a}** vs **${b}** side by side? Say "yes, compare".`
}

/** True when the deterministic nudge should be appended to this turn. */
export function shouldAppendNudge(
  content: string,
  blocks: NudgeBlock[] | undefined,
  toolCallsMade: string[] | undefined,
): boolean {
  if (Array.isArray(toolCallsMade) && toolCallsMade.includes('compare_projects')) return false
  if (Array.isArray(blocks) && blocks.some((b) => b?.type === 'comparison')) return false
  if (COMPARE_WORD_RES.some((r) => r.test(content || ''))) return false
  return extractCompareCandidates(blocks).length >= 2
}
