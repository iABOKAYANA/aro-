import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { ollamaChat } from '@/lib/ai/ollama'

export const dynamic = 'force-dynamic'

// ─── Intent vocabulary (11 data intents the route serves) ───
type IntentId =
  | 'projects-top'
  | 'leads-unassigned'
  | 'leads-status'
  | 'locations'
  | 'brokers-best'
  | 'conversion'
  | 'users'
  | 'inquiries'
  | 'revenue'
  | 'units'
  | 'viewings'
  | 'other'

const KNOWN_INTENTS: IntentId[] = [
  'projects-top',
  'leads-unassigned',
  'leads-status',
  'locations',
  'brokers-best',
  'conversion',
  'users',
  'inquiries',
  'revenue',
  'units',
  'viewings',
]

// Short timeout: the CEO waits on this endpoint. 12s is inside the
// requested 10–15s window — long enough for qwen2.5:3b to emit a tiny
// JSON object locally, short enough to fall back to keywords fast.
const CLASSIFY_TIMEOUT_MS = 12_000

const CLASSIFY_SYSTEM =
  'You are a strict intent classifier for a bilingual (English/Arabic) real-estate CEO assistant. ' +
  'Output ONLY a JSON object with exactly two keys: {"intent","lang"}. ' +
  '"intent" must be exactly one of: ' +
  '"projects-top","leads-unassigned","leads-status","locations","brokers-best","conversion","users","inquiries","revenue","units","viewings","other". ' +
  '"lang" must be "ar" if the question is Arabic (any dialect, with or without hamzas) else "en". ' +
  'Intent definitions: ' +
  'projects-top=top/popular projects by inquiries; ' +
  'leads-unassigned=new/unassigned/pending leads counts; ' +
  'leads-status=lead breakdown/distribution by status; ' +
  'locations=areas/governorates/regions with demand; ' +
  'brokers-best=best/top brokers by performance; ' +
  'conversion=conversion rate (leads converted %); ' +
  'users=total user count / breakdown by role; ' +
  'inquiries=total inquiry count / breakdown by status; ' +
  'revenue=deals/sales/revenue totals; ' +
  'units=available/vacant units; ' +
  'viewings=viewings/appointments totals; ' +
  'other=anything else (greetings, off-topic, unclear). ' +
  'Be robust to typos, missing hamzas (ا vs أ vs إ vs آ), ى vs ي, and Egyptian dialect words (عايز, عاوز, كام, انهي, أنهى, وريني, ايه, ازاي, فين, بكام, مين). ' +
  'No preamble, no code fences, JSON only. ' +
  'Examples: ' +
  '{"q":"Which projects have the most inquiries?","a":{"intent":"projects-top","lang":"en"}} ' +
  '{"q":"انهي مشاريع عليها اكتر استفسارات","a":{"intent":"projects-top","lang":"ar"}} ' +
  '{"q":"وريني المشاريع المشهوره","a":{"intent":"projects-top","lang":"ar"}} ' +
  '{"q":"How many leads are unassigned?","a":{"intent":"leads-unassigned","lang":"en"}} ' +
  '{"q":"في كام ليد مش متوزع؟","a":{"intent":"leads-unassigned","lang":"ar"}} ' +
  '{"q":"عايز اعرف توزيعة الليدز حسب الحاله","a":{"intent":"leads-status","lang":"ar"}} ' +
  '{"q":"lead status breakdown","a":{"intent":"leads-status","lang":"en"}} ' +
  '{"q":"انهي مناطق عليها طلب عالي؟","a":{"intent":"locations","lang":"ar"}} ' +
  '{"q":"which areas have the highest demand","a":{"intent":"locations","lang":"en"}} ' +
  '{"q":"البروكرز مين احسن ناس","a":{"intent":"brokers-best","lang":"ar"}} ' +
  '{"q":"who are the top performing brokers","a":{"intent":"brokers-best","lang":"en"}} ' +
  '{"q":"عايز اعرف الكونفرجن","a":{"intent":"conversion","lang":"ar"}} ' +
  '{"q":"what is our conversion rate","a":{"intent":"conversion","lang":"en"}} ' +
  '{"q":"كام مستخدم عندنا؟","a":{"intent":"users","lang":"ar"}} ' +
  '{"q":"how many users total","a":{"intent":"users","lang":"en"}} ' +
  '{"q":"اجمالي الاستفسارات كام","a":{"intent":"inquiries","lang":"ar"}} ' +
  '{"q":"total inquiries count","a":{"intent":"inquiries","lang":"en"}} ' +
  '{"q":"اجمالي الصفقات والمبيعات","a":{"intent":"revenue","lang":"ar"}} ' +
  '{"q":"total deals and revenue","a":{"intent":"revenue","lang":"en"}} ' +
  '{"q":"في كام وحده متاحه؟","a":{"intent":"units","lang":"ar"}} ' +
  '{"q":"how many units are available","a":{"intent":"units","lang":"en"}} ' +
  '{"q":"عندنا كام معاينه؟","a":{"intent":"viewings","lang":"ar"}} ' +
  '{"q":"how many viewings scheduled","a":{"intent":"viewings","lang":"en"}} ' +
  '{"q":"عامل ايه؟","a":{"intent":"other","lang":"ar"}} ' +
  '{"q":"how is the weather today","a":{"intent":"other","lang":"en"}}'

