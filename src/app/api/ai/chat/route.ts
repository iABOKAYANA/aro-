import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { callLLM, callLLMStream, TOOL_LOOP_BUDGET_MS, type ResponseBlock } from '@/lib/ai-llm'
import { findKnownProjectMentions, type KnownCatalogProject } from '@/lib/ai-llm'
import { AI_CONFIG } from '@/lib/ai/config'
import { checkOllamaStatus } from '@/lib/ai/ollama'
import { checkLlamacppStatus } from '@/lib/ai/llamacpp'
import { checkGeminiStatus } from '@/lib/ai/gemini'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import {
  decideLeadStep,
  formatLeadReply,
  formatLeadSuccess,
  formatLeadToolError,
  isLeadTrigger,
  isCancelMessage,
  isCompareAffirm,
  extractEgyptianPhone,
  type ChatLang,
  type LeadState,
} from '@/lib/ai-lead-capture'
import { toolCreateInquiry, toolCompareProjects, type ComparisonData } from '@/lib/ai-tools'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

const HISTORY_LIMIT = 8
const ANON_LIMIT = 10
const ANON_WINDOW_MS = 60 * 60_000
// Authenticated callers were unlimited — one account could loop the 6-round
// Ollama tool loop indefinitely. Same limiter idiom as the anon bucket.
const AUTHED_LIMIT = 30
const AUTHED_WINDOW_MS = 60 * 60_000

function ipOf(req: Request): string {
  // Shared extractor (src/lib/rate-limit.ts) — signature kept, callers untouched.
  return getClientIp(req.headers)
}

function detectLanguage(text: string): 'ar' | 'en' {
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length
  return arabicChars > 0 ? 'ar' : 'en'
}

function arOfflineResponse(error?: string): string {
  if (!error) return 'المساعد الذكي غير متاح. تأكد إن Ollama شغال والموديل مثبت.'
  if (error.includes('not running') || error.includes('ECONNREFUSED')) {
    return 'المساعد الذكي غير متاح حاليًا. تأكد إن Ollama شغال على جهازك.\n\nلتشغيله: افتح Terminal واكتب `ollama serve`'
  }
  if (error.includes('not installed')) {
    return `الموديل "${error}" مش مثبت عندك.\n\nشغّل: ollama pull ${error}\n\nأو غيّر الموديل في ملف .env`
  }
  return 'المساعد الذكي غير متاح. تأكد إن Ollama شغال والموديل مثبت.'
}

// ─── Shared chat setup (JSON + streaming paths) ────────────

function enforceRateLimit(req: Request, userId: string | null): NextResponse | null {
  if (!userId) {
    const rl = rateLimit(`ai-chat:${ipOf(req)}`, { limit: ANON_LIMIT, windowMs: ANON_WINDOW_MS })
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }
  } else {
    // Authenticated callers get a per-user bucket (30/hr) — previously
    // unlimited, so a single account could spin the Ollama tool loop.
    const rl = rateLimit(`ai-chat:user:${userId}`, { limit: AUTHED_LIMIT, windowMs: AUTHED_WINDOW_MS })
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }
  }
  return null
}

function offlineAssistantMessage(
  lang: 'ar' | 'en',
  aiStatus: { available: boolean; modelInstalled: boolean; model: string; error?: string },
): { role: string; content: string; blocks: ResponseBlock[]; intent: string; lang: string } {
  // Gemini without a server key is a config gap, not an Ollama outage.
  if (AI_CONFIG.provider === 'gemini' && !AI_CONFIG.gemini.configured) {
    const content = lang === 'ar'
      ? 'المساعد الذكي غير مهيأ حاليًا. جرّب تاني بعد شوية.'
      : 'AI Assistant is not configured right now. Please try again later.'
    return {
      role: 'assistant',
      content,
      blocks: [{ type: 'text', content }],
      intent: 'ai_offline',
      lang,
    } as { role: string; content: string; blocks: ResponseBlock[]; intent: string; lang: string }
  }
  return {
    role: 'assistant',
    content: lang === 'ar'
      ? arOfflineResponse(aiStatus.available ? aiStatus.model : aiStatus.error)
      : `AI Assistant is unavailable. ${aiStatus.error || 'Please make sure Ollama is running.'}`,
    blocks: [{ type: 'text', content: lang === 'ar'
      ? (aiStatus.available && !aiStatus.modelInstalled
          ? `موديل "${aiStatus.model}" مش مثبت.\n\nشغّل:\nowna pull ${aiStatus.model}\n\nأو غيّر الموديل في ملف .env`
          : 'المساعد الذكي غير متاح. تأكد إن Ollama شغال على جهازك.\n\n1. نزّل Ollama من https://ollama.com\n2. شغّل: ollama serve\n3. شغّل: ollama pull qwen2.5:3b')
      : `AI Assistant unavailable. ${aiStatus.error || 'Make sure Ollama is running.'}`
    }],
    intent: 'ai_offline',
    lang,
  } as { role: string; content: string; blocks: ResponseBlock[]; intent: string; lang: string }
}

