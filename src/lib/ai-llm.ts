import { type OllamaMessage, type OllamaTool, type OllamaToolCall } from '@/lib/ai/ollama'
import { chatOnce, streamOnce, type ServedProvider } from '@/lib/ai/provider-router'
import { AI_TOOLS } from '@/lib/ai/tools'
import { SYSTEM_PROMPT } from '@/lib/ai-system-prompt'
import { AI_CONFIG } from '@/lib/ai/config'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { hasListingIntent, parseNaturalLanguageQuery } from '@/lib/ai-search-parser'
import {
  areaTakeOffered,
  askedConsultSlots,
  countConsultQuestions,
  CONSULT_MAX_QUESTIONS,
  AREA_TAKE_SEGUE_AR,
  AREA_TAKE_SEGUE_EN,
  discoveryExhausted,
  hasRecommended,
  isReady,
  needsFromHistory,
  nextConsultQuestion,
  slotsRevealedBy,
  type ConsultNeeds,
  wantsImmediateListings,
} from '@/lib/ai-consultation'
import { areaStats, nationalSnapshot } from '@/lib/ai-market-study'
import { classifySiteIntent, answerSiteQuestion } from '@/lib/ai-site-knowledge'
import {
  toolSearchProjects,
  toolSearchUnits,
  toolGetProjectDetails,
  toolGetDeveloperDetails,
  toolCompareProjects,
  toolCalculatePayment,
  toolGetPaymentPlans,
  toolCreateInquiry,
} from '@/lib/ai-tools'
import { toolGetLeadDetails, toolGetPipelineSummary, toolCalculateCommission, type AICtx } from '@/lib/ai-growth-tools'
import { buildCompareNudge, shouldAppendNudge, extractCompareCandidates } from '@/lib/ai-lead-capture'
import type { ProjectSummary, UnitSummary, ComparisonData, PaymentCalculation } from '@/lib/ai-tools'

// ─── Response Block Types ────────────────────────────────

export interface TextBlock { type: 'text'; content: string }
export interface PropertyGridBlock { type: 'property_grid'; title: string; projects?: ProjectSummary[]; units?: UnitSummary[]; total: number }
export interface ComparisonBlock { type: 'comparison'; title: string; data: ComparisonData }
export interface PaymentBlock { type: 'payment'; title: string; calculation: PaymentCalculation }
export interface FilterUpdateBlock { type: 'filter_update'; filters: Record<string, string | number>; chips: Array<{ label: string; value: string; field: string }> }
export type ResponseBlock = TextBlock | PropertyGridBlock | ComparisonBlock | PaymentBlock | FilterUpdateBlock

export interface LLMResult {
  content: string
  blocks: ResponseBlock[]
  toolCallsMade: string[]
  // Which backend served THIS turn (additive observability): 'gemini' for a
  // clean Gemini turn, 'local' when the per-turn fallback fired, 'grounded'
  // for deterministic site answers (no LLM call), else the direct provider.
  provider: ServedProvider
}

// ─── Provider dispatch ─────────────────────────────────────
// AI_PROVIDER=gemini → Gemini primary with AUTOMATIC per-turn fallback to
// the local llama.cpp stack (see src/lib/ai/provider-router.ts).
// AI_PROVIDER=llamacpp → self-hosted llama-server directly.
// Default ollama path is untouched.
function primaryProvider(): ServedProvider {
  if (AI_CONFIG.provider === 'gemini') return 'gemini'
  return AI_CONFIG.provider === 'llamacpp' ? 'llamacpp' : 'ollama'
}

// Mutable per-turn fallback flag (request-scoped object — never module
// state — so concurrent chats can't cross-contaminate the report).
interface FallbackTrack { fellBack: boolean }
function servedProvider(track: FallbackTrack): ServedProvider {
  return track.fellBack ? 'local' : primaryProvider()
}

// ─── Optional live-market web search (SearXNG, fail-soft) ───
// Only offered to the model when SEARXNG_URL is set. Short timeout, and a
// failed search degrades to a plain block — the chat NEVER depends on it.
const WEB_SEARCH_TOOL: OllamaTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the live web for CURRENT market news only (new launches, price trends, interest rates, laws). Use ONLY when the user asks about current events/news outside our catalog. Results are third-party snippets: summarize them as web results, never as GHAYA listings or prices.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (Arabic or English)' },
      },
      required: ['query'],
    },
  },
}

// read_page: study ONE page from the web results in full (a developer's
// official project page, a market article). Complements web_search snippets.
const WEB_READ_TOOL: OllamaTool = {
  type: 'function',
  function: {
    name: 'read_page',
    description: 'Fetch and study the text of ONE web page from a web_search result (developer community page, market article) to answer an outside-catalog question. Text only — never used for GHAYA catalog facts.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute https URL from a web_search result' },
      },
      required: ['url'],
    },
  },
}

const ACTIVE_TOOLS: OllamaTool[] = AI_CONFIG.searxng.baseUrl ? [...AI_TOOLS, WEB_SEARCH_TOOL, WEB_READ_TOOL] : AI_TOOLS

// ─── Role-gated tool schemas ───────────────────────────────
// Buyer/anon sessions NEVER need the growth-system tools: the tool layer
// denies them anyway (broker/dev/admin-only scope), so sending their
// schemas only bloats every prefill (~400 tokens). Staff roles keep all.
const BUYER_TOOL_NAMES = new Set([
  'search_projects',
  'search_units',
  'get_project_details',
  'get_developer_details',
  'compare_projects',
  'calculate_payment',
  'get_payment_plans',
  'create_inquiry',
])

function toolsFor(ctx?: AICtx): OllamaTool[] {
  const role = ctx?.role
  if (role === 'BROKER' || role === 'DEVELOPER' || role === 'CEO' || role === 'ADMIN') return ACTIVE_TOOLS
  // web_search (when wired) stays available to everyone; growth tools gated.
  return ACTIVE_TOOLS.filter((t) => t.function.name === 'web_search' || BUYER_TOOL_NAMES.has(t.function.name))
}

async function toolWebSearch(args: { query?: unknown }): Promise<unknown> {
  const base = AI_CONFIG.searxng.baseUrl.replace(/\/+$/, '')
  const query = typeof args?.query === 'string' ? args.query.slice(0, 200) : ''
  if (!base || !query) return { success: false, error: 'web search unavailable' }
  try {
    const res = await fetch(`${base}/search?q=${encodeURIComponent(query)}&format=json`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return { success: false, error: `search failed (${res.status})` }
    const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
    const results = (data.results || []).slice(0, 5).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: (r.content || '').slice(0, 300),
    }))
    return { success: true, data: { query, results } }
  } catch {
    return { success: false, error: 'search unavailable' }
  }
}

/** read_page: fetch a page, strip HTML/script/style, return bounded plain text. */
async function toolReadPage(args: { url?: unknown }): Promise<unknown> {
  const raw = typeof args?.url === 'string' ? args.url.trim() : ''
  let target: URL
  try {
    target = new URL(raw)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('scheme')
    // SSRF guard: never follow the service into its own internals.
    if (/^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(target.hostname)) {
      throw new Error('blocked-host')
    }
  } catch {
    return { success: false, error: 'invalid url' }
  }
  try {
    const res = await fetch(target.href, {
      signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'GHAYA-Ayn/1.0 (+https://ghayaestate.com)', Accept: 'text/html,*/*' },
      redirect: 'follow',
    })
    if (!res.ok) return { success: false, error: `fetch failed (${res.status})` }
    const MAX = 1_000_000
    const type = res.headers.get('content-type') || ''
    if (!/text\/|html|json|xml/.test(type)) return { success: false, error: 'unsupported content type' }
    const html = (await res.text()).slice(0, MAX)
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = (m ? m[1] : target.hostname).replace(/\s+/g, ' ').trim().slice(0, 120)
    const content = cleaned.slice(0, 4000)
    if (content.length < 80) return { success: false, error: 'page too thin to read' }
    return { success: true, data: { url: target.href, title, content: content + (cleaned.length > 4000 ? ' …' : '') } }
  } catch {
    return { success: false, error: 'fetch unavailable' }
  }
}