function parseClassifyOutput(content: string): { intent: IntentId; lang: 'ar' | 'en' } | null {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>
    const intent = parsed.intent
    const lang = parsed.lang
    if (typeof intent !== 'string') return null
    const validIntent: IntentId = (KNOWN_INTENTS as string[]).includes(intent) ? (intent as IntentId) : 'other'
    const validLang: 'ar' | 'en' = lang === 'ar' ? 'ar' : lang === 'en' ? 'en' : detectLangFallback(intent)
    return { intent: validIntent, lang: validLang }
  } catch {
    return null
  }
}

function detectLangFallback(_intent: string): 'ar' | 'en' {
  return 'en'
}

async function classifyIntent(question: string): Promise<{ intent: IntentId; lang: 'ar' | 'en'; ms: number; engine: 'LLM' } | null> {
  const t0 = Date.now()
  try {
    const res = await Promise.race([
      ollamaChat([
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: question.slice(0, 1000) },
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('llm-timeout')), CLASSIFY_TIMEOUT_MS)),
    ])
    const content = (res.message?.content || '').trim()
    if (!content) throw new Error('empty llm output')
    // Strip markdown fences if the model wraps the JSON.
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(content)
    const parsed = parseClassifyOutput(fence ? fence[1] : content)
    if (!parsed) throw new Error('unparseable classification')
    return { ...parsed, ms: Date.now() - t0, engine: 'LLM' }
  } catch {
    return null
  }
}

// ─── LEGACY keyword matcher (deterministic fallback, kept intact) ───
// Same conditions as the original if/else chain, extracted verbatim into
// a function returning an intent id. Runs when the LLM is unavailable,
// times out, or returns garbage — and its verdict is authoritative then.
function legacyMatchIntent(q: string): IntentId {
  if ((q.includes('project') || q.includes('مشروع') || q.includes('مشاريع')) && (q.includes('inquir') || q.includes('popular') || q.includes('top') || q.includes('most') || q.includes('استفسار') || q.includes('استفسارات') || q.includes('الأكثر') || q.includes('الأعلى') || q.includes('الأشهر') || q.includes('الاكثر') || q.includes('الاعلى') || q.includes('الاشهر') || q.includes('أكثر') || q.includes('أعلى') || q.includes('أشهر') || q.includes('أكتر') || q.includes('اكتر') || q.includes('اكثر') || q.includes('اعلى') || q.includes('اشهر'))) {
    return 'projects-top'
  }
  if ((q.includes('lead') || q.includes('ليد') || q.includes('عميل') || q.includes('عملاء')) && (q.includes('unassign') || q.includes('new') || q.includes('pending') || q.includes('without') || q.includes('مش متوزع') || q.includes('متوزع') || q.includes('جديد') || q.includes('معلق') || q.includes('من غير'))) {
    return 'leads-unassigned'
  }
  if ((q.includes('lead') || q.includes('ليد')) && (q.includes('status') || q.includes('حالة') || q.includes('توزيعة') || q.includes('الحالات') || q.includes('حالات'))) {
    return 'leads-status'
  }
  if (q.includes('location') || q.includes('governorate') || q.includes('area') || q.includes('demand') || q.includes('منطقة') || q.includes('مناطق') || q.includes('محافظة') || q.includes('طلب') || q.includes('الأعلى') || q.includes('الاعلى') || q.includes('أعلى') || q.includes('اعلى')) {
    return 'locations'
  }
  if ((q.includes('broker') || q.includes('بروكر') || q.includes('وسيط') || q.includes('وسطاء')) && (q.includes('lead') || q.includes('active') || q.includes('best') || q.includes('top') || q.includes('perform') || q.includes('الأحسن') || q.includes('الأفضل') || q.includes('الأعلى') || q.includes('شغال') || q.includes('الاحسن') || q.includes('الافضل') || q.includes('الاعلى') || q.includes('أحسن') || q.includes('أفضل') || q.includes('أعلى') || q.includes('احسن') || q.includes('افضل') || q.includes('اعلى') || q.includes('شغالين'))) {
    return 'brokers-best'
  }
  if (q.includes('conversion') || q.includes('convert') || q.includes('تحويل') || q.includes('نسبة التحويل') || q.includes('اتحول') || q.includes('تحول') || q.includes('يتحول')) {
    return 'conversion'
  }
  if ((q.includes('user') || q.includes('مستخدم') || q.includes('مستخدمين')) && (q.includes('total') || q.includes('how many') || q.includes('count') || q.includes('عدد') || q.includes('كام') || q.includes('إجمالي') || q.includes('اجمالي'))) {
    return 'users'
  }
  if ((q.includes('inquir') || q.includes('استفسار') || q.includes('استفسارات')) && (q.includes('total') || q.includes('how many') || q.includes('count') || q.includes('عدد') || q.includes('كام') || q.includes('إجمالي') || q.includes('اجمالي'))) {
    return 'inquiries'
  }
  if (q.includes('revenue') || q.includes('deal') || q.includes('sale') || q.includes('إيراد') || q.includes('ايراد') || q.includes('صفقات') || q.includes('صفقة') || q.includes('مبيعات') || q.includes('مباع') || q.includes('متباع')) {
    return 'revenue'
  }
  if ((q.includes('unit') || q.includes('وحدة') || q.includes('وحدات')) && (q.includes('available') || q.includes('vacant') || q.includes('متاح') || q.includes('متاحة') || q.includes('فاضي') || q.includes('فاضية'))) {
    return 'units'
  }
  if (q.includes('viewing') || q.includes('appointment') || q.includes('معاينة') || q.includes('معاينات') || q.includes('معاين') || q.includes('مواعيد') || q.includes('موعد')) {
    return 'viewings'
  }
  return 'other'
}

