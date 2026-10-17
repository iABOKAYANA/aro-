import { db } from '@/lib/db'
import { ollamaChat } from '@/lib/ai/ollama'
import { logAudit } from '@/lib/permissions'
import { parseJsonSafe } from '@/lib/utils'

// ─── AI PROPERTY CONTENT GENERATOR (Feature 5) ──────────────
// Generates marketing content from VERIFIED DATABASE FACTS ONLY.
// Hard rules:
//   • Facts are read from Prisma right before generation.
//   • The prompt forbids inventing price/area/delivery/payment/amenities.
//   • If the LLM is unavailable → deterministic template fallback that
//     only interpolates facts (still never invents anything).
//   • Drafts are stored as ApprovalRequests; publishing applies the
//     approved text to the project (CEO/ADMIN final control).

export const CONTENT_APPROVAL_TYPE = 'AI_CONTENT'

export type ContentKind =
  | 'DESCRIPTION_EN' | 'DESCRIPTION_AR' | 'SHORT_LISTING'
  | 'SEO_TITLE' | 'SEO_DESC' | 'SOCIAL' | 'WHATSAPP'

export const CONTENT_KINDS: ContentKind[] = [
  'DESCRIPTION_EN', 'DESCRIPTION_AR', 'SHORT_LISTING',
  'SEO_TITLE', 'SEO_DESC', 'SOCIAL', 'WHATSAPP',
]

const KIND_LABEL: Record<ContentKind, string> = {
  DESCRIPTION_EN: 'English description',
  DESCRIPTION_AR: 'Arabic description',
  SHORT_LISTING: 'Short listing description',
  SEO_TITLE: 'SEO title',
  SEO_DESC: 'SEO description',
  SOCIAL: 'Social media caption',
  WHATSAPP: 'WhatsApp listing text',
}

export interface VerifiedFacts {
  name: string
  nameArabic: string | null
  developer: string
  city: string | null
  governorate: string | null
  status: string
  propertyTypes: string[]
  listingTypes: string[]
  priceMin: number | null
  priceMax: number | null
  deliveryDate: string | null
  downPaymentMin: number | null
  installmentYears: number | null
  amenities: string[]
  totalUnits: number | null
  unitCount: number
  bedrooms: { min: number; max: number } | null
  trust: Record<string, { status: string; source?: string; updatedAt?: string }>
}

export async function buildVerifiedFacts(projectId: string): Promise<VerifiedFacts | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: {
      developer: { select: { companyName: true, user: { select: { name: true } } } },
      city: { select: { name: true } },
      governorate: { select: { name: true } },
      amenities: { include: { amenity: { select: { name: true, nameArabic: true } } } },
      units: { select: { price: true, bedrooms: true } },
      paymentPlans: { select: { downPaymentPct: true, installmentYears: true } },
    },
  })
  if (!p) return null

  const prices = p.units.map((u) => u.price).filter((x) => x > 0)
  const beds = p.units.map((u) => u.bedrooms).filter((b): b is number => b !== null)
  const plan = p.paymentPlans[0]
  const unitTypes = parseJsonSafe<string[]>(p.propertyTypes, [])
  const listingTypes = parseJsonSafe<string[]>(p.listingTypes, [])
  return {
    name: p.name,
    nameArabic: p.nameArabic,
    developer: p.developer.companyName || p.developer.user.name,
    city: p.city?.name || null,
    governorate: p.governorate?.name || null,
    status: p.status,
    propertyTypes: unitTypes,
    listingTypes,
    priceMin: p.startPrice ?? (prices.length ? Math.min(...prices) : null),
    priceMax: p.endPrice ?? (prices.length ? Math.max(...prices) : null),
    deliveryDate: p.deliveryDate ? new Date(p.deliveryDate).toISOString() : null,
    downPaymentMin: p.downPaymentMin ?? plan?.downPaymentPct ?? null,
    installmentYears: p.installmentYears ?? plan?.installmentYears ?? null,
    amenities: p.amenities.map((a) => a.amenity.name).filter(Boolean),
    totalUnits: p.totalUnits,
    unitCount: p.units.length,
    bedrooms: beds.length ? { min: Math.min(...beds), max: Math.max(...beds) } : null,
    trust: parseJsonSafe<Record<string, { status: string; source?: string; updatedAt?: string }>>(p.dataTrust, {}),
  }
}

