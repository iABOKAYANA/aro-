import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

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
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

type DeveloperProject = {
  id: string;
  name: string;
  status?: string;
  approvalStatus?: string;
  isActive: boolean;
  location?: string;
  viewCount?: number;
};

type Partnership = {
  status: string;
  isActive: boolean;
  allProjectsApproved: boolean;
  approvedProjectIds: string[];
  allowedBrokerIds: string[];
  blockedBrokerIds: string[];
  commissionAgreement: string | null;
  leadProtectionDays: number | null;
  startDate: string | null;
  endDate: string | null;
  terms: string | null;
  reviewNote?: string | null;
};

type Developer = {
  id: string;
  userId: string;
  companyName: string;
  companyNameArabic?: string | null;
  contactEmail: string;
  contactPhone: string;
  website?: string | null;
  crNumber?: string | null;
  taxId?: string | null;
  foundedYear?: number | null;
  headquarters?: string | null;
  description?: string | null;
  rating?: number;
  isVerified: boolean;
  accountStatus: string;
  isActive: boolean;
  editMode?: string | null;
  totalProjects?: number;
  totalUnitsSold?: number;
  soldValue?: number;
  leadCount?: number;
  leadsLast30Days?: number;
  projects: DeveloperProject[];
  partnership: Partnership | null;
};

type BrokerLite = { id: string; name: string; email: string };

/** One row of `GET /api/ceo/edit-requests?status=` with its review context. */
type EditRequest = {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  oldValue: string | null;
  newValue: string;
  message: string | null;
  developerId: string;
  status: string;
  reason: string | null;
  createdAt: string;
  developer?: {
    id: string;
    name?: string | null;
    email?: string | null;
    companyName?: string | null;
  } | null;
  project?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
  plan?: { id: string; name: string } | null;
};

type ReqFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const REQ_FILTERS: ReqFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

type StatusFilter = 'ALL' | 'VERIFIED' | 'UNVERIFIED' | 'ACTIVE' | 'SUSPENDED';
type SortKey = 'projects' | 'units' | 'name';

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'VERIFIED', 'UNVERIFIED', 'ACTIVE', 'SUSPENDED'];

/** The three sorts the website's sort bar offers. */
const SORTS: { key: SortKey; labelKey: MessageKey }[] = [
  { key: 'projects', labelKey: 'ceo.projects' },
  { key: 'units', labelKey: 'ceo.units' },
  { key: 'name', labelKey: 'common.name' },
];

/** Exactly the statuses `partnershipSchema` accepts. */
const PARTNERSHIP_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'EXPIRED',
];

const MAX_RENDER = 60;

/**
 * First-page size for the opt-in cursor pagination
 * (`GET /api/ceo/developers?limit=` → `{ items, nextCursor }`). No `limit`
 * param means the legacy `{ developers }` full list — the pager falls back.
 */
const PAGE_LIMIT = 50;

type StatusAction = { action: string; labelKey: MessageKey; variant: 'primary' | 'ghost' };

/**
 * The legal moves out of each approval status — the same state machine
 * `POST /api/ceo/projects/[id]/status` enforces, borrowed from the CEO
 * projects console so a tap here can never be answered with
 * "Cannot publish project in DRAFT status".
 */