// ─── Deterministic execution: dispatch map keyed by intent id ───
// Both languages share each handler; `ar` only switches the answer string.
// Queries are the ORIGINAL branch queries, unchanged.
async function executeIntent(intent: IntentId, ar: boolean): Promise<{ answer: string; data: unknown }> {
  switch (intent) {
    case 'projects-top': {
      const topProjects = await db.project.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          inquiryCount: true,
          viewCount: true,
          favoriteCount: true,
          developer: { select: { companyName: true } },
        },
        orderBy: { inquiryCount: 'desc' },
        take: 10,
      })
      return { answer: ar ? `أعلى المشاريع في الاستفسارات:` : `Here are the top projects by inquiry count:`, data: topProjects }
    }
    case 'leads-unassigned': {
      const count = await db.lead.count({ where: { status: 'NEW' } })
      return { answer: ar ? `عندك ${count} ليد مش متوزعين.` : `There are ${count} unassigned (NEW) leads in the system.`, data: { count } }
    }
    case 'leads-status': {
      const leadsByStatus = await db.lead.groupBy({
        by: ['status'],
        _count: { id: true },
      })
      return { answer: ar ? `توزيعة الليدز حسب الحالة:` : `Lead breakdown by status:`, data: leadsByStatus.map(s => ({ status: s.status, count: s._count.id })) }
    }
    case 'locations': {
      const topLocations = await db.governorate.findMany({
        select: { name: true, _count: { select: { projects: true } } },
        orderBy: { projects: { _count: 'desc' } },
        take: 10,
      })
      return { answer: ar ? `المناطق اللي عليها أعلى طلب:` : `Here are the locations with highest project demand:`, data: topLocations.map(l => ({ name: l.name, projectCount: l._count.projects })) }
    }
    case 'brokers-best': {
      const brokerPerformance = await db.brokerProfile.findMany({
        select: {
          id: true,
          user: { select: { name: true, email: true } },
          totalDeals: true,
          rating: true,
          _count: { select: { leads: true } },
        },
        orderBy: { totalDeals: 'desc' },
        take: 10,
      })
      return { answer: ar ? `أحسن بروكرز حسب الأداء:` : `Here are the top brokers by performance:`, data: brokerPerformance }
    }
    case 'conversion': {
      const totalLeads = await db.lead.count()
      const convertedLeads = await db.lead.count({ where: { convertedAt: { not: null } } })
      const rate = totalLeads > 0 ? (convertedLeads / totalLeads * 100) : 0
      return { answer: ar ? `نسبة التحويل ${Math.round(rate * 10) / 10}% (${convertedLeads} من أصل ${totalLeads} ليد اتحولوا).` : `The lead conversion rate is ${Math.round(rate * 10) / 10}% (${convertedLeads} out of ${totalLeads} leads converted).`, data: { totalLeads, convertedLeads, conversionRate: Math.round(rate * 10) / 10 } }
    }
    case 'users': {
      const totalUsers = await db.user.count()
      const usersByRole = await db.user.groupBy({ by: ['role'], _count: { id: true } })
      return { answer: ar ? `إجمالي المستخدمين: ${totalUsers}. التوزيعة:` : `Total users: ${totalUsers}. Breakdown:`, data: usersByRole.map(r => ({ role: r.role, count: r._count.id })) }
    }
    case 'inquiries': {
      const total = await db.inquiry.count()
      const byStatus = await db.inquiry.groupBy({ by: ['status'], _count: { id: true } })
      return { answer: ar ? `إجمالي الاستفسارات: ${total}. التوزيعة حسب الحالة:` : `Total inquiries: ${total}. Breakdown by status:`, data: byStatus.map(s => ({ status: s.status, count: s._count.id })) }
    }
    case 'revenue': {
      const totalDeals = await db.brokerProfile.aggregate({ _sum: { totalDeals: true } })
      const topBrokers = await db.brokerProfile.findMany({
        select: { user: { select: { name: true } }, totalDeals: true },
        orderBy: { totalDeals: 'desc' },
        take: 5,
      })
      return { answer: ar ? `إجمالي الصفقات: ${totalDeals._sum.totalDeals || 0}. أحسن بروكرز:` : `Total deals completed: ${totalDeals._sum.totalDeals || 0}. Top brokers:`, data: topBrokers.map(b => ({ name: b.user.name, deals: b.totalDeals })) }
    }
    case 'units': {
      // CEO AI answers count buyable inventory only — never showcase samples.
      const count = await db.unit.count({ where: { status: 'AVAILABLE', isSample: false } })
      const byType = await db.unit.groupBy({
        by: ['unitType'],
        where: { status: 'AVAILABLE', isSample: false },
        _count: { id: true },
      })
      return { answer: ar ? `الوحدات المتاحة: ${count}. التوزيعة حسب النوع:` : `Available units: ${count}. Breakdown by type:`, data: byType.map(t => ({ type: t.unitType, count: t._count.id })) }
    }
    case 'viewings': {
      const total = await db.viewing.count()
      const byStatus = await db.viewing.groupBy({ by: ['status'], _count: { id: true } })
      return { answer: ar ? `إجمالي المعاينات: ${total}. التوزيعة حسب الحالة:` : `Total viewings: ${total}. Breakdown by status:`, data: byStatus.map(s => ({ status: s.status, count: s._count.id })) }
    }
    case 'other':
    default: {
      // Deterministic helpful fallback (original shape). Deliberately NO
      // unguided LLM generation on business data — the LLM only classifies.
      return { answer: ar ? `أقدر أساعدك في أسئلة عن: المشاريع، الليدز، البروكرز، المستخدمين، الاستفسارات، التحويل، المعاينات، المناطق، الوحدات، والإيرادات. جرّب تسأل زي "أنهي مشاريع عليها أكتر استفسارات؟" أو "في كام ليد مش متوزع؟"` : `I can help with questions about: projects, leads, brokers, users, inquiries, conversions, viewings, locations, units, and revenue. Try asking something like "Which projects have the most inquiries?" or "How many leads are unassigned?"`, data: null }
    }
  }
}

