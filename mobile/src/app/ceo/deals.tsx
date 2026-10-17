import { Stack } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SearchBar,
  SectionTitle,
  Segmented,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Deal = {
  id: string;
  status: string;
  dealValue?: number | null;
  createdAt?: string;
  lead?: { id?: string; leadCode?: string | null; name?: string | null } | null;
  broker?: { id?: string; user?: { name?: string } } | null;
  developer?: { id?: string; companyName?: string } | null;
  project?: { id?: string; name?: string } | null;
  unit?: { id?: string; name?: string } | null;
};

type Commission = {
  id: string;
  status: string;
  totalPct?: number | null;
  brokerPct?: number | null;
  totalAmount?: number | null;
  brokerAmount?: number | null;
  dueDate?: string | null;
  paidDate?: string | null;
  deal?: {
    id?: string;
    status?: string;
    lead?: { name?: string | null; leadCode?: string | null } | null;
    broker?: { user?: { name?: string } } | null;
    developer?: { companyName?: string } | null;
    project?: { name?: string } | null;
  } | null;
  rule?: { name?: string } | null;
};

type Growth = {
  deals?: { total?: number; sold?: number; totalValue?: number };
  commissions?: {
    totalAmount?: number;
    brokerShare?: number;
    pendingAmount?: number;
    openDisputes?: number;
  };
};

/** Full `GET /api/ceo/growth-stats` payload — the website's overview tab. */
type OverviewStats = {
  leads: {
    total: number;
    new: number;
    activeProtected: number;
    expiringSoon: number;
    expiredProtection: number;
    duplicateReview: number;
    transferred: number;
    statusBreakdown: Record<string, number>;
  };
  deals: {
    total: number;
    reservations: number;
    contracts: number;
    sold: number;
    cancelled: number;
    totalValue: number;
  };
  commissions: {
    totalRecords: number;
    totalAmount: number;
    estateaiShare: number;
    brokerShare: number;
    pendingAmount: number;
    pendingBrokerShare: number;
    paidAmount: number;
    paidBrokerShare: number;
    openDisputes: number;
    disputeList: {
      id: string;
      status: string;
      totalAmount: number;
      deal: {
        id: string;
        dealValue: number | null;
        lead: { leadCode: string | null; name: string } | null;
        project: { name: string } | null;
      };
    }[];
  };
  protection: {
    config: { defaultDays: number; expiringSoonDays: number; allowRenewal: boolean; renewalDays: number; expirationBehavior: string };
    active: number;
    expiringSoon: number;
    expired: number;
    expiringList: {
      id: string;
      leadCode: string | null;
      name: string;
      status: string;
      protectionExpiresAt: string;
      broker: { user: { name: string | null } } | null;
    }[];
  };
  platform: { brokerCount: number; developerCount: number; conversionRate: number };
};

/** One `GET /api/leads` row — the website's protection tab. */
type ProtLead = {
  id: string;
  leadCode: string | null;
  name: string;
  status: string;
  reviewStatus: string;
  createdAt: string;
  protectionStartsAt: string | null;
  protectionExpiresAt: string | null;
  protectionStatus: 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE';
  broker: { id: string; user: { name: string | null } } | null;
  project: { id: string; name: string } | null;
};

type BrokerOpt = { id: string; user: { id: string; name: string | null } };
type DevOpt = { id: string; companyName: string };
type ProjOpt = { id: string; name: string };

/** `GET /api/ceo/partnerships` — server already parses the id lists. */
type Partnership = {
  id: string;
  developerId: string;
  status: string;
  allProjectsApproved: boolean;
  approvedProjectIds: string[];
  commissionAgreement: string | null;
  leadProtectionDays: number | null;
  allowedBrokerIds: string[];
  blockedBrokerIds: string[];
  startDate: string | null;
  endDate: string | null;
  terms: string | null;
  isActive: boolean;
  reviewNote: string | null;
  createdAt: string;
  developer: { id: string; companyName: string };
};

type AccessRow = {
  id: string;
  brokerId: string;
  developerId: string | null;
  projectId: string | null;
  access: string;
  expiresAt: string | null;
  notes: string | null;
  broker: { id: string; user: { name: string | null } };
  developer: { id: string; companyName: string } | null;
  project: { id: string; name: string } | null;
};

/** `GET /api/ceo/growth-config` — the website's settings tab. */
type ProtectionConfig = {
  defaultDays: number;
  expiringSoonDays: number;
  allowRenewal: boolean;
  maxRenewals: number;
  renewalDays: number;
  expirationBehavior: 'AUTO_EXPIRE' | 'ALERT_ONLY';
  inactivityDays: number;
  developerOverrides: Record<string, number>;
  projectOverrides: Record<string, number>;
};

type CommissionSplit = {
  totalPct: number;
  estateaiPct: number;
  brokerPct: number;
  otherPct: number;
  otherLabel: string | null;
};

type RuleRow = {
  id: string;
  name: string;
  developerId: string | null;
  projectId: string | null;
  totalPct: number;
  estateaiPct: number;
  brokerPct: number;
  otherPct: number;
  otherLabel: string | null;
  minDealValue?: number | null;
  maxDealValue?: number | null;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  developer?: { id: string; companyName: string } | null;
  project?: { id: string; name: string } | null;
};

type GrowthConfig = {
  protection: ProtectionConfig;
  commissionDefaults: CommissionSplit;
  rules: RuleRow[];
};

type Move = { status: string; labelKey: MessageKey; variant: 'primary' | 'ghost' };

type Tab = 'overview' | 'deals' | 'commissions' | 'protection' | 'partnerships' | 'settings';

const DEAL_STAGES = ['ALL', 'RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST'] as const;
type Stage = (typeof DEAL_STAGES)[number];

/** Stages `POST /api/ceo/deals` accepts when closing a deal. */
const CLOSE_STAGES = ['RESERVATION', 'CONTRACT', 'SOLD'] as const;

/** Sources `POST /api/ceo/deals` accepts. */
const CLOSE_SOURCES = ['PLATFORM', 'OFF_PLATFORM_REPORT'] as const;

/** `YYYY-MM-DD` passes the sheet's date check, anything else does not. */
function isDateLike(raw: string): boolean {
  const v = raw.trim();
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return dateOrNull(v) !== null;
}

type ProtPanel = 'expiring' | 'expired' | 'duplicates';
type ProtAction = 'extend' | 'expire' | 'transfer' | 'resolve';

const PARTNERSHIP_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'EXPIRED'];

/**
 * Stage transitions `PATCH /api/deals/[id]` accepts, offered in pipeline
 * order rather than as the whole list — a reservation can move to contract or
 * straight to sold, a lost deal reopens, and a sold one is final. Closing a
 * deal is always available as the ghost pair at the end of the row.
 */
const DEAL_MOVES: Record<string, Move[]> = {
  RESERVATION: [
    { status: 'CONTRACT', labelKey: 'ceo.toContract', variant: 'primary' },
    { status: 'SOLD', labelKey: 'ceo.toSold', variant: 'primary' },
    { status: 'CANCELLED', labelKey: 'common.cancel', variant: 'ghost' },
    { status: 'LOST', labelKey: 'ceo.markLost', variant: 'ghost' },
  ],
  CONTRACT: [
    { status: 'SOLD', labelKey: 'ceo.toSold', variant: 'primary' },
    { status: 'CANCELLED', labelKey: 'common.cancel', variant: 'ghost' },
    { status: 'LOST', labelKey: 'ceo.markLost', variant: 'ghost' },
  ],
  CANCELLED: [{ status: 'RESERVATION', labelKey: 'ceo.reopen', variant: 'primary' }],
  LOST: [{ status: 'RESERVATION', labelKey: 'ceo.reopen', variant: 'primary' }],
  SOLD: [],
};

/**
 * The commission state machine straight out of `PATCH /api/commissions/[id]`:
 * PENDING → APPROVED → INVOICED → DUE → PAID, with a dispute able to open
 * from any live step — only the CEO can move a commission.
 */
const COMMISSION_MOVES: Record<string, Move[]> = {
  PENDING: [{ status: 'APPROVED', labelKey: 'ceo.approve', variant: 'primary' }],
  APPROVED: [{ status: 'INVOICED', labelKey: 'ceo.invoice', variant: 'primary' }],
  INVOICED: [{ status: 'DUE', labelKey: 'ceo.markDue', variant: 'primary' }],
  DUE: [{ status: 'PAID', labelKey: 'ceo.markPaid', variant: 'primary' }],
  DISPUTED: [
    { status: 'PENDING', labelKey: 'ceo.resumeReview', variant: 'primary' },
    { status: 'APPROVED', labelKey: 'ceo.approve', variant: 'ghost' },
  ],
  PAID: [],
  CANCELLED: [{ status: 'PENDING', labelKey: 'ceo.resumeReview', variant: 'primary' }],
};

const DISPUTABLE = ['PENDING', 'APPROVED', 'INVOICED', 'DUE'];

function numOr(raw: string, fallback: number): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : fallback;
}