// ─── Tool Execution ──────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>, ctx?: AICtx): Promise<unknown> {
  const emptyCtx: AICtx = ctx || {}
  switch (name) {
    case 'search_projects':
      return await toolSearchProjects(args as any)
    case 'search_units':
      return await toolSearchUnits(args as any)
    case 'get_project_details':
      return await toolGetProjectDetails(args.nameOrSlug as string)
    case 'get_developer_details':
      return await toolGetDeveloperDetails(args.name as string)
    case 'compare_projects':
      return await toolCompareProjects(args.projectNames as string[])
    case 'calculate_payment':
      return await toolCalculatePayment(args as any)
    case 'get_payment_plans':
      return await toolGetPaymentPlans(args.projectSlug as string)
    case 'create_inquiry':
      // ctx carries the server session — userId is forced from it inside the
      // tool; a model-supplied userId is ignored.
      return await toolCreateInquiry(args as any, ctx)
    case 'web_search':
      return await toolWebSearch(args as { query?: unknown })
    case 'read_page':
      return await toolReadPage(args as { url?: unknown })
    case 'get_lead_details':
      return await toolGetLeadDetails(args, emptyCtx)
    case 'get_pipeline_summary':
      return await toolGetPipelineSummary(args, emptyCtx)
    case 'calculate_commission':
      return await toolCalculateCommission(args, emptyCtx)
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

// ─── Tool Result → Response Blocks ───────────────────────

function toolResultToBlocks(toolName: string, result: any): ResponseBlock[] {
  if (!result?.success) return [{ type: 'text', content: result?.error || 'Tool failed.' }]

  const data = result.data
  const blocks: ResponseBlock[] = []

  switch (toolName) {
    case 'search_projects': {
      const d = data as any
      if (d.total === 0) {
        blocks.push({ type: 'text', content: 'مفيش نتائج تطابق البحث.' })
      } else {
        // Consultation shortlist — never a wall of cards: the grid shows
        // the top 3 fits; `total` stays the honest match count.
        blocks.push({
          type: 'property_grid',
          title: '',
          projects: Array.isArray(d.projects) ? d.projects.slice(0, 3) : d.projects,
          total: d.total,
        })
      }
      break
    }
    case 'search_units': {
      const d = data as any
      if (d.total === 0) {
        blocks.push({ type: 'text', content: 'مفيش وحدات تطابق البحث.' })
      } else {
        blocks.push({ type: 'property_grid', title: '', units: d.units, total: d.total })
      }
      break
    }
    case 'get_project_details': {
      const d = data as any
      const lines: string[] = []
      lines.push(`**${d.name}**`)
      if (d.developerName) lines.push(`🏢 ${d.developerName}`)
      if (d.city) lines.push(`📍 ${d.city}`)
      if (d.startPrice) lines.push(`💰 يبدأ من ${fmtEGP(d.startPrice)} ج.م`)
      if (d.propertyTypes?.length) lines.push(`🏠 ${d.propertyTypes.join(', ').replace(/_/g, ' ')}`)
      if (d.completionPercent != null) lines.push(`📊 الإنجاز ${d.completionPercent}%`)
      if (d.deliveryDate) lines.push(`📅 التسليم: ${fmtDate(d.deliveryDate)}`)
      if (d.downPaymentMin) lines.push(`💳 مقدم من ${d.downPaymentMin}%`)
      if (d.installmentYears) lines.push(`📆 تقسيط حتى ${d.installmentYears} سنة`)
      if (d.description) lines.push(`\n${d.description.substring(0, 300)}${d.description.length > 300 ? '...' : ''}`)
      if (d.amenities?.length) lines.push(`\n🏊 ${d.amenities.slice(0, 8).join('، ')}`)
      if (d.paymentPlans?.length) {
        lines.push('\nخطط السداد:')
        for (const pp of d.paymentPlans.slice(0, 3)) {
          lines.push(`• ${pp.name}: مقدم ${pp.downPaymentPct}% / ${pp.installmentYears} سنة`)
        }
      }
      blocks.push({ type: 'text', content: lines.join('\n') })
      if (d.units?.length > 0) {
        const units = d.units.slice(0, 6).map((u: any) => ({
          id: u.id, name: u.name, slug: null, unitType: u.unitType, listingType: u.listingType || 'sale',
          status: 'available', bedrooms: u.bedrooms, bathrooms: u.bathrooms, area: u.area,
          price: u.price, pricePerSqm: u.pricePerSqm, finishingType: u.finishingType,
          projectName: d.name, projectSlug: d.slug, hasBalcony: false, view: null,
        }))
        blocks.push({ type: 'property_grid', title: `وحدات - ${d.name}`, units, total: d.units.length })
      }
      break
    }
    case 'get_developer_details': {
      const d = data as any
      const lines: string[] = []
      lines.push(`**${d.companyName}**`)
      if (d.isVerified) lines.push('✅ مطوّر معتمد')
      if (d.headquarters) lines.push(`📍 ${d.headquarters}`)
      if (d.foundedYear) lines.push(`📅 تأسس ${d.foundedYear}`)
      if (d.totalProjects) lines.push(`🏗️ ${d.totalProjects} مشروع`)
      if (d.rating) lines.push(`⭐ ${d.rating}/5`)
      if (d.projects?.length > 0) {
        lines.push('\nالمشاريع:')
        for (const p of d.projects) lines.push(`• **${p.name}**${p.startPrice ? ` من ${fmtEGP(p.startPrice)} ج.م` : ''}`)
      }
      blocks.push({ type: 'text', content: lines.join('\n') })
      break
    }
    case 'compare_projects': {
      const d = data as ComparisonData
      blocks.push({ type: 'text', content: `مقارنة بين **${d.projects.map(p => p.name).join(' و ')}**:` })
      blocks.push({ type: 'comparison', title: '', data: d })
      break
    }
    case 'calculate_payment': {
      const d = data as PaymentCalculation
      const lines: string[] = []
      lines.push(`💰 السعر: ${fmtEGP(d.unitPrice)} ج.م`)
      lines.push(`💳 مقدم (${d.downPaymentPct}%): ${fmtEGP(d.downPaymentAmount)} ج.م`)
      lines.push(`🏦 الممول: ${fmtEGP(d.financedAmount)} ج.م`)
      lines.push(`📆 ${d.installmentYears} سنة - قسط نصف سنوي: ${fmtEGP(d.semiAnnualPayment)} ج.م`)
      lines.push(`📅 قسط شهري تقريبي: ~${fmtEGP(d.monthlyPayment)} ج.م`)
      blocks.push({ type: 'text', content: lines.join('\n') })
      blocks.push({ type: 'payment', title: '', calculation: d })
      break
    }
    case 'get_payment_plans': {
      const d = data as any
      const lines: string[] = []
      lines.push(`خطط السداد - ${d.projectName}`)
      for (const pp of d.plans) {
        lines.push(`\n• **${pp.name}**`)
        lines.push(`  مقدم: ${pp.downPaymentPct}% | تقسيط: ${pp.installmentYears} سنة`)
      }
      blocks.push({ type: 'text', content: lines.join('\n') })
      break
    }
    case 'create_inquiry': {
      const d = data as any
      blocks.push({ type: 'text', content: `✅ ${d.message || 'تم تسجيل طلبك. هنتواصل معاك خلال 24 ساعة.'}` })
      break
    }
    case 'web_search': {
      const d = data as { query: string; results: Array<{ title: string; url: string; snippet: string }> }
      if (!d.results.length) {
        blocks.push({ type: 'text', content: 'البحث المباشر مرجعش نتائج — هجاوبك من بيانات الموقع.' })
      } else {
        const lines = d.results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}${r.url ? `\n   ${r.url}` : ''}`)
        blocks.push({ type: 'text', content: `نتائج البحث المباشر عن "${d.query}" (مصادر خارجية، مش أسعار غاية):\n\n${lines.join('\n\n')}` })
      }
      break
    }
    case 'read_page': {
      const d = data as { url: string; title: string; content: string }
      blocks.push({ type: 'text', content: `قرأت الصفحة: **${d.title}** (${d.url})\n\n${d.content.slice(0, 700)}` })
      break
    }
    case 'get_lead_details': {
      const d = data as any
      const lines: string[] = []
      lines.push(`**${d.leadCode || 'Lead'}** — ${d.name}`)
      lines.push(`📌 الحالة: ${d.status}${d.reviewStatus !== 'ACTIVE' ? ` (${d.reviewStatus})` : ''}`)
      if (d.broker) lines.push(`🤝 البروكر: ${d.broker}`)
      if (d.project) lines.push(`🏗️ المشروع: ${d.project}`)
      if (d.unit) lines.push(`🏠 الوحدة: ${d.unit}`)
      if (d.protection) {
        const p = d.protection
        const statusLabel = p.status === 'PROTECTED' ? '🟢 محمي' : p.status === 'EXPIRING_SOON' ? '🟡 ينتهي قريبًا' : p.status === 'EXPIRED' ? '🔴 منتهي' : '⚪ بدون حماية'
        lines.push(`${statusLabel} الحماية حتى: ${p.expiresAt ? String(p.expiresAt).slice(0, 10) : '—'} (${statusLabel.includes('محمي') ? 'مفعّلة' : p.status})`)
      }
      if (d.deal) lines.push(`💼 صفقة: ${d.deal.status}${d.deal.dealValue ? ` — ${fmtEGP(d.deal.dealValue)} ج.م` : ''}`)
      blocks.push({ type: 'text', content: lines.join('\n') })
      break
    }
    case 'get_pipeline_summary': {
      const d = data as any
      const lines: string[] = []
      lines.push('**ملخص الـ Pipeline (من قاعدة البيانات):**')
      lines.push(`📌 إجمالي الـ leads: ${d.leads.total}`)
      const statusEntries = Object.entries(d.leads.byStatus as Record<string, number>)
      if (statusEntries.length) lines.push(statusEntries.map(([k, v]) => `${k}: ${v}`).join(' | '))
      lines.push(`🟢 محمية: ${d.protection.activeProtected} | تنتهي قريبًا: ${d.protection.expiringSoon} | منتهية: ${d.protection.expired}`)
      const dealEntries = Object.entries(d.deals as Record<string, { count: number; value: number }>)
      if (dealEntries.length) {
        lines.push('💼 صفقات:')
        for (const [k, v] of dealEntries) lines.push(`• ${k}: ${v.count}${v.value ? ` — ${fmtEGP(v.value)} ج.م` : ''}`)
      }
      if (Object.keys(d.commissions.byStatus).length) {
        lines.push(`💰 عمولات: ${fmtEGP(d.commissions.totalAmount)} ج.م (بيوصل البروكر ${fmtEGP(d.commissions.brokerAmount)} ج.م)`)
      }
      blocks.push({ type: 'text', content: lines.join('\n') })
      break
    }
    case 'calculate_commission': {
      const d = data as any
      const lines: string[] = []
      lines.push(`**حساب العمولة (من قاعدة القواعد):**`)
      lines.push(`💼 قيمة الصفقة: ${fmtEGP(d.dealValue)} ج.م`)
      lines.push(`📊 القاعدة (${d.ruleSource}): إجمالي ${d.split.totalPct}% = ${fmtEGP(d.amounts.totalAmount)} ج.م`)
      lines.push(`🏢 EstateAI ${d.split.estateaiPct}% = ${fmtEGP(d.amounts.estateaiAmount)} ج.م`)
      lines.push(`🤝 البروكر ${d.split.brokerPct}% = ${fmtEGP(d.amounts.brokerAmount)} ج.م`)
      if (d.split.otherPct > 0) lines.push(`➕ ${d.split.otherLabel || 'أخرى'} ${d.split.otherPct}% = ${fmtEGP(d.amounts.otherAmount)} ج.م`)
      blocks.push({ type: 'text', content: lines.join('\n') })
      break
    }
  }

  return blocks
}

// ─── Proactive compare nudge (upgrade A) ───────────────────
// After search/listing turns with ≥2 results the assistant appends a
// natural-language compare offer naming the first pair. Text-only (no new
// block type) so the mobile contract is unchanged. Skipped when the turn
// already compared, already mentions comparing, or has <2 named projects.
//
// It is applied at every non-grounded return site, so it also carries the
// stale-link fix: the model habitually invents wrong link forms — absolute
// links to the old estateai.eg domain and custom schemes like "ghaya://" (a
// mobile deep-link hallucination). Both are rewritten to relative paths,
// which the chat UI linkifies correctly.
const STALE_DOMAIN_RE = /https?:\/\/(?:www\.)?estateai\.eg/gi
const GHAYA_SCHEME_RE = /ghaya:\/\//gi

export function stripStaleDomainLinks(content: string): string {
  return content.replace(GHAYA_SCHEME_RE, '/').replace(STALE_DOMAIN_RE, '')
}

function withCompareNudge(
  content: string,
  blocks: ResponseBlock[],
  toolCallsMade: string[],
  lang: 'ar' | 'en',
): string {
  try {
    content = stripStaleDomainLinks(content)
    if (!shouldAppendNudge(content, blocks as Array<{ type: string; projects?: Array<{ name?: string }> }>, toolCallsMade)) {
      return content
    }
    const [a, b] = extractCompareCandidates(blocks as Array<{ type: string; projects?: Array<{ name?: string }> }>)
    if (!a || !b) return content
    return `${content}\n\n${buildCompareNudge(lang, a, b)}`
  } catch {
    return content
  }
}

// ─── Main LLM Call ───────────────────────────────────────

// Overall deadline for the LLM tool loop (also caps the streaming route).
// Qwen3-8B on CPU decodes ≈3 tok/s with a dieted ≈2.4k-token system+tools
// prompt (was ≈4.2k before the diet): one 300-token round takes ~2 min, so
// the budget must cover prefill + 2-3 tool rounds. Single
// requests in llamacpp.ts allow 300s each; this caps the whole loop.
export const TOOL_LOOP_BUDGET_MS = 280_000

const CJK_RE = /[\u4e00-\u9fff]/

function detectLang(text: string): 'ar' | 'en' {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text) ? 'ar' : 'en'
}

// Compact conversation-state summary derived server-side from prior user
// turns + the current message. Injected into the prompt so the small model
// never re-asks for a slot the user already gave (budget/place/rooms/type).
// Capped at ~10 lines. Also returns the merged query text used by the
// forced-search fallback so follow-ups ("وريني اللي تحت 8 مليون") inherit
// earlier slots.
function buildConversationState(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string,
): { stateBlock: string; mergedQuery: string } {
  const priorUser = history
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .slice(-6)
  const mergedQuery = [...priorUser, currentMessage].join(' | ')
  const { summary } = parseNaturalLanguageQuery(mergedQuery)
  if (summary.length === 0) return { stateBlock: '', mergedQuery }

  const byField = new Map<string, string[]>()
  for (const s of summary) {
    if (s.field === 'sortBy') continue
    const list = byField.get(s.field) || []
    if (!list.includes(s.value)) list.push(s.value)
    byField.set(s.field, list)
  }
  const labels: Record<string, string> = {
    city: 'place', propertyType: 'type', bedrooms: 'rooms',
    minPrice: 'min-budget', maxPrice: 'budget', listingType: 'listing',
    minArea: 'min-area', maxArea: 'max-area', developer: 'developer',
    finishingType: 'finishing', delivery: 'delivery', ready: 'availability',
  }
  const lines = [...byField.entries()]
    .slice(0, 8)
    .map(([field, vals]) => `- ${labels[field] || field}: ${vals.join(', ')}`)
  const stateBlock = [
    '[CONVERSATION STATE — slots already known from earlier turns. NEVER ask for these again, not even rephrased:]',
    ...lines,
    'RULE: slots above are settled — never re-ask them. On a listing question, merge STATE with the new message, call the search tool yourself, then recommend the best 2-3 with a one-line reason each.',
  ].join('\n')
  return { stateBlock, mergedQuery }
}

// True when the CURRENT turn asks for listings: explicit intent in this
// message, or a bare refinement ("3 أوض"، "تحت 8 مليون") continuing an
// earlier listing thread.
function isListingTurn(
  currentMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  if (hasListingIntent(currentMessage)) return true
  const { summary } = parseNaturalLanguageQuery(currentMessage)
  if (summary.length === 0) return false
  const priorUser = history
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .slice(-5)
  return priorUser.some((t) => hasListingIntent(t))
}

// Names a SPECIFIC catalog project? Then the turn is a direct question about
// that project (units/prices/phases) — the consultation-discovery gate
// (budget interrogation) must NOT intercept it: the client named the
// project, so they get a tool-grounded answer right away. Cheapest safe
// detection: substring match against the public project-name corpus,
// cached once per process.
export interface KnownCatalogProject {
  id: string
  slug: string
  name: string
  nameArabic: string | null
  developerName: string | null
  cityName: string | null
  /** true = archived register entry: NOT publicly listed (no /projects page). */
  archived?: boolean
}

let projectNameCorpus: { loadedAt: number; projects: KnownCatalogProject[] } | null = null

function normalizeProjectMention(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Match an explicit, unambiguous public project name in the user's message. */
export async function findKnownProjectMentions(message: string): Promise<KnownCatalogProject[]> {
  try {
    if (!projectNameCorpus || Date.now() - projectNameCorpus.loadedAt > 60_000) {
      const [rows, archivedRows] = await Promise.all([
        db.project.findMany({
          where: PUBLIC_PROJECT_WHERE,
          select: {
            id: true,
            name: true,
            nameArabic: true,
            slug: true,
            developer: { select: { companyName: true } },
            city: { select: { name: true } },
          },
        }),
        // The full catalog register: archived projects are NOT public — عين
        // must recognize ANY name the catalog holds and answer honestly
        // (no site link, "team can share details") instead of feigning ignorance.
        db.project.findMany({
          where: { isActive: false },
          select: {
            id: true,
            name: true,
            nameArabic: true,
            slug: true,
            developer: { select: { companyName: true } },
            city: { select: { name: true } },
          },
        }),
      ])
      projectNameCorpus = {
        loadedAt: Date.now(),
        projects: [
          ...rows.map((row) => ({
            id: row.id,
            slug: row.slug,
            name: row.name,
            nameArabic: row.nameArabic,
            developerName: row.developer?.companyName ?? null,
            cityName: row.city?.name ?? null,
          })),
          ...archivedRows.map((row) => ({
            id: row.id,
            slug: row.slug,
            name: row.name,
            nameArabic: row.nameArabic,
            developerName: row.developer?.companyName ?? null,
            cityName: row.city?.name ?? null,
            archived: true,
          })),
        ],
      }
    }
    const text = ` ${normalizeProjectMention(message)} `
    const bestById = new Map<string, { project: KnownCatalogProject; score: number }>()
    for (const project of projectNameCorpus.projects) {
      const variants = [project.name, project.nameArabic || '']
        .map(normalizeProjectMention)
        .filter((name) => name.length >= 4)
      for (const name of variants) {
        if (text.includes(` ${name} `)) {
          const previous = bestById.get(project.id)
          if (!previous || previous.score < name.length) bestById.set(project.id, { project, score: name.length })
        }
      }
    }
    const sorted = [...bestById.values()].sort((a, b) => b.score - a.score)
    if (!sorted.length) return []
    const maxScore = sorted[0].score
    return sorted.filter((item) => item.score === maxScore).map((item) => item.project)
  } catch {
    return [] // knowledge match is best-effort; never fail chat
  }
}

async function mentionsKnownProject(message: string): Promise<boolean> {
  return (await findKnownProjectMentions(message)).length > 0
}

// Best-effort server-side search used when the model returns zero tool calls
// on a listing turn. Same params the parser extracts; relaxation order keeps
// the hardest user constraints (city, budget) longest — bedroom counts are
// relaxed first because project-level bedroom data is sparse.
// Consultation deep-brief: the top-3 shortlist WITH FULL DETAILS (payment
// plans, amenities, delivery, location, description) — pulled via the same
// get_project_details tool the model uses — plus a REAL market study for
// the client's area (project counts, developer activity, price bands,
// per-type minimums from the DB; national breadth when no area is in play).
async function studyBrief(
  blocks: ResponseBlock[],
  mergedQuery: string,
): Promise<{ projects: string; market: string | null }> {
  const slugs: string[] = []
  for (const b of blocks) {
    if (b.type !== 'property_grid' || !Array.isArray(b.projects)) continue
    for (const p of b.projects) {
      if (slugs.length < 3 && p.slug) slugs.push(p.slug)
    }
  }

  const projects: Array<Record<string, unknown>> = []
  for (const slug of slugs) {
    try {
      const res = await toolGetProjectDetails(slug)
      if (!res?.success) continue
      const d = res.data as Record<string, any>
      projects.push({
        name: d.name,
        link: `/projects/${d.slug}`,
        city: d.city ?? d.governorate ?? null,
        developer: d.developer?.companyName ?? null,
        developerVerified: d.developer?.isVerified ?? null,
        startPrice: d.startPrice ?? null,
        endPrice: d.endPrice ?? null,
        types: d.propertyTypes ?? [],
        status: d.status ?? null,
        completionPercent: d.completionPercent ?? null,
        deliveryDate: d.deliveryDate ?? null,
        address: d.address ?? null,
        totalArea: d.totalArea ?? null,
        amenities: Array.isArray(d.amenities) ? d.amenities.slice(0, 8) : [],
        paymentPlans: Array.isArray(d.paymentPlans)
          ? d.paymentPlans.slice(0, 3).map((pp: any) => ({
              name: pp.name,
              downPaymentPct: pp.downPaymentPct,
              installmentYears: pp.installmentYears,
              cashDiscount: pp.cashDiscount,
              maintenanceFeePct: pp.maintenanceFeePct,
            }))
          : [],
        nearbyPlaces: Array.isArray(d.nearbyPlaces)
          ? d.nearbyPlaces.slice(0, 4).map((np: any) => ({ name: np.name, distance: np.distance }))
          : [],
        about: typeof d.description === 'string' ? d.description.slice(0, 240) : null,
      })
    } catch {
      /* one failed detail fetch never sinks the study */
    }
  }

  // Market study — the client's area first, national breadth otherwise.
  let market: string | null = null
  try {
    const parsed = parseNaturalLanguageQuery(mergedQuery)
    const place = String(
      (parsed.filters as Record<string, unknown>).city ||
        (parsed.filters as Record<string, unknown>).governorate ||
        '',
    )
    const stats = place ? await areaStats(place) : null
    if (stats) {
      market = JSON.stringify({
        areaStudy: stats.place,
        publicProjectsThere: stats.projectsCount,
        activeDevelopers: stats.developersCount,
        priceStartsFrom: stats.minStart,
        areaAverageStart: stats.avgStart,
        byType: stats.byType,
        leadingDevelopers: stats.topDevelopers,
      })
    } else {
      const snap = await nationalSnapshot()
      if (snap) {
        market = JSON.stringify({
          nationalStudy: snap.totalProjects,
          developers: snap.totalDevelopers,
          topAreas: snap.topAreas,
        })
      }
    }
  } catch {
    /* market study is a bonus — never a dependency */
  }

  return { projects: JSON.stringify(projects), market }
}

// One extra "study" round over the shortlist with the FULL details + the
// market study: the model reasons like a senior consultant. Falls back to
// the plain intro on any failure.
async function consultativeStudy(
  brief: { projects: string; market: string | null },
  messages: OllamaMessage[],
  lang: 'ar' | 'en',
  track?: FallbackTrack,
  signal?: AbortSignal,
): Promise<string | null> {
  const marketLine = brief.market
    ? lang === 'ar'
      ? `\nدراسة السوق الحقيقية (من قاعدة بياناتنا): ${brief.market}`
      : `\nReal market study (from our database): ${brief.market}`
    : ''
  const ask =
    lang === 'ar'
      ? `نتائج البحث الحقيقية (أفضل 3 مشاريع بتفاصيلها الكاملة): ${brief.projects}${marketLine}
اتكلم كأكبر مستشار عقاري في مصر — دي دراسة مش عرض:
- لكل مشروع: موقعه في سوق منطقته (سعره مقارنة بالمتوسط لو متاح)، هيكل السداد (المقدم والسنين والخصم)، المرافق المهمة، ومخاطر التسليم/التشطيب.
- اربط كل ترشيح ببروفايل العميل (غرضه وميزانيته ومكانة) — ليه ده مناسب ليه تحديدًا.
- لو الغرض استثمار: اتكلم عن حركة المنطقة وقابلية البيع. لو سكن: اتكلم عن المعيشة والمرافق.
- في الآخر: ملاحظة سوقية واحدة العميل ماسألش عنها + سؤال أو اتنين للنقاش (مقارنة / معاينة / خطة سداد).
مختصر ومركز (10 جمل بحد أقصى) وبالعربي المصري. ممنوع أي أرقام أو أسماء من خارج النتايج دي.`
      : `Real search results (top 3 full projects): ${brief.projects}${marketLine}
Speak as a senior Egyptian real-estate consultant — a study, not a listing:
- Per project: its position in its area's market (price vs area average when available), payment structure (down payment, years, cash discount), key amenities, and delivery/finishing risks.
- Tie each pick to the CLIENT's profile (purpose, budget, place) — why THIS one for THEM.
- Investment purpose → area demand and resale angle. Living → lifestyle, amenities, connectivity.
- End with ONE market insight they didn't ask about + 1-2 discussion questions (compare / viewing / payment plan).
Brief and sharp (max ~10 sentences). Never use names or numbers outside these results.`
  try {
    const { response, provider } = await chatOnce([...messages, { role: 'user', content: ask }], undefined, { signal })
    if (provider === 'local') track && (track.fellBack = true)
    const text = response.message?.content || ''
    if (text && !replyNeedsRepair(text, lang)) return text
  } catch {
    /* keep the deterministic intro */
  }
  return null
}

// Consultation questions stay deterministic in CONTENT (the slot decision
// and the exact question text are system-owned — the gate counts them from
// plain history), but the DELIVERY becomes a consultative discussion: the
// model drafts 2-4 engaged sentences — acknowledging what the client
// actually said, with real market color when a place is in play — and MUST
// end with the exact canned question verbatim. Any failure → the plain
// question, so discovery never stalls on the model.
async function consultativeWrap(
  question: { slot: string; content: string },
  history: Array<{ role: string; content: string }>,
  lang: 'ar' | 'en',
  lastUserText: string,
  track?: FallbackTrack,
): Promise<string> {
  // Real market color ONLY when the client already named a place.
  let market = ''
  try {
    const f = parseNaturalLanguageQuery(lastUserText).filters as Record<string, unknown>
    const place = String(f.city || f.governorate || '')
    const stats = place ? await areaStats(place) : null
    if (stats) {
      market = JSON.stringify({
        area: stats.place,
        publicProjects: stats.projectsCount,
        activeDevelopers: stats.developersCount,
        startsFrom: stats.minStart,
        averageStart: stats.avgStart,
        byType: stats.byType.slice(0, 4),
      })
    }
  } catch {
    /* market study is a bonus — never a dependency */
  }

  const ask =
    lang === 'ar'
      ? `آخر رسالة من العميل: "${lastUserText}"
دراسة سوق حقيقية من قاعدة بياناتنا — دي الأرقام الوحيدة المسموحة: ${market || 'مفيش أرقام معاك — ممنوع تمامًا تذكر أي رقم'}
شخصيتك: مستشار عقاري مصري كبير — خبير جدًا، لطيف وله حس دعابة خفيف (لمسة واحدة في الرد، مش نكتة كل جملة، ولا بذيئة أبدًا، وفي كلام الميزانية تعامل راقي).
- تفاعل مع اللي قاله بفهم حقيقي مش مجاملة (لو حدد مكان أو نوع أو غرض، قول رأيك الصريح فيه).
- وضّح في جملة واحدة ليه السؤال ده مهم أساسًا — منطق المستشار: جوابه بيفصل إيه عن إيه (من غير شرح ثقيل).
- الأرقام المسموحة هي اللي في الدراسة أعلاه بالحرف فقط. ممنوع أي رقم تاني، وممنوع تسمّي أي مشروع (المشروعات بتيجي بعد ما نخلص الأسئلة).
- آخر جملة في ردك لازم تكون السؤال ده حرفيًا من غير أي تغيير: ${question.content}`
      : `The client's last message: "${lastUserText}"
Real market study from our database — the ONLY numbers allowed: ${market || 'none — you know no numbers, inventing any is forbidden'}
Your voice: a senior Egyptian real-estate consultant — deeply expert, warm, lightly playful (ONE light touch per reply, not a joke every line, never rude, classy during money talk):
- Engage with what they said with genuine understanding, not flattery (if they named a place/type/purpose, give your quick honest take).
- Explain in ONE line WHY this question matters — consultant reasoning: what the answer decides (no heavy lecture).
- Numbers only from the study above, verbatim. No other figures, NO project names (projects come after discovery).
- The LAST sentence of your reply must be this question verbatim, unchanged: ${question.content}`
  try {
    const { response, provider } = await chatOnce(
      [...history.slice(-6).map((m) => ({ role: (m.role === 'tool' ? 'assistant' : m.role) as OllamaMessage['role'], content: m.content })), { role: 'user', content: ask }],
      undefined,
    )
    if (provider === 'local') track && (track.fellBack = true)
    const text = (response.message?.content || '').trim()
    if (text.includes(question.content) && text.length <= 1000 && !replyNeedsRepair(text, lang)) return text
  } catch {
    /* fall through to the plain question */
  }
  return question.content
}

// ── Area take: the place-discussion round ──────────────────
// Triggered ONCE when the client just settled a slot (usually named the
// place) while already "ready" — instead of flooding listings on the
// reveal turn, Ayn discusses the AREA as a consultant: real aggregates,
// an honest take for their purpose, what their budget does there — and
// never names a single project. Ends with the system-owned segue;
// listings only on the NEXT turn. Falls back to a deterministic brief.
async function areaTakeTurn(
  needs: ConsultNeeds,
  history: Array<{ role: string; content: string }>,
  lang: 'ar' | 'en',
  track?: FallbackTrack,
): Promise<string> {
  const segue = lang === 'ar' ? AREA_TAKE_SEGUE_AR : AREA_TAKE_SEGUE_EN
  // Real area aggregates and the client's budget position in them.
  let facts = ''
  let factsFallback = ''
  try {
    const stats = needs.place ? await areaStats(needs.place) : null
    if (stats) {
      const topType = stats.byType[0]
      facts = JSON.stringify({
        area: stats.place,
        publicProjects: stats.projectsCount,
        activeDevelopers: stats.developersCount,
        startsFrom: stats.minStart,
        averageStart: stats.avgStart,
        byType: stats.byType.slice(0, 5),
      })
      const position =
        needs.budgetMax != null && stats.avgStart != null
          ? needs.budgetMax < stats.avgStart
            ? lang === 'ar'
              ? 'ميزانيتك تحت متوسط بدايات المنطقة — هنعكسها في رأي صريح.'
              : 'Your budget sits below the area average start — expect an honest take.'
            : lang === 'ar'
              ? 'ميزانيتك مارّة فوق المتوسط هنا — عندنا مساحة لعب.'
              : 'Your budget clears the area average — room to play.'
          : ''
      factsFallback =
        lang === 'ar'
          ? `${stats.projectsCount} مشروع على يد ${stats.developersCount} مطور، بدايات من ${fmtEGP(stats.minStart ?? 0)} (المتوسط ${fmtEGP(stats.avgStart ?? 0)})${topType ? `، وأنشط نوع: ${topType.type}` : ''}. ${position}`
          : `${stats.projectsCount} projects by ${stats.developersCount} developers, starts from ${fmtEGP(stats.minStart ?? 0)} (average ${fmtEGP(stats.avgStart ?? 0)}). ${position}`
    }
  } catch {
    /* bonus, never a dependency */
  }

  const budgetLine =
    needs.budgetMin != null || needs.budgetMax != null
      ? `${needs.budgetMin ?? 0}–${needs.budgetMax ?? '—'} EGP`
      : lang === 'ar'
        ? 'مرنة (غير محددة)'
        : 'flexible'
  const purposeLine = needs.purpose === 'invest' ? (lang === 'ar' ? 'استثمار' : 'invest') : needs.purpose === 'live' ? (lang === 'ar' ? 'سكن' : 'living') : '—'
  const typeLine = needs.propertyType || '—'

  const ask =
    lang === 'ar'
      ? `بروفايل العميل: ميزانية ${budgetLine}، النوع ${typeLine}، الغرض ${purposeLine}، المكان ${needs.place}
دراسة المكان الحقيقية (الوحيدة المسموحة أرقام): ${facts || 'مفيش أرقام — ممنوع تذكر أي رقم'}
اتكلم عن المكان كخبير جاهز، 4-6 جمل، ومن غير ذكر اسم أي مشروع نهائيًا (القايمة مش النهارده):
- طبع المكان وشغله في السوق (من الأرقام فقط) + رأيك الصريح بالنسبة لغرض العميل.
- ميزانية العميل بتعمل إيه هنا بالأرقام (تحت/فوق المتوسط، بداية من كام) — بالحرف من الأرقام.
- لمستين شخصيتين (مثلاً: الزحمة الصبح، قرب المدارس، وصل الساحل — من معرفة عامة مش من مفهوم).
الجملة الأخيرة حرفيًا: ${segue}`
      : `Client profile: budget ${budgetLine}, type ${typeLine}, purpose ${purposeLine}, place ${needs.place}
Real area study (the ONLY numbers allowed): ${facts || 'none — inventing numbers is forbidden'}
Talk about the AREA as an informed consultant, 4-6 sentences, NO project names at all (the list comes later):
- The area's character and market behavior (from the numbers only) + your honest take for the client's purpose.
- What the client's budget does here, in real numbers (below/above average, starts from) — verbatim from the facts.
- Two personality touches (morning traffic, school proximity, coast access — general knowledge, not averages).
The LAST sentence verbatim: ${segue}`
  try {
    const { response, provider } = await chatOnce(
      [
        ...history.slice(-6).map((m) => ({ role: (m.role === 'tool' ? 'assistant' : m.role) as OllamaMessage['role'], content: m.content })),
        { role: 'user', content: ask },
      ],
      undefined,
    )
    if (provider === 'local') track && (track.fellBack = true)
    const text = (response.message?.content || '').trim()
    if (
      text.includes(segue) &&
      !text.includes('/projects/') &&
      !text.includes('ghaya://') &&
      text.length <= 1200 &&
      !replyNeedsRepair(text, lang)
    ) {
      return stripStaleDomainLinks(text)
    }
  } catch {
    /* fall through to the deterministic brief */
  }
  if (lang === 'ar') {
    const placeName = needs.place?.replace(/-/g, ' ') || ''
    return `${placeName}: ${factsFallback} ${segue}`
  }
  return `${needs.place?.replace(/-/g, ' ') || ''}: ${factsFallback} ${segue}`
}

// Final-turn ask after tool rounds: context-aware. Compare requests get a
// VERDICT discussion ask (the consultant's pick + the deltas that decide +
// "choose X if / Y if") — never a data dump narrating the table cells. Any
// other listing turn keeps the shortlist ask.
function finalSummaryAsk(lang: 'ar' | 'en', toolCallsMade: string[]): string {
  const compared = toolCallsMade.some((t) => t.toLowerCase().includes('compare'))
  if (!compared) {
    return lang === 'ar'
      ? 'رشّح أنسب 2-3 للمستخدم: سطر لكل واحد ليه مناسب + سؤال واحد للخطوة الجاية. مختصر جدًا.'
      : 'Recommend the best 2-3: one line each on why it fits + one next-step question. Keep it very brief.'
  }
  return lang === 'ar'
    ? 'قارن النتايج كخبير يتكلم لعميله: افتتح برأيك النهائي (أنصح بمين وطلب العميل هو إيه)، بعدين الفروقات اللي بتفرق فعلًا (السعر مقابل ميزانيته، هيكل السداد، التسليم، المكان) في 4-8 سطور، وبعدين "اختار كذا لو… واختار كذا لو…". الجدول ظاهر قدام العميل أصلًا — ممنوع تسرد كل خلية فيه، اتكلم في الخلاصة والرأي، وبسّط سؤال واحد للخطوة الجاية. بالعربي المصري.'
    : 'Compare like an expert talking to their client: OPEN with your verdict (who you\'d pick for this profile), then the deltas that actually decide it (price vs budget, payment structure, delivery, location) in 4-8 lines, then "choose X if… / choose Y if…". The table is already on screen — never narrate every cell; give the takeaways and your opinion, then ONE next-step question.'
}

async function runForcedSearch(
  mergedQuery: string,
  lang: 'ar' | 'en',
): Promise<{ tools: string[]; blocks: ResponseBlock[]; intro: string; total: number }> {
  const parsed = parseNaturalLanguageQuery(mergedQuery)
  const base = { ...parsed.filters, limit: 6 } as Record<string, unknown>
  delete base.page

  const attempts: Array<{ name: string; drop: string[] }> = [
    { name: 'full', drop: [] },
    { name: 'no-bedrooms', drop: ['bedrooms', 'bathrooms'] },
    { name: 'no-bedrooms-listing', drop: ['bedrooms', 'bathrooms', 'listingType'] },
    { name: 'city-budget-only', drop: ['bedrooms', 'bathrooms', 'listingType', 'propertyType', 'minArea', 'maxArea', 'finishingType'] },
  ]

  let best: { tools: string[]; blocks: ResponseBlock[]; total: number; dropped: string[] } | null = null
  for (const attempt of attempts) {
    const filters = { ...base }
    for (const k of attempt.drop) delete filters[k]
    const res = await toolSearchProjects(filters as any)
    if (res.success && (res.data as any)?.total > 0) {
      const d = res.data as any
      const blocks = toolResultToBlocks('search_projects', res)
      const tools = ['search_projects']
      // Attach matching units too when the unit table has any.
      try {
        const ures = await toolSearchUnits(filters as any)
        if (ures.success && (ures.data as any)?.total > 0) {
          blocks.push(...toolResultToBlocks('search_units', ures))
          tools.push('search_units')
        }
      } catch { /* units are a bonus — never fail the fallback */ }
      best = { tools, blocks, total: d.total, dropped: attempt.drop }
      break
    }
  }
  if (!best) return { tools: [], blocks: [], intro: '', total: 0 }

  // filter_update chips so the website search bar / mobile chips stay in sync.
  const chipFilters: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(base)) {
    if (best.dropped.includes(k)) continue
    if (typeof v === 'string' || typeof v === 'number') chipFilters[k] = v
  }
  const appliedSummary = parsed.summary.filter((s) => !best.dropped.includes(s.field))
  best.blocks.push({
    type: 'filter_update',
    filters: chipFilters,
    chips: appliedSummary.map((s) => ({ label: s.label, value: s.value, field: s.field })),
  })

  const intro = lang === 'ar'
    ? `تمام — بعد ما درست اللي عندنا، دول أقرب ${best.total} اختيار لطلبك 👇`
    : `Done — I studied our catalog; here are the closest ${best.total} fits 👇`
  return { tools: best.tools, blocks: best.blocks, intro, total: best.total }
}

// Language guard: the small model occasionally leaks CJK tokens into Arabic
// replies. True when repair is needed.
function replyNeedsRepair(content: string, lang: 'ar' | 'en'): boolean {
  if (!content) return lang === 'ar'
  if (CJK_RE.test(content)) return true
  if (lang === 'ar') {
    const arabic = (content.match(/[\u0600-\u06FF]/g) || []).length
    const latin = (content.match(/[A-Za-z]/g) || []).length
    const total = arabic + latin
    if (total >= 20 && arabic / total < 0.5) return true
  }
  return false
}

function templateFallback(hasData: boolean, lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return hasData
      ? 'تمام، دي أنسب اختيارات لطلبك 👇'
      : 'تمام، فهمتك. قولي الميزانية والمكان وعدد الأوض، وأنا أجيب لك أنسب اختيارات.'
  }
  return hasData
    ? 'Here are the closest matches for you 👇'
    : 'Got it. Tell me your budget, area, and bedrooms and I’ll pull the best matches.'
}

async function guardLanguage(
  content: string,
  messages: OllamaMessage[],
  lang: 'ar' | 'en',
  hasData: boolean,
  track?: FallbackTrack,
): Promise<string> {
  if (!replyNeedsRepair(content, lang)) return content
  // Regenerate once: shorter + explicit language lock.
  try {
    const { response: retry, provider } = await chatOnce([
      ...messages,
      {
        role: 'user',
        content: lang === 'ar'
          ? 'رد بالعربي المصري بس وباختصار. ممنوع أي حروف صيني أو أجنبية غير الإنجليزي الشائع.'
          : 'Reply in English only, briefly.',
      },
    ])
    if (provider === 'local') track && (track.fellBack = true)
    const text = retry.message.content || ''
    if (!replyNeedsRepair(text, lang)) return text
  } catch { /* fall through to template */ }
  // Still bad: deterministic template + the real listing blocks. Never CJK.
  return templateFallback(hasData, lang)
}

interface PreparedLLMRequest {
  lang: 'ar' | 'en'
  // Non-null when deterministic site grounding answered (greeting, areas,
  // cheapest, ...) — no LLM round trip needed. Callers return it directly.
  grounded: LLMResult | null
  messages: OllamaMessage[]
  mergedQuery: string
  listingTurn: boolean
  deadline: number
  toolCallsMade: string[]
  allBlocks: ResponseBlock[]
}

// Shared preamble for callLLM + callLLMStream: language, deterministic
// site grounding, conversation-state injection, and the tool-loop messages.
async function prepareLLMRequest(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string,
  ctx?: AICtx,
  langOverride?: 'ar' | 'en',
): Promise<PreparedLLMRequest> {
  const lang = langOverride || detectLang(currentMessage)
  const toolCallsMade: string[] = []
  const allBlocks: ResponseBlock[] = []

  // ── Site-knowledge grounding ──────────────────────────────────
  // Fact-listing intents (areas / cheapest / booking / calculators / a
  // named project) are answered DETERMINISTICALLY from live site data —
  // no LLM round trip — because the small model hallucinates site facts
  // (baseline: invented "Jeddah / Tangier" as coverage). Runs BEFORE the
  // listing-turn logic so "عايز أعرف عن مشروع سيليا" resolves to project
  // facts instead of a catalog dump. Returns null for COMPARISON/GENERAL
  // and unknown project names → existing flow below is untouched.
  // Ongoing-consultation guard: once Ayn has recommended (assistant history
  // carries project links), a client pushback like "غالي، عندك أرخص قريب؟"
  // must go to the consultative model path (client state + market study +
  // search tools) — NOT the global-cheapest/global-best shortcut, which
  // ignores the client's profile, area and type entirely. Standalone
  // questions with no prior recommendations still hit the shortcuts.
  const inConsultation = conversationHistory
    .slice(-6)
    .some((m) => m.role === 'assistant' && m.content.includes('/projects/'))
  const siteKind = classifySiteIntent(currentMessage)
  if (
    siteKind === 'GREETING' ||
    siteKind === 'WHERE_AREAS' ||
    siteKind === 'DEVELOPERS' ||
    (siteKind === 'CHEAPEST' && !inConsultation) ||
    (siteKind === 'BEST' && !inConsultation) ||
    siteKind === 'HOW_TO_BOOK' ||
    siteKind === 'CALCULATOR' ||
    siteKind === 'ABOUT_SITE' ||
    siteKind === 'CONTACT_INFO' ||
    siteKind === 'BLOG' ||
    siteKind === 'PRESS' ||
    siteKind === 'CAREERS' ||
    siteKind === 'OFFERS' ||
    siteKind === 'SITE_HELP' ||
    siteKind === 'PROJECT_ABOUT'
  ) {
    const grounded = await answerSiteQuestion(siteKind, currentMessage, lang)
    if (grounded) {
      toolCallsMade.push(grounded.toolTag)
      allBlocks.push({ type: 'text', content: grounded.content })
      return {
        lang,
        grounded: { content: grounded.content, blocks: allBlocks, toolCallsMade, provider: 'grounded' },
        messages: [], mergedQuery: '', listingTurn: false, deadline: 0,
        toolCallsMade, allBlocks,
      }
    }
  }

  const { stateBlock: stateBlockRaw, mergedQuery } = buildConversationState(conversationHistory, currentMessage)
  const listingTurn = isListingTurn(currentMessage, conversationHistory)

  // ── Consultation gate ────────────────────────────────────────
  // A listing turn with an incomplete client profile (no budget, no
  // place/type) resolves to ONE deterministic discovery question —
  // instant, free, consistent — instead of a project dump. Max
  // CONSULT_MAX_QUESTIONS. Every question is asked AT MOST once: when the
  // client dodges (vague/no answer), discovery is exhausted and the flow
  // proceeds to search with whatever is known — never a repeat question.
  // "وريني اللي عندك" impatience skips discovery entirely.
  let stateBlock = stateBlockRaw
  const namesProject = await mentionsKnownProject(currentMessage)
  // Bypass: the client named a catalog project — answer it (tool-grounded),
  // never interrogate budget first.
  if (listingTurn && !wantsImmediateListings(currentMessage) && !namesProject) {
    const needs = needsFromHistory(conversationHistory, currentMessage)
    const assistantTexts = conversationHistory
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .slice(-6)
    if (!isReady(needs)) {
      const asked = askedConsultSlots(assistantTexts)
      if (discoveryExhausted(needs, asked)) {
        // Keep discussing, never repeat: the client already heard every
        // question and answered vaguely. Provide with what is known and
        // let them react — the model gets the explicit no-questions rule.
        stateBlock +=
          '\n[DISCOVERY EXHAUSTED — every discovery question was already asked once. NEVER ask the client any question this turn, not even rephrased. Recommend with what is known; if the budget is unknown, present options as a range (from below the area average up) and let them react.]'
      } else if (countConsultQuestions(assistantTexts) < CONSULT_MAX_QUESTIONS) {
        const q = nextConsultQuestion(needs, lang, asked)
        if (q) {
          // The question stays system-owned; the delivery becomes a real
          // consultative discussion (falls back to the plain question).
          const trackWrap: FallbackTrack = { fellBack: false }
          const wrapped = await consultativeWrap(q, conversationHistory, lang, currentMessage, trackWrap)
          return {
            lang,
            grounded: {
              content: wrapped,
              blocks: [{ type: 'text', content: wrapped }],
              toolCallsMade: [],
              provider: servedProvider(trackWrap),
            },
            messages: [],
            mergedQuery,
            listingTurn: false,
            deadline: 0,
            toolCallsMade: [],
            allBlocks: [],
          }
        }
      }
    } else if (
      needs.place &&
      slotsRevealedBy(conversationHistory, currentMessage).length > 0 &&
      !hasRecommended(assistantTexts) &&
      !areaTakeOffered(assistantTexts)
    ) {
      // ── Area take: NO listings on the reveal turn ────────────
      // The client just settled a slot (usually named the place). Before
      // any shortlist, Ayn discusses the AREA like a consultant — real
      // aggregates, honest opinion, no project names — and ends with a
      // system-owned segue ("curated top-3 or keep talking?"). One-time.
      const trackTake: FallbackTrack = { fellBack: false }
      const take = await areaTakeTurn(needs, conversationHistory, lang, trackTake)
      return {
        lang,
        grounded: {
          content: take,
          blocks: [{ type: 'text', content: take }],
          toolCallsMade: [],
          provider: servedProvider(trackTake),
        },
        messages: [],
        mergedQuery,
        listingTurn: false,
        deadline: 0,
        toolCallsMade: [],
        allBlocks: [],
      }
    }
  }

  // ── Market study for the model path ──────────────────────────
  // Real DB aggregates for the client's area (project counts, developer
  // activity, price bands, per-type minimums) ground every market claim
  // the model makes — it can say "few villa projects in Zayed" only when
  // the numbers say so, and can never invent an average.
  let marketBlock = ''
  try {
    if (listingTurn) {
      const parsedFilters = parseNaturalLanguageQuery(mergedQuery).filters as Record<string, unknown>
      const place = String(parsedFilters.city || parsedFilters.governorate || '')
      const stats = place ? await areaStats(place) : null
      if (stats) {
        const byType = stats.byType
          .map((t) => `${t.type}(${t.count}${t.minStart ? `, from ${t.minStart} EGP` : ''})`)
          .join(', ')
        marketBlock =
          `\n[MARKET STUDY — real DB aggregates for ${stats.place}: ${stats.projectsCount} public projects, ` +
          `${stats.developersCount} active developers, starts from ${stats.minStart ?? '—'} EGP, ` +
          `average start ${stats.avgStart ?? '—'} EGP, by type: ${byType}. ` +
          `Any market/supply/average claim MUST come from THESE numbers — never invent averages or trends.]`
      }
    }
  } catch {
    /* market study is a bonus — never a dependency */
  }
  const deadline = Date.now() + TOOL_LOOP_BUDGET_MS

  // Build messages array
  // Dynamic per-request notes: WhatsApp escalation uses the live CTA number
  // from SystemSettings (never hardcoded), web-search rules only when wired.
  let dynamicNotes = ''
  try {
    const { readContactCtas, toWhatsAppHref } = await import('@/lib/contact-cta')
    const waHref = toWhatsAppHref((await readContactCtas()).whatsapp)
    if (waHref) {
      dynamicNotes += `\n[ESCALATION — when the user shows serious buying intent (wants to book a viewing, talk to a broker, or shares contact details): invite them to continue on WhatsApp: ${waHref}. Use ONLY this link; never invent phone numbers.]`
    }
  } catch { /* CTA is a nicety — never fail the chat */ }
  if (AI_CONFIG.searxng.baseUrl) {
    dynamicNotes += '\n[WEB SEARCH — you have a web_search tool for CURRENT market news only (launches, rates, laws). Catalog questions always use DB tools / site STATE first. Present web results as external results, never as GHAYA listings or prices.]'
  }

  // Trained knowledge: injected bounded blocks, only when retrieval hits.
  try {
    const { retrieveKnowledge } = await import('@/lib/ai-knowledge')
    const learned = await retrieveKnowledge(`${currentMessage} ${mergedQuery}`.trim())
    if (learned) {
      dynamicNotes += '\n\n' + learned
    }
  } catch { /* learned context is a nicety — never fail the chat */ }

  const messages: OllamaMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + dynamicNotes },
  ]
  if (stateBlock || marketBlock) {
    messages.push({ role: 'system', content: [stateBlock, marketBlock].filter(Boolean).join('\n') })
  }

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  messages.push({ role: 'user', content: currentMessage })

  return {
    lang, grounded: null, messages, mergedQuery, listingTurn, deadline,
    toolCallsMade, allBlocks,
  }
}

export async function callLLM(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string,
  ctx?: AICtx,
  langOverride?: 'ar' | 'en',
): Promise<LLMResult> {
  const prep = await prepareLLMRequest(conversationHistory, currentMessage, ctx, langOverride)
  if (prep.grounded) return prep.grounded
  const { lang, messages, mergedQuery, listingTurn, deadline, toolCallsMade, allBlocks } = prep
  const requestTools = toolsFor(ctx)
  const track: FallbackTrack = { fellBack: false }

  // Tool loop
  for (let round = 0; round < AI_CONFIG.maxToolRounds; round++) {
    if (Date.now() > deadline) break
    const { response, provider } = await chatOnce(messages, requestTools)
    if (provider === 'local') track.fellBack = true

    const assistantMsg = response.message

    // If no tool calls, return the text response (or forced search).
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      let content = assistantMsg.content || ''
      if (toolCallsMade.length === 0 && listingTurn) {
        // The model refused to retrieve: run the default search server-side
        // and attach real results instead of a bare clarifying question.
        const forced = await runForcedSearch(mergedQuery, lang)
        if (forced.total > 0) {
          toolCallsMade.push(...forced.tools)
          allBlocks.push(...forced.blocks)
          // Study round: consultative recommendation over the shortlist
          // (falls back to the plain intro on any failure).
          content =
            (await consultativeStudy(await studyBrief(allBlocks, mergedQuery), messages, lang, track)) ||
            forced.intro
        }
      }
      content = await guardLanguage(content, messages, lang, allBlocks.length > 0, track)
      content = withCompareNudge(content, allBlocks, toolCallsMade, lang)
      return {
        content,
        blocks: allBlocks,
        toolCallsMade,
        provider: servedProvider(track),
      }
    }

    // Add assistant message with tool calls to history
    messages.push({
      role: 'assistant',
      content: assistantMsg.content || '',
      tool_calls: assistantMsg.tool_calls,
    })

    // Execute each tool call
    for (const toolCall of assistantMsg.tool_calls) {
      const func = toolCall.function
      const functionName = func.name
      let args: Record<string, unknown> = {}

      try {
        args = JSON.parse(func.arguments)
      } catch {
        args = {}
      }

      toolCallsMade.push(functionName)

      // Execute
      const result = await executeTool(functionName, args, ctx)

      // Parse into blocks
      const blocks = toolResultToBlocks(functionName, result)
      allBlocks.push(...blocks)

      // Feed result back to LLM
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: `call_${functionName}_${round}`,
      })
    }
  }

  // Exhausted tool rounds — get final summary (skipped past the deadline).
  if (Date.now() > deadline) {
    return {
      content: withCompareNudge(templateFallback(allBlocks.length > 0, lang), allBlocks, toolCallsMade, lang),
      blocks: allBlocks,
      toolCallsMade,
      provider: servedProvider(track),
    }
  }
  const { response: finalResponse, provider: finalProvider } = await chatOnce([
    ...messages,
    { role: 'user', content: finalSummaryAsk(lang, toolCallsMade) },
  ])
  if (finalProvider === 'local') track.fellBack = true

  const content = withCompareNudge(
    await guardLanguage(finalResponse.message.content || '', messages, lang, allBlocks.length > 0, track),
    allBlocks,
    toolCallsMade,
    lang,
  )
  return {
    content,
    blocks: allBlocks,
    toolCallsMade,
    provider: servedProvider(track),
  }
}

// ─── Streaming LLM Call ────────────────────────────────────
// Same tool loop as callLLM, but the FINAL prose answer streams token by
// token via `onToken` while tool calls still resolve server-side first.
// Status callbacks fire between rounds so the route can keep the SSE alive
// (and the proxy timeout at bay) during long CPU decodes. Returns the same
// LLMResult — the route persists it and replays it authoritatively in the
// `done` event, so a mid-stream language-guard repair never desyncs.
// Abort: `signal` (the client's disconnect) flows to every backend fetch.
export interface LLMStreamCallbacks {
  signal?: AbortSignal
  onStatus?: (phase: 'thinking' | 'searching' | 'summarizing', message: string) => void
  onToken?: (text: string) => void
}

// Final prose via the streaming backend when available (llama.cpp SSE /
// Gemini SSE); otherwise one non-stream round delivered as a single token
// so every provider honors the same callback contract. Retryable Gemini
// failures fall back to the local stream inside streamOnce (tracked).
async function streamFinalText(messages: OllamaMessage[], cb: LLMStreamCallbacks, track: FallbackTrack): Promise<string> {
  const { text, provider } = await streamOnce(messages, (t) => cb.onToken?.(t), { signal: cb.signal })
  if (provider === 'local') track.fellBack = true
  return text
}

export async function callLLMStream(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string,
  ctx?: AICtx,
  langOverride?: 'ar' | 'en',
  cb: LLMStreamCallbacks = {},
): Promise<LLMResult> {
  const prep = await prepareLLMRequest(conversationHistory, currentMessage, ctx, langOverride)
  // Deterministic grounding (greetings, site facts): instant, no LLM.
  // Emit as one token so clients share a single render path.
  if (prep.grounded) {
    cb.onToken?.(prep.grounded.content)
    return prep.grounded
  }
  const { lang, messages, mergedQuery, listingTurn, deadline, toolCallsMade, allBlocks } = prep
  const requestTools = toolsFor(ctx)
  const track: FallbackTrack = { fellBack: false }

  // Tool loop (non-streamed rounds — only the final answer streams)
  cb.onStatus?.('thinking', lang === 'ar' ? 'بفكر في سؤالك…' : 'Thinking…')
  for (let round = 0; round < AI_CONFIG.maxToolRounds; round++) {
    if (Date.now() > deadline) break
    cb.signal?.throwIfAborted()
    const { response, provider } = await chatOnce(messages, requestTools, { signal: cb.signal })
    if (provider === 'local') track.fellBack = true

    const assistantMsg = response.message

    // If no tool calls, stream the text response (or forced search).
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      if (toolCallsMade.length === 0 && listingTurn) {
        // The model refused to retrieve: run the default search server-side
        // and attach real results instead of a bare clarifying question.
        const forced = await runForcedSearch(mergedQuery, lang)
        if (forced.total > 0) {
          toolCallsMade.push(...forced.tools)
          allBlocks.push(...forced.blocks)
          // Study round: consultative recommendation over the shortlist
          // (falls back to the plain intro on any failure). Emitted as one
          // token so both clients share the existing render path.
          cb.onStatus?.('summarizing', lang === 'ar' ? 'بدارس الاختيارات…' : 'Studying the options…')
          const studied = await consultativeStudy(
            await studyBrief(allBlocks, mergedQuery),
            messages,
            lang,
            track,
            cb.signal,
          )
          const finalText = studied || forced.intro
          const nudged = withCompareNudge(finalText, allBlocks, toolCallsMade, lang)
          cb.onToken?.(nudged)
          return {
            content: nudged,
            blocks: allBlocks,
            toolCallsMade,
            provider: servedProvider(track),
          }
        }
      }
      cb.onStatus?.('summarizing', lang === 'ar' ? 'بكتب الإجابة…' : 'Writing the answer…')
      const streamed = await streamFinalText(messages, cb, track)
      const content = withCompareNudge(
        await guardLanguage(streamed, messages, lang, allBlocks.length > 0, track),
        allBlocks,
        toolCallsMade,
        lang,
      )
      return {
        content,
        blocks: allBlocks,
        toolCallsMade,
        provider: servedProvider(track),
      }
    }

    // Add assistant message with tool calls to history
    messages.push({
      role: 'assistant',
      content: assistantMsg.content || '',
      tool_calls: assistantMsg.tool_calls,
    })

    // Execute each tool call
    for (const toolCall of assistantMsg.tool_calls) {
      const func = toolCall.function
      const functionName = func.name
      let args: Record<string, unknown> = {}

      try {
        args = JSON.parse(func.arguments)
      } catch {
        args = {}
      }

      toolCallsMade.push(functionName)
      cb.onStatus?.('searching', lang === 'ar' ? 'بدوّر في البيانات…' : 'Searching listings…')

      // Execute
      const result = await executeTool(functionName, args, ctx)

      // Parse into blocks
      const blocks = toolResultToBlocks(functionName, result)
      allBlocks.push(...blocks)

      // Feed result back to LLM
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: `call_${functionName}_${round}`,
      })
    }
  }

  // Exhausted tool rounds — get final summary (skipped past the deadline).
  if (Date.now() > deadline) {
    const content = withCompareNudge(templateFallback(allBlocks.length > 0, lang), allBlocks, toolCallsMade, lang)
    cb.onToken?.(content)
    return {
      content,
      blocks: allBlocks,
      toolCallsMade,
      provider: servedProvider(track),
    }
  }
  cb.onStatus?.('summarizing', lang === 'ar' ? 'بكتب الإجابة…' : 'Writing the answer…')
  const streamed = await streamFinalText(
    [...messages, { role: 'user', content: finalSummaryAsk(lang, toolCallsMade) }],
    cb,
    track,
  )

  const content = withCompareNudge(
    await guardLanguage(streamed, messages, lang, allBlocks.length > 0, track),
    allBlocks,
    toolCallsMade,
    lang,
  )
  return {
    content,
    blocks: allBlocks,
    toolCallsMade,
    provider: servedProvider(track),
  }
}

// ─── Helpers ─────────────────────────────────────────────

function fmtEGP(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`
  return amount.toLocaleString()
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}