// Creates or continues a conversation with the same ownership guards the
// JSON path always had. Throws { status, error } on IDOR/404 violations.
async function resolveConversation(
  conversationId: unknown,
  sessionId: unknown,
  message: string,
  userId: string | null,
): Promise<{ convId: string; effectiveSessionId: string | null }> {
  let convId = conversationId as string | undefined
  let effectiveSessionId: string | null = (sessionId as string) || null
  if (convId) {
    // Ownership check: never continue another user's conversation (IDOR guard)
    const existing = await db.aIConversation.findUnique({ where: { id: convId } })
    if (!existing) {
      throw { status: 404, error: 'Conversation not found' }
    }
    const ownerId = existing.userId
    if (ownerId && ownerId !== userId) {
      throw { status: 403, error: 'Forbidden' }
    }
    // Anonymous conversation: the caller MUST present the conversation's
    // matching sessionId. A missing sessionId previously skipped the check
    // entirely, letting anyone append to anyone's anon conversation.
    if (!ownerId && (!existing.sessionId || !sessionId || existing.sessionId !== sessionId)) {
      throw { status: 403, error: 'Forbidden' }
    }
    // Authoritative id for self-heal: the stored one, never the caller's.
    effectiveSessionId = existing.sessionId || (sessionId as string) || null
  } else {
    effectiveSessionId = (sessionId as string) || `session-${Date.now()}`
    const conv = await db.aIConversation.create({
      data: {
        userId: userId || null,
        sessionId: effectiveSessionId,
        title: message.substring(0, 50),
      },
    })
    convId = conv.id
  }
  return { convId, effectiveSessionId }
}

function fireDnaJourneyHooks(userId: string | null, message: string, convId: string) {
  // ── Feature 1 + 6 hooks: rule-based Client DNA extraction from the
  //    user's own message + journey event. Fail-soft, never blocks chat.
  if (!userId) return
  Promise.all([
    import('@/lib/client-dna').then(async (m) => {
      const { readBoolSetting } = await import('@/lib/system-settings')
      if (await readBoolSetting('dnaEnabled', true)) {
        await m.recordDnaEvidence(userId, m.extractFromMessage(message))
      }
    }),
    import('@/lib/journey').then(async (m) => {
      const enabled = await m.journeyTrackingEnabled()
      if (enabled) {
        await m.recordEvent({ userId, type: 'AI_CHAT', entityType: 'AIConversation', entityId: convId })
      }
    }),
  ]).catch((e) => console.error('[ai-chat] dna/journey hook failed:', e))
}

async function loadConversationHistory(convId: string, message: string) {
  // Fetch conversation history
  const history = await db.aIMessage.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: 'asc' },
    take: HISTORY_LIMIT,
  })

  // Build history for LLM
  const conversationHistory = history
    .filter(m => !(m.role === 'user' && m.content === message && m === history[history.length - 1]))
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
  return conversationHistory
}

async function buildAiCtx(session: any) {
  // Call LLM (with the caller's scope so lead/commission tools are enforced server-side)
  const sessUser = session?.user as any
  const aiCtx: { userId?: string | null; role?: string | null; brokerId?: string | null; developerId?: string | null } = {
    userId: sessUser?.id || null,
    role: (sessUser?.role as string) || null,
  }
  if (sessUser?.id && (aiCtx.role === 'BROKER' || aiCtx.role === 'DEVELOPER')) {
    try {
      if (aiCtx.role === 'BROKER') {
        const p = await db.brokerProfile.findFirst({ where: { userId: sessUser.id }, select: { id: true } })
        aiCtx.brokerId = p?.id || null
      } else {
        const p = await db.developerProfile.findFirst({ where: { userId: sessUser.id }, select: { id: true } })
        aiCtx.developerId = p?.id || null
      }
    } catch (e) {
      console.error('AI ctx profile lookup failed:', e)
    }
  }
  return aiCtx
}