export function factsBlock(f: VerifiedFacts): string {
  const lines: string[] = []
  lines.push(`Project: ${f.name}${f.nameArabic ? ` / ${f.nameArabic}` : ''}`)
  lines.push(`Developer: ${f.developer}`)
  if (f.city || f.governorate) lines.push(`Location: [${f.city || '—'}, ${f.governorate || '—'}], Egypt`)
  lines.push(`Status: ${f.status.replace(/_/g, ' ').toLowerCase()}`)
  if (f.propertyTypes.length) lines.push(`Property types: ${f.propertyTypes.join(', ')}`)
  if (f.listingTypes.length) lines.push(`Listing types: ${f.listingTypes.join(', ')}`)
  if (f.priceMin) lines.push(`Starting price: ${Math.round(f.priceMin).toLocaleString('en-US')} EGP`)
  if (f.priceMax && f.priceMax !== f.priceMin) lines.push(`Price range up to: ${Math.round(f.priceMax).toLocaleString('en-US')} EGP`)
  if (f.downPaymentMin !== null) lines.push(`Minimum down payment: ${f.downPaymentMin}%`)
  if (f.installmentYears !== null) lines.push(`Installments up to: ${f.installmentYears} years`)
  if (f.deliveryDate) lines.push(`Delivery date: ${f.deliveryDate.slice(0, 10)}`)
  if (f.bedrooms) lines.push(`Bedrooms available: ${f.bedrooms.min}–${f.bedrooms.max}`)
  if (f.unitCount) lines.push(`Units on platform: ${f.unitCount}${f.totalUnits ? ` (project total: ${f.totalUnits})` : ''}`)
  if (f.amenities.length) lines.push(`Amenities: ${f.amenities.slice(0, 14).join(', ')}${f.amenities.length > 14 ? '…' : ''}`)
  lines.push(`Verification: ${JSON.stringify(Object.fromEntries(Object.entries(f.trust).map(([k, v]) => [k, v.status])))}`)
  return lines.join('\n')
}

function templateContent(kind: ContentKind, f: VerifiedFacts, lang: 'en' | 'ar'): string {
  const price = f.priceMin ? `starting from ${Math.round(f.priceMin).toLocaleString('en-US')} EGP` : ''
  const types = f.propertyTypes.join(' & ').toLowerCase() || 'properties'
  const loc = [f.city, f.governorate].filter(Boolean).join(', ')
  const delivery = f.deliveryDate ? `Delivery: ${f.deliveryDate.slice(0, 10)}.` : ''
  const pay = [
    f.downPaymentMin !== null ? `${f.downPaymentMin}% down payment` : null,
    f.installmentYears !== null ? `installments up to ${f.installmentYears} years` : null,
  ].filter(Boolean).join(' with ')

  switch (kind) {
    case 'DESCRIPTION_EN':
      return [
        `${f.name} by ${f.developer}${loc ? ` in ${loc}` : ''}.`,
        f.propertyTypes.length ? `Offering ${types} for ${f.listingTypes.join(' & ').toLowerCase() || 'sale'}.` : '',
        price ? `Units are available ${price}.` : '',
        pay ? `Payment plan: ${pay}.` : '',
        delivery,
        f.amenities.length ? `Amenities include ${f.amenities.slice(0, 8).join(', ')}.` : '',
      ].filter(Boolean).join(' ')
    case 'DESCRIPTION_AR':
      return [
        `${f.nameArabic || f.name} من ${f.developer}${loc ? ` في ${loc}` : ''}.`,
        f.propertyTypes.length ? `يضم ${types}.` : '',
        price ? `الأسعار تبدأ من ${Math.round(f.priceMin!).toLocaleString('en-US')} جنيه مصري.` : '',
        pay ? `خطة السداد: ${pay}.` : '',
        delivery ? `التسليم: ${f.deliveryDate!.slice(0, 10)}.` : '',
        f.amenities.length ? `من الخدمات: ${f.amenities.slice(0, 6).join('، ')}.` : '',
      ].filter(Boolean).join(' ')
    case 'SHORT_LISTING':
      return `${f.name}${loc ? ` — ${loc}` : ''}. ${f.propertyTypes.length ? `${f.propertyTypes.join(' & ')}s. ` : ''}${price ? `From ${Math.round(f.priceMin!).toLocaleString('en-US')} EGP. ` : ''}${delivery}`
    case 'SEO_TITLE':
      return `${f.name} — ${loc || 'Egypt'} ${f.propertyTypes.join(' & ')} Prices & Payment Plan | ${f.developer}`
    case 'SEO_DESC':
      return `Explore ${f.name} in ${loc || 'Egypt'}: ${types}${price ? `, ${price}` : ''}${pay ? `, ${pay}` : ''}. Updated ${new Date().toISOString().slice(0, 10)} on EstateAI.`
    case 'SOCIAL':
      return `🏙️ ${f.name}${loc ? ` — ${loc}` : ''}\n${price ? `💰 ${price}` : ''}\n${pay ? `📅 ${pay}` : ''}\n${f.amenities.length ? `🏊 ${f.amenities.slice(0, 3).join(' • ')}` : ''}\n${lang === 'ar' ? 'اطلب التفاصيل الآن' : 'Ask for details today'} ✨`
    case 'WHATSAPP':
      return `*${f.name}*${loc ? ` — ${loc}` : ''}\n${f.propertyTypes.length ? `${f.propertyTypes.join(' & ')}\n` : ''}${price ? `${price}\n` : ''}${pay ? `${pay}\n` : ''}${delivery ? `${delivery}\n` : ''}Reply for full details.`
  }
}