export async function POST(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { question, lang = 'en' } = body
    if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 })

    const q = question.toLowerCase()
    // Byte-compatible language resolution: explicit param + Arabic autodetect,
    // exactly as before. The classifier's lang is a tiebreak only when the
    // param is absent/default and no Arabic script is present — it never
    // overrides an explicit `lang` or detected Arabic script.
    let ar = lang === 'ar' || /[\u0600-\u06FF]/.test(question)

    // 1) LLM intent router (strict JSON, short timeout).
    const classified = await classifyIntent(question)
    let intent: IntentId
    if (classified) {
      intent = classified.intent
      if (lang !== 'ar' && !/[\u0600-\u06FF]/.test(question) && classified.lang === 'ar') ar = true
      console.log(`[ceo-ai] intent=${intent} lang=${classified.lang} ms=${classified.ms} engine=LLM q=${question.slice(0, 120)}`)
    } else {
      // 2) Deterministic fallback: legacy keyword matcher, kept intact.
      const t0 = Date.now()
      intent = legacyMatchIntent(q)
      console.log(`[ceo-ai] intent=${intent} ms=${Date.now() - t0} engine=LEGACY q=${question.slice(0, 120)}`)
    }
    // 3) Deterministic execution — the LLM never touches business data.
    const { answer, data } = await executeIntent(intent, ar)

    return NextResponse.json({ answer, data })
  } catch (error) {
    console.error('CEO AI assistant error:', error)
    return NextResponse.json({ error: 'Failed to process question' }, { status: 500 })
  }
}