async function saveAssistantTurn(
  convId: string,
  message: string,
  result: { content: string; blocks: ResponseBlock[]; toolCallsMade: string[]; provider?: string },
  lang: 'ar' | 'en',
  extraMetadata?: Record<string, unknown>,
) {
  // Save assistant message
  const metadata = {
    blocks: result.blocks,
    toolCallsMade: result.toolCallsMade,
    provider: result.provider || AI_CONFIG.provider,
    lang,
    ...extraMetadata,
  }

  await db.aIMessage.create({
    data: {
      conversationId: convId,
      role: 'assistant',
      content: result.content,
      metadata: JSON.stringify(metadata),
    },
  })

  // Update conversation title
  const messageCount = await db.aIMessage.count({ where: { conversationId: convId } })
  if (messageCount <= 2) {
    await db.aIConversation.update({
      where: { id: convId },
      data: { title: message.substring(0, 50) },
    })
  }
}

function assistantPayload(
  convId: string,
  effectiveSessionId: string | null,
  result: { content: string; blocks: ResponseBlock[]; toolCallsMade: string[]; provider?: string },
  lang: 'ar' | 'en',
) {
  return {
    conversationId: convId,
    sessionId: effectiveSessionId,
    provider: result.provider || AI_CONFIG.provider,
    message: {
      role: 'assistant',
      content: result.content,
      blocks: result.blocks,
      intent: result.toolCallsMade.length > 0 ? result.toolCallsMade[result.toolCallsMade.length - 1] : 'conversation',
      toolCallsMade: result.toolCallsMade,
      lang,
    },
  }
}

// ─── Deterministic chat upgrades (no LLM round trip) ───
// A: a short compare affirmation ("أيوه قارن") resolves against the pair
//    from the most recent property_grid in this conversation and reuses the
//    compare tool + comparison table. B: slot-filling lead capture, with
//    server-driven state in the latest assistant message metadata
//    (`leadCapture`: stage + slots + retries). Both answer in text (+ the
//    existing comparison block for A), so the mobile text-only contract is
//    unchanged. Partial PII is never logged — only persisted as the
//    conversation's own metadata until the turn resolves.

interface DeterministicTurn {
  content: string
  blocks: ResponseBlock[]
  toolCallsMade: string[]
  provider: string
  leadMeta?: { stage: string; name?: string; phone?: string; retries: number }
}

function formatCatalogMoney(value: number, lang: ChatLang): string {
  const formatted = Math.round(value).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')
  return lang === 'ar' ? `${formatted} جنيه` : `EGP ${formatted}`
}

function formatCatalogArea(value: number, lang: ChatLang): string {
  const formatted = Math.round(value).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')
  return lang === 'ar' ? `${formatted} م²` : `${formatted} sqm`
}

function ambiguousProjectReply(matches: KnownCatalogProject[], lang: ChatLang): DeterministicTurn {
  const options = matches.map((project) => {
    const label = lang === 'ar' ? project.nameArabic || project.name : project.name
    const developer = project.developerName ? ` — ${project.developerName}` : ''
    return `• [${label}](/projects/${project.slug})${developer}`
  })
  const content = lang === 'ar'
    ? `اسم المشروع ممكن يقصد أكتر من مشروع. تقصد أنهي واحد؟\n${options.join('\n')}`
    : `That name matches more than one project. Which one do you mean?\n${options.join('\n')}`
  return { content, blocks: [{ type: 'text', content }], toolCallsMade: [], provider: 'grounded' }
}

function isProjectCatalogFactQuestion(message: string): boolean {
  const ar = /(سعر|اسعار|أسعار|بكام|كام|وحده|وحدة|وحدات|متاح|متوفر|مساح|متر|تسليم|استلام|مرحلة|مراحل|تقسيط|قسط|مقدم|خطة|خطط|مطور|الموقع|فين|أين)/i
  const en = /\b(price|prices|cost|available|availability|unit|units|area|areas|sqm|square meter|delivery|handover|phase|phases|installment|payment|down payment|developer|location|where|how many)\b/i
  return ar.test(message) || en.test(message)
}