function langOf(kind: ContentKind): 'en' | 'ar' {
  return kind === 'DESCRIPTION_AR' ? 'ar' : 'en'
}

const KIND_INSTRUCTIONS: Record<ContentKind, string> = {
  DESCRIPTION_EN: 'Write a professional English property description (120–180 words).',
  DESCRIPTION_AR: 'اكتب وصفًا عربيًا احترافيًا للعقار (120–180 كلمة) بلهجة فصحى مفهومة.',
  SHORT_LISTING: 'Write a 2–3 sentence listing blurb in English.',
  SEO_TITLE: 'Write an SEO title under 60 characters in English.',
  SEO_DESC: 'Write an SEO meta description of 140–160 characters in English.',
  SOCIAL: 'Write a short social-media caption in English with light emojis.',
  WHATSAPP: 'Write a concise WhatsApp message in English ready to paste.',
}

/** Generate one content kind for a project. Returns facts block for auditability. */
export async function generateContent(
  projectId: string,
  kind: ContentKind,
): Promise<{ content: string; engine: 'LLM' | 'TEMPLATE'; facts: VerifiedFacts; factsText: string } | { error: string }> {
  if (!CONTENT_KINDS.includes(kind)) return { error: 'Unknown content kind' }
  const facts = await buildVerifiedFacts(projectId)
  if (!facts) return { error: 'Project not found' }
  const factsText = factsBlock(facts)

  const system =
    'You are the EstateAI real-estate content writer. You receive VERIFIED database facts. ' +
    'RULES: Use ONLY facts provided. NEVER invent or guess price, area, delivery date, payment plan, amenities, location, or developer claims. ' +
    'If a fact is missing, simply omit it. Output ONLY the requested content — no preamble, no quotes around it.'
  const user = `VERIFIED FACTS:\n${factsText}\n\nTASK: ${KIND_INSTRUCTIONS[kind]}`

  try {
    const res = await Promise.race([
      ollamaChat([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('llm-timeout')), 45_000)),
    ])
    const content = (res.message?.content || '').trim()
    if (content && content.length >= 10) {
      return { content: content.replace(/^["']|["']$/g, ''), engine: 'LLM', facts: facts, factsText }
    }
    throw new Error('empty llm output')
  } catch {
    // Deterministic, facts-only fallback (still never invents anything)
    return { content: templateContent(kind, facts, langOf(kind)), engine: 'TEMPLATE', facts: facts, factsText }
  }
}

// ─── Draft storage / approval workflow ────────────────────

export interface ContentDraft {
  approvalId: string
  kind: ContentKind
  lang: 'en' | 'ar'
  content: string
  engine: 'LLM' | 'TEMPLATE'
  status: string
  createdAt: string
}

function draftMeta(meta: Record<string, unknown>): { kind: ContentKind; lang: 'en' | 'ar'; content: string; engine: 'LLM' | 'TEMPLATE' } {
  return {
    kind: (meta.kind as ContentKind) || 'DESCRIPTION_EN',
    lang: (meta.lang as 'en' | 'ar') || 'en',
    content: (meta.content as string) || '',
    engine: (meta.engine as 'LLM' | 'TEMPLATE') || 'TEMPLATE',
  }
}

/** Save/replace a pending draft for (project, kind). */
export async function saveDraft(params: {
  projectId: string
  projectName: string
  kind: ContentKind
  content: string
  engine: 'LLM' | 'TEMPLATE'
  factsText: string
  actorId: string
  lang?: 'en' | 'ar'
}): Promise<ContentDraft> {
  const meta = {
    kind: params.kind,
    lang: params.lang || langOf(params.kind),
    content: params.content,
    engine: params.engine,
    facts: params.factsText,
    projectId: params.projectId,
  }
  const existing = await db.approvalRequest.findFirst({
    where: { type: CONTENT_APPROVAL_TYPE, entityType: 'PROJECT', entityId: params.projectId, status: 'PENDING', title: `${KIND_LABEL[params.kind]}` },
  })
  if (existing) {
    await db.approvalRequest.update({ where: { id: existing.id }, data: { metadata: JSON.stringify(meta), requestedAt: new Date() } })
    return { approvalId: existing.id, kind: params.kind, lang: meta.lang, content: params.content, engine: params.engine, status: 'PENDING', createdAt: new Date().toISOString() }
  }
  const row = await db.approvalRequest.create({
    data: {
      type: CONTENT_APPROVAL_TYPE,
      entityType: 'PROJECT',
      entityId: params.projectId,
      title: KIND_LABEL[params.kind],
      description: `AI-generated ${KIND_LABEL[params.kind]} for ${params.projectName}`,
      status: 'PENDING',
      requestedBy: params.actorId,
      metadata: JSON.stringify(meta),
    },
  })
  await logAudit({ userId: params.actorId, action: 'AI_CONTENT_DRAFTED', entity: 'Project', entityId: params.projectId, changes: { kind: params.kind, engine: params.engine } })
  return { approvalId: row.id, kind: params.kind, lang: meta.lang, content: params.content, engine: params.engine, status: 'PENDING', createdAt: new Date(row.requestedAt).toISOString() }
}

/** List drafts for a project (newest first). */
export async function listDrafts(projectId?: string): Promise<Array<ContentDraft & { projectId: string; projectName: string; title: string }>> {
  const where: Record<string, unknown> = { type: CONTENT_APPROVAL_TYPE }
  if (projectId) where.entityId = projectId
  const rows = await db.approvalRequest.findMany({ where, orderBy: { requestedAt: 'desc' }, take: 200 })
  const projectIds = [...new Set(rows.map((r) => r.entityId).filter((x): x is string => !!x))]
  const projects = projectIds.length ? await db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : []
  return rows.map((r) => {
    const meta = draftMeta(parseJsonSafe<Record<string, unknown>>(r.metadata, {}))
    const project = projects.find((p) => p.id === r.entityId)
    return {
      approvalId: r.id,
      projectId: r.entityId || '',
      projectName: project?.name || '—',
      title: r.title,
      kind: meta.kind,
      lang: meta.lang,
      content: meta.content,
      engine: meta.engine,
      status: r.status,
      createdAt: new Date(r.requestedAt).toISOString(),
    }
  })
}

const FIELD_FOR_KIND: Record<string, string> = {
  DESCRIPTION_EN: 'description',
  DESCRIPTION_AR: 'descriptionArabic',
  SEO_TITLE: 'metaTitle',
  SEO_DESC: 'metaDescription',
}

/** Approve a draft; optionally publish it onto the project. */
export async function approveDraft(params: {
  approvalId: string
  actorId: string
  publish: boolean
}): Promise<{ ok: boolean; error?: string; published?: string | null }> {
  const row = await db.approvalRequest.findUnique({ where: { id: params.approvalId } })
  if (!row || row.type !== CONTENT_APPROVAL_TYPE) return { ok: false, error: 'Draft not found' }
  if (row.status === 'APPROVED') return { ok: false, error: 'Already approved' }
  const meta = draftMeta(parseJsonSafe<Record<string, unknown>>(row.metadata, {}))

  await db.approvalRequest.update({
    where: { id: row.id },
    data: { status: 'APPROVED', reviewedBy: params.actorId, reviewedAt: new Date(), reviewNote: params.publish ? 'Approved & published' : 'Approved (kept as approved draft)' },
  })

  let published: string | null = null
  const targetField = FIELD_FOR_KIND[meta.kind]
  if (params.publish && targetField && row.entityId) {
    await db.project.update({ where: { id: row.entityId }, data: { [targetField]: meta.content } } as never)
    published = targetField
  }
  await logAudit({
    userId: params.actorId,
    action: params.publish ? 'AI_CONTENT_PUBLISHED' : 'AI_CONTENT_APPROVED',
    entity: 'Project',
    entityId: row.entityId || undefined,
    changes: { kind: meta.kind, engine: meta.engine, publishedField: published },
  })
  return { ok: true, published }
}

export async function rejectDraft(params: { approvalId: string; actorId: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const row = await db.approvalRequest.findUnique({ where: { id: params.approvalId } })
  if (!row || row.type !== CONTENT_APPROVAL_TYPE) return { ok: false, error: 'Draft not found' }
  await db.approvalRequest.update({
    where: { id: row.id },
    data: { status: 'REJECTED', reviewedBy: params.actorId, reviewedAt: new Date(), reviewNote: params.note || 'Rejected by reviewer' },
  })
  await logAudit({ userId: params.actorId, action: 'AI_CONTENT_REJECTED', entity: 'Project', entityId: row.entityId || undefined, changes: { note: params.note } })
  return { ok: true }
}