/** `YYYY-MM-DD` → ISO datetime, or null when blank. */
function dateOrNull(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The website's deal centre (`src/app/ceo/deals/page.tsx`) as six native
 * workspaces sharing one screen: Overview, Deals, Commissions, Protection,
 * Partnerships and Settings. Deals + commissions keep the same `/api/deals`,
 * `/api/commissions` and `/api/ceo/growth-stats` reads plus the record state
 * machines; the other four tabs read the exact endpoints the web tabs hit
 * (`growth-stats` with filters, `/api/leads`, `/api/ceo/partnerships`,
 * `/api/ceo/growth-config`, `/api/ceo/leads/actions`, `/api/ceo/maintenance`).
 * Each tab loads only while active, so switching workspaces never flashes a
 * ledger paid for by another tab.
 */
export default function CeoDealsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const [tab, setTab] = useState<Tab>('overview');
  const [stage, setStage] = useState<Stage>('ALL');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showClose, setShowClose] = useState(false);

  // Overview filters — the website's developer/broker/project/date selects.
  const [ovDev, setOvDev] = useState('');
  const [ovBroker, setOvBroker] = useState('');
  const [ovProj, setOvProj] = useState('');
  const [ovFrom, setOvFrom] = useState('');
  const [ovTo, setOvTo] = useState('');

  // Protection workspace.
  const [protPanel, setProtPanel] = useState<ProtPanel>('expiring');
  const [protQuery, setProtQuery] = useState('');
  const [protOpen, setProtOpen] = useState<string | null>(null);
  const [protAction, setProtAction] = useState<ProtAction>('extend');
  const [protDays, setProtDays] = useState('90');
  const [protReason, setProtReason] = useState('');
  const [protBrokerId, setProtBrokerId] = useState('');
  const [protResolution, setProtResolution] = useState<'ORIGINAL_WINS' | 'CHALLENGER_WINS'>('ORIGINAL_WINS');
  const [protBusy, setProtBusy] = useState(false);
  const [maintBusy, setMaintBusy] = useState(false);
  const [maintResult, setMaintResult] = useState<string | null>(null);

  // Partnerships workspace.
  const [psEdit, setPsEdit] = useState<string | null>(null);
  const [psDevId, setPsDevId] = useState('');
  const [psStatus, setPsStatus] = useState('PENDING');
  const [psProtDays, setPsProtDays] = useState('');
  const [psStart, setPsStart] = useState('');
  const [psEnd, setPsEnd] = useState('');
  const [psAgreement, setPsAgreement] = useState('');
  const [psTerms, setPsTerms] = useState('');
  const [psReviewNote, setPsReviewNote] = useState('');
  const [psActive, setPsActive] = useState(true);
  const [psAllApproved, setPsAllApproved] = useState(true);
  const [psApprovedIds, setPsApprovedIds] = useState<string[]>([]);
  const [psBusy, setPsBusy] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [accBroker, setAccBroker] = useState('');
  const [accScope, setAccScope] = useState<'developer' | 'project'>('developer');
  const [accDev, setAccDev] = useState('');
  const [accProj, setAccProj] = useState('');
  const [accAccess, setAccAccess] = useState<'APPROVED' | 'BLOCKED'>('APPROVED');
  const [accExpires, setAccExpires] = useState('');
  const [accNotes, setAccNotes] = useState('');

  // Settings workspace — string drafts over the loaded config so typing never
  // fights a refetch; the save coerces them back to numbers.
  const [sProt, setSProt] = useState<{
    defDays: string; soonDays: string; renewDays: string; maxRen: string; inactDays: string;
    behavior: 'AUTO_EXPIRE' | 'ALERT_ONLY'; renewal: 'yes' | 'no';
  } | null>(null);
  const [sDef, setSDef] = useState<{ total: string; estateai: string; broker: string; other: string } | null>(null);
  const [sBusy, setSBasy] = useState(false);
  const [ruleOpen, setRuleOpen] = useState<string | null>(null);
  const [rName, setRName] = useState('');
  const [rTotal, setRTotal] = useState('4');
  const [rEstate, setREstate] = useState('1');
  const [rBroker, setRBroker] = useState('3');
  const [rOther, setROther] = useState('0');
  const [rOtherLabel, setROtherLabel] = useState('');
  const [rPriority, setRPriority] = useState('0');
  const [rMinDeal, setRMinDeal] = useState('');
  const [rMaxDeal, setRMaxDeal] = useState('');
  const [rActive, setRActive] = useState(true);
  const [rDefault, setRDefault] = useState(false);

  const dealParams = new URLSearchParams();
  if (query.trim()) dealParams.set('search', query.trim());
  if (stage !== 'ALL') dealParams.set('status', stage);

  const ovParams = new URLSearchParams();
  if (ovDev) ovParams.set('developerId', ovDev);
  if (ovBroker) ovParams.set('brokerId', ovBroker);
  if (ovProj) ovParams.set('projectId', ovProj);
  if (ovFrom.trim()) ovParams.set('from', ovFrom.trim());
  if (ovTo.trim()) ovParams.set('to', ovTo.trim());

  const protParams = new URLSearchParams();
  if (protPanel === 'expiring') protParams.set('protection', 'expiring');
  if (protPanel === 'expired') protParams.set('protection', 'expired');
  if (protPanel === 'duplicates') protParams.set('reviewStatus', 'DUPLICATE_REVIEW');
  if (protQuery.trim()) protParams.set('search', protQuery.trim());
  protParams.set('limit', '50');

  const inDeals = tab === 'deals' || tab === 'commissions';
  const needPeople = tab === 'overview' || tab === 'protection' || tab === 'partnerships';
  const needCatalog = tab === 'overview' || tab === 'partnerships';

  const growthQ = useApi<Growth>('/api/ceo/growth-stats', inDeals);
  const { data, error, loading, refreshing, refresh } = useApi<{ deals?: Deal[] }>(
    `/api/deals?${dealParams.toString()}`,
    tab === 'deals',
  );
  const {
    data: commissionData,
    error: commissionsError,
    loading: commissionsLoading,
    refreshing: commissionsRefreshing,
    refresh: refreshCommissions,
  } = useApi<{ commissions?: Commission[] }>('/api/commissions', tab === 'commissions');
  const ovQ = useApi<OverviewStats>(`/api/ceo/growth-stats?${ovParams.toString()}`, tab === 'overview');
  const brokersQ = useApi<{ brokers?: BrokerOpt[] }>('/api/ceo/brokers', needPeople);
  const devsQ = useApi<{ developers?: DevOpt[] }>('/api/ceo/developers', needCatalog);
  const projsQ = useApi<{ projects?: ProjOpt[] }>('/api/projects?limit=100', needCatalog);
  const protQ = useApi<{ leads?: ProtLead[] }>(`/api/leads?${protParams.toString()}`, tab === 'protection');
  const psQ = useApi<{ partnerships?: Partnership[]; brokerAccess?: AccessRow[] }>(
    '/api/ceo/partnerships',
    tab === 'partnerships',
  );
  const cfgQ = useApi<GrowthConfig>('/api/ceo/growth-config', tab === 'settings');
  const mutation = useMutation();

  const deals = data?.deals ?? [];
  const commissions = commissionData?.commissions ?? [];
  const brokers = brokersQ.data?.brokers ?? [];
  const developers = devsQ.data?.developers ?? [];
  const projects = projsQ.data?.projects ?? [];
  const protLeads = protQ.data?.leads ?? [];
  const partnerships = psQ.data?.partnerships ?? [];
  const accessRows = psQ.data?.brokerAccess ?? [];
  const stats = ovQ.data;
  const protCfg = cfgQ.data?.protection ?? null;
  const defCfg = cfgQ.data?.commissionDefaults ?? null;
  const rules = cfgQ.data?.rules ?? [];

  function clearFeedback() {
    setProblem(null);
    setNotice(null);
    setMaintResult(null);
  }

  function switchTab(next: Tab) {
    setTab(next);
    clearFeedback();
  }

  async function sendMove(path: string, id: string, body: Record<string, unknown>, doneKey: MessageKey) {
    setBusyId(id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(path, 'PATCH', body);
      setNotice(t(doneKey));
      refresh();
      refreshCommissions();
      growthQ.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function openProtAction(lead: ProtLead, action: ProtAction) {
    if (protOpen === lead.id && protAction === action) {
      setProtOpen(null);
      return;
    }
    setProtOpen(lead.id);
    setProtAction(action);
    setProtDays('90');
    setProtReason('');
    setProtBrokerId('');
    setProtResolution('ORIGINAL_WINS');
    setProblem(null);
    setNotice(null);
  }

  /** The route's contract: EXTEND | EXPIRE | TRANSFER | RESOLVE_DUPLICATE. */
  async function submitProtAction(lead: ProtLead) {
    const reason = protReason.trim() || undefined;
    let body: Record<string, unknown>;
    if (protAction === 'extend') {
      const days = Number(protDays.trim());
      if (!Number.isInteger(days) || days < 1 || days > 730) {
        setProblem(t('ceoD.pExtraDays'));
        return;
      }
      body = { action: 'EXTEND', leadId: lead.id, days, ...(reason ? { reason } : {}) };
    } else if (protAction === 'expire') {
      body = { action: 'EXPIRE', leadId: lead.id, ...(reason ? { reason } : {}) };
    } else if (protAction === 'transfer') {
      if (!protBrokerId) {
        setProblem(t('ceoD.pPickBroker'));
        return;
      }
      body = { action: 'TRANSFER', leadId: lead.id, toBrokerId: protBrokerId, ...(reason ? { reason } : {}) };
    } else {
      body = { action: 'RESOLVE_DUPLICATE', leadId: lead.id, resolution: protResolution, ...(reason ? { reason } : {}) };
    }
    setProtBusy(true);
    setProblem(null);
    try {
      await mutation.run('/api/ceo/leads/actions', 'POST', body);
      setNotice(t('ceoD.saved'));
      setProtOpen(null);
      protQ.refresh();
      ovQ.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setProtBusy(false);
    }
  }

  async function runMaintenance() {
    setMaintBusy(true);
    setMaintResult(null);
    setProblem(null);
    try {
      const out = (await mutation.run('/api/ceo/maintenance', 'POST')) as {
        summary?: Record<string, number>;
      };
      const s = out?.summary;
      setMaintResult(
        s
          ? `Codes: ${s.backfilledCodes ?? 0} · Expiring notified: ${s.expiringNotified ?? 0} · Expired notified: ${s.expiredNotified ?? 0} · Auto-expired: ${s.autoExpired ?? 0} · Inactivity: ${s.inactivityNotified ?? 0} · ${t('ceoD.pMaintAuto')}: ${s.autoSuspended ?? 0} · ${t('ceoD.pMaintFollow')}: ${s.followUpReminded ?? 0}`
          : t('ceoD.saved'),
      );
      protQ.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setMaintBusy(false);
    }
  }

  function openPartnership(p: Partnership | null) {
    if (p) {
      setPsEdit(p.id);
      setPsDevId(p.developerId);
      setPsStatus(p.status);
      setPsProtDays(p.leadProtectionDays != null ? String(p.leadProtectionDays) : '');
      setPsStart(p.startDate ? p.startDate.slice(0, 10) : '');
      setPsEnd(p.endDate ? p.endDate.slice(0, 10) : '');
      setPsAgreement(p.commissionAgreement ?? '');
      setPsTerms(p.terms ?? '');
      setPsReviewNote(p.reviewNote ?? '');
      setPsActive(p.isActive);
      setPsAllApproved(p.allProjectsApproved);
      setPsApprovedIds(p.approvedProjectIds ?? []);
    } else {
      const uncovered = developers.filter((d) => !partnerships.some((x) => x.developerId === d.id));
      if (uncovered.length === 0) {
        setProblem(t('ceoD.psNoDevs'));
        return;
      }
      setPsEdit('NEW');
      setPsDevId(uncovered[0].id);
      setPsStatus('PENDING');
      setPsProtDays('');
      setPsStart('');
      setPsEnd('');
      setPsAgreement('');
      setPsTerms('');
      setPsReviewNote('');
      setPsActive(true);
      setPsAllApproved(true);
      setPsApprovedIds([]);
    }
    setProblem(null);
    setNotice(null);
  }

  async function savePartnership() {
    const existing = partnerships.find((x) => x.id === psEdit) ?? null;
    if (!psDevId) {
      setProblem(t('ceoD.psPickDev'));
      return;
    }
    const days = psProtDays.trim() ? Number(psProtDays.trim()) : null;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 730)) {
      setProblem(t('ceoD.psProtDays'));
      return;
    }
    setPsBusy(true);
    setProblem(null);
    try {
      await mutation.run('/api/ceo/partnerships', 'POST', {
        type: 'PARTNERSHIP_UPSERT',
        partnership: {
          developerId: psDevId,
          status: psStatus,
          allProjectsApproved: psAllApproved,
          approvedProjectIds: psAllApproved ? [] : psApprovedIds,
          commissionAgreement: psAgreement.trim() || null,
          leadProtectionDays: days,
          allowedBrokerIds: existing?.allowedBrokerIds ?? [],
          blockedBrokerIds: existing?.blockedBrokerIds ?? [],
          startDate: dateOrNull(psStart),
          endDate: dateOrNull(psEnd),
          terms: psTerms.trim() || null,
          isActive: psActive,
          reviewNote: psReviewNote.trim() || null,
        },
      });
      setNotice(t('ceoD.saved'));
      setPsEdit(null);
      psQ.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setPsBusy(false);
    }
  }

  async function saveAccess() {
    if (!accBroker) {
      setProblem(t('ceoD.psPickBroker'));
      return;
    }
    const targetId = accScope === 'developer' ? accDev : accProj;
    if (!targetId) {
      setProblem(t('ceoD.psPickTarget'));
      return;
    }
    setPsBusy(true);
    setProblem(null);
    try {
      await mutation.run('/api/ceo/partnerships', 'POST', {
        type: 'ACCESS_UPSERT',
        brokerId: accBroker,
        developerId: accScope === 'developer' ? targetId : null,
        projectId: accScope === 'project' ? targetId : null,
        access: accAccess,
        expiresAt: dateOrNull(accExpires),
        notes: accNotes.trim() || null,
      });
      setNotice(t('ceoD.saved'));
      setShowAccess(false);
      setAccBroker('');
      setAccDev('');
      setAccProj('');
      setAccExpires('');
      setAccNotes('');
      psQ.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setPsBusy(false);
    }
  }

  function confirmAccessDelete(id: string) {
    Alert.alert(t('ceoD.psDeleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await mutation.run('/api/ceo/partnerships', 'POST', { type: 'ACCESS_DELETE', accessId: id });
              setNotice(t('ceoD.saved'));
              psQ.refresh();
            } catch (e) {
              setProblem(e instanceof Error ? e.message : t('common.error'));
            }
          })();
        },
      },
    ]);
  }

  /** `POST /api/ceo/growth-config` wrapper shared by every settings save. */
  async function postConfig(body: Record<string, unknown>) {
    setSBasy(true);
    setProblem(null);
    try {
      await mutation.run('/api/ceo/growth-config', 'POST', body);
      setNotice(t('ceoD.saved'));
      cfgQ.refresh();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
      return false;
    } finally {
      setSBasy(false);
    }
  }

  function protDraft() {
    if (!protCfg) return null;
    return (
      sProt ?? {
        defDays: String(protCfg.defaultDays),
        soonDays: String(protCfg.expiringSoonDays),
        renewDays: String(protCfg.renewalDays),
        maxRen: String(protCfg.maxRenewals),
        inactDays: String(protCfg.inactivityDays),
        behavior: protCfg.expirationBehavior,
        renewal: (protCfg.allowRenewal ? 'yes' : 'no') as 'yes' | 'no',
      }
    );
  }

  function defDraft() {
    if (!defCfg) return null;
    return (
      sDef ?? {
        total: String(defCfg.totalPct),
        estateai: String(defCfg.estateaiPct),
        broker: String(defCfg.brokerPct),
        other: String(defCfg.otherPct),
      }
    );
  }

  async function saveProtection() {
    const d = protDraft();
    if (!d || !protCfg) return;
    await postConfig({
      type: 'PROTECTION',
      config: {
        ...protCfg,
        defaultDays: numOr(d.defDays, protCfg.defaultDays),
        expiringSoonDays: numOr(d.soonDays, protCfg.expiringSoonDays),
        renewalDays: numOr(d.renewDays, protCfg.renewalDays),
        maxRenewals: Math.round(numOr(d.maxRen, protCfg.maxRenewals)),
        inactivityDays: numOr(d.inactDays, protCfg.inactivityDays),
        expirationBehavior: d.behavior,
        allowRenewal: d.renewal === 'yes',
      },
    });
  }

  function splitValid(d: { total: string; estateai: string; broker: string; other: string }) {
    const sum = numOr(d.estateai, NaN) + numOr(d.broker, NaN) + numOr(d.other, NaN);
    return Number.isFinite(sum) && Math.abs(sum - numOr(d.total, NaN)) <= 0.01;
  }

  async function saveDefaults() {
    const d = defDraft();
    if (!d) return;
    if (!splitValid(d)) {
      setProblem(t('ceoD.sSplitBad'));
      return;
    }
    await postConfig({
      type: 'COMMISSION_DEFAULTS',
      config: {
        totalPct: numOr(d.total, 0),
        estateaiPct: numOr(d.estateai, 0),
        brokerPct: numOr(d.broker, 0),
        otherPct: numOr(d.other, 0),
        otherLabel: defCfg?.otherLabel ?? null,
      },
    });
  }

  function openRule(r: RuleRow | null) {
    if (r) {
      setRuleOpen(r.id);
      setRName(r.name);
      setRTotal(String(r.totalPct));
      setREstate(String(r.estateaiPct));
      setRBroker(String(r.brokerPct));
      setROther(String(r.otherPct));
      setROtherLabel(r.otherLabel ?? '');
      setRPriority(String(r.priority));
      setRMinDeal(r.minDealValue != null ? String(r.minDealValue) : '');
      setRMaxDeal(r.maxDealValue != null ? String(r.maxDealValue) : '');
      setRActive(r.isActive);
      setRDefault(r.isDefault);
    } else {
      setRuleOpen('NEW');
      setRName('');
      setRTotal('4');
      setREstate('1');
      setRBroker('3');
      setROther('0');
      setROtherLabel('');
      setRPriority('0');
      setRMinDeal('');
      setRMaxDeal('');
      setRActive(true);
      setRDefault(false);
    }
    setProblem(null);
    setNotice(null);
  }

  /** Optional tier bounds; blank means unbounded. Null when invalid. */
  function tierBounds(): { min: number | null; max: number | null } | null {
    const minRaw = rMinDeal.trim();
    const maxRaw = rMaxDeal.trim();
    const min = minRaw === '' ? null : Number(minRaw);
    const max = maxRaw === '' ? null : Number(maxRaw);
    if (min !== null && (!Number.isFinite(min) || min < 0)) return null;
    if (max !== null && (!Number.isFinite(max) || max < 0)) return null;
    if (min !== null && max !== null && min > max) return null;
    return { min, max };
  }

  async function saveRule() {
    const existing = rules.find((x) => x.id === ruleOpen) ?? null;
    if (rName.trim().length < 2) {
      setProblem(t('ceoD.sRuleNameShort'));
      return;
    }
    const draft = { total: rTotal, estateai: rEstate, broker: rBroker, other: rOther };
    if (!splitValid(draft)) {
      setProblem(t('ceoD.sSplitBad'));
      return;
    }
    const tiers = tierBounds();
    if (!tiers) {
      setProblem(t('ceoD.sTierBad'));
      return;
    }
    const ok = await postConfig({
      type: existing ? 'RULE_UPDATE' : 'RULE_CREATE',
      ...(existing ? { ruleId: existing.id } : {}),
      rule: {
        name: rName.trim(),
        developerId: existing?.developerId ?? null,
        projectId: existing?.projectId ?? null,
        totalPct: numOr(rTotal, 0),
        estateaiPct: numOr(rEstate, 0),
        brokerPct: numOr(rBroker, 0),
        otherPct: numOr(rOther, 0),
        otherLabel: rOtherLabel.trim() || null,
        ...(tiers.min !== null ? { minDealValue: tiers.min } : {}),
        ...(tiers.max !== null ? { maxDealValue: tiers.max } : {}),
        isActive: rActive,
        isDefault: rDefault,
        priority: Math.round(numOr(rPriority, 0)),
      },
    });
    if (ok) setRuleOpen(null);
  }

  function confirmRuleDelete(id: string) {
    Alert.alert(t('ceoD.sDeleteRuleTitle'), t('ceoD.sDeleteRuleBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const ok = await postConfig({ type: 'RULE_DELETE', ruleId: id });
            if (ok) setRuleOpen(null);
          })();
        },
      },
    ]);
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  const tabLoading =
    tab === 'overview'
      ? ovQ.loading
      : tab === 'deals'
        ? loading
        : tab === 'commissions'
          ? commissionsLoading
          : tab === 'protection'
            ? protQ.loading
            : tab === 'partnerships'
              ? psQ.loading
              : cfgQ.loading;
  if (tabLoading) return <Loading label={t('ceoD.loading')} />;

  const tabRefreshing =
    tab === 'overview'
      ? ovQ.refreshing || brokersQ.refreshing || devsQ.refreshing || projsQ.refreshing
      : tab === 'deals'
        ? refreshing || growthQ.refreshing
        : tab === 'commissions'
          ? commissionsRefreshing || growthQ.refreshing
          : tab === 'protection'
            ? protQ.refreshing || brokersQ.refreshing
            : tab === 'partnerships'
              ? psQ.refreshing || brokersQ.refreshing || devsQ.refreshing || projsQ.refreshing
              : cfgQ.refreshing;

  function refreshActive() {
    clearFeedback();
    if (tab === 'overview') {
      ovQ.refresh();
      brokersQ.refresh();
      devsQ.refresh();
      projsQ.refresh();
    } else if (tab === 'deals') {
      refresh();
      growthQ.refresh();
    } else if (tab === 'commissions') {
      refreshCommissions();
      growthQ.refresh();
    } else if (tab === 'protection') {
      protQ.refresh();
      brokersQ.refresh();
    } else if (tab === 'partnerships') {
      psQ.refresh();
      brokersQ.refresh();
      devsQ.refresh();
      projsQ.refresh();
    } else {
      cfgQ.refresh();
    }
  }

  const kpis = growthQ.data?.deals;
  const commissionKpis = growthQ.data?.commissions;
  const showDeals = tab === 'deals';
  const showCommissions = tab === 'commissions';
  const editingPs = psEdit === 'NEW' ? null : (partnerships.find((x) => x.id === psEdit) ?? null);
  const uncoveredDevs = developers.filter((d) => !partnerships.some((x) => x.developerId === d.id));
  const pv = protDraft();
  const dv = defDraft();
  const filtersActive = Boolean(ovDev || ovBroker || ovProj || ovFrom.trim() || ovTo.trim());

  return (
    <Screen refreshing={tabRefreshing} onRefresh={refreshActive}>
      <Stack.Screen options={{ title: t('ceo.dealsScreen') }} />

      <Segmented<Tab>
        options={[
          { value: 'overview', label: t('ceoD.tabOverview') },
          { value: 'deals', label: t('ceoD.tabDeals') },
          { value: 'commissions', label: t('ceoD.tabCommissions') },
          { value: 'protection', label: t('ceoD.tabProtection') },
          { value: 'partnerships', label: t('ceoD.tabPartnerships') },
          { value: 'settings', label: t('ceoD.tabSettings') },
        ]}
        value={tab}
        onChange={switchTab}
      />

      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {/* ── Deals + commissions keep their ledgers ─────────────────── */}
      {showDeals || showCommissions ? (
        <Card style={[styles.kpis, row]}>
          <View style={styles.kpi}>
            <Stat value={kpis?.total ?? 0} label={t('ceo.deals')} />
          </View>
          <View style={styles.kpi}>
            <Stat value={kpis?.sold ?? 0} label={t('ceo.dealsSold')} />
          </View>
          <View style={styles.kpi}>
            <Stat
              value={formatMoney(kpis?.totalValue ?? 0, currency, rates, { compact: true })}
              label={t('ceo.dealValue')}
            />
          </View>
          <View style={styles.kpi}>
            <Stat
              value={formatMoney(commissionKpis?.pendingAmount ?? 0, currency, rates, { compact: true })}
              label={t('ceo.pendingPayouts')}
            />
          </View>
          <View style={styles.kpi}>
            <Stat
              value={formatMoney(commissionKpis?.brokerShare ?? 0, currency, rates, { compact: true })}
              label={t('ceo.brokerShare')}
            />
          </View>
          <View style={styles.kpi}>
            <Stat value={commissionKpis?.openDisputes ?? 0} label={t('ceo.openDisputes')} />
          </View>
        </Card>
      ) : null}

      {showDeals ? (
        <>
          <Btn title={t('ceoD.close.open')} onPress={() => setShowClose(true)} />
          <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.searchDeals')} />
          <View style={[styles.filters, row]}>
            {DEAL_STAGES.map((value) => (
              <Chip
                key={value}
                label={value === 'ALL' ? t('common.all') : humanise(value)}
                selected={stage === value}
                onPress={() => setStage(value)}
              />
            ))}
          </View>
        </>
      ) : null}

      {tab === 'deals' || tab === 'commissions' ? (
        <>
          {tab === 'deals' && growthQ.error ? <ErrorBar message={growthQ.error} onRetry={growthQ.refresh} /> : null}
          {error && showDeals ? <ErrorBar message={error} onRetry={refresh} /> : null}
          {commissionsError && showCommissions ? (
            <ErrorBar message={commissionsError} onRetry={refreshCommissions} />
          ) : null}

          {showCommissions && !commissionsError && commissions.length === 0 ? (
            <Empty title={t('ceo.commissions.none')} message={t('ceo.commissions.noneHint')} />
          ) : null}

          {showDeals ? (
            !error && deals.length === 0 ? (
              <Empty title={t('ceo.deals.none')} message={t('ceo.deals.noneHint')} />
            ) : (
              deals.map((deal, index) => {
                const busy = busyId === deal.id;
                const moves = DEAL_MOVES[deal.status] ?? [];

                return (
                  <View key={deal.id}>
                    {index > 0 ? <Divider /> : null}
                    <Card style={styles.card}>
                      <Row
                        title={deal.lead?.name || deal.lead?.leadCode || t('ceo.leads')}
                        subtitle={[
                          deal.project?.name,
                          deal.broker?.user?.name
                            ? `${t('common.broker')}: ${deal.broker.user.name}`
                            : null,
                          deal.developer?.companyName
                            ? `${t('common.developer')}: ${deal.developer.companyName}`
                            : null,
                          deal.createdAt ? formatDate(deal.createdAt) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        badge={<Badge tone={toneForStage(deal.status)}>{humanise(deal.status)}</Badge>}
                        right={
                          <Text style={styles.amount}>
                            {formatMoney(deal.dealValue ?? 0, currency, rates, { compact: true })}
                          </Text>
                        }
                      />

                      {moves.length > 0 ? (
                        <View style={[styles.actions, row]}>
                          {moves.map((option) => (
                            <Btn
                              key={option.status}
                              title={t(option.labelKey)}
                              variant={option.variant}
                              style={styles.action}
                              busy={busy}
                              onPress={() =>
                                void sendMove(
                                  `/api/deals/${deal.id}`,
                                  deal.id,
                                  { status: option.status },
                                  'ceo.stageUpdated',
                                )
                              }
                            />
                          ))}
                        </View>
                      ) : null}
                    </Card>
                  </View>
                );
              })
            )
          ) : (
            commissions.map((commission, index) => {
              const busy = busyId === commission.id;
              const moves = [...(COMMISSION_MOVES[commission.status] ?? [])];
              if (DISPUTABLE.includes(commission.status)) {
                moves.push({ status: 'DISPUTED', labelKey: 'ceo.dispute', variant: 'ghost' });
              }

              return (
                <View key={commission.id}>
                  {index > 0 ? <Divider /> : null}
                  <Card style={styles.card}>
                    <Row
                      title={
                        commission.deal?.lead?.name ||
                        commission.deal?.lead?.leadCode ||
                        commission.deal?.project?.name ||
                        t('ceo.commissions')
                      }
                      subtitle={[
                        commission.deal?.broker?.user?.name
                          ? `${t('common.broker')}: ${commission.deal.broker.user.name}`
                          : null,
                        commission.deal?.developer?.companyName ?? null,
                        commission.rule?.name ? `${t('common.type')}: ${commission.rule.name}` : null,
                        commission.totalPct != null
                          ? `${t('ceo.commissionTotal')} ${commission.totalPct}%`
                          : null,
                        commission.dueDate
                          ? `${t('ceo.dueDate')} ${formatDate(commission.dueDate)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      badge={
                        <Badge tone={toneForStage(commission.status)}>{humanise(commission.status)}</Badge>
                      }
                      right={
                        <View style={styles.amountBlock}>
                          <Text style={styles.amount}>
                            {formatMoney(commission.totalAmount ?? 0, currency, rates, { compact: true })}
                          </Text>
                          <Text style={styles.share}>
                            {`${t('ceo.brokerShare')} ${formatMoney(commission.brokerAmount ?? 0, currency, rates, { compact: true })}`}
                          </Text>
                        </View>
                      }
                    />

                    {moves.length > 0 ? (
                      <View style={[styles.actions, row]}>
                        {moves.map((option) => (
                          <Btn
                            key={option.status}
                            title={t(option.labelKey)}
                            variant={option.variant}
                            style={styles.action}
                            busy={busy}
                            onPress={() =>
                              void sendMove(
                                `/api/commissions/${commission.id}`,
                                commission.id,
                                { status: option.status },
                                'ceo.stageUpdated',
                              )
                            }
                          />
                        ))}
                      </View>
                    ) : null}
                  </Card>
                </View>
              );
            })
          )}
          {showCommissions ? <DisputesPanel /> : null}
        </>
      ) : null}

      {/* ── Overview: headline metrics + status breakdown ──────────── */}
      {tab === 'overview' ? (
        <>
          {ovQ.error ? <ErrorBar message={ovQ.error} onRetry={ovQ.refresh} /> : null}
          <ForecastPanel />
          <Card>
            <SectionTitle>{t('ceoD.ovFilters')}</SectionTitle>
            <Text style={[styles.groupLabel, align]}>{t('ceoD.fDeveloper')}</Text>
            <View style={[styles.filters, row]}>
              <Chip label={t('common.all')} selected={!ovDev} onPress={() => setOvDev('')} />
              {developers.map((d) => (
                <Chip key={d.id} label={d.companyName} selected={ovDev === d.id} onPress={() => setOvDev(ovDev === d.id ? '' : d.id)} />
              ))}
            </View>
            <Text style={[styles.groupLabel, align]}>{t('ceoD.fBroker')}</Text>
            <View style={[styles.filters, row]}>
              <Chip label={t('common.all')} selected={!ovBroker} onPress={() => setOvBroker('')} />
              {brokers.map((b) => (
                <Chip
                  key={b.id}
                  label={b.user?.name || b.id.slice(0, 8)}
                  selected={ovBroker === b.id}
                  onPress={() => setOvBroker(ovBroker === b.id ? '' : b.id)}
                />
              ))}
            </View>
            <Text style={[styles.groupLabel, align]}>{t('ceoD.fProject')}</Text>
            <View style={[styles.filters, row]}>
              <Chip label={t('common.all')} selected={!ovProj} onPress={() => setOvProj('')} />
              {projects.map((p) => (
                <Chip key={p.id} label={p.name} selected={ovProj === p.id} onPress={() => setOvProj(ovProj === p.id ? '' : p.id)} />
              ))}
            </View>
            <Field label={t('ceoD.fFrom')} value={ovFrom} onChangeText={setOvFrom} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            <Field label={t('ceoD.fTo')} value={ovTo} onChangeText={setOvTo} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            {filtersActive ? (
              <Btn
                title={t('ceoD.ovClearFilters')}
                variant="ghost"
                onPress={() => {
                  setOvDev('');
                  setOvBroker('');
                  setOvProj('');
                  setOvFrom('');
                  setOvTo('');
                }}
              />
            ) : null}
          </Card>

          {!stats ? (
            <Empty title={t('ceoD.empty')} message={t('ceoD.emptyHint')} />
          ) : (
            <>
              <SectionTitle>{t('ceoD.ovLeads')}</SectionTitle>
              <Card style={[styles.kpis, row]}>
                <View style={styles.kpi}><Stat value={stats.leads.total} label={t('ceoD.ovTotalLeads')} /></View>
                <View style={styles.kpi}><Stat value={stats.leads.new} label={t('ceoD.ovNew')} /></View>
                <View style={styles.kpi}><Stat value={stats.leads.activeProtected} label={t('ceoD.ovProtected')} /></View>
                <View style={styles.kpi}><Stat value={stats.leads.expiringSoon} label={t('ceoD.ovExpiringSoon')} /></View>
                <View style={styles.kpi}><Stat value={stats.leads.expiredProtection} label={t('ceoD.ovExpired')} /></View>
                <View style={styles.kpi}><Stat value={stats.leads.duplicateReview} label={t('ceoD.ovDuplicates')} /></View>
                <View style={styles.kpi}><Stat value={stats.leads.transferred} label={t('ceoD.ovTransferred')} /></View>
              </Card>
              <View style={[styles.filters, row]}>
                {Object.entries(stats.leads.statusBreakdown).map(([status, count]) => (
                  <Badge key={status} tone={toneForStage(status)}>
                    {`${humanise(status)}: ${count}`}
                  </Badge>
                ))}
              </View>

              <SectionTitle>{t('ceoD.ovDeals')}</SectionTitle>
              <Card style={[styles.kpis, row]}>
                <View style={styles.kpi}><Stat value={stats.deals.total} label={t('ceoD.ovTotalDeals')} /></View>
                <View style={styles.kpi}><Stat value={stats.deals.reservations} label={t('ceoD.ovReservations')} /></View>
                <View style={styles.kpi}><Stat value={stats.deals.contracts} label={t('ceoD.ovContracts')} /></View>
                <View style={styles.kpi}><Stat value={stats.deals.sold} label={t('ceoD.ovSold')} /></View>
                <View style={styles.kpi}><Stat value={stats.deals.cancelled} label={t('ceoD.ovCancelled')} /></View>
                <View style={styles.kpi}>
                  <Stat value={formatMoney(stats.deals.totalValue, currency, rates, { compact: true })} label={t('ceoD.ovTotalValue')} />
                </View>
                <View style={styles.kpi}>
                  <Stat value={`${stats.platform.conversionRate}%`} label={t('ceoD.ovConversion')} />
                </View>
              </Card>

              <SectionTitle>{t('ceoD.ovCommission')}</SectionTitle>
              <Card style={[styles.kpis, row]}>
                <View style={styles.kpi}>
                  <Stat value={formatMoney(stats.commissions.totalAmount, currency, rates, { compact: true })} label={t('ceoD.ovExpected')} />
                </View>
                <View style={styles.kpi}>
                  <Stat value={formatMoney(stats.commissions.estateaiShare, currency, rates, { compact: true })} label={t('ceoD.ovEstateShare')} />
                </View>
                <View style={styles.kpi}>
                  <Stat value={formatMoney(stats.commissions.brokerShare, currency, rates, { compact: true })} label={t('ceoD.ovBrokerShare')} />
                </View>
                <View style={styles.kpi}>
                  <Stat value={formatMoney(stats.commissions.pendingAmount, currency, rates, { compact: true })} label={t('ceoD.ovPending')} />
                </View>
                <View style={styles.kpi}>
                  <Stat value={formatMoney(stats.commissions.paidAmount, currency, rates, { compact: true })} label={t('ceoD.ovPaid')} />
                </View>
                <View style={styles.kpi}><Stat value={stats.commissions.openDisputes} label={t('ceoD.ovOpenDisputes')} /></View>
                <View style={styles.kpi}>
                  <Stat value={`${stats.platform.brokerCount} / ${stats.platform.developerCount}`} label={t('ceoD.ovBrokersDevs')} />
                </View>
              </Card>

              <SectionTitle>
                {`${t('ceoD.ovExpiringTitle')} (${stats.protection.config.expiringSoonDays} ${t('ceoD.days')})`}
              </SectionTitle>
              <Card>
                {stats.protection.expiringList.length === 0 ? (
                  <Text style={[styles.hint, align]}>{t('ceoD.ovNothingExpiring')}</Text>
                ) : (
                  stats.protection.expiringList.map((lead, index) => (
                    <View key={lead.id}>
                      {index > 0 ? <Divider /> : null}
                      <Row
                        title={lead.leadCode ? `${lead.leadCode} · ${lead.name}` : lead.name}
                        subtitle={lead.broker?.user?.name ? `${t('common.broker')}: ${lead.broker.user.name}` : null}
                        right={<Text style={styles.amount}>{formatDate(lead.protectionExpiresAt)}</Text>}
                      />
                    </View>
                  ))
                )}
              </Card>

              <SectionTitle>
                {stats.commissions.openDisputes > 0
                  ? `${t('ceoD.ovDisputesTitle')} (${stats.commissions.openDisputes})`
                  : t('ceoD.ovDisputesTitle')}
              </SectionTitle>
              <Card>
                {stats.commissions.disputeList.length === 0 ? (
                  <Text style={[styles.hint, align]}>{t('ceoD.ovNoDisputes')}</Text>
                ) : (
                  stats.commissions.disputeList.map((rowItem, index) => (
                    <View key={rowItem.id}>
                      {index > 0 ? <Divider /> : null}
                      <Row
                        title={
                          rowItem.deal.lead
                            ? rowItem.deal.lead.leadCode
                              ? `${rowItem.deal.lead.leadCode} · ${rowItem.deal.lead.name}`
                              : rowItem.deal.lead.name
                            : (rowItem.deal.project?.name ?? '—')
                        }
                        subtitle={rowItem.deal.project?.name ?? null}
                        badge={<Badge tone="red">{humanise(rowItem.status)}</Badge>}
                        right={
                          <Text style={styles.amount}>
                            {formatMoney(rowItem.totalAmount, currency, rates, { compact: true })}
                          </Text>
                        }
                      />
                    </View>
                  ))
                )}
              </Card>
            </>
          )}
        </>
      ) : null}

      {/* ── Protection: windows, expiring, expired ─────────────── */}
      {tab === 'protection' ? (
        <>
          {protQ.error ? <ErrorBar message={protQ.error} onRetry={protQ.refresh} /> : null}
          <View style={[styles.filters, row]}>
            {(['expiring', 'expired', 'duplicates'] as ProtPanel[]).map((value) => (
              <Chip
                key={value}
                label={t(value === 'expiring' ? 'ceoD.pExpiring' : value === 'expired' ? 'ceoD.pExpired' : 'ceoD.pDuplicates')}
                selected={protPanel === value}
                onPress={() => {
                  setProtPanel(value);
                  setProtOpen(null);
                  setProblem(null);
                }}
              />
            ))}
          </View>
          <SearchBar value={protQuery} onChangeText={setProtQuery} placeholder={t('ceoD.pSearch')} />
          <Btn title={t('ceoD.pRunMaint')} variant="ghost" busy={maintBusy} onPress={() => void runMaintenance()} />
          {maintResult ? <Text style={[styles.hint, align]}>{`${t('ceoD.pSweeperResult')}: ${maintResult}`}</Text> : null}

          {!protQ.error && protLeads.length === 0 ? (
            <Empty
              title={t('ceoD.tabProtection')}
              message={t(
                protPanel === 'expiring' ? 'ceoD.pNothingExpiring' : protPanel === 'expired' ? 'ceoD.pNoExpired' : 'ceoD.pNoDuplicates',
              )}
            />
          ) : (
            protLeads.map((lead, index) => {
              const open = protOpen === lead.id;
              return (
                <View key={lead.id}>
                  {index > 0 ? <Divider /> : null}
                  <Card style={styles.card}>
                    <Row
                      title={lead.name}
                      subtitle={[
                        lead.leadCode,
                        `${t('ceoD.pRegistered')} ${formatDate(lead.createdAt)}`,
                        lead.broker?.user?.name ?? t('ceoD.pUnassigned'),
                        lead.project?.name,
                        lead.protectionStartsAt && lead.protectionExpiresAt
                          ? `${formatDate(lead.protectionStartsAt)} → ${formatDate(lead.protectionExpiresAt)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      badge={
                        <Badge tone={protectionTone(lead.protectionStatus)}>
                          {t(
                            lead.protectionStatus === 'PROTECTED'
                              ? 'ceoD.pProtected'
                              : lead.protectionStatus === 'EXPIRING_SOON'
                                ? 'ceoD.pExpiringOne'
                                : lead.protectionStatus === 'EXPIRED'
                                  ? 'ceoD.pExpiredOne'
                                  : 'ceoD.pUnassigned',
                          )}
                        </Badge>
                      }
                      right={<Badge tone="muted">{humanise(lead.status)}</Badge>}
                    />
                    <View style={[styles.actions, row]}>
                      {protPanel === 'duplicates' ? (
                        <Btn
                          title={t('ceoD.pResolve')}
                          variant="primary"
                          style={styles.action}
                          onPress={() => openProtAction(lead, 'resolve')}
                        />
                      ) : (
                        <>
                          <Btn
                            title={t('ceoD.pExtend')}
                            variant="primary"
                            style={styles.action}
                            onPress={() => openProtAction(lead, 'extend')}
                          />
                          <Btn
                            title={t('ceoD.pTransfer')}
                            variant="ghost"
                            style={styles.action}
                            onPress={() => openProtAction(lead, 'transfer')}
                          />
                          <Btn
                            title={t('ceoD.pExpire')}
                            variant="ghost"
                            style={styles.action}
                            onPress={() => openProtAction(lead, 'expire')}
                          />
                        </>
                      )}
                    </View>

                    {open ? (
                      <Card>
                        {protAction === 'extend' ? (
                          <Field
                            label={t('ceoD.pExtraDays')}
                            value={protDays}
                            onChangeText={setProtDays}
                            keyboardType="numeric"
                          />
                        ) : null}
                        {protAction === 'transfer' ? (
                          <>
                            <Text style={[styles.groupLabel, align]}>{t('ceoD.pNewOwner')}</Text>
                            <View style={[styles.filters, row]}>
                              {brokers.map((b) => (
                                <Chip
                                  key={b.id}
                                  label={b.user?.name || b.id.slice(0, 8)}
                                  selected={protBrokerId === b.id}
                                  onPress={() => setProtBrokerId(protBrokerId === b.id ? '' : b.id)}
                                />
                              ))}
                            </View>
                          </>
                        ) : null}
                        {protAction === 'resolve' ? (
                          <>
                            <Text style={[styles.groupLabel, align]}>{t('ceoD.pResolution')}</Text>
                            <View style={[styles.filters, row]}>
                              <Chip
                                label={t('ceoD.pResOriginal')}
                                selected={protResolution === 'ORIGINAL_WINS'}
                                onPress={() => setProtResolution('ORIGINAL_WINS')}
                              />
                              <Chip
                                label={t('ceoD.pResChallenger')}
                                selected={protResolution === 'CHALLENGER_WINS'}
                                onPress={() => setProtResolution('CHALLENGER_WINS')}
                              />
                            </View>
                          </>
                        ) : null}
                        {protAction === 'expire' ? (
                          <Text style={[styles.hint, align]}>{t('ceoD.pExpireWarn')}</Text>
                        ) : null}
                        <Field label={t('ceoD.pReason')} value={protReason} onChangeText={setProtReason} />
                        <View style={[styles.actions, row]}>
                          <Btn
                            title={t('common.confirm')}
                            variant="primary"
                            style={styles.action}
                            busy={protBusy}
                            onPress={() => void submitProtAction(lead)}
                          />
                          <Btn
                            title={t('common.cancel')}
                            variant="ghost"
                            style={styles.action}
                            onPress={() => setProtOpen(null)}
                          />
                        </View>
                      </Card>
                    ) : null}
                  </Card>
                </View>
              );
            })
          )}
        </>
      ) : null}

      {/* ── Partnerships: co-brokerage surface ─────────────────── */}
      {tab === 'partnerships' ? (
        <>
          {psQ.error ? <ErrorBar message={psQ.error} onRetry={psQ.refresh} /> : null}
          <SectionTitle
            action={
              <Btn title={t('ceoD.psNew')} variant="primary" onPress={() => openPartnership(null)} />
            }
          >
            {t('ceoD.psTitle')}
          </SectionTitle>

          {!psQ.error && partnerships.length === 0 ? (
            <Empty title={t('ceoD.psNone')} message={t('ceoD.psNoneHint')} />
          ) : (
            partnerships.map((p, index) => (
              <View key={p.id}>
                {index > 0 ? <Divider /> : null}
                <Card style={styles.card}>
                  <Row
                    title={p.developer?.companyName || p.developerId}
                    subtitle={[
                      `${t('ceoD.psLeadProtection')}: ${p.leadProtectionDays != null ? `${p.leadProtectionDays} ${t('ceoD.days')}` : t('ceoD.psPlatformDefault')}`,
                      `${p.startDate ? formatDate(p.startDate) : '—'} → ${p.endDate ? formatDate(p.endDate) : t('ceoD.psOpen')}`,
                      `${p.allowedBrokerIds.length} ${t('ceoD.psAllowed')} · ${p.blockedBrokerIds.length} ${t('ceoD.psBlocked')}`,
                      p.allProjectsApproved ? t('ceoD.psAllApproved') : `${p.approvedProjectIds.length} ${t('ceoD.psApprovedN')}`,
                    ].join(' · ')}
                    badge={
                      <Badge tone={partnershipTone(p.status)}>
                        {humanise(p.status)}
                      </Badge>
                    }
                    right={!p.isActive ? <Badge tone="red">{t('ceoD.psInactive')}</Badge> : undefined}
                  />
                  <View style={[styles.actions, row]}>
                    <Btn
                      title={t('ceoD.psEdit')}
                      variant="ghost"
                      style={styles.action}
                      onPress={() => openPartnership(p)}
                    />
                  </View>
                </Card>
              </View>
            ))
          )}

          {psEdit ? (
            <Card>
              <SectionTitle>{t(editingPs ? 'ceoD.psEditTitle' : 'ceoD.psNew')}</SectionTitle>
              {!editingPs ? (
                <>
                  <Text style={[styles.groupLabel, align]}>{t('ceoD.psDeveloper')}</Text>
                  <View style={[styles.filters, row]}>
                    {uncoveredDevs.map((d) => (
                      <Chip
                        key={d.id}
                        label={d.companyName}
                        selected={psDevId === d.id}
                        onPress={() => setPsDevId(d.id)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={[styles.groupLabel, align]}>{t('ceoD.psStatus')}</Text>
              <View style={[styles.filters, row]}>
                {PARTNERSHIP_STATUSES.map((s) => (
                  <Chip key={s} label={humanise(s)} selected={psStatus === s} onPress={() => setPsStatus(s)} />
                ))}
              </View>
              <Field
                label={t('ceoD.psProtDays')}
                value={psProtDays}
                onChangeText={setPsProtDays}
                keyboardType="numeric"
                placeholder={t('ceoD.psPlatformDefault')}
              />
              <Field
                label={t('ceoD.psStart')}
                value={psStart}
                onChangeText={setPsStart}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
              <Field
                label={t('ceoD.psEnd')}
                value={psEnd}
                onChangeText={setPsEnd}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
              <View style={[styles.filters, row]}>
                <Chip
                  label={t('ceoD.psAllProjects')}
                  selected={psAllApproved}
                  onPress={() => setPsAllApproved(!psAllApproved)}
                />
                <Chip
                  label={t('ceoD.psActive')}
                  selected={psActive}
                  onPress={() => setPsActive(!psActive)}
                />
              </View>
              {!psAllApproved ? (
                <>
                  <Text style={[styles.groupLabel, align]}>{t('ceoD.fProject')}</Text>
                  <View style={[styles.filters, row]}>
                    {projects.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.name}
                        selected={psApprovedIds.includes(p.id)}
                        onPress={() =>
                          setPsApprovedIds(
                            psApprovedIds.includes(p.id)
                              ? psApprovedIds.filter((id) => id !== p.id)
                              : [...psApprovedIds, p.id],
                          )
                        }
                      />
                    ))}
                  </View>
                </>
              ) : null}
              <Field label={t('ceoD.psAgreement')} value={psAgreement} onChangeText={setPsAgreement} multiline />
              <Field label={t('ceoD.psTerms')} value={psTerms} onChangeText={setPsTerms} multiline />
              <Field label={t('ceoD.psReviewNote')} value={psReviewNote} onChangeText={setPsReviewNote} />
              <View style={[styles.actions, row]}>
                <Btn
                  title={t('common.save')}
                  variant="primary"
                  style={styles.action}
                  busy={psBusy}
                  onPress={() => void savePartnership()}
                />
                <Btn
                  title={t('common.cancel')}
                  variant="ghost"
                  style={styles.action}
                  onPress={() => setPsEdit(null)}
                />
              </View>
            </Card>
          ) : null}

          <SectionTitle
            action={
              <Btn title={t('ceoD.psAddRule')} variant="ghost" onPress={() => setShowAccess(!showAccess)} />
            }
          >
            {t('ceoD.psAccessTitle')}
          </SectionTitle>

          {showAccess ? (
            <Card>
              <Text style={[styles.groupLabel, align]}>{t('ceoD.fBroker')}</Text>
              <View style={[styles.filters, row]}>
                {brokers.map((b) => (
                  <Chip
                    key={b.id}
                    label={b.user?.name || b.id.slice(0, 8)}
                    selected={accBroker === b.id}
                    onPress={() => setAccBroker(accBroker === b.id ? '' : b.id)}
                  />
                ))}
              </View>
              <Text style={[styles.groupLabel, align]}>{t('ceoD.psScope')}</Text>
              <View style={[styles.filters, row]}>
                <Chip
                  label={t('ceoD.psScopeDev')}
                  selected={accScope === 'developer'}
                  onPress={() => setAccScope('developer')}
                />
                <Chip
                  label={t('ceoD.psScopeProj')}
                  selected={accScope === 'project'}
                  onPress={() => setAccScope('project')}
                />
              </View>
              {accScope === 'developer' ? (
                <>
                  <Text style={[styles.groupLabel, align]}>{t('ceoD.psDeveloper')}</Text>
                  <View style={[styles.filters, row]}>
                    {developers.map((d) => (
                      <Chip
                        key={d.id}
                        label={d.companyName}
                        selected={accDev === d.id}
                        onPress={() => setAccDev(accDev === d.id ? '' : d.id)}
                      />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.groupLabel, align]}>{t('ceoD.psProject')}</Text>
                  <View style={[styles.filters, row]}>
                    {projects.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.name}
                        selected={accProj === p.id}
                        onPress={() => setAccProj(accProj === p.id ? '' : p.id)}
                      />
                    ))}
                  </View>
                </>
              )}
              <Text style={[styles.groupLabel, align]}>{t('ceoD.psAccess')}</Text>
              <View style={[styles.filters, row]}>
                <Chip
                  label={t('ceoD.psApproved')}
                  selected={accAccess === 'APPROVED'}
                  onPress={() => setAccAccess('APPROVED')}
                />
                <Chip
                  label={t('ceoD.psBlockedState')}
                  selected={accAccess === 'BLOCKED'}
                  onPress={() => setAccAccess('BLOCKED')}
                />
              </View>
              <Field
                label={t('ceoD.psExpiry')}
                value={accExpires}
                onChangeText={setAccExpires}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
              <Field label={t('ceoD.psNotes')} value={accNotes} onChangeText={setAccNotes} />
              <View style={[styles.actions, row]}>
                <Btn
                  title={t('ceoD.psSaveRule')}
                  variant="primary"
                  style={styles.action}
                  busy={psBusy}
                  onPress={() => void saveAccess()}
                />
                <Btn
                  title={t('common.cancel')}
                  variant="ghost"
                  style={styles.action}
                  onPress={() => setShowAccess(false)}
                />
              </View>
            </Card>
          ) : null}

          {accessRows.length === 0 ? (
            <Text style={[styles.hint, align]}>{t('ceoD.psAccessNone')}</Text>
          ) : (
            accessRows.map((accessRow, index) => (
              <View key={accessRow.id}>
                {index > 0 ? <Divider /> : null}
                <Card style={styles.card}>
                  <Row
                    title={accessRow.broker?.user?.name || accessRow.brokerId}
                    subtitle={[
                      accessRow.project
                        ? `${t('ceoD.psProject')}: ${accessRow.project.name}`
                        : accessRow.developer
                          ? `${t('ceoD.psDeveloper')}: ${accessRow.developer.companyName}`
                          : null,
                      accessRow.notes,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      <Badge tone={accessRow.access === 'APPROVED' ? 'green' : 'red'}>
                        {t(accessRow.access === 'APPROVED' ? 'ceoD.psApproved' : 'ceoD.psBlockedState')}
                      </Badge>
                    }
                    right={
                      <Text style={styles.share}>
                        {`${t('ceoD.psExpires')}: ${accessRow.expiresAt ? formatDate(accessRow.expiresAt) : '—'}`}
                      </Text>
                    }
                  />
                  <View style={[styles.actions, row]}>
                    <Btn
                      title={t('common.delete')}
                      variant="ghost"
                      style={styles.action}
                      onPress={() => confirmAccessDelete(accessRow.id)}
                    />
                  </View>
                </Card>
              </View>
            ))
          )}
        </>
      ) : null}

      {/* ── Settings: protection defaults + commission rules ───── */}
      {tab === 'settings' ? (
        <>
          {cfgQ.error ? <ErrorBar message={cfgQ.error} onRetry={cfgQ.refresh} /> : null}
          {pv ? (
            <Card>
              <SectionTitle>{t('ceoD.sProtection')}</SectionTitle>
              <Text style={[styles.hint, align]}>{t('ceoD.sProtectionHint')}</Text>
              <Field
                label={t('ceoD.sDefDays')}
                value={pv.defDays}
                onChangeText={(v) => setSProt({ ...pv, defDays: v })}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sSoonDays')}
                value={pv.soonDays}
                onChangeText={(v) => setSProt({ ...pv, soonDays: v })}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sRenewDays')}
                value={pv.renewDays}
                onChangeText={(v) => setSProt({ ...pv, renewDays: v })}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sMaxRenewals')}
                value={pv.maxRen}
                onChangeText={(v) => setSProt({ ...pv, maxRen: v })}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sInactivity')}
                value={pv.inactDays}
                onChangeText={(v) => setSProt({ ...pv, inactDays: v })}
                keyboardType="numeric"
              />
              <Text style={[styles.groupLabel, align]}>{t('ceoD.sBehavior')}</Text>
              <View style={[styles.filters, row]}>
                <Chip
                  label={t('ceoD.sAutoExpire')}
                  selected={pv.behavior === 'AUTO_EXPIRE'}
                  onPress={() => setSProt({ ...pv, behavior: 'AUTO_EXPIRE' })}
                />
                <Chip
                  label={t('ceoD.sAlertOnly')}
                  selected={pv.behavior === 'ALERT_ONLY'}
                  onPress={() => setSProt({ ...pv, behavior: 'ALERT_ONLY' })}
                />
              </View>
              <Text style={[styles.groupLabel, align]}>{t('ceoD.sAllowRenewal')}</Text>
              <View style={[styles.filters, row]}>
                <Chip
                  label={t('common.yes')}
                  selected={pv.renewal === 'yes'}
                  onPress={() => setSProt({ ...pv, renewal: 'yes' })}
                />
                <Chip
                  label={t('common.no')}
                  selected={pv.renewal === 'no'}
                  onPress={() => setSProt({ ...pv, renewal: 'no' })}
                />
              </View>
              <Btn title={t('common.save')} variant="primary" busy={sBusy} onPress={() => void saveProtection()} />
            </Card>
          ) : null}

          {dv ? (
            <Card>
              <SectionTitle>{t('ceoD.sSplit')}</SectionTitle>
              <Text style={[styles.hint, align]}>{t('ceoD.sSplitHint')}</Text>
              <Field
                label={t('ceoD.sTotal')}
                value={dv.total}
                onChangeText={(v) => setSDef({ ...dv, total: v })}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sEstateai')}
                value={dv.estateai}
                onChangeText={(v) => setSDef({ ...dv, estateai: v })}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sBroker')}
                value={dv.broker}
                onChangeText={(v) => setSDef({ ...dv, broker: v })}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sOther')}
                value={dv.other}
                onChangeText={(v) => setSDef({ ...dv, other: v })}
                keyboardType="numeric"
              />
              {!splitValid(dv) ? <ErrorBar message={t('ceoD.sSplitBad')} /> : null}
              <Btn
                title={t('common.save')}
                variant="primary"
                busy={sBusy}
                onPress={() => void saveDefaults()}
              />
            </Card>
          ) : null}

          <SectionTitle
            action={<Btn title={t('ceoD.sNewRule')} variant="primary" onPress={() => openRule(null)} />}
          >
            {`${t('ceoD.sRules')} (${t('ceoD.sRulesHint')})`}
          </SectionTitle>
          {rules.length === 0 ? (
            <Text style={[styles.hint, align]}>{t('ceoD.sNoRules')}</Text>
          ) : (
            rules.map((ruleItem, index) => (
              <View key={ruleItem.id}>
                {index > 0 ? <Divider /> : null}
                <Card style={styles.card}>
                  <Row
                    title={ruleItem.name}
                    subtitle={[
                      ruleItem.project
                        ? `${t('ceoD.psProject')}: ${ruleItem.project.name}`
                        : ruleItem.developer
                          ? `${t('ceoD.psDeveloper')}: ${ruleItem.developer.companyName}`
                          : t('ceoD.sScopePlatform'),
                      `${ruleItem.totalPct}% = ${ruleItem.estateaiPct}% + ${ruleItem.brokerPct}%${ruleItem.otherPct > 0 ? ` + ${ruleItem.otherPct}%` : ''} · ${t('ceoD.sPriority')}: ${ruleItem.priority}`,
                      ruleItem.minDealValue != null || ruleItem.maxDealValue != null
                        ? `${t('ceoD.sTierRange')}: ${ruleItem.minDealValue != null ? formatMoney(ruleItem.minDealValue, currency, rates, { compact: true }) : '—'} → ${ruleItem.maxDealValue != null ? formatMoney(ruleItem.maxDealValue, currency, rates, { compact: true }) : '∞'}`
                        : null,
                    ].filter(Boolean).join(' · ')}
                    badge={
                      <Badge tone={ruleItem.isActive ? 'green' : 'muted'}>
                        {ruleItem.isDefault ? 'DEFAULT' : ruleItem.isActive ? t('ceoD.psApproved') : t('ceoD.psInactive')}
                      </Badge>
                    }
                  />
                  <View style={[styles.actions, row]}>
                    <Btn
                      title={t('ceoD.psEdit')}
                      variant="ghost"
                      style={styles.action}
                      onPress={() => openRule(ruleItem)}
                    />
                    <Btn
                      title={t('common.delete')}
                      variant="ghost"
                      style={styles.action}
                      onPress={() => confirmRuleDelete(ruleItem.id)}
                    />
                  </View>
                </Card>
              </View>
            ))
          )}

          {ruleOpen ? (
            <Card>
              <SectionTitle>{t(ruleOpen === 'NEW' ? 'ceoD.sNewRuleTitle' : 'ceoD.sEditRule')}</SectionTitle>
              <Field label={t('ceoD.sRuleName')} value={rName} onChangeText={setRName} />
              <Field
                label={t('ceoD.sTotal')}
                value={rTotal}
                onChangeText={setRTotal}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sEstateai')}
                value={rEstate}
                onChangeText={setREstate}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sBroker')}
                value={rBroker}
                onChangeText={setRBroker}
                keyboardType="numeric"
              />
              <Field
                label={t('ceoD.sOther')}
                value={rOther}
                onChangeText={setROther}
                keyboardType="numeric"
              />
              <Field label={t('ceoD.sOtherLabel')} value={rOtherLabel} onChangeText={setROtherLabel} />
              <Field
                label={t('ceoD.sMinDeal')}
                value={rMinDeal}
                onChangeText={setRMinDeal}
                keyboardType="decimal-pad"
              />
              <Field
                label={t('ceoD.sMaxDeal')}
                value={rMaxDeal}
                onChangeText={setRMaxDeal}
                keyboardType="decimal-pad"
              />
              <Field
                label={t('ceoD.sPriority')}
                value={rPriority}
                onChangeText={setRPriority}
                keyboardType="numeric"
              />
              <View style={[styles.filters, row]}>
                <Chip
                  label={t('ceoD.psActive')}
                  selected={rActive}
                  onPress={() => setRActive(!rActive)}
                />
                <Chip label="DEFAULT" selected={rDefault} onPress={() => setRDefault(!rDefault)} />
              </View>
              {!splitValid({ total: rTotal, estateai: rEstate, broker: rBroker, other: rOther }) ? (
                <ErrorBar message={t('ceoD.sSplitBad')} />
              ) : null}
              <View style={[styles.actions, row]}>
                <Btn
                  title={t('common.save')}
                  variant="primary"
                  style={styles.action}
                  busy={sBusy}
                  onPress={() => void saveRule()}
                />
                <Btn
                  title={t('common.cancel')}
                  variant="ghost"
                  style={styles.action}
                  onPress={() => setRuleOpen(null)}
                />
              </View>
            </Card>
          ) : null}

          <RoutingPanel />

          <AuditPanel />
        </>
      ) : null}

      {showClose ? (
        <CloseDealSheet
          onClose={() => setShowClose(false)}
          onSaved={(message) => {
            setNotice(message);
            setProblem(null);
            refresh();
            refreshCommissions();
            growthQ.refresh();
          }}
        />
      ) : null}
    </Screen>
  );
}

/* ─── Forecast + disputes + routing + audit ──────────────────────── */
// GET /api/ceo/forecast → {stages:[{stage,count,value,probability,weighted}],
// totalOpen, totalWeighted, generatedAt} — read-only pipeline estimate.

type ForecastStage = {
  stage: string;
  count: number;
  value: number;
  probability: number;
  weighted: number;
};

function ForecastPanel() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const { data, error, loading, refresh } = useApi<{
    stages?: ForecastStage[];
    totalOpen?: number;
    totalWeighted?: number;
    generatedAt?: string;
  }>('/api/ceo/forecast');

  const stages = data?.stages ?? [];

  return (
    <>
      <SectionTitle>{t('ceoD.fc.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceoD.fc.hint')}</Text>
      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading label={t('common.loading')} />
      ) : !error && stages.length === 0 ? (
        <Empty title={t('ceoD.fc.title')} message={t('ceoD.emptyHint')} />
      ) : (
        <>
          <Card style={[styles.kpis, row]}>
            <View style={styles.kpi}>
              <Stat
                value={formatMoney(data?.totalOpen ?? 0, currency, rates, { compact: true })}
                label={t('ceoD.fc.open')}
              />
            </View>
            <View style={styles.kpi}>
              <Stat
                value={formatMoney(data?.totalWeighted ?? 0, currency, rates, { compact: true })}
                label={t('ceoD.fc.weighted')}
              />
            </View>
          </Card>
          {data?.generatedAt ? (
            <Text style={[styles.hint, align]}>
              {`${t('ceoD.fc.generated')} ${formatDate(data.generatedAt, true)}`}
            </Text>
          ) : null}
          <Card style={styles.card}>
            {stages.map((stage, index) => {
              const share = (data?.totalOpen ?? 0) > 0 ? (stage.value / (data?.totalOpen ?? 1)) * 100 : 0;
              return (
                <View key={stage.stage}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={humanise(stage.stage)}
                    subtitle={`${stage.count} · ${formatMoney(stage.value, currency, rates, { compact: true })} → ${formatMoney(stage.weighted, currency, rates, { compact: true })}`}
                    badge={<Badge tone={toneForStage(stage.stage)}>{`${Math.round(stage.probability * 100)}%`}</Badge>}
                  />
                  <View style={styles.barOuter}>
                    <View style={[styles.barInner, { width: `${Math.min(100, Math.max(0, share))}%` }]} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </>
  );
}

// ─── Disputes: GET list, POST file, PATCH decide ────────────────────
// POST ← {dealId, claimantId?, reason, evidence?} (CEO files for a broker,
// so claimantId is required here); PATCH ← {id, decision, resolution?}
// behind a confirm — APPROVED reattributes the deal + re-syncs commission.

type Dispute = {
  id: string;
  dealId: string;
  dealValue: number | null;
  dealStatus: string;
  currentBroker: { brokerId: string; name: string; email: string } | null;
  project: { id: string; name: string } | null;
  lead: { id: string; leadCode: string | null; name: string } | null;
  claimant: { id: string; name: string; email: string };
  reason: string;
  evidence: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
};

function DisputesPanel() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const mutation = useMutation();
  const [showFile, setShowFile] = useState(false);
  const [dealId, setDealId] = useState('');
  const [claimantId, setClaimantId] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refresh } = useApi<{ disputes?: Dispute[] }>('/api/ceo/disputes');
  const { data: brokerData } = useApi<{ brokers?: BrokerOpt[] }>('/api/ceo/brokers');
  const disputes = data?.disputes ?? [];
  const brokers = brokerData?.brokers ?? [];

  async function file() {
    if (!dealId.trim()) {
      setFormError(t('ceoD.dp.dealRequired'));
      return;
    }
    if (!claimantId) {
      setFormError(t('ceoD.dp.claimantRequired'));
      return;
    }
    if (!reason.trim()) {
      setFormError(t('ceoD.dp.reasonRequired'));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await mutation.run('/api/ceo/disputes', 'POST', {
        dealId: dealId.trim(),
        claimantId,
        reason: reason.trim(),
        ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
      });
      setShowFile(false);
      setDealId('');
      setClaimantId('');
      setReason('');
      setEvidence('');
      setNotice(t('ceoD.dp.filed'));
      refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  function decide(dispute: Dispute, decision: 'APPROVED' | 'REJECTED') {
    Alert.alert(
      t('ceoD.dp.decideTitle'),
      t(decision === 'APPROVED' ? 'ceoD.dp.decideBodyApprove' : 'ceoD.dp.decideBodyReject'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: decision === 'APPROVED' ? 'default' : 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              setProblem(null);
              try {
                await mutation.run('/api/ceo/disputes', 'PATCH', {
                  id: dispute.id,
                  decision,
                  ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
                });
                setNotice(t('ceoD.dp.resolved'));
                setResolving(null);
                setResolution('');
                refresh();
              } catch (e) {
                setProblem(e instanceof Error ? e.message : t('common.error'));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <>
      <SectionTitle
        action={<Btn title={t('ceoD.dp.file')} variant="ghost" onPress={() => setShowFile(!showFile)} />}>
        {t('ceoD.dp.title')}
      </SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceoD.dp.hint')}</Text>
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {showFile ? (
        <Card>
          <Field label={t('ceoD.dp.dealId')} value={dealId} onChangeText={setDealId} autoCapitalize="none" />
          <Text style={[styles.groupLabel, align]}>{t('ceoD.dp.claimant')}</Text>
          <View style={[styles.filters, row]}>
            {brokers.map((b) => {
              // Disputes API expects the claimant's USER id (not the profile id).
              const uid = b.user?.id;
              if (!uid) return null;
              return (
                <Chip
                  key={b.id}
                  label={b.user?.name || b.id.slice(0, 8)}
                  selected={claimantId === uid}
                  onPress={() => setClaimantId(claimantId === uid ? '' : uid)}
                />
              );
            })}
          </View>
          <Field label={t('ceoD.dp.reason')} value={reason} onChangeText={setReason} multiline />
          <Field label={t('ceoD.dp.evidence')} value={evidence} onChangeText={setEvidence} multiline />
          {formError ? <ErrorBar message={formError} /> : null}
          <View style={[styles.actions, row]}>
            <Btn
              title={t('ceoD.dp.submit')}
              style={styles.action}
              busy={busy || mutation.busy}
              onPress={() => void file()}
            />
            <Btn
              title={t('common.cancel')}
              variant="ghost"
              style={styles.action}
              onPress={() => setShowFile(false)}
            />
          </View>
        </Card>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading label={t('common.loading')} />
      ) : !error && disputes.length === 0 ? (
        <Empty title={t('ceoD.dp.none')} message={t('ceoD.dp.noneHint')} />
      ) : (
        disputes.map((dispute, index) => {
          const open = dispute.status === 'OPEN';
          const expanded = resolving === dispute.id;
          return (
            <View key={dispute.id}>
              {index > 0 ? <Divider /> : null}
              <Card style={styles.card}>
                <Row
                  title={
                    dispute.lead
                      ? dispute.lead.leadCode
                        ? `${dispute.lead.leadCode} · ${dispute.lead.name}`
                        : dispute.lead.name
                      : (dispute.project?.name ?? dispute.dealId.slice(0, 8))
                  }
                  subtitle={[
                    dispute.currentBroker ? `${t('common.broker')}: ${dispute.currentBroker.name}` : null,
                    `${t('ceoD.dp.claimant')}: ${dispute.claimant?.name ?? dispute.claimant?.email ?? '—'}`,
                    dispute.reason,
                    dispute.resolution,
                    formatDate(dispute.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={
                    <Badge tone={open ? 'red' : 'muted'}>
                      {open ? t('ceoD.dp.open') : humanise(dispute.status)}
                    </Badge>
                  }
                  right={
                    <Text style={styles.amount}>
                      {formatMoney(dispute.dealValue ?? 0, currency, rates, { compact: true })}
                    </Text>
                  }
                />
                {open ? (
                  <View style={[styles.actions, row]}>
                    <Btn
                      title={t('ceoD.dp.approve')}
                      variant="primary"
                      style={styles.action}
                      onPress={() => {
                        setResolving(expanded ? null : dispute.id);
                        setResolution('');
                      }}
                    />
                    <Btn
                      title={t('ceoD.dp.reject')}
                      variant="danger"
                      style={styles.action}
                      onPress={() => {
                        setResolving(expanded ? null : dispute.id);
                        setResolution('');
                      }}
                    />
                  </View>
                ) : null}
                {open && expanded ? (
                  <Card>
                    <Field
                      label={t('ceoD.dp.resolution')}
                      value={resolution}
                      onChangeText={setResolution}
                      multiline
                    />
                    <View style={[styles.actions, row]}>
                      <Btn
                        title={t('ceoD.dp.approve')}
                        variant="primary"
                        style={styles.action}
                        busy={busy}
                        onPress={() => decide(dispute, 'APPROVED')}
                      />
                      <Btn
                        title={t('ceoD.dp.reject')}
                        variant="danger"
                        style={styles.action}
                        busy={busy}
                        onPress={() => decide(dispute, 'REJECTED')}
                      />
                    </View>
                  </Card>
                ) : null}
              </Card>
            </View>
          );
        })
      )}
    </>
  );
}

// ─── Routing: GET|POST /api/ceo/routing ──────────────────────────
// The doc IS the body: {mode, weights, whitelist, fallback}. Lives in the
// growth settings tab (not platform settings.tsx — that screen owns
// /api/settings sections only, and routing bypasses that route entirely).

type RoutingDoc = {
  mode: 'off' | 'round-robin';
  weights?: Record<string, number>;
  whitelist?: string[];
  fallback?: 'unassigned' | 'first-active';
};

function RoutingPanel() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const mutation = useMutation();
  const [mode, setMode] = useState<'off' | 'round-robin'>('off');
  const [fallback, setFallback] = useState<'unassigned' | 'first-active'>('unassigned');
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refresh } = useApi<RoutingDoc>('/api/ceo/routing');
  const { data: brokerData } = useApi<{ brokers?: BrokerOpt[] }>('/api/ceo/brokers');
  const brokers = brokerData?.brokers ?? [];

  // Seed the editors once the doc arrives; a failed load never clears them.
  useEffect(() => {
    if (!data) return;
    setMode(data.mode === 'round-robin' ? 'round-robin' : 'off');
    setFallback(data.fallback === 'first-active' ? 'first-active' : 'unassigned');
    setWhitelist(data.whitelist ?? []);
    const w: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.weights ?? {})) w[k] = String(v);
    setWeights(w);
  }, [data]);

  function toggleWhite(id: string) {
    setWhitelist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    const w: Record<string, number> = {};
    for (const [k, v] of Object.entries(weights)) {
      if (v.trim() === '') continue;
      const n = Number(v.trim());
      if (!Number.isFinite(n) || n < 0) {
        setProblem(t('common.error'));
        return;
      }
      w[k] = n;
    }
    setSaving(true);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/routing', 'POST', { mode, weights: w, whitelist, fallback });
      setNotice(t('ceoD.rt.saved'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label={t('common.loading')} />;

  return (
    <Card>
      <SectionTitle>{t('ceoD.rt.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceoD.rt.hint')}</Text>
      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}
      <Text style={[styles.groupLabel, align]}>{t('ceoD.rt.mode')}</Text>
      <View style={[styles.filters, row]}>
        <Chip label={t('ceoD.rt.off')} selected={mode === 'off'} onPress={() => setMode('off')} />
        <Chip
          label={t('ceoD.rt.roundRobin')}
          selected={mode === 'round-robin'}
          onPress={() => setMode('round-robin')}
        />
      </View>
      <Text style={[styles.groupLabel, align]}>{t('ceoD.rt.fallback')}</Text>
      <View style={[styles.filters, row]}>
        <Chip
          label={t('ceoD.rt.unassigned')}
          selected={fallback === 'unassigned'}
          onPress={() => setFallback('unassigned')}
        />
        <Chip
          label={t('ceoD.rt.firstActive')}
          selected={fallback === 'first-active'}
          onPress={() => setFallback('first-active')}
        />
      </View>
      <Text style={[styles.groupLabel, align]}>{t('ceoD.rt.whitelist')}</Text>
      <View style={[styles.filters, row]}>
        {brokers.map((b) => (
          <Chip
            key={b.id}
            label={b.user?.name || b.id.slice(0, 8)}
            selected={whitelist.includes(b.id)}
            onPress={() => toggleWhite(b.id)}
          />
        ))}
      </View>
      {whitelist.length > 0 ? (
        <>
          <Text style={[styles.groupLabel, align]}>{t('ceoD.rt.weight')}</Text>
          {whitelist.map((id) => (
            <Field
              key={id}
              label={brokers.find((b) => b.id === id)?.user?.name || id.slice(0, 8)}
              value={weights[id] ?? '1'}
              onChangeText={(next) => setWeights((prev) => ({ ...prev, [id]: next }))}
              keyboardType="decimal-pad"
            />
          ))}
        </>
      ) : null}
      <Btn title={t('ceoD.rt.save')} busy={saving || mutation.busy} onPress={() => void save()} />
    </Card>
  );
}

// ─── Audit viewer: GET /api/ceo/audit ────────────────────────────
// ?action=&entity=&userId=&from=&to=&limit= → {items}. Newest first; each
// item carries the actor name/email plus the raw changes payload.

type AuditItem = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  changes: unknown;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
};

function AuditPanel() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [limit, setLimit] = useState('50');

  const params = new URLSearchParams();
  if (action.trim()) params.set('action', action.trim());
  if (entity.trim()) params.set('entity', entity.trim());
  params.set('limit', limit);

  const { data, error, loading, refresh } = useApi<{ items?: AuditItem[] }>(
    `/api/ceo/audit?${params.toString()}`,
  );
  const items = data?.items ?? [];

  return (
    <>
      <SectionTitle>{t('ceoD.au.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceoD.au.hint')}</Text>
      <Field label={t('ceoD.au.action')} value={action} onChangeText={setAction} autoCapitalize="none" />
      <Field label={t('ceoD.au.entity')} value={entity} onChangeText={setEntity} autoCapitalize="none" />
      <Text style={[styles.groupLabel, align]}>{t('ceoD.au.limit')}</Text>
      <View style={[styles.filters, row]}>
        {['25', '50', '100', '200'].map((n) => (
          <Chip key={n} label={n} selected={limit === n} onPress={() => setLimit(n)} />
        ))}
      </View>
      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading label={t('common.loading')} />
      ) : !error && items.length === 0 ? (
        <Empty title={t('ceoD.au.none')} message={t('ceoD.au.noneHint')} />
      ) : (
        <Card style={styles.card}>
          {items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={item.action}
                subtitle={[
                  item.entity,
                  item.userName || item.userEmail,
                  formatDate(item.createdAt, true),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={<Badge tone="muted">{humanise(item.entity ?? '')}</Badge>}
              />
              {item.changes != null && typeof item.changes === 'object' ? (
                <Text style={[styles.share, align]} numberOfLines={2}>
                  {JSON.stringify(item.changes).slice(0, 160)}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

/* ─── Close deal — POST /api/ceo/deals ───────────────────────────────── */

type CloseLead = {
  id: string;
  leadCode: string | null;
  name: string;
  phone: string;
  status: string;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  broker?: { id: string; user?: { name?: string | null } | null } | null;
};

type CloseUnit = { id: string; name: string };

type CloseResult = {
  deal?: { id: string; status?: string; dealValue?: number | null } | null;
  commission?: Commission | null;
  created?: boolean;
};

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { row, align } = useI18n();
  const { t: theme } = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.sheetHead, row]}>
              <Text style={[styles.sheetTitle, align]}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={title}>
                <Ionicons name="close" size={20} color={theme.mutedForeground} />
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * The CEO close-deal form: lead + attributed broker + value are required,
 * stage defaults to SOLD, dates stamp the chosen stage, source defaults to
 * PLATFORM, and project/unit/rule/notes are optional overrides. The server
 * recomputes the commission — the returned record is shown back, never a
 * client-side guess.
 */
function CloseDealSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const mutation = useMutation();
  const [leadSearch, setLeadSearch] = useState('');
  const [leadId, setLeadId] = useState('');
  const [brokerId, setBrokerId] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState<(typeof CLOSE_STAGES)[number]>('SOLD');
  const [resDate, setResDate] = useState('');
  const [conDate, setConDate] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [source, setSource] = useState<(typeof CLOSE_SOURCES)[number]>('PLATFORM');
  const [projectId, setProjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [ruleId, setRuleId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CloseResult | null>(null);

  const leadQs = leadSearch.trim() ? `?search=${encodeURIComponent(leadSearch.trim())}` : '';
  const { data: leadData, error: leadsError } = useApi<{ leads?: CloseLead[] }>(
    `/api/ceo/leads${leadQs}`,
  );
  const { data: brokerData } = useApi<{ brokers?: BrokerOpt[] }>('/api/ceo/brokers');
  const { data: projectData } = useApi<{ projects?: ProjOpt[] }>('/api/projects?limit=100');
  const { data: unitData } = useApi<{ units?: CloseUnit[] }>(
    projectId ? `/api/ceo/units?projectId=${encodeURIComponent(projectId)}` : null,
  );
  const { data: cfgData } = useApi<GrowthConfig>('/api/ceo/growth-config');

  const leads = (leadData?.leads ?? []).slice(0, 30);
  const brokers = brokerData?.brokers ?? [];
  const projects = projectData?.projects ?? [];
  const units = unitData?.units ?? [];
  const rules = (cfgData?.rules ?? []).filter((rule) => rule.isActive);
  const pickedLead = leads.find((lead) => lead.id === leadId) ?? null;

  function validate(): MessageKey | null {
    if (!leadId) return 'ceoD.close.leadRequired';
    if (!brokerId) return 'ceoD.close.brokerRequired';
    const n = Number(value.trim());
    if (!value.trim() || !Number.isFinite(n) || n <= 0) return 'ceoD.close.valueRequired';
    if (!isDateLike(resDate) || !isDateLike(conDate) || !isDateLike(saleDate)) {
      return 'ceoD.close.badDate';
    }
    return null;
  }

  async function submit() {
    const bad = validate();
    if (bad) {
      setFormError(t(bad));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        leadId,
        brokerId,
        dealValue: Number(value.trim()),
        status: stage,
        source,
      };
      if (projectId) body.projectId = projectId;
      if (unitId) body.unitId = unitId;
      if (ruleId) body.ruleId = ruleId;
      if (notes.trim()) body.notes = notes.trim();
      const resDateIso = dateOrNull(resDate);
      const conDateIso = dateOrNull(conDate);
      const saleDateIso = dateOrNull(saleDate);
      if (resDateIso) body.reservationDate = resDateIso;
      if (conDateIso) body.contractDate = conDateIso;
      if (saleDateIso) body.saleDate = saleDateIso;
      const res = (await mutation.run('/api/ceo/deals', 'POST', body)) as CloseResult;
      setResult(res ?? null);
      onSaved(t('ceoD.close.closed'));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const commission = result?.commission ?? null;

  return (
    <Sheet title={t('ceoD.close.title')} onClose={onClose}>
      {result ? (
        <Card>
          <Text style={[styles.resultTitle, align]}>
            {`${t('ceoD.close.closed')} ✓ — ${humanise(result.deal?.status ?? stage)}`}
          </Text>
          <Text style={[styles.resultValue, align]}>
            {formatMoney(result.deal?.dealValue ?? Number(value.trim()), currency, rates)}
          </Text>
          {commission ? (
            <>
              <Text style={[styles.resultRow, align]}>
                {`${t('ceoD.close.commission')}: ${formatMoney(commission.totalAmount ?? 0, currency, rates)}`}
              </Text>
              <Text style={[styles.resultRow, align]}>
                {`${t('ceoD.close.brokerShare')}: ${formatMoney(commission.brokerAmount ?? 0, currency, rates)}`}
              </Text>
            </>
          ) : (
            <Text style={[styles.hint, align]}>{t('ceoD.close.noCommission')}</Text>
          )}
          <Btn title={t('ceoD.close.done')} variant="ghost" onPress={onClose} />
        </Card>
      ) : null}

      <Text style={[styles.groupLabel, align]}>{t('ceoD.close.lead')}</Text>
      <SearchBar
        value={leadSearch}
        onChangeText={setLeadSearch}
        placeholder={t('ceoD.close.searchLeads')}
      />
      {leadsError ? <ErrorBar message={leadsError} /> : null}
      {leads.length === 0 ? (
        <Text style={[styles.hint, align]}>{t('ceoD.close.noLeads')}</Text>
      ) : (
        leads.map((lead) => {
          const picked = leadId === lead.id;
          return (
            <Pressable
              key={lead.id}
              onPress={() => setLeadId(picked ? '' : lead.id)}
              style={[styles.pickRow, picked && styles.pickRowOn]}>
              <View style={styles.pickMain}>
                <Text style={[styles.pickName, align]} numberOfLines={1}>
                  {lead.leadCode ? `${lead.leadCode} · ${lead.name}` : lead.name}
                </Text>
                <Text style={[styles.pickSub, align]} numberOfLines={1}>
                  {[lead.phone, lead.project?.name, humanise(lead.status)].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}

      <Text style={[styles.groupLabel, align]}>{t('ceoD.close.broker')}</Text>
      <View style={[styles.filters, row]}>
        {brokers.map((broker) => (
          <Chip
            key={broker.id}
            label={broker.user?.name || broker.id.slice(0, 8)}
            selected={brokerId === broker.id}
            onPress={() => setBrokerId(brokerId === broker.id ? '' : broker.id)}
          />
        ))}
      </View>

      <Field
        label={t('ceoD.close.value')}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
      />

      <Text style={[styles.groupLabel, align]}>{t('ceoD.close.stage')}</Text>
      <View style={[styles.filters, row]}>
        {CLOSE_STAGES.map((s) => (
          <Chip
            key={s}
            label={t(
              s === 'RESERVATION'
                ? 'ceoD.close.stageReservation'
                : s === 'CONTRACT'
                  ? 'ceoD.close.stageContract'
                  : 'ceoD.close.stageSold',
            )}
            selected={stage === s}
            onPress={() => setStage(s)}
          />
        ))}
      </View>

      <Field
        label={t('ceoD.close.resDate')}
        value={resDate}
        onChangeText={setResDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />
      <Field
        label={t('ceoD.close.conDate')}
        value={conDate}
        onChangeText={setConDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />
      <Field
        label={t('ceoD.close.saleDate')}
        value={saleDate}
        onChangeText={setSaleDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />

      <Text style={[styles.groupLabel, align]}>{t('ceoD.close.source')}</Text>
      <View style={[styles.filters, row]}>
        {CLOSE_SOURCES.map((s) => (
          <Chip
            key={s}
            label={t(s === 'PLATFORM' ? 'ceoD.close.srcPlatform' : 'ceoD.close.srcOffPlatform')}
            selected={source === s}
            onPress={() => setSource(s)}
          />
        ))}
      </View>

      <Text style={[styles.groupLabel, align]}>{t('ceoD.close.project')}</Text>
      <Text style={[styles.hint, align]}>{t('ceoD.close.projectHint')}</Text>
      {pickedLead?.project ? (
        <Text style={[styles.hint, align]}>
          {`${t('ceoD.close.lead')}: ${pickedLead.project.name}`}
        </Text>
      ) : null}
      <View style={[styles.filters, row]}>
        {projects.map((project) => (
          <Chip
            key={project.id}
            label={project.name}
            selected={projectId === project.id}
            onPress={() => {
              setProjectId(projectId === project.id ? '' : project.id);
              setUnitId('');
            }}
          />
        ))}
      </View>

      {projectId ? (
        <>
          <Text style={[styles.groupLabel, align]}>{t('ceoD.close.unit')}</Text>
          <View style={[styles.filters, row]}>
            <Chip
              label={t('ceoD.close.noUnit')}
              selected={!unitId}
              onPress={() => setUnitId('')}
            />
            {units.map((unit) => (
              <Chip
                key={unit.id}
                label={unit.name}
                selected={unitId === unit.id}
                onPress={() => setUnitId(unitId === unit.id ? '' : unit.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      {rules.length > 0 ? (
        <>
          <Text style={[styles.groupLabel, align]}>{t('ceoD.close.rule')}</Text>
          <View style={[styles.filters, row]}>
            <Chip
              label={t('ceoD.close.noRule')}
              selected={!ruleId}
              onPress={() => setRuleId('')}
            />
            {rules.map((rule) => (
              <Chip
                key={rule.id}
                label={rule.name}
                selected={ruleId === rule.id}
                onPress={() => setRuleId(ruleId === rule.id ? '' : rule.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <Field
        label={t('ceoD.close.notes')}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {formError ? <ErrorBar message={formError} /> : null}
      <View style={[styles.actions, row]}>
        <Btn
          title={t('ceoD.close.submit')}
          style={styles.action}
          busy={saving || mutation.busy}
          onPress={() => void submit()}
        />
        <Btn
          title={t('common.cancel')}
          variant="ghost"
          style={styles.action}
          onPress={onClose}
        />
      </View>
    </Sheet>
  );
}

function toneForStage(status: string): 'green' | 'red' | 'gold' | 'blue' {
  const s = (status ?? '').toUpperCase();
  if (['SOLD', 'PAID', 'APPROVED', 'ACTIVE'].includes(s)) return 'green';
  if (['CANCELLED', 'LOST', 'DISPUTED', 'REJECTED', 'SUSPENDED', 'EXPIRED'].includes(s)) return 'red';
  if (['RESERVATION', 'CONTRACT', 'PENDING', 'INVOICED', 'DUE', 'UNDER_REVIEW'].includes(s)) return 'gold';
  return 'blue';
}

function protectionTone(status: ProtLead['protectionStatus']): 'green' | 'gold' | 'red' | 'muted' {
  if (status === 'PROTECTED') return 'green';
  if (status === 'EXPIRING_SOON') return 'gold';
  if (status === 'EXPIRED') return 'red';
  return 'muted';
}

function partnershipTone(status: string): 'green' | 'red' | 'gold' | 'blue' {
  return toneForStage(status);
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { flexWrap: 'wrap', justifyContent: 'space-around', paddingVertical: Spacing.md },
    kpi: { flexGrow: 1, flexBasis: '30%', minWidth: 96, alignItems: 'center' },
    filters: { flexWrap: 'wrap', gap: 8 },
    groupLabel: { color: t.mutedForeground, fontSize: 13, fontWeight: '600', marginTop: Spacing.sm },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 6, marginTop: Spacing.xs },
    amount: { color: t.primary, fontSize: 14, fontWeight: '800' },
    amountBlock: { alignItems: 'flex-end', gap: 2, maxWidth: 140 },
    share: { color: t.mutedForeground, fontSize: 11, textAlign: 'right' },
    actions: { gap: 8, flexWrap: 'wrap' },
    action: { flexGrow: 1, minWidth: 110 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    sheet: {
      width: '100%',
      maxWidth: 480,
      maxHeight: '92%',
      backgroundColor: t.popover,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xl,
      overflow: 'hidden',
    },
    sheetBody: { padding: 16, gap: 8 },
    sheetHead: { alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' },
    sheetTitle: { color: t.foreground, fontSize: 17, lineHeight: 24, fontWeight: '700', flex: 1 },
    pickRow: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      padding: 10,
    },    pickRowOn: { borderColor: t.primary, backgroundColor: t.muted },
    pickMain: { gap: 2 },
    pickName: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    pickSub: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
    resultTitle: { color: t.successFg, fontSize: 15, fontWeight: '700' },    resultValue: { color: t.primary, fontSize: 20, fontWeight: '800' },
    resultRow: { color: t.foreground, fontSize: 14 },
    barOuter: {
      height: 6,
      borderRadius: 3,
      backgroundColor: t.muted,
      overflow: 'hidden',
      marginTop: 4,
    },
    barInner: { height: 6, borderRadius: 3, backgroundColor: t.primary },
  }),
);