async function projectCatalogFactsTurn(projectMatch: KnownCatalogProject, message: string, lang: ChatLang): Promise<DeterministicTurn | null> {
  const project = await db.project.findFirst({
    where: { id: projectMatch.id, ...PUBLIC_PROJECT_WHERE },
    select: {
      id: true,
      name: true,
      nameArabic: true,
      slug: true,
      coverImage: true,
      status: true,
      startPrice: true,
      endPrice: true,
      pricePerSqm: true,
      propertyTypes: true,
      deliveryTerms: true,
      deliveryDate: true,
      completionPercent: true,
      viewCount: true,
      favoriteCount: true,
      downPaymentMin: true,
      installmentYears: true,
      description: true,
      city: { select: { name: true, nameArabic: true } },
      governorate: { select: { name: true, nameArabic: true } },
      developer: { select: { companyName: true, companyNameArabic: true } },
      phases: {
        orderBy: { sortOrder: 'asc' },
        select: { name: true, nameArabic: true, startPrice: true, endPrice: true, status: true, deliveryDate: true },
      },
      paymentPlans: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        take: 5,
        select: { name: true, nameArabic: true, downPaymentPct: true, installmentYears: true, cashDiscount: true },
      },
    },
  })
  if (!project) return null

  const unitWhere = {
    projectId: project.id,
    status: { in: ['AVAILABLE', 'Vacant'] },
    isSample: false,
    price: { gt: 0 },
  }
  const inventory = await db.unit.aggregate({
    where: unitWhere,
    _count: { _all: true },
    _min: { price: true, area: true },
    _max: { price: true, area: true },
  })

  let types: string[] = []
  try {
    const parsed = typeof project.propertyTypes === 'string' ? JSON.parse(project.propertyTypes) : project.propertyTypes
    if (Array.isArray(parsed)) types = parsed.filter((type): type is string => typeof type === 'string' && type !== 'UNKNOWN')
  } catch { types = [] }

  const count = inventory._count._all
  const minimumPrice = count > 0 ? inventory._min.price : project.startPrice
  const maximumPrice = count > 0 ? inventory._max.price : project.endPrice
  const projectName = lang === 'ar' ? project.nameArabic || project.name : project.name
  const projectLink = `[${projectName}](/projects/${project.slug})`
  const lines: string[] = [
    lang === 'ar'
      ? `حسب كتالوج غاية الحالي، **${projectLink}**:`
      : `From GHAYA’s current catalog, **${projectLink}**:`,
  ]

  if (count > 0) {
    lines.push(lang === 'ar' ? `• الوحدات المتاحة غير التجريبية: ${count}.` : `• Available non-sample units: ${count}.`)
    if (minimumPrice != null) {
      const priceText = maximumPrice != null && maximumPrice > minimumPrice
        ? `${formatCatalogMoney(minimumPrice, lang)} – ${formatCatalogMoney(maximumPrice, lang)}`
        : formatCatalogMoney(minimumPrice, lang)
      lines.push(lang === 'ar' ? `• أسعار الوحدات المتاحة: ${priceText}.` : `• Available unit prices: ${priceText}.`)
    }
    if (inventory._min.area != null && inventory._max.area != null) {
      const areaText = inventory._min.area === inventory._max.area
        ? formatCatalogArea(inventory._min.area, lang)
        : `${formatCatalogArea(inventory._min.area, lang)} – ${formatCatalogArea(inventory._max.area, lang)}`
      lines.push(lang === 'ar' ? `• المساحات المتاحة: ${areaText}.` : `• Available areas: ${areaText}.`)
    }
  } else {
    lines.push(lang === 'ar' ? '• لا توجد وحدات متاحة مسجلة حاليًا في المخزون.' : '• No currently available units are recorded in the inventory.')
    if (project.startPrice != null && project.startPrice > 0) {
      lines.push(lang === 'ar'
        ? `• سعر البداية المسجل للمشروع: ${formatCatalogMoney(project.startPrice, lang)} (مش تأكيد لتوفر وحدة).`
        : `• Catalog starting price: ${formatCatalogMoney(project.startPrice, lang)} (not confirmation of an available unit).`)
    }
  }

  if (types.length > 0) {
    lines.push(lang === 'ar' ? `• الأنواع المسجلة: ${types.map((type) => type.replace(/_/g, ' ')).join('، ')}.` : `• Listed types: ${types.map((type) => type.replace(/_/g, ' ')).join(', ')}.`)
  }
  if (project.deliveryTerms) {
    lines.push(lang === 'ar' ? `• شروط التسليم المسجلة: ${project.deliveryTerms}` : `• Recorded delivery terms: ${project.deliveryTerms}`)
  }
  if (project.phases.length > 0) {
    const names = project.phases.slice(0, 5).map((phase) => lang === 'ar' ? phase.nameArabic || phase.name : phase.name)
    lines.push(lang === 'ar' ? `• المراحل المسجلة: ${names.join('، ')}.` : `• Recorded phases: ${names.join(', ')}.`)
  }
  if (project.deliveryDate && /(تسليم|استلام|delivery|handover)/i.test(message)) {
    const delivery = new Date(project.deliveryDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'long' })
    lines.push(lang === 'ar' ? `• موعد التسليم المسجل: ${delivery}.` : `• Recorded delivery date: ${delivery}.`)
  }
  if (project.paymentPlans.length > 0 && /(تقسيط|قسط|مقدم|خطة|خطط|installment|payment|down payment)/i.test(message)) {
    const plans = project.paymentPlans.slice(0, 3).map((plan) => {
      const name = lang === 'ar' ? plan.nameArabic || plan.name : plan.name
      const down = `${plan.downPaymentPct}% ${lang === 'ar' ? 'مقدم' : 'down'}`
      const years = `${plan.installmentYears} ${lang === 'ar' ? 'سنة' : 'years'}`
      return `${name}: ${down}, ${years}`
    })
    lines.push(lang === 'ar' ? `• خطط السداد المسجلة: ${plans.join('؛ ')}.` : `• Recorded payment plans: ${plans.join('; ')}.`)
  }

  const content = lines.join('\n')
  return {
    content,
    blocks: [{ type: 'text', content }],
    toolCallsMade: ['get_project_details', 'search_units'],
    provider: 'grounded',
  }
}