const ACTIONS: Record<string, StatusAction[]> = {
  DRAFT: [
    { action: 'submit', labelKey: 'ceo.submitReview', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  PENDING: [
    { action: 'approve', labelKey: 'ceo.approve', variant: 'primary' },
    { action: 'restore', labelKey: 'ceo.restoreDraft', variant: 'ghost' },
  ],
  APPROVED: [
    { action: 'publish', labelKey: 'ceo.publish', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  REJECTED: [{ action: 'submit', labelKey: 'ceo.submitReview', variant: 'primary' }],
  PUBLISHED: [
    { action: 'unpublish', labelKey: 'ceo.unpublish', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  HIDDEN: [
    { action: 'publish', labelKey: 'ceo.publish', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  ARCHIVED: [{ action: 'restore', labelKey: 'ceo.restoreDraft', variant: 'primary' }],
};

/** Every field the website's Edit developer modal posts. */
type EditForm = {
  companyName: string;
  companyNameArabic: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  crNumber: string;
  taxId: string;
  foundedYear: string;
  headquarters: string;
  rating: string;
  description: string;
};

/** Every field the website's Partnership modal posts. */
type PartnerForm = {
  status: string;
  isActive: boolean;
  allProjectsApproved: boolean;
  leadProtectionDays: string;
  commissionAgreement: string;
  terms: string;
  startDate: string;
  endDate: string;
  reviewNote: string;
  approved: string[];
  allowed: string[];
  blocked: string[];
};

/**
 * Developer management: verify, suspend, edit and govern partnerships for
 * every developer company — the website's developers page, sized for a phone.
 *
 * Reads `GET /api/ceo/developers`, writes through `PATCH /api/ceo/developers/[id]`
 * (profile + verification), `PATCH /api/ceo/users` (suspend/reactivate, the
 * same `{ userId, status, isActive }` payload the site sends), `POST
 * /api/ceo/partnerships` (`PARTNERSHIP_UPSERT`), `PATCH /api/ceo/projects/[id]`
 * (show/hide) and `POST /api/ceo/projects/[id]/status` (approval moves). Remove
 * is the route's `?hard=true` delete, which refuses while the company still
 * owns projects or deals — the server's message is what the user reads.
 */
export default function CeoDevelopersScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('projects');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [panel, setPanel] = useState<'edit' | 'partnership' | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [partner, setPartner] = useState<PartnerForm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Edit-request inbox — a section below the directory, fetched only while open.
  const [reqOpen, setReqOpen] = useState(false);
  const [reqFilter, setReqFilter] = useState<ReqFilter>('PENDING');
  const [reqExpanded, setReqExpanded] = useState<string | null>(null);
  const [reqNote, setReqNote] = useState('');
  const [reqBusy, setReqBusy] = useState<string | null>(null);
  // Cursor-pager accumulation: page 1 arrives via `useApi`, later pages append
  // through `loadMore`. `cursor` is the outstanding `nextCursor` (null = done
  // or legacy mode); it resets whenever the first-page response changes.
  const { session } = useAuth();
  const [extra, setExtra] = useState<Developer[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useApi<{
    developers?: Developer[];
    items?: Developer[];
    nextCursor?: string | null;
  }>(`/api/ceo/developers?limit=${PAGE_LIMIT}`);
  const reqParams = reqFilter === 'ALL' ? '' : `?status=${reqFilter}`;
  const reqQuery = useApi<{ requests?: EditRequest[] }>(
    reqOpen ? `/api/ceo/edit-requests${reqParams}` : null,
  );
  // The broker directory only matters while the partnership form is open.
  const { data: brokerData, error: brokerError, loading: brokerLoading } =
    useApi<{ brokers?: BrokerLite[] }>(panel === 'partnership' ? '/api/ceo/brokers' : null);
  const mutation = useMutation();

  useEffect(() => {
    setExtra([]);
    setMoreError(null);
    setCursor(data && Array.isArray(data.items) ? (data.nextCursor ?? null) : null);
  }, [data]);

  const pageItems = data && Array.isArray(data.items) ? data.items : null;
  const isPaged = pageItems !== null;
  const developers = pageItems ? [...pageItems, ...extra] : (data?.developers ?? []);
  const brokers = brokerData?.brokers ?? [];

  /** One write path for every action: busy key, error strip, success notice. */
  async function write(key: string, run: () => Promise<void>, success?: string): Promise<boolean> {
    setBusyId(key);
    setProblem(null);
    setNotice(null);
    try {
      await run();
      if (success) setNotice(success);
      refresh();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function toggleVerify(dev: Developer) {
    const next = !dev.isVerified;
    void write(
      dev.id,
      async () => {
        await mutation.run(`/api/ceo/developers/${dev.id}`, 'PATCH', { isVerified: next });
      },
      t('ceoCat.verificationUpdated'),
    );
  }

  /** Suspend / reactivate — the site patches the *user*, not the profile. */
  function toggleAccount(dev: Developer) {
    const active = dev.accountStatus === 'ACTIVE' && dev.isActive;
    const status = active ? 'SUSPENDED' : 'ACTIVE';
    void write(
      dev.id,
      async () => {
        await mutation.run('/api/ceo/users', 'PATCH', {
          userId: dev.userId,
          status,
          isActive: !active,
        });
      },
      t('ceoCat.accountUpdated'),
    );
  }

  /**
   * Edit permission: DIRECT lets the developer PATCH/DELETE own rows,
   * REQUEST blocks those writes (403 `requestOnly`) and forces the
   * edit-request flow below. New profiles default to REQUEST server-side.
   */
  function setEditMode(dev: Developer, editMode: 'DIRECT' | 'REQUEST') {
    if ((dev.editMode ?? 'REQUEST') === editMode) return;
    void write(
      dev.id,
      async () => {
        await mutation.run(`/api/ceo/developers/${dev.id}`, 'PATCH', { editMode });
      },
      t('ceoSt.editModeUpdated'),
    );
  }

  /** Approve/reject an edit request — confirms first, applies server-side. */
  async function decideRequest(req: EditRequest, decision: 'APPROVED' | 'REJECTED') {
    const title = decision === 'APPROVED' ? t('ceoSt.reqApproveTitle') : t('ceoSt.reqRejectTitle');
    const body = decision === 'APPROVED' ? t('ceoSt.reqApproveBody') : t('ceoSt.reqRejectBody');
    Alert.alert(title, body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: decision === 'APPROVED' ? t('ceo.approve') : t('ceo.reject'),
        style: decision === 'APPROVED' ? 'default' : 'destructive',
        onPress: () => void sendDecision(req, decision),
      },
    ]);
  }

  async function sendDecision(req: EditRequest, decision: 'APPROVED' | 'REJECTED') {
    setReqBusy(req.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/edit-requests', 'PATCH', {
        id: req.id,
        decision,
        ...(reqNote.trim() ? { reason: reqNote.trim() } : {}),
      });
      setReqNote('');
      setReqExpanded(null);
      setNotice(t(decision === 'APPROVED' ? 'ceoSt.reqApprovedOk' : 'ceoSt.reqRejectedOk'));
      reqQuery.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setReqBusy(null);
    }
  }

  function openEdit(dev: Developer) {
    setPanel('edit');
    setProblem(null);
    setNotice(null);
    setEdit({
      companyName: dev.companyName ?? '',
      companyNameArabic: dev.companyNameArabic ?? '',
      contactEmail: dev.contactEmail ?? '',
      contactPhone: dev.contactPhone ?? '',
      website: dev.website ?? '',
      crNumber: dev.crNumber ?? '',
      taxId: dev.taxId ?? '',
      foundedYear: dev.foundedYear ? String(dev.foundedYear) : '',
      headquarters: dev.headquarters ?? '',
      rating: String(dev.rating ?? 0),
      description: dev.description ?? '',
    });
  }

  /** Same rules the PATCH route enforces, checked before the round trip. */
  async function saveEdit(dev: Developer) {
    if (!edit) return;
    const name = edit.companyName.trim();
    if (!name) {
      setProblem(t('ceoCat.companyRequired'));
      return;
    }
    const rating = Number(edit.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      setProblem(t('ceoCat.ratingRange'));
      return;
    }
    const foundedRaw = edit.foundedYear.trim();
    let foundedYear: number | null = null;
    if (foundedRaw) {
      const year = Number(foundedRaw);
      if (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear()) {
        setProblem(t('ceoCat.foundedRange'));
        return;
      }
      foundedYear = year;
    }
    const ok = await write(
      dev.id,
      async () => {
        await mutation.run(`/api/ceo/developers/${dev.id}`, 'PATCH', {
          companyName: name,
          companyNameArabic: edit.companyNameArabic.trim(),
          contactEmail: edit.contactEmail.trim(),
          contactPhone: edit.contactPhone.trim(),
          website: edit.website.trim(),
          crNumber: edit.crNumber.trim(),
          taxId: edit.taxId.trim(),
          foundedYear,
          headquarters: edit.headquarters.trim(),
          rating,
          description: edit.description.trim(),
        });
      },
      t('ceoCat.developerUpdated'),
    );
    if (ok) {
      setPanel(null);
      setEdit(null);
    }
  }

  function openPartnership(dev: Developer) {
    const p = dev.partnership;
    setPanel('partnership');
    setProblem(null);
    setNotice(null);
    setPartner({
      status: p?.status ?? 'PENDING',
      isActive: p?.isActive ?? true,
      allProjectsApproved: p?.allProjectsApproved ?? true,
      leadProtectionDays: p?.leadProtectionDays != null ? String(p.leadProtectionDays) : '',
      commissionAgreement: p?.commissionAgreement ?? '',
      terms: p?.terms ?? '',
      startDate: p?.startDate ? p.startDate.slice(0, 10) : '',
      endDate: p?.endDate ? p.endDate.slice(0, 10) : '',
      reviewNote: p?.reviewNote ?? '',
      approved: p?.approvedProjectIds ?? [],
      allowed: p?.allowedBrokerIds ?? [],
      blocked: p?.blockedBrokerIds ?? [],
    });
  }

  function toIso(value: string): string | null | 'invalid' {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? 'invalid' : date.toISOString();
  }

  /** Mirrors `partnershipSchema` before the POST so a bad value never 400s. */
  async function savePartnership(dev: Developer) {
    if (!partner) return;
    const leadRaw = partner.leadProtectionDays.trim();
    let leadProtectionDays: number | null = null;
    if (leadRaw) {
      const days = Number(leadRaw);
      if (!Number.isInteger(days) || days < 1 || days > 730) {
        setProblem(t('ceoCat.leadProtectionRange'));
        return;
      }
      leadProtectionDays = days;
    }
    const startDate = toIso(partner.startDate);
    const endDate = toIso(partner.endDate);
    if (startDate === 'invalid' || endDate === 'invalid') {
      setProblem(t('ceoCat.invalidDate'));
      return;
    }
    const ok = await write(
      dev.id,
      async () => {
        await mutation.run('/api/ceo/partnerships', 'POST', {
          type: 'PARTNERSHIP_UPSERT',
          partnership: {
            developerId: dev.id,
            status: partner.status,
            isActive: partner.isActive,
            allProjectsApproved: partner.allProjectsApproved,
            approvedProjectIds: partner.approved,
            allowedBrokerIds: partner.allowed,
            blockedBrokerIds: partner.blocked,
            leadProtectionDays,
            commissionAgreement: partner.commissionAgreement.trim() || null,
            terms: partner.terms.trim() || null,
            startDate,
            endDate,
            reviewNote: partner.reviewNote.trim() || null,
          },
        });
      },
      t('ceoCat.partnershipSaved'),
    );
    if (ok) {
      setPanel(null);
      setPartner(null);
    }
  }

  function toggleProjectVisible(dev: Developer, project: DeveloperProject) {
    const next = !project.isActive;
    void write(
      `${dev.id}:${project.id}`,
      async () => {
        await mutation.run(`/api/ceo/projects/${project.id}`, 'PATCH', { isActive: next });
      },
      t('ceoCat.projectUpdated'),
    );
  }

  function changeApproval(dev: Developer, project: DeveloperProject, action: string) {
    void write(
      `${dev.id}:${project.id}`,
      async () => {
        await mutation.run(`/api/ceo/projects/${project.id}/status`, 'POST', { action });
      },
      t('ceoCat.projectUpdated'),
    );
  }

  function confirmRemove(dev: Developer) {
    Alert.alert(t('ceoCat.removeTitle'), `${dev.companyName}\n\n${t('ceoCat.removeBody')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('ceoCat.remove'),
        style: 'destructive',
        onPress: () => {
          void write(
            dev.id,
            async () => {
              await mutation.run(`/api/ceo/developers/${dev.id}?hard=true`, 'DELETE');
              setExpanded(null);
              setPanel(null);
            },
            t('ceoCat.developerRemoved'),
          );
        },
      },
    ]);
  }

  /** Append the next cursor page. Guarded by `cursor == null` in legacy mode. */
  async function loadMore() {
    if (moreBusy || cursor == null) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await apiFetch<{ items?: Developer[]; nextCursor?: string | null }>(
        `/api/ceo/developers?limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`,
        { token: session?.token ?? null, cookieName: session?.cookieName ?? null },
      );
      const fresh = Array.isArray(page?.items) ? page.items : [];
      setExtra((prev) => {
        const seen = new Set([...(pageItems ?? []), ...prev].map((d) => d.id));
        return [...prev, ...fresh.filter((d) => !seen.has(d.id))];
      });
      setCursor(page?.nextCursor ?? null);
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setMoreBusy(false);
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const counts = {
    total: developers.length,
    verified: developers.filter((d) => d.isVerified).length,
    suspended: developers.filter((d) => !(d.accountStatus === 'ACTIVE' && d.isActive)).length,
    projects: developers.reduce((sum, d) => sum + (d.totalProjects ?? 0), 0),
  };

  // Same search / filter / sort pipeline as the website, over the same fields.
  const needle = query.trim().toLowerCase();
  const filtered = developers
    .filter((d) => {
      if (needle) {
        const matches =
          d.companyName.toLowerCase().includes(needle) ||
          (d.companyNameArabic ?? '').toLowerCase().includes(needle) ||
          d.contactEmail.toLowerCase().includes(needle);
        if (!matches) return false;
      }
      const active = d.accountStatus === 'ACTIVE' && d.isActive;
      switch (filter) {
        case 'VERIFIED':
          return d.isVerified;
        case 'UNVERIFIED':
          return !d.isVerified;
        case 'ACTIVE':
          return active;
        case 'SUSPENDED':
          return !active;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.companyName.localeCompare(b.companyName);
        case 'units':
          return (b.totalUnitsSold ?? 0) - (a.totalUnitsSold ?? 0);
        default:
          return (b.totalProjects ?? 0) - (a.totalProjects ?? 0);
      }
    });

  // Paged mode grows through "Load more"; legacy full-list keeps the old cap.
  const rows = isPaged ? filtered : filtered.slice(0, MAX_RENDER);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoCat.developersTitle') }} />

      <Card style={[styles.kpis, row]}>
        <View style={styles.kpiCell}>
          <Stat value={counts.total} label={t('ceoCat.statTotal')} />
        </View>
        <View style={styles.kpiCell}>
          <Stat value={`${counts.verified}/${counts.total}`} label={t('ceoCat.statVerified')} />
        </View>
        <View style={styles.kpiCell}>
          <Stat value={counts.projects} label={t('ceo.projects')} />
        </View>
        <View style={styles.kpiCell}>
          <Stat value={counts.suspended} label={t('ceo.suspendedAccounts')} />
        </View>
      </Card>

      <Text style={[styles.hint, align]}>{t('ceoCat.developersHint')}</Text>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('ceoCat.searchDevelopers')}
      />

      <View style={[styles.filters, row]}>
        {STATUS_FILTERS.map((value) => (
          <Chip
            key={value}
            label={value === 'ALL' ? t('common.all') : humanise(value)}
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>

      <Text style={[styles.formLabel, align]}>{t('ceoCat.sort')}</Text>
      <View style={[styles.filters, row]}>
        {SORTS.map((option) => (
          <Chip
            key={option.key}
            label={t(option.labelKey)}
            selected={sortBy === option.key}
            onPress={() => setSortBy(option.key)}
          />
        ))}
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && rows.length === 0 ? (
        <Empty title={t('ceoCat.developersNone')} message={t('ceoCat.developersNoneHint')} />
      ) : null}

      {!isPaged && filtered.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${filtered.length}`}
        </Text>
      ) : null}

      {rows.map((dev, index) => {
        const isOpen = expanded === dev.id;
        const busy = busyId === dev.id;
        const active = dev.accountStatus === 'ACTIVE' && dev.isActive;
        const partnership = dev.partnership;
        const avgUnits =
          (dev.totalProjects ?? 0) > 0
            ? Math.round((dev.totalUnitsSold ?? 0) / (dev.totalProjects ?? 1)).toLocaleString()
            : '0';

        return (
          <View key={dev.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={dev.companyName}
                subtitle={[
                  dev.description || dev.headquarters || undefined,
                  dev.contactEmail || undefined,
                  dev.contactPhone || undefined,
                  dev.foundedYear ? `${t('ceoCat.founded')} ${dev.foundedYear}` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => {
                  setExpanded(isOpen ? null : dev.id);
                  setPanel(null);
                  setProblem(null);
                  setNotice(null);
                }}
              />

              <View style={[styles.badges, row]}>
                <Badge tone={dev.isVerified ? 'green' : 'gold'}>
                  {dev.isVerified ? t('ceo.verified') : humanise('UNVERIFIED')}
                </Badge>
                <Badge tone={active ? 'green' : 'red'}>
                  {active ? humanise('ACTIVE') : humanise(dev.accountStatus || 'SUSPENDED')}
                </Badge>
                <Badge tone={toneForPartnership(partnership?.status)}>
                  {partnership
                    ? `${t('ceoCat.partnership')}: ${partnership.status}`
                    : t('ceoCat.noPartnership')}
                </Badge>
                <Badge tone={(dev.editMode ?? 'REQUEST') === 'DIRECT' ? 'blue' : 'gold'}>
                  {`${t('ceoSt.editModeLabel')}: ${(dev.editMode ?? 'REQUEST') === 'DIRECT' ? t('ceoSt.editDirect') : t('ceoSt.editRequest')}`}
                </Badge>
              </View>

              <View style={[styles.metrics, row]}>
                <View style={styles.metricCell}>
                  <Text style={styles.metricValue}>{dev.totalProjects ?? 0}</Text>
                  <Text style={styles.metricLabel}>{t('ceo.projects')}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricValue}>
                    {(dev.totalUnitsSold ?? 0).toLocaleString()}
                  </Text>
                  <Text style={styles.metricLabel}>{t('ceoCat.unitsSold')}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricValue}>{avgUnits}</Text>
                  <Text style={styles.metricLabel}>{t('ceoCat.avgUnits')}</Text>
                </View>
              </View>

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />

                  <View style={[styles.grid, row]}>
                    <View style={styles.cell}>
                      <Text style={[styles.cellLabel, align]}>{t('ceoCat.crNumber')}</Text>
                      <Text style={[styles.cellValue, align]}>{dev.crNumber || '—'}</Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={[styles.cellLabel, align]}>{t('ceoCat.headquarters')}</Text>
                      <Text style={[styles.cellValue, align]}>{dev.headquarters || '—'}</Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={[styles.cellLabel, align]}>{t('ceoCat.dealValueSold')}</Text>
                      <Text style={[styles.cellGold, align]}>
                        {formatMoney(dev.soldValue ?? 0, currency, rates, { compact: true })}
                      </Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={[styles.cellLabel, align]}>{t('ceoCat.leads30')}</Text>
                      <Text style={[styles.cellValue, align]}>
                        {`${dev.leadsLast30Days ?? 0} / ${dev.leadCount ?? 0}`}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.sectionLabel, align]}>{t('ceoCat.controls')}</Text>
                  <View style={[styles.actions, row]}>
                    <Btn
                      title={t('ceoCat.edit')}
                      variant="ghost"
                      disabled={busy}
                      onPress={() => openEdit(dev)}
                    />
                    <Btn
                      title={t('ceoCat.partnershipAction')}
                      variant="ghost"
                      disabled={busy}
                      onPress={() => openPartnership(dev)}
                    />
                    <Btn
                      title={dev.isVerified ? t('ceo.removeVerification') : t('ceo.verify')}
                      variant="ghost"
                      busy={busy}
                      onPress={() => toggleVerify(dev)}
                    />
                    <Btn
                      title={active ? t('ceo.suspend') : t('ceoCat.reactivate')}
                      variant={active ? 'danger' : 'primary'}
                      busy={busy}
                      onPress={() => toggleAccount(dev)}
                    />
                    <Btn
                      title={t('ceoCat.remove')}
                      variant="danger"
                      disabled={busy}
                      onPress={() => confirmRemove(dev)}
                    />
                  </View>

                  <Text style={[styles.sectionLabel, align]}>{t('ceoSt.editModeLabel')}</Text>
                  <Text style={[styles.hint, align]}>{t('ceoSt.editModeHint')}</Text>
                  <View style={[styles.actions, row]}>
                    <Chip
                      label={t('ceoSt.editDirect')}
                      selected={(dev.editMode ?? 'REQUEST') === 'DIRECT'}
                      onPress={() => setEditMode(dev, 'DIRECT')}
                    />
                    <Chip
                      label={t('ceoSt.editRequest')}
                      selected={(dev.editMode ?? 'REQUEST') === 'REQUEST'}
                      onPress={() => setEditMode(dev, 'REQUEST')}
                    />
                  </View>

                  {panel === 'edit' && edit ? (
                    <View style={styles.form}>
                      <Text style={[styles.sectionLabel, align]}>{t('ceoCat.editDeveloper')}</Text>
                      <Field
                        label={t('ceoCat.companyName')}
                        value={edit.companyName}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, companyName: v } : p))}
                      />
                      <Field
                        label={t('ceoCat.companyNameAr')}
                        value={edit.companyNameArabic}
                        onChangeText={(v) =>
                          setEdit((p) => (p ? { ...p, companyNameArabic: v } : p))
                        }
                      />
                      <Field
                        label={t('ceoCat.contactEmail')}
                        value={edit.contactEmail}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, contactEmail: v } : p))}
                      />
                      <Field
                        label={t('ceoCat.contactPhone')}
                        value={edit.contactPhone}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, contactPhone: v } : p))}
                      />
                      <Field
                        label={t('ceo.settings.website')}
                        placeholder="https://"
                        value={edit.website}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, website: v } : p))}
                      />
                      <Field
                        label={t('ceoCat.headquarters')}
                        value={edit.headquarters}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, headquarters: v } : p))}
                      />
                      <Field
                        label={t('ceoCat.crNumber')}
                        value={edit.crNumber}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, crNumber: v } : p))}
                      />
                      <Field
                        label={t('ceoCat.taxId')}
                        value={edit.taxId}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, taxId: v } : p))}
                      />
                      <Field
                        label={t('ceoCat.foundedYear')}
                        value={edit.foundedYear}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, foundedYear: v } : p))}
                        keyboardType="numeric"
                      />
                      <Field
                        label={`${t('ceo.rating')} (${t('ceoCat.ratingHint')})`}
                        value={edit.rating}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, rating: v } : p))}
                        keyboardType="numeric"
                      />
                      <Field
                        label={t('ceoCat.description')}
                        value={edit.description}
                        onChangeText={(v) => setEdit((p) => (p ? { ...p, description: v } : p))}
                        multiline
                      />
                      <View style={[styles.actions, row]}>
                        <Btn
                          title={t('common.cancel')}
                          variant="ghost"
                          onPress={() => {
                            setPanel(null);
                            setEdit(null);
                            setProblem(null);
                          }}
                        />
                        <Btn
                          title={t('ceo.settings.save')}
                          busy={busy}
                          onPress={() => void saveEdit(dev)}
                        />
                      </View>
                    </View>
                  ) : null}

                  {panel === 'partnership' && partner ? (
                    <View style={styles.form}>
                      <Text style={[styles.sectionLabel, align]}>{t('ceoCat.partnershipTitle')}</Text>
                      <Text style={[styles.hint, align]}>{t('ceoCat.partnershipHint')}</Text>

                      <Text style={[styles.formLabel, align]}>{t('common.status')}</Text>
                      <View style={[styles.chipRow, row]}>
                        {PARTNERSHIP_STATUSES.map((value) => (
                          <Chip
                            key={value}
                            label={humanise(value)}
                            selected={partner.status === value}
                            onPress={() => setPartner((p) => (p ? { ...p, status: value } : p))}
                          />
                        ))}
                      </View>

                      <Field
                        label={t('ceoCat.leadProtection')}
                        placeholder={t('ceoCat.leadProtectionHint')}
                        value={partner.leadProtectionDays}
                        onChangeText={(v) =>
                          setPartner((p) => (p ? { ...p, leadProtectionDays: v } : p))
                        }
                        keyboardType="numeric"
                      />
                      <Field
                        label={t('ceoCat.startDate')}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                        value={partner.startDate}
                        onChangeText={(v) => setPartner((p) => (p ? { ...p, startDate: v } : p))}
                      />
                      <Field
                        label={t('ceoCat.endDate')}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                        value={partner.endDate}
                        onChangeText={(v) => setPartner((p) => (p ? { ...p, endDate: v } : p))}
                      />

                      <View style={[styles.chipRow, row]}>
                        <Chip
                          label={t('ceoCat.partnershipActive')}
                          selected={partner.isActive}
                          onPress={() => setPartner((p) => (p ? { ...p, isActive: !p.isActive } : p))}
                        />
                        <Chip
                          label={t('ceoCat.coverAllProjects')}
                          selected={partner.allProjectsApproved}
                          onPress={() =>
                            setPartner((p) =>
                              p ? { ...p, allProjectsApproved: !p.allProjectsApproved } : p,
                            )
                          }
                        />
                      </View>

                      <Field
                        label={t('ceoCat.commissionAgreement')}
                        placeholder={t('ceoCat.commissionPlaceholder')}
                        value={partner.commissionAgreement}
                        onChangeText={(v) =>
                          setPartner((p) => (p ? { ...p, commissionAgreement: v } : p))
                        }
                        multiline
                      />
                      <Field
                        label={t('ceoCat.terms')}
                        value={partner.terms}
                        onChangeText={(v) => setPartner((p) => (p ? { ...p, terms: v } : p))}
                        multiline
                      />
                      <Field
                        label={t('ceoCat.ceoReviewNote')}
                        placeholder={t('ceoCat.reviewNotePlaceholder')}
                        value={partner.reviewNote}
                        onChangeText={(v) => setPartner((p) => (p ? { ...p, reviewNote: v } : p))}
                      />
                      <Text style={[styles.hint, align]}>{t('ceoCat.ceoReviewNoteHint')}</Text>

                      <Text style={[styles.formLabel, align]}>{t('ceoCat.brokerAccess')}</Text>
                      <View style={[styles.counts, row]}>
                        <Text style={styles.countAllowed}>
                          {`${partner.allowed.length} ${t('ceoCat.allowed')}`}
                        </Text>
                        <Text style={styles.countBlocked}>
                          {`${partner.blocked.length} ${t('ceoCat.blocked')}`}
                        </Text>
                      </View>

                      {brokerError ? <ErrorBar message={brokerError} /> : null}
                      {brokerLoading && brokers.length === 0 ? (
                        <Text style={[styles.hint, align]}>{t('ceoCat.loading')}</Text>
                      ) : null}

                      <Text style={[styles.formLabel, align]}>{t('ceoCat.allowedHint')}</Text>
                      <View style={[styles.chipRow, row]}>
                        {brokers.slice(0, MAX_RENDER).map((broker) => (
                          <Chip
                            key={broker.id}
                            label={broker.name || broker.email}
                            selected={partner.allowed.includes(broker.id)}
                            onPress={() =>
                              setPartner((p) =>
                                p
                                  ? {
                                      ...p,
                                      allowed: p.allowed.includes(broker.id)
                                        ? p.allowed.filter((x) => x !== broker.id)
                                        : [...p.allowed, broker.id],
                                    }
                                  : p,
                              )
                            }
                          />
                        ))}
                      </View>

                      <Text style={[styles.formLabel, align]}>{t('ceoCat.blockedHint')}</Text>
                      <View style={[styles.chipRow, row]}>
                        {brokers.slice(0, MAX_RENDER).map((broker) => (
                          <Chip
                            key={broker.id}
                            label={broker.name || broker.email}
                            selected={partner.blocked.includes(broker.id)}
                            onPress={() =>
                              setPartner((p) =>
                                p
                                  ? {
                                      ...p,
                                      blocked: p.blocked.includes(broker.id)
                                        ? p.blocked.filter((x) => x !== broker.id)
                                        : [...p.blocked, broker.id],
                                    }
                                  : p,
                              )
                            }
                          />
                        ))}
                      </View>

                      {!partner.allProjectsApproved ? (
                        <View>
                          <View style={[styles.counts, row]}>
                            <Text style={[styles.formLabel, align]}>
                              {`${t('ceoCat.approvedProjects')} (${partner.approved.length}/${dev.projects.length})`}
                            </Text>
                            <View style={[styles.chipRow, row]}>
                              <Chip
                                label={t('common.all')}
                                onPress={() =>
                                  setPartner((p) =>
                                    p ? { ...p, approved: dev.projects.map((x) => x.id) } : p,
                                  )
                                }
                              />
                              <Chip
                                label={t('common.none')}
                                onPress={() =>
                                  setPartner((p) => (p ? { ...p, approved: [] } : p))
                                }
                              />
                            </View>
                          </View>
                          <View style={[styles.chipRow, row]}>
                            {dev.projects.map((project) => (
                              <Chip
                                key={project.id}
                                label={project.name}
                                selected={partner.approved.includes(project.id)}
                                onPress={() =>
                                  setPartner((p) =>
                                    p
                                      ? {
                                          ...p,
                                          approved: p.approved.includes(project.id)
                                            ? p.approved.filter((x) => x !== project.id)
                                            : [...p.approved, project.id],
                                        }
                                      : p,
                                  )
                                }
                              />
                            ))}
                          </View>
                        </View>
                      ) : null}

                      <View style={[styles.counts, row]}>
                        <View style={styles.cell}>
                          <Text style={[styles.cellLabel, align]}>{t('ceoCat.coverage')}</Text>
                          <Text style={[styles.cellValue, align]}>
                            {partner.allProjectsApproved
                              ? t('ceoCat.allProjects')
                              : `${partner.approved.length}`}
                          </Text>
                        </View>
                        <View style={styles.cell}>
                          <Text style={[styles.cellLabel, align]}>{t('ceoCat.window')}</Text>
                          <Text style={[styles.cellValue, align]}>
                            {partner.startDate || partner.endDate
                              ? `${partner.startDate || '…'} → ${partner.endDate || '…'}`
                              : t('ceoCat.noExpiry')}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.actions, row]}>
                        <Btn
                          title={t('common.cancel')}
                          variant="ghost"
                          onPress={() => {
                            setPanel(null);
                            setPartner(null);
                            setProblem(null);
                          }}
                        />
                        <Btn
                          title={t('ceoCat.savePartnership')}
                          busy={busy}
                          onPress={() => void savePartnership(dev)}
                        />
                      </View>
                    </View>
                  ) : null}

                  <Text style={[styles.sectionLabel, align]}>
                    {`${t('ceo.projects')} (${dev.projects.length}) · ${t('ceoCat.showHide')}`}
                  </Text>
                  {dev.projects.length === 0 ? (
                    <Text style={[styles.hint, align]}>{t('ceoCat.noProjects')}</Text>
                  ) : (
                    dev.projects.slice(0, MAX_RENDER).map((project, projectIndex) => {
                      const projectBusy = busyId === `${dev.id}:${project.id}`;
                      const movesForProject = ACTIONS[project.approvalStatus ?? 'DRAFT'] ?? [];
                      return (
                        <View
                          key={project.id}
                          style={[styles.projectBox, projectIndex > 0 ? styles.gapTop : null]}>
                          <Text style={[styles.projectName, align]} numberOfLines={1}>
                            {project.name}
                          </Text>
                          <Text style={[styles.projectMeta, align]} numberOfLines={1}>
                            {project.location ?? ''}
                          </Text>
                          <View style={[styles.badges, row]}>
                            <Badge tone={project.isActive ? 'green' : 'muted'}>
                              {project.isActive ? t('ceoCat.visible') : t('ceoCat.hidden')}
                            </Badge>
                            <Badge tone={toneForApproval(project.approvalStatus)}>
                              {humanise(project.approvalStatus ?? 'DRAFT')}
                            </Badge>
                            <Badge tone="muted">
                              {`${(project.viewCount ?? 0).toLocaleString()} ${t('ceoCat.views')}`}
                            </Badge>
                          </View>

                          <Text style={[styles.formLabel, align]}>{t('ceoCat.approval')}</Text>
                          <View style={[styles.actions, row]}>
                            <Btn
                              title={
                                project.isActive ? t('ceoCat.hideProject') : t('ceoCat.showProject')
                              }
                              variant="ghost"
                              busy={projectBusy}
                              onPress={() => toggleProjectVisible(dev, project)}
                            />
                            {movesForProject.map((move) => (
                              <Btn
                                key={move.action}
                                title={t(move.labelKey)}
                                variant={move.variant}
                                busy={projectBusy}
                                onPress={() => changeApproval(dev, project, move.action)}
                              />
                            ))}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      {isPaged && cursor !== null ? (
        <View style={styles.more}>
          <Btn
            title={t('ceoPpl.loadMore')}
            variant="ghost"
            busy={moreBusy}
            onPress={() => void loadMore()}
          />
        </View>
      ) : null}
      {moreError ? <ErrorBar message={moreError} onRetry={() => void loadMore()} /> : null}
      {isPaged && cursor === null && filtered.length > 0 ? (
        <Text style={[styles.endNote, align]}>{t('ceoPpl.allShown')}</Text>
      ) : null}

      <Card style={styles.inbox}>
        <Row
          title={t('ceoSt.reqTitle')}
          subtitle={t('ceoSt.reqHint')}
          badge={
            reqQuery.data?.requests && reqOpen ? (
              <Badge tone="gold">{`${reqQuery.data.requests.length}`}</Badge>
            ) : undefined
          }
          onPress={() => {
            setReqOpen((prev) => !prev);
            setReqExpanded(null);
            setReqNote('');
          }}
        />
        <Btn
          title={reqOpen ? t('ceoSt.reqHide') : t('ceoSt.reqShow')}
          variant="ghost"
          onPress={() => {
            setReqOpen((prev) => !prev);
            setReqExpanded(null);
            setReqNote('');
          }}
        />

        {reqOpen ? (
          <View style={styles.inboxBody}>
            <View style={[styles.filters, row]}>
              {REQ_FILTERS.map((value) => (
                <Chip
                  key={value}
                  label={value === 'ALL' ? t('common.all') : humanise(value)}
                  selected={reqFilter === value}
                  onPress={() => {
                    setReqFilter(value);
                    setReqExpanded(null);
                  }}
                />
              ))}
            </View>

            <Field
              label={t('ceoSt.reqNote')}
              value={reqNote}
              onChangeText={setReqNote}
              multiline
              numberOfLines={2}
            />

            {reqQuery.loading ? <Loading label={t('common.loading')} /> : null}
            {reqQuery.error ? <ErrorBar message={reqQuery.error} onRetry={reqQuery.refresh} /> : null}
            {!reqQuery.loading && !reqQuery.error && (reqQuery.data?.requests ?? []).length === 0 ? (
              <Empty title={t('ceoSt.reqTitle')} message={t('ceoSt.reqEmpty')} />
            ) : null}

            {(reqQuery.data?.requests ?? []).map((req, index) => {
              const isOpen = reqExpanded === req.id;
              const busy = reqBusy === req.id;
              const target = req.unit ?? req.plan ?? req.project;
              return (
                <View key={req.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={`${req.entity} · ${req.field}`}
                    subtitle={[
                      req.developer?.companyName ?? req.developer?.name,
                      target?.name,
                      req.message,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      <Badge
                        tone={
                          req.status === 'APPROVED' ? 'green' : req.status === 'REJECTED' ? 'red' : 'gold'
                        }>
                        {humanise(req.status)}
                      </Badge>
                    }
                    onPress={() => setReqExpanded(isOpen ? null : req.id)}
                  />
                  {isOpen ? (
                    <View style={styles.editor}>
                      <View style={styles.grid}>
                        <View style={styles.cell}>
                          <Text style={[styles.cellLabel, align]}>{t('ceoSt.oldValue')}</Text>
                          <Text style={[styles.cellValue, align]} selectable>
                            {req.oldValue ?? '—'}
                          </Text>
                        </View>
                        <View style={styles.cell}>
                          <Text style={[styles.cellLabel, align]}>{t('ceoSt.newValue')}</Text>
                          <Text style={[styles.cellValue, align]} selectable>
                            {req.newValue}
                          </Text>
                        </View>
                      </View>
                      {req.reason ? (
                        <Text style={[styles.hint, align]}>
                          {`${t('ceo.reviewNote')}: ${req.reason}`}
                        </Text>
                      ) : null}
                      {req.status === 'PENDING' ? (
                        <View style={[styles.actions, row]}>
                          <Btn
                            title={t('ceo.approve')}
                            busy={busy}
                            disabled={busy}
                            onPress={() => void decideRequest(req, 'APPROVED')}
                          />
                          <Btn
                            title={t('ceo.reject')}
                            variant="danger"
                            disabled={busy}
                            onPress={() => void decideRequest(req, 'REJECTED')}
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

/** Website's PARTNERSHIP_TONES, mapped onto the kit's Badge tones. */
function toneForPartnership(status?: string | null): 'green' | 'gold' | 'red' | 'blue' | 'muted' {
  const s = (status ?? '').toUpperCase();
  if (s === 'ACTIVE' || s === 'APPROVED') return 'green';
  if (s === 'PENDING') return 'gold';
  if (s === 'UNDER_REVIEW') return 'blue';
  if (s === 'SUSPENDED' || s === 'REJECTED') return 'red';
  return 'muted';
}

function toneForApproval(status?: string | null): 'green' | 'gold' | 'red' | 'muted' {
  const s = (status ?? '').toUpperCase();
  if (s === 'PUBLISHED' || s === 'APPROVED') return 'green';
  if (s === 'PENDING' || s === 'DRAFT') return 'gold';
  if (s === 'REJECTED' || s === 'ARCHIVED') return 'red';
  return 'muted';
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: {
      justifyContent: 'space-around',
      alignItems: 'stretch',
      paddingVertical: Spacing.md,
      rowGap: Spacing.sm,
      flexWrap: 'wrap',
    },
    kpiCell: { width: '48%', alignItems: 'center' },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    filters: { flexWrap: 'wrap', gap: 8 },
    count: { color: t.mutedForeground, fontSize: 13 },
    more: { marginTop: Spacing.sm },
    endNote: { color: t.mutedForeground, fontSize: 13, marginTop: Spacing.sm },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 0, marginTop: Spacing.xs },
    badges: { flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
    metrics: { marginTop: Spacing.sm, gap: 8 },
    metricCell: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      paddingVertical: Spacing.sm,
      paddingHorizontal: 4,
    },
    metricValue: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    metricLabel: { color: t.mutedForeground, fontSize: 11, textAlign: 'center' },
    editor: { gap: 8, marginTop: Spacing.sm },
    inbox: { gap: 8, marginTop: Spacing.md },
    inboxBody: { gap: 8 },
    sectionLabel: {
      color: t.mutedForeground,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: Spacing.xs,
    },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    grid: { flexWrap: 'wrap', gap: 8 },
    cell: { flexGrow: 1, flexBasis: '45%', gap: 2 },
    cellLabel: {
      color: t.mutedForeground,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cellValue: { color: t.foreground, fontSize: 14, fontWeight: '500' },
    cellGold: { color: t.primary, fontSize: 14, fontWeight: '700' },
    actions: { flexWrap: 'wrap', gap: 8 },
    form: { gap: 8, marginTop: Spacing.sm },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    counts: { alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    countAllowed: { color: t.successFg, fontSize: 13, fontWeight: '600' },
    countBlocked: { color: t.dangerFg, fontSize: 13, fontWeight: '600' },
    projectBox: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm,
      gap: 6,
      backgroundColor: t.muted,
    },
    gapTop: { marginTop: Spacing.sm },
    projectName: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    projectMeta: { color: t.mutedForeground, fontSize: 12 },
  }),
);


