/**
 * Phase 3 security-remediation regression tests.
 *
 * Covers (route handlers exercised with mocked db/auth — no live probes):
 *  FIX 1 — non-CEO/Admin callers cannot dictate commission math via ruleId
 *  FIX 2 — deal stage machine rejects skips (RESERVATION→SOLD) and
 *          resurrection of terminal stages (SOLD/CANCELLED)
 *  FIX 3 — duplicate-active-deal check+create runs inside one $transaction
 *  FIX 4 — only an existing CEO may assign the CEO role (ADMIN → 403)
 *  FIX 5 — touching an existing anon AI conversation without its matching
 *          sessionId → 403
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: unknown }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers,
    }),
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    deal: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    lead: { findUnique: vi.fn(), update: vi.fn() },
    leadActivity: { create: vi.fn() },
    commission: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    commissionRule: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    systemSetting: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    project: { findUnique: vi.fn() },
    aIConversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    aIMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/permissions', () => ({ requireCEOApi: vi.fn(), logAudit: vi.fn() }))
vi.mock('@/lib/lead-access', () => ({ requireActor: vi.fn(), leadAccessLevel: vi.fn() }))
vi.mock('@/lib/notify', () => ({
  notifyUser: vi.fn(),
  notifyRole: vi.fn(),
  brokerUserId: vi.fn(),
  developerUserId: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ai-llm', () => ({ callLLM: vi.fn() }))
vi.mock('@/lib/ai/ollama', () => ({ checkOllamaStatus: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '127.0.0.1',
  rateLimit: () => ({ ok: true, resetAt: Date.now() }),
}))

import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { requireActor, leadAccessLevel } from '@/lib/lead-access'
import { auth } from '@/lib/auth'
import { callLLM } from '@/lib/ai-llm'
import { checkOllamaStatus } from '@/lib/ai/ollama'
import { resolveCommissionRule } from '@/lib/commission'
import { PATCH as patchDeal } from '@/app/api/deals/[id]/route'
import { POST as postDeals } from '@/app/api/deals/route'
import { PATCH as patchUsers } from '@/app/api/ceo/users/route'
import { PATCH as patchRole } from '@/app/api/ceo/users/[id]/role/route'
import { POST as postChat } from '@/app/api/ai/chat/route'

const mdb: any = db
const mRequireCEOApi: any = requireCEOApi
const mRequireActor: any = requireActor
const mLeadAccessLevel: any = leadAccessLevel
const mAuth: any = auth
const mCallLLM: any = callLLM
const mCheckOllama: any = checkOllamaStatus

function jsonReq(body: unknown): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ACTIVE_RULE = {
  id: 'rule-x',
  isActive: true,
  totalPct: 5,
  estateaiPct: 1,
  brokerPct: 4,
  otherPct: 0,
  otherLabel: null,
}

function dealRow(status: string) {
  return {
    id: 'deal1',
    leadId: 'lead1',
    brokerId: 'br1',
    developerId: 'devorg1',
    projectId: 'proj1',
    status,
    dealValue: 100000,
    lead: {
      brokerId: 'br1',
      developerId: 'devorg1',
      status: 'RESERVATION',
      leadCode: 'L-1',
      project: { developerId: 'devorg1' },
    },
  }
}

function stubCommissionFallback() {
  mdb.commissionRule.findUnique.mockResolvedValue(null)
  mdb.commissionRule.findMany.mockResolvedValue([])
  mdb.commissionRule.findFirst.mockResolvedValue(null)
  mdb.systemSetting.findUnique.mockResolvedValue(null)
  mdb.commission.findFirst.mockResolvedValue(null)
  mdb.commission.create.mockResolvedValue({ id: 'c1' })
  mdb.commission.update.mockResolvedValue({ id: 'c1' })
}

beforeEach(() => {
  vi.resetAllMocks()
  // Default: run the transaction callback against the mocked client.
  mdb.$transaction.mockImplementation(async (cb: any) =>
    typeof cb === 'function' ? cb(mdb) : cb,
  )
})

// ─── FIX 1: explicit ruleId is CEO/Admin-only ──────────────────────────────

describe('FIX 1 — commission ruleId gating', () => {
  it('resolveCommissionRule ignores explicitRuleId without allowExplicitRule', async () => {
    mdb.commissionRule.findUnique.mockResolvedValue({ ...ACTIVE_RULE })
    mdb.commissionRule.findMany.mockResolvedValue([])
    mdb.commissionRule.findFirst.mockResolvedValue(null)
    mdb.systemSetting.findUnique.mockResolvedValue(null)

    const denied = await resolveCommissionRule({
      projectId: 'proj1',
      developerId: 'devorg1',
      explicitRuleId: 'rule-x',
      dealValue: 100,
    })
    expect(denied.source).not.toBe('EXPLICIT')
    expect(denied.ruleId).toBeNull()

    const allowed = await resolveCommissionRule({
      projectId: 'proj1',
      developerId: 'devorg1',
      explicitRuleId: 'rule-x',
      dealValue: 100,
      allowExplicitRule: true,
    })
    expect(allowed.source).toBe('EXPLICIT')
    expect(allowed.ruleId).toBe('rule-x')
  })

  it('DEVELOPER ruleId is stripped on deal update (commission keeps scope-resolved rule)', async () => {
    mRequireActor.mockResolvedValue({
      ok: true,
      ctx: { role: 'DEVELOPER', userId: 'u-dev', brokerId: null, developerId: 'devorg1', isCEO: false },
    })
    mLeadAccessLevel.mockReturnValue('full')
    mdb.deal.findUnique.mockResolvedValue(dealRow('RESERVATION'))
    mdb.deal.update.mockResolvedValue({ ...dealRow('RESERVATION'), status: 'CONTRACT' })
    mdb.commissionRule.findUnique.mockResolvedValue({ ...ACTIVE_RULE })
    stubCommissionFallback()
    mdb.lead.update.mockResolvedValue({})
    mdb.leadActivity.create.mockResolvedValue({})

    const res: any = await patchDeal(jsonReq({ status: 'CONTRACT', ruleId: 'rule-x' }), {
      params: { id: 'deal1' },
    })
    expect(res.status).toBe(200)
    expect(mdb.commission.create).toHaveBeenCalledTimes(1)
    // Attacker's ruleId must NOT land on the commission row.
    expect(mdb.commission.create.mock.calls[0][0].data.ruleId).toBeNull()
  })

  it('CEO explicit ruleId is honored unchanged', async () => {
    mRequireActor.mockResolvedValue({
      ok: true,
      ctx: { role: 'CEO', userId: 'u-ceo', brokerId: null, developerId: null, isCEO: true },
    })
    mLeadAccessLevel.mockReturnValue('full')
    mdb.deal.findUnique.mockResolvedValue(dealRow('RESERVATION'))
    mdb.deal.update.mockResolvedValue({ ...dealRow('RESERVATION'), status: 'CONTRACT' })
    mdb.commissionRule.findUnique.mockResolvedValue({ ...ACTIVE_RULE })
    mdb.commission.findFirst.mockResolvedValue(null)
    mdb.commission.create.mockResolvedValue({ id: 'c1' })
    mdb.lead.update.mockResolvedValue({})
    mdb.leadActivity.create.mockResolvedValue({})

    const res: any = await patchDeal(jsonReq({ status: 'CONTRACT', ruleId: 'rule-x' }), {
      params: { id: 'deal1' },
    })
    expect(res.status).toBe(200)
    expect(mdb.commission.create.mock.calls[0][0].data.ruleId).toBe('rule-x')
  })
})

// ─── FIX 2: deal stage machine ─────────────────────────────────────────────

describe('FIX 2 — deal stage transitions', () => {
  function asDeveloperOn(status: string) {
    mRequireActor.mockResolvedValue({
      ok: true,
      ctx: { role: 'DEVELOPER', userId: 'u-dev', brokerId: null, developerId: 'devorg1', isCEO: false },
    })
    mLeadAccessLevel.mockReturnValue('full')
    mdb.deal.findUnique.mockResolvedValue(dealRow(status))
  }

  it('rejects the RESERVATION → SOLD skip with 409 and writes nothing', async () => {
    asDeveloperOn('RESERVATION')
    const res: any = await patchDeal(jsonReq({ status: 'SOLD' }), { params: { id: 'deal1' } })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Cannot move deal from RESERVATION to SOLD/)
    expect(mdb.deal.update).not.toHaveBeenCalled()
  })

  it('rejects resurrection of terminal stages (SOLD / CANCELLED / LOST)', async () => {
    for (const from of ['SOLD', 'CANCELLED', 'LOST']) {
      vi.resetAllMocks()
      mdb.$transaction.mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(mdb) : cb))
      asDeveloperOn(from)
      const res: any = await patchDeal(jsonReq({ status: 'RESERVATION' }), {
        params: { id: 'deal1' },
      })
      expect(res.status).toBe(409)
      expect(mdb.deal.update).not.toHaveBeenCalled()
    }
  })

  it('allows the legal RESERVATION → CONTRACT step', async () => {
    asDeveloperOn('RESERVATION')
    mdb.deal.update.mockResolvedValue({ ...dealRow('RESERVATION'), status: 'CONTRACT' })
    stubCommissionFallback()
    mdb.lead.update.mockResolvedValue({})
    mdb.leadActivity.create.mockResolvedValue({})

    const res: any = await patchDeal(jsonReq({ status: 'CONTRACT' }), { params: { id: 'deal1' } })
    expect(res.status).toBe(200)
    expect(mdb.deal.update).toHaveBeenCalledTimes(1)
  })
})

// ─── FIX 3: duplicate-active-deal race ─────────────────────────────────────

describe('FIX 3 — duplicate active deal guarded in a transaction', () => {
  const leadRow = {
    id: 'lead1',
    brokerId: 'br1',
    developerId: null,
    projectId: 'proj1',
    unitId: null,
    status: 'NEW',
    leadCode: 'L-1',
    project: { id: 'proj1', developerId: 'devorg1' },
  }

  function asCEO() {
    mRequireActor.mockResolvedValue({
      ok: true,
      ctx: { role: 'CEO', userId: 'u-ceo', brokerId: null, developerId: null, isCEO: true },
    })
    mdb.lead.findUnique.mockResolvedValue({ ...leadRow })
    mdb.project.findUnique.mockResolvedValue({ id: 'proj1', developerId: 'devorg1' })
  }

  it('existing active deal → 409 and no create', async () => {
    asCEO()
    mdb.deal.findFirst.mockResolvedValue({ id: 'deal-old', status: 'RESERVATION' })

    const res: any = await postDeals(jsonReq({ leadId: 'lead1', dealValue: 50000 }))
    expect(res.status).toBe(409)
    expect(mdb.$transaction).toHaveBeenCalledTimes(1)
    expect(mdb.deal.create).not.toHaveBeenCalled()
  })

  it('check+create run inside $transaction on the happy path', async () => {
    asCEO()
    mdb.deal.findFirst.mockResolvedValue(null)
    mdb.deal.create.mockResolvedValue({ id: 'deal-new', project: null })
    mdb.lead.update.mockResolvedValue({})
    mdb.leadActivity.create.mockResolvedValue({})
    stubCommissionFallback()

    const res: any = await postDeals(jsonReq({ leadId: 'lead1', dealValue: 50000 }))
    expect(res.status).toBe(201)
    expect(mdb.$transaction).toHaveBeenCalledTimes(1)
    expect(mdb.deal.findFirst).toHaveBeenCalledTimes(1)
    expect(mdb.deal.create).toHaveBeenCalledTimes(1)
  })
})

// ─── FIX 4: only an existing CEO may assign CEO ────────────────────────────

describe('FIX 4 — CEO role assignment', () => {
  it('ADMIN → CEO is 403 on the bulk users route (self-edit block intact)', async () => {
    mRequireCEOApi.mockResolvedValue({
      error: null,
      session: { user: { id: 'admin1' } },
      role: 'ADMIN',
    } as any)

    const res: any = await patchUsers(jsonReq({ userId: 'u2', role: 'CEO' }))
    expect(res.status).toBe(403)
    expect(mdb.user.update).not.toHaveBeenCalled()

    // Self-edit block still fires first for own row.
    const selfRes: any = await patchUsers(jsonReq({ userId: 'admin1', role: 'BROKER' }))
    expect(selfRes.status).toBe(400)
  })

  it('ADMIN → CEO is 403 on the single-role route', async () => {
    mRequireCEOApi.mockResolvedValue({
      error: null,
      session: { user: { id: 'admin1' } },
      role: 'ADMIN',
    } as any)

    const res: any = await patchRole(jsonReq({ role: 'CEO' }), { params: { id: 'u2' } })
    expect(res.status).toBe(403)
    expect(mdb.user.update).not.toHaveBeenCalled()
  })

  it('CEO → CEO is allowed on both routes', async () => {
    mRequireCEOApi.mockResolvedValue({
      error: null,
      session: { user: { id: 'ceo1' } },
      role: 'CEO',
    } as any)
    mdb.user.update.mockResolvedValue({ id: 'u2', role: 'CEO' })
    mdb.user.findUnique.mockResolvedValue({ id: 'u2', email: 'u2@x.com', role: 'ADMIN' })

    const bulk: any = await patchUsers(jsonReq({ userId: 'u2', role: 'CEO' }))
    expect(bulk.status).toBe(200)
    expect(bulk.body.user.role).toBe('CEO')

    const single: any = await patchRole(jsonReq({ role: 'CEO' }), { params: { id: 'u2' } })
    expect(single.status).toBe(200)
  })
})

// ─── FIX 5: anon AI-conversation sessionId guard ───────────────────────────

describe('FIX 5 — anon conversation requires its sessionId', () => {
  function anonConv() {
    mAuth.mockResolvedValue(null)
    mCheckOllama.mockResolvedValue({ available: true, modelInstalled: true, model: 'qwen', error: null })
    mdb.aIConversation.findUnique.mockResolvedValue({ id: 'conv1', userId: null, sessionId: 'sess-abc' })
  }

  it('POST without sessionId to an existing anon conversation → 403', async () => {
    anonConv()
    const res: any = await postChat(jsonReq({ message: 'hello', conversationId: 'conv1' }))
    expect(res.status).toBe(403)
    expect(mdb.aIMessage.create).not.toHaveBeenCalled()
  })

  it('POST with a mismatched sessionId → 403', async () => {
    anonConv()
    const res: any = await postChat(
      jsonReq({ message: 'hello', conversationId: 'conv1', sessionId: 'sess-evil' }),
    )
    expect(res.status).toBe(403)
    expect(mdb.aIMessage.create).not.toHaveBeenCalled()
  })

  it('POST with the matching sessionId proceeds', async () => {
    anonConv()
    mdb.aIMessage.create.mockResolvedValue({})
    mdb.aIMessage.findMany.mockResolvedValue([])
    mdb.aIMessage.count.mockResolvedValue(2)
    mdb.aIConversation.update.mockResolvedValue({})
    mCallLLM.mockResolvedValue({ content: 'reply', blocks: [], toolCallsMade: [] })

    const res: any = await postChat(
      jsonReq({ message: 'hello', conversationId: 'conv1', sessionId: 'sess-abc' }),
    )
    expect(res.status).toBe(200)
    expect(res.body.conversationId).toBe('conv1')
  })
})