async function whatsAppHref(): Promise<string | null> {
  try {
    const { readContactCtas, toWhatsAppHref } = await import('@/lib/contact-cta')
    return toWhatsAppHref((await readContactCtas()).whatsapp)
  } catch {
    return null
  }
}

interface RecentTurn {
  content: string
  meta: any
}

async function readRecentAssistantTurns(convId: string, take = 5): Promise<RecentTurn[]> {
  try {
    const rows = await db.aIMessage.findMany({
      where: { conversationId: convId, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
      take,
    })
    return rows.map((r) => {
      let meta: any = null
      try {
        meta = r.metadata ? JSON.parse(r.metadata) : null
      } catch {
        meta = null
      }
      return { content: r.content || '', meta }
    })
  } catch {
    return []
  }
}

function activeLeadState(turns: RecentTurn[]): LeadState | null {
  const m = turns[0]?.meta?.leadCapture
  if (m && (m.stage === 'awaiting_name' || m.stage === 'awaiting_phone' || m.stage === 'awaiting_confirm')) {
    return {
      stage: m.stage,
      name: typeof m.name === 'string' ? m.name : undefined,
      phone: typeof m.phone === 'string' ? m.phone : undefined,
      retries: typeof m.retries === 'number' ? m.retries : 0,
    }
  }
  return null
}

function recentComparePair(turns: RecentTurn[]): string[] | null {
  for (const t of turns) {
    const blocks = t.meta?.blocks
    if (!Array.isArray(blocks)) continue
    for (const b of blocks) {
      if (b?.type === 'property_grid' && Array.isArray(b.projects) && b.projects.length >= 2) {
        const names = b.projects
          .slice(0, 2)
          .map((p: any) => (typeof p?.name === 'string' ? p.name.trim() : ''))
          .filter(Boolean)
        if (names.length >= 2) return names
      }
    }
  }
  return null
}

async function tryDeterministicTurn(
  convId: string,
  message: string,
  lang: ChatLang,
  aiCtx: { userId?: string | null; role?: string | null; brokerId?: string | null; developerId?: string | null },
): Promise<DeterministicTurn | null> {
  const turns = await readRecentAssistantTurns(convId)

  // ── B: an in-progress capture owns the turn (cancel wins first) ──
  const active = activeLeadState(turns)
  if (active) {
    const d = decideLeadStep(active, message)
    if (d.action === 'submit') {
      // userId is forced from the server session inside the tool
      // (anon → null, as today).
      const res = await toolCreateInquiry(
        { name: d.name || '', phone: d.phone || '', message: 'Lead from AI chat (slot capture)' },
        aiCtx,
      )
      const content = res.success
        ? formatLeadSuccess(lang, { name: d.name, phone: d.phone, waHref: await whatsAppHref() })
        : formatLeadToolError(lang, await whatsAppHref())
      return {
        content,
        blocks: [{ type: 'text', content }],
        toolCallsMade: ['create_inquiry'],
        provider: 'grounded',
        leadMeta: { stage: 'done', retries: 0 },
      }
    }
    if (d.action === 'cancelled' || d.action === 'handoff') {
      const content = formatLeadReply(d.action, lang, { waHref: d.action === 'handoff' ? await whatsAppHref() : null })
      return {
        content,
        blocks: [{ type: 'text', content }],
        toolCallsMade: [],
        provider: 'grounded',
        leadMeta: { stage: 'cancelled', retries: 0 },
      }
    }
    // ask_name / ask_phone / ask_confirm / repeat_confirm
    const state = d.state!
    const content = formatLeadReply(d.action, lang, {
      name: d.name ?? state.name,
      phone: d.phone ?? state.phone,
      phoneSaved: d.action === 'ask_name' && !!state.phone && state.retries === 0,
    })
    return {
      content,
      blocks: [{ type: 'text', content }],
      toolCallsMade: [],
      provider: 'grounded',
      leadMeta: { stage: state.stage, name: state.name, phone: state.phone, retries: state.retries },
    }
  }

  // ── B: a fresh trigger starts capture (idle cancel → normal flow) ──
  if (isLeadTrigger(message)) {
    const prefill = extractEgyptianPhone(message)
    const content = formatLeadReply('ask_name', lang, { phoneSaved: !!prefill })
    return {
      content,
      blocks: [{ type: 'text', content }],
      toolCallsMade: [],
      provider: 'grounded',
      leadMeta: prefill
        ? { stage: 'awaiting_name', phone: prefill, retries: 0 }
        : { stage: 'awaiting_name', retries: 0 },
    }
  }
  // An idle cancel with no capture running is not ours — normal flow.
  if (isCancelMessage(message)) return null

  // Catalog facts for a specifically named project must never depend on the
  // LLM deciding to call a tool. Read current inventory from SQLite and answer
  // deterministically (this was the failure mode behind fabricated prices and
  // the repeated budget question).
  if (isProjectCatalogFactQuestion(message)) {
    const matches = await findKnownProjectMentions(message)
    if (matches.length > 1) return ambiguousProjectReply(matches, lang)
    if (matches.length === 1) return projectCatalogFactsTurn(matches[0], message, lang)
  }

  // ── A: short compare affirmation resolves against the shown pair ──
  if (isCompareAffirm(message, turns[0]?.content)) {
    const pair = recentComparePair(turns)
    if (pair) {
      const res = await toolCompareProjects(pair)
      if (res.success) {
        const data = res.data as ComparisonData
        const intro = lang === 'ar'
          ? `مقارنة بين **${data.projects.map((p) => p.name).join(' و ')}**:`
          : `Comparing **${data.projects.map((p) => p.name).join(' vs ')}**:`
        const blocks: ResponseBlock[] = [
          { type: 'text', content: intro },
          { type: 'comparison', title: '', data },
        ]
        return { content: intro, blocks, toolCallsMade: ['compare_projects'], provider: 'grounded' }
      }
      const content = lang === 'ar'
        ? 'معلش، مش لاقي المشروعين دول للمقارنة. قولي اسم مشروعين وأنا أقارنهملك.'
        : 'Sorry, I couldn\u2019t find those two projects to compare. Name two projects and I\u2019ll compare them.'
      return { content, blocks: [{ type: 'text', content }], toolCallsMade: ['compare_projects'], provider: 'grounded' }
    }
  }

  return null
}

// Map backend failures to the same Arabic UX copy the JSON path returns.
function failureAssistantMessage(lang: 'ar' | 'en', error: any): { content: string; blocks: ResponseBlock[]; intent: string } | null {
  // Both backends down (Gemini primary + local fallback exhausted, or the
  // local stack refused the connection) — provider-neutral copy.
  if (AI_CONFIG.provider === 'gemini') {
    if (error?.code === 'ECONNREFUSED' || error?.message?.includes('ECONNREFUSED') || error?.message?.includes('fetch failed')) {
      return {
        content: 'المساعد الذكي غير متاح حاليًا. جرّب تاني بعد شوية.',
        blocks: [{ type: 'text', content: 'المساعد الذكي غير متاح حاليًا. جرّب تاني بعد شوية.' }],
        intent: 'ai_offline',
      }
    }
  }
  // Connection refused — Ollama not running
  if (error?.code === 'ECONNREFUSED' || error?.message?.includes('ECONNREFUSED') || error?.message?.includes('fetch failed')) {
    return {
      content: 'المساعد الذكي غير متاح. تأكد إن Ollama شغال على جهازك.',
      blocks: [{ type: 'text', content: 'المساعد الذكي غير متاح. تأكد إن Ollama شغال على جهازك.\n\n1. نزّل Ollama من https://ollama.com\n2. شغّل: ollama serve\n3. شغّل: ollama pull qwen2.5:3b' }],
      intent: 'ai_offline',
    }
  }

  // Timeout
  if (error?.name === 'TimeoutError' || error?.message?.includes('timeout') || error?.name === 'AbortError') {
    return {
      content: 'الموديل بياخد وقت طويل. جرّب تاني أو استخدم موديل أصغر.',
      blocks: [{ type: 'text', content: 'الموديل بياخد وقت طويل. جرّب تاني أو استخدم موديل أصغر.\n\nموديل مقترح: qwen2.5:3b' }],
      intent: 'timeout',
    }
  }
  return null
}

// ─── Streaming (SSE) ───────────────────────────────────────
// Contract: `meta` (ids handshake, first) → `status`* (tool-loop progress,
// also keeps the proxy read-timeout at bay) → `token`* (final-answer deltas)
// → `done` (authoritative full payload, already persisted) — or `error`
// mid-stream, which clients render through their existing error UI.
// Abort: the client disconnect (req.signal) + the tool-loop budget flow to
// every backend fetch; no secrets ever ride the stream.
function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function handleStreamChat(
  req: Request,
  body: { message: string; conversationId?: unknown; sessionId?: unknown },
  session: any,
  aiStatus: { available: boolean; modelInstalled: boolean; model: string; error?: string },
  lang: 'ar' | 'en',
): Promise<Response> {
  const { message, conversationId, sessionId } = body
  const userId = (session?.user as any)?.id || null

  let convId: string
  let effectiveSessionId: string | null
  try {
    ({ convId, effectiveSessionId } = await resolveConversation(conversationId, sessionId, message, userId))
  } catch (e: any) {
    return NextResponse.json({ error: e?.error || 'Forbidden' }, { status: e?.status || 403 })
  }

  // Save user message
  await db.aIMessage.create({
    data: { conversationId: convId, role: 'user', content: message },
  })

  fireDnaJourneyHooks(userId, message, convId)

  const conversationHistory = await loadConversationHistory(convId, message)
  const aiCtx = await buildAiCtx(session)

  // Deterministic upgrades answer as plain JSON (both clients share the
  // non-SSE fallback path) — no LLM round trip needed.
  const det = await tryDeterministicTurn(convId, message, lang, aiCtx)
  if (det) {
    await saveAssistantTurn(convId, message, det, lang, det.leadMeta ? { leadCapture: det.leadMeta } : undefined)
    return NextResponse.json(assistantPayload(convId, effectiveSessionId, det, lang))
  }

  // Total stream cap: the tool-loop budget. Past it the stream ends with an
  // `error` event instead of hanging into the proxy timeout.
  const budgetTimeout = AbortSignal.timeout(TOOL_LOOP_BUDGET_MS)
  const signal = req.signal
    ? AbortSignal.any([req.signal, budgetTimeout])
    : budgetTimeout

  let heartbeat: ReturnType<typeof setInterval> | null = null
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(new TextEncoder().encode(chunk))
        } catch {
          closed = true
        }
      }
      const close = () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      }
      // SSE comment heartbeat: resets the proxy read-timeout during long
      // CPU decodes between real events. Clients ignore comments.
      heartbeat = setInterval(() => safeEnqueue(': ping\n\n'), 15_000)
      try {
        // IDs handshake FIRST — clients persist before any content arrives.
        safeEnqueue(sseEncode('meta', { conversationId: convId, sessionId: effectiveSessionId }))
        const result = await callLLMStream(conversationHistory, message, aiCtx, lang, {
          signal,
          onStatus: (phase, text) => safeEnqueue(sseEncode('status', { phase, message: text })),
          onToken: (text) => safeEnqueue(sseEncode('token', { text })),
        })
        await saveAssistantTurn(convId, message, result, lang)
        safeEnqueue(sseEncode('done', assistantPayload(convId, effectiveSessionId, result, lang)))
        close()
      } catch (error: any) {
        if (req.signal?.aborted) {
          // Client went away — stop the backend fetch, send nothing.
          close()
          return
        }
        console.error('AI Chat stream error:', error?.message || error)
        const mapped = failureAssistantMessage(lang, error)
        safeEnqueue(sseEncode('error', {
          error: mapped ? undefined : 'Internal server error',
          content: mapped?.content || (lang === 'ar' ? 'حصل مشكلة. جرّب تاني.' : 'Something went wrong. Try again.'),
          blocks: mapped?.blocks || [{ type: 'text', content: mapped?.content || 'حصل مشكلة. جرّب تاني.' }],
          intent: mapped?.intent || 'unknown',
          lang,
        }))
        close()
      }
    },
    cancel() {
      // Client disconnected mid-stream: req.signal aborts the backend fetch.
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // nginx: never buffer chat SSE — flush every token immediately.
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    // Anonymous callers share an IP bucket (authed behavior unchanged).
    const limited = enforceRateLimit(req, (session?.user as any)?.id || null)
    if (limited) return limited
    const body = await req.json()
    const { message, conversationId, sessionId } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    const lang = detectLanguage(message)

    // Check AI backend availability before calling LLM (provider-aware)
    const aiStatus = AI_CONFIG.provider === 'gemini'
      ? await checkGeminiStatus()
      : AI_CONFIG.provider === 'llamacpp'
        ? await checkLlamacppStatus()
        : await checkOllamaStatus()
    if (!aiStatus.available || !aiStatus.modelInstalled) {
      return NextResponse.json({
        conversationId: conversationId || null,
        sessionId: sessionId || null,
        message: offlineAssistantMessage(lang, aiStatus),
      })
    }

    // Streaming clients opt in with `"stream": true` — same guards, same
    // persistence, tokens instead of one buffered JSON body.
    if (body.stream === true) {
      return handleStreamChat(req, body, session, aiStatus, lang)
    }

    // Create or continue conversation (ownership guards shared with stream path)
    let convId: string
    let effectiveSessionId: string | null
    try {
      ({ convId, effectiveSessionId } = await resolveConversation(conversationId, sessionId, message, (session?.user as any)?.id || null))
    } catch (e: any) {
      return NextResponse.json({ error: e?.error || 'Forbidden' }, { status: e?.status || 403 })
    }

    // Save user message
    await db.aIMessage.create({
      data: { conversationId: convId, role: 'user', content: message },
    })

    fireDnaJourneyHooks((session?.user as any)?.id || null, message, convId)

    const conversationHistory = await loadConversationHistory(convId, message)

    const aiCtx = await buildAiCtx(session)

    // Deterministic upgrades (lead capture / compare affirmation) answer as
    // plain JSON — both clients share the non-SSE fallback path.
    const det = await tryDeterministicTurn(convId, message, lang, aiCtx)
    if (det) {
      await saveAssistantTurn(convId, message, det, lang, det.leadMeta ? { leadCapture: det.leadMeta } : undefined)
      return NextResponse.json(assistantPayload(convId, effectiveSessionId, det, lang))
    }

    const result = await callLLM(conversationHistory, message, aiCtx, lang)

    await saveAssistantTurn(convId, message, result, lang)

    return NextResponse.json(assistantPayload(convId, effectiveSessionId, result, lang))
  } catch (error: any) {
    console.error('AI Chat error:', error?.message || error)

    // Conversation-guard rejections (IDOR/404) carry { status, error }.
    if (typeof error?.status === 'number' && error?.error) {
      return NextResponse.json({ error: error.error }, { status: error.status })
    }

    const lang = 'ar'

    const mapped = failureAssistantMessage(lang, error)
    if (mapped) {
      return NextResponse.json({
        conversationId: null,
        message: {
          role: 'assistant',
          ...mapped,
          lang,
        },
      })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
