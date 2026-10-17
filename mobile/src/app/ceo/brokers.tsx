import { Stack } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  Avatar,
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
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { humanise, initials, formatDate, timeAgo } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

type BrokerAccess = {
  id: string;
  projectId?: string | null;
  developerId?: string | null;
  access?: string;
  expiresAt?: string | null;
};

type Broker = {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  avatar?: string | null;
  nameArabic?: string | null;
  socialLinks?: string | null;
  preferredLang?: string | null;
  preferredCurrency?: string | null;
  agencyName?: string;
  licenseNumber?: string;
  specializations?: string[];
  yearsExperience?: number | null;
  commissionRate?: number | null;
  bio?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  totalDeals?: number;
  dealCount?: number;
  isVerified?: boolean;
  userVerified?: boolean;
  isActive?: boolean;
  accountStatus?: string;
  leadCount?: number;
  activeLeads?: number;
  conversionRate?: number;
  totalRevenue?: number | null;
  commissionEarned?: number | null;
  joinedAt?: string;
  lastLoginAt?: string | null;
  projectAccess?: BrokerAccess[];
};

type ProjectRow = {
  id: string;
  name: string;
  developerId?: string;
  developer?: { id?: string; companyName?: string } | null;
};

type DeveloperRow = { id: string; companyName: string };

type LeadLite = {
  id: string;
  leadCode?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  broker?: { id: string; user?: { name?: string | null } | null } | null;
};

type Partnership = {
  id: string;
  developerId: string;
  status: string;
  isActive?: boolean;
  allProjectsApproved?: boolean;
  approvedProjectIds?: string[];
  allowedBrokerIds?: string[];
  blockedBrokerIds?: string[];
  commissionAgreement?: string | null;
  leadProtectionDays?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  terms?: string | null;
  reviewNote?: string | null;
  developer?: { id?: string; companyName?: string } | null;
};

type StatusTab = 'ALL' | 'VERIFIED' | 'UNVERIFIED' | 'ACTIVE' | 'SUSPENDED';
type SortKey = 'deals' | 'rating' | 'leads' | 'name';

const TABS: StatusTab[] = ['ALL', 'VERIFIED', 'UNVERIFIED', 'ACTIVE', 'SUSPENDED'];
const SORTS: SortKey[] = ['deals', 'rating', 'leads', 'name'];

/**
 * First-page size for the opt-in cursor pagination
 * (`GET /api/ceo/brokers?limit=` → `{ items, nextCursor }`). No `limit` param
 * means the legacy `{ brokers }` full list — the pager below falls back to it.
 */
const PAGE_LIMIT = 50;

/**
 * Broker management: verify/suspend, the edit form, lead assignment and the
 * project/developer access rows — the same controls as
 * `src/app/ceo/brokers/page.tsx`.
 *
 * - Edit writes through `PATCH /api/ceo/brokers/[id]`.
 * - Suspend/reactivate writes through `PATCH /api/ceo/users`
 *   (`{ userId, status, isActive }`), exactly like the website.
 * - Assign posts `{ leadIds }` to
 *   `POST /api/ceo/brokers/[id]/assign-lead`; release clears ownership one
 *   lead at a time via `PATCH /api/ceo/leads` (`{ id, brokerId: null }`).
 * - Access toggles post `ACCESS_UPSERT` / `ACCESS_DELETE` / `ACCESS_BULK` /
 *   `ACCESS_DELETE_BULK` to `POST /api/ceo/partnerships`.
 * - Remove is the route's hard delete (`DELETE …?hard=true`): the broker's
 *   leads go back to the pool, closed deals keep their attribution, and a
 *   broker with deals is rejected (409) — suspend them instead.
 */
export default function CeoBrokersScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('deals');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Broker | null>(null);
  const [assignTarget, setAssignTarget] = useState<Broker | null>(null);
  const [accessTarget, setAccessTarget] = useState<Broker | null>(null);
  // Cursor-pager accumulation: page 1 arrives via `useApi`, later pages append
  // through `loadMore`. `cursor` is the outstanding `nextCursor` (null = done
  // or legacy mode); it resets whenever the first-page response changes.
  const { session } = useAuth();
  const [extra, setExtra] = useState<Broker[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const firstPath = query.trim()
    ? `/api/ceo/brokers?search=${encodeURIComponent(query.trim())}&limit=${PAGE_LIMIT}`
    : `/api/ceo/brokers?limit=${PAGE_LIMIT}`;

  const { data, error, loading, refreshing, refresh } = useApi<{
    brokers?: Broker[];
    items?: Broker[];
    nextCursor?: string | null;
  }>(firstPath);
  const { data: projectData } = useApi<{ items?: ProjectRow[] }>('/api/ceo/projects-all?limit=100');
  const {
    data: partnershipData,
    error: partnershipsError,
    refresh: refreshPartnerships,
  } = useApi<{ partnerships?: Partnership[] }>('/api/ceo/partnerships');
  const mutation = useMutation();

  useEffect(() => {
    setExtra([]);
    setMoreError(null);
    setCursor(data && Array.isArray(data.items) ? (data.nextCursor ?? null) : null);
  }, [data]);

  const pageItems = data && Array.isArray(data.items) ? data.items : null;
  const isPaged = pageItems !== null;
  const brokers = pageItems ? [...pageItems, ...extra] : (data?.brokers ?? []);
  const partnerships = partnershipData?.partnerships ?? [];
  const projectName = new Map((projectData?.items ?? []).map((p) => [p.id, p.name]));

  const verified = brokers.filter((b) => b.isVerified ?? b.userVerified).length;
  const suspended = brokers.filter((b) => b.isActive === false || b.accountStatus === 'SUSPENDED').length;
  const avgRating = brokers.length
    ? brokers.reduce((sum, b) => sum + (Number(b.rating) || 0), 0) / brokers.length
    : 0;

  function patchLocal(id: string, patch: Partial<Broker>) {
    if (editTarget?.id === id) setEditTarget((prev) => (prev ? { ...prev, ...patch } : prev));
    if (accessTarget?.id === id) setAccessTarget((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function verify(broker: Broker) {
    const next = !(broker.isVerified ?? broker.userVerified ?? false);
    setBusyId(broker.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/ceo/brokers/${broker.id}`, 'PATCH', { isVerified: next });
      setNotice(t('ceo.statusUpdated'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAccount(broker: Broker) {
    const active = broker.accountStatus === 'ACTIVE' && broker.isActive !== false;
    const status = active ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(broker.id);
    setProblem(null);
    setNotice(null);
    try {
      if (broker.userId) {
        await mutation.run('/api/ceo/users', 'PATCH', {
          userId: broker.userId,
          status,
          isActive: !active,
        });
      } else {
        await mutation.run(`/api/ceo/brokers/${broker.id}`, 'PATCH', { isActive: !active });
      }
      setNotice(t('ceo.statusUpdated'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(broker: Broker) {
    setBusyId(broker.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/ceo/brokers/${broker.id}?hard=true`, 'DELETE');
      setExpanded(null);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(broker: Broker) {
    const name = broker.name || broker.email || broker.id;
    Alert.alert(
      t('ceoP.brokers.removeTitle'),
      `${t('ceoP.brokers.removeBodyA')} ${name} ${t('ceoP.brokers.removeBodyB')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('ceoP.brokers.remove'),
          style: 'destructive',
          onPress: () => void remove(broker),
        },
      ],
    );
  }

  async function setPartnership(partnership: Partnership, status: 'APPROVED' | 'SUSPENDED') {
    setBusyId(partnership.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/partnerships', 'POST', {
        type: 'PARTNERSHIP_UPSERT',
        partnership: {
          ...partnership,
          status,
          isActive: status === 'APPROVED',
        },
      });
      setNotice(t('ceo.statusUpdated'));
      refreshPartnerships();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmSuspendPartnership(partnership: Partnership) {
    Alert.alert(t('ceo.suspendPartnershipTitle'), t('ceo.suspendPartnershipBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => void setPartnership(partnership, 'SUSPENDED'),
      },
    ]);
  }

  /** Append the next cursor page. Guarded by `cursor == null` in legacy mode. */
  async function loadMore() {
    if (moreBusy || cursor == null) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await apiFetch<{ items?: Broker[]; nextCursor?: string | null }>(
        `${firstPath}&cursor=${encodeURIComponent(cursor)}`,
        { token: session?.token ?? null, cookieName: session?.cookieName ?? null },
      );
      const fresh = Array.isArray(page?.items) ? page.items : [];
      setExtra((prev) => {
        const seen = new Set([...(pageItems ?? []), ...prev].map((b) => b.id));
        return [...prev, ...fresh.filter((b) => !seen.has(b.id))];
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

  const needle = query.trim().toLowerCase();
  const filtered = brokers
    .filter((b) => {
      if (needle) {
        const hit = [b.name, b.email, b.agencyName, b.licenseNumber].some((v) =>
          (v ?? '').toLowerCase().includes(needle),
        );
        if (!hit) return false;
      }
      const active = b.accountStatus === 'ACTIVE' && b.isActive !== false;
      const isVerified = b.isVerified ?? b.userVerified ?? false;
      switch (tab) {
        case 'VERIFIED':
          return isVerified;
        case 'UNVERIFIED':
          return !isVerified;
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
          return (a.name ?? '').localeCompare(b.name ?? '');
        case 'rating':
          return (Number(b.rating) || 0) - (Number(a.rating) || 0);
        case 'leads':
          return (b.leadCount ?? 0) - (a.leadCount ?? 0);
        default:
          return (b.totalDeals ?? b.dealCount ?? 0) - (a.totalDeals ?? a.dealCount ?? 0);
      }
    });

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.brokersScreen') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={brokers.length} label={t('ceo.totalBrokers')} />
        <Stat value={verified} label={t('ceo.verified')} />
        <Stat value={avgRating.toFixed(1)} label={t('ceoP.brokers.avgRating')} />
        <Stat value={suspended} label={t('ceo.suspendedAccounts')} />
      </Card>

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.searchBrokers')} />

      <View style={[styles.filters, row]}>
        {TABS.map((value) => (
          <Chip
            key={value}
            label={value === 'ALL' ? t('common.all') : t(tabLabel(value))}
            selected={tab === value}
            onPress={() => setTab(value)}
          />
        ))}
      </View>

      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, align]}>{t('ceoP.brokers.sortBy')}</Text>
        <View style={[styles.filters, row]}>
          {SORTS.map((value) => (
            <Chip
              key={value}
              label={t(sortLabel(value))}
              selected={sortBy === value}
              onPress={() => setSortBy(value)}
            />
          ))}
        </View>
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && filtered.length === 0 ? (
        <Empty title={t('ceo.brokers.none')} message={t('ceo.brokers.noneHint')} />
      ) : null}

      {filtered.map((broker, index) => {
        const isOpen = expanded === broker.id;
        const busy = busyId === broker.id;
        const isVerified = broker.isVerified ?? broker.userVerified ?? false;
        const isActive = broker.accountStatus === 'ACTIVE' && broker.isActive !== false;
        const accessNames = (broker.projectAccess ?? [])
          .map((access) => (access.projectId ? projectName.get(access.projectId) ?? null : null))
          .filter((name): name is string => Boolean(name));

        return (
          <View key={broker.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={<Avatar text={initials(broker.name ?? broker.email)} />}
                title={broker.name || broker.email || broker.id}
                subtitle={[
                  broker.agencyName || undefined,
                  broker.licenseNumber ? `${t('ceo.licence')}: ${broker.licenseNumber}` : undefined,
                  broker.rating != null ? `${t('ceo.rating')}: ★ ${Number(broker.rating).toFixed(1)}` : undefined,
                  broker.lastLoginAt
                    ? `${t('ceo.lastLogin')} ${timeAgo(broker.lastLoginAt)}`
                    : broker.joinedAt
                      ? `${t('ceo.joinedAt')} ${timeAgo(broker.joinedAt)}`
                      : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone={isVerified ? 'green' : 'muted'}>
                      {isVerified ? t('ceo.verified') : t('common.none')}
                    </Badge>
                    <Badge tone={toneForAccount(isActive, broker.accountStatus)}>
                      {humanise(broker.accountStatus ?? (isActive ? 'ACTIVE' : 'SUSPENDED'))}
                    </Badge>
                  </View>
                }
                onPress={() => setExpanded(isOpen ? null : broker.id)}
              />

              {isOpen ? (
                <View style={styles.actions}>
                  <Divider />

                  <Text style={[styles.meta, align]}>
                    {[
                      broker.leadCount != null ? `${broker.leadCount} ${t('ceo.leads')}` : null,
                      (broker.totalDeals ?? broker.dealCount) != null
                        ? `${broker.totalDeals ?? broker.dealCount} ${t('ceo.dealsSold')}`
                        : null,
                      broker.conversionRate != null ? `${t('ceo.conversion')} ${broker.conversionRate}%` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>

                  {accessNames.length > 0 ? (
                    <Text style={[styles.meta, align]}>
                      {`${t('ceo.projects')}: ${accessNames.slice(0, 4).join(' · ')}`}
                    </Text>
                  ) : null}

                  <Btn
                    title={t('ceoP.brokers.edit')}
                    variant="ghost"
                    disabled={busy}
                    onPress={() => setEditTarget(broker)}
                  />
                  <Btn
                    title={isVerified ? t('ceo.removeVerification') : t('ceo.verify')}
                    variant="ghost"
                    busy={busy}
                    onPress={() => void verify(broker)}
                  />
                  <Btn
                    title={isActive ? t('ceo.suspend') : t('ceo.activate')}
                    variant={isActive ? 'danger' : 'primary'}
                    busy={busy}
                    onPress={() => void toggleAccount(broker)}
                  />
                  <Btn
                    title={t('ceoP.brokers.leadsBtn')}
                    variant="ghost"
                    disabled={busy}
                    onPress={() => setAssignTarget(broker)}
                  />
                  <Btn
                    title={t('ceoP.brokers.accessBtn')}
                    variant="ghost"
                    disabled={busy}
                    onPress={() => setAccessTarget(broker)}
                  />
                  <Btn
                    title={t('ceoP.brokers.remove')}
                    variant="danger"
                    disabled={busy}
                    onPress={() => confirmRemove(broker)}
                  />
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

      <SectionTitle>{t('ceo.partnerships')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceo.partnershipsHint')}</Text>

      {partnershipsError ? (
        <ErrorBar message={partnershipsError} onRetry={refreshPartnerships} />
      ) : null}

      {partnerships.length === 0 ? (
        <Empty title={t('ceo.partnerships.none')} message={t('ceo.partnershipsHint')} />
      ) : (
        <Card style={styles.card}>
          {partnerships.map((partnership, index) => {
            const busy = busyId === partnership.id;
            const approved = ['APPROVED', 'ACTIVE'].includes(partnership.status);

            return (
              <View key={partnership.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={partnership.developer?.companyName || partnership.developerId}
                  subtitle={partnership.status}
                  badge={
                    <Badge tone={toneForPartnership(partnership.status, partnership.isActive)}>
                      {humanise(partnership.status)}
                    </Badge>
                  }
                />
                <View style={[styles.actions, row]}>
                  <Btn
                    title={t('ceo.approve')}
                    variant="ghost"
                    style={styles.action}
                    disabled={busy || approved}
                    onPress={() => void setPartnership(partnership, 'APPROVED')}
                  />
                  <Btn
                    title={t('ceo.suspend')}
                    variant="danger"
                    style={styles.action}
                    disabled={busy || !approved}
                    onPress={() => confirmSuspendPartnership(partnership)}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <BrokerTargetsPanel />

      <BrokerLeaderboardPanel />

      <BrokerReviewsQueue />

      {editTarget ? (
        <EditBrokerSheet
          broker={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(patch) => {
            patchLocal(editTarget.id, patch);
            setEditTarget(null);
            setNotice(t('ceoP.brokers.updated'));
            refresh();
          }}
          onError={(message) => setProblem(message)}
        />
      ) : null}

      {assignTarget ? (
        <AssignLeadsSheet
          broker={assignTarget}
          onClose={() => setAssignTarget(null)}
          onDone={(count, mode) => {
            setAssignTarget(null);
            setNotice(
              `${count} ${t(mode === 'assign' ? 'ceoP.brokers.assignedOk' : 'ceoP.brokers.releasedOk')}`,
            );
            refresh();
          }}
          onError={(message) => setProblem(message)}
        />
      ) : null}

      {accessTarget ? (
        <AccessSheet
          broker={accessTarget}
          onClose={() => setAccessTarget(null)}
          onChanged={(rows) => {
            patchLocal(accessTarget.id, { projectAccess: rows });
            setNotice(t('ceoP.brokers.accessOk'));
          }}
          onError={(message) => setProblem(message)}
        />
      ) : null}
    </Screen>
  );
}

/* ─── Monthly targets + leaderboard ──────────────────────────────── */
// GET /api/ceo/targets?month= → every broker profile with progress
// ({brokerId (profile id), name, month, targetDeals, targetValue,
// actualDeals, actualValue, pctDeals, pctValue, hasTarget}); POST upserts
// {brokerId, month, targetDeals?, targetValue?}. Leaderboard is read-only:
// GET /api/ceo/leaderboard?month= → {month, leaderboard} ranked by value.

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type TargetRow = {
  brokerId: string;
  name: string;
  month: string;
  targetDeals: number;
  targetValue: number;
  actualDeals: number;
  actualValue: number;
  pctDeals: number;
  pctValue: number;
  hasTarget: boolean;
};

type BoardRow = {
  brokerId: string;
  name: string;
  deals: number;
  value: number;
  commission: number;
  leads: number;
  conversionPct: number;
};

function BrokerTargetsPanel() {
  const styles = useStyles();
  const { t, align } = useI18n();
  const mutation = useMutation();
  const [month, setMonth] = useState(currentMonth());
  const [monthError, setMonthError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TargetRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dealsDraft, setDealsDraft] = useState('');
  const [valueDraft, setValueDraft] = useState('');

  const validMonth = MONTH_RE.test(month.trim());
  const { data, error, loading, refresh } = useApi<{ month?: string; targets?: TargetRow[] }>(
    validMonth ? `/api/ceo/targets?month=${encodeURIComponent(month.trim())}` : null,
  );
  const targets = data?.targets ?? [];

  function openEdit(target: TargetRow) {
    setEditing(target);
    setDealsDraft(String(target.targetDeals ?? 0));
    setValueDraft(String(target.targetValue ?? 0));
    setFormError(null);
  }

  async function submit() {
    if (!editing) return;
    const td = Number(dealsDraft.trim());
    const tv = Number(valueDraft.trim());
    if (!Number.isInteger(td) || td < 0 || td > 1000000 || !Number.isFinite(tv) || tv < 0) {
      setFormError(t('ceoM.targets.badMonth'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await mutation.run('/api/ceo/targets', 'POST', {
        brokerId: editing.brokerId,
        month: month.trim(),
        targetDeals: td,
        targetValue: tv,
      });
      setEditing(null);
      refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SectionTitle>{t('ceoM.targets.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceoM.targets.hint')}</Text>
      <Field
        label={t('ceoM.targets.month')}
        value={month}
        onChangeText={(next) => {
          setMonth(next);
          setMonthError(MONTH_RE.test(next.trim()) ? null : t('ceoM.targets.badMonth'));
        }}
        placeholder="YYYY-MM"
        autoCapitalize="none"
        maxLength={7}
      />
      {monthError ? <ErrorBar message={monthError} /> : null}
      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading label={t('common.loading')} />
      ) : !validMonth ? null : targets.length === 0 ? (
        <Empty title={t('ceoM.targets.title')} message={t('ceoM.targets.noTarget')} />
      ) : (
        <Card style={styles.card}>
          {targets.map((target, index) => (
            <View key={target.brokerId}>
              {index > 0 ? <Divider /> : null}
              <Row
                left={<Avatar text={initials(target.name)} />}
                title={target.name}
                subtitle={[
                  `${target.actualDeals}/${target.targetDeals} ${t('ceoM.targets.deals')}`,
                  `${Number(target.actualValue).toLocaleString('en-US')}/${Number(target.targetValue).toLocaleString('en-US')} ${t('ceoM.targets.value')}`,
                ].join(' · ')}
                badge={
                  <Badge tone={target.hasTarget ? 'green' : 'muted'}>
                    {target.hasTarget ? t('ceoM.targets.hasTarget') : t('ceoM.targets.noTarget')}
                  </Badge>
                }
                onPress={() => openEdit(target)}
              />
              <View style={styles.barOuter}>
                <View style={[styles.barInner, { width: `${Math.min(100, Math.max(0, target.pctDeals || 0))}%` }]} />
              </View>
              <View style={styles.barOuter}>
                <View style={[styles.barInnerGold, { width: `${Math.min(100, Math.max(0, target.pctValue || 0))}%` }]} />
              </View>
            </View>
          ))}
        </Card>
      )}
      {editing ? (
        <Sheet
          title={t('ceoM.targets.edit')}
          subtitle={`${editing.name} · ${month.trim()}`}
          onClose={() => setEditing(null)}>
          <Field
            label={t('ceoM.targets.targetDeals')}
            value={dealsDraft}
            onChangeText={setDealsDraft}
            keyboardType="number-pad"
          />
          <Field
            label={t('ceoM.targets.targetValue')}
            value={valueDraft}
            onChangeText={setValueDraft}
            keyboardType="decimal-pad"
          />
          {formError ? <ErrorBar message={formError} /> : null}
          <Btn title={t('common.save')} busy={saving || mutation.busy} onPress={() => void submit()} />
          <Btn title={t('common.cancel')} variant="ghost" onPress={() => setEditing(null)} />
        </Sheet>
      ) : null}
    </>
  );
}

function BrokerLeaderboardPanel() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [month, setMonth] = useState(currentMonth());
  const validMonth = MONTH_RE.test(month.trim());
  const { data, error, loading, refresh } = useApi<{ month?: string; leaderboard?: BoardRow[] }>(
    validMonth ? `/api/ceo/leaderboard?month=${encodeURIComponent(month.trim())}` : null,
  );
  const rows = data?.leaderboard ?? [];

  return (
    <>
      <SectionTitle>{t('ceoM.board.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceoM.board.hint')}</Text>
      <Field
        label={t('ceoM.targets.month')}
        value={month}
        onChangeText={setMonth}
        placeholder="YYYY-MM"
        autoCapitalize="none"
        maxLength={7}
      />
      {!validMonth ? <ErrorBar message={t('ceoM.targets.badMonth')} /> : null}
      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading label={t('common.loading')} />
      ) : !validMonth || rows.length === 0 ? (
        <Empty title={t('ceoM.board.none')} message={t('ceoM.board.noneHint')} />
      ) : (
        <Card style={styles.card}>
          {rows.map((entry, index) => (
            <View key={entry.brokerId}>
              {index > 0 ? <Divider /> : null}
              <Row
                left={<Avatar text={index < 3 ? ['🥇', '🥈', '🥉'][index] : String(index + 1)} />}
                title={`${index + 1}. ${entry.name}`}
                subtitle={[
                  `${entry.deals} ${t('ceoM.board.deals')}`,
                  `${Number(entry.value).toLocaleString('en-US')} ${t('ceoM.board.value')}`,
                  `${Number(entry.commission).toLocaleString('en-US')} ${t('ceoM.board.commission')}`,
                  `${entry.leads} ${t('ceoM.board.leads')}`,
                  `${entry.conversionPct}% ${t('ceoM.board.conversion')}`,
                ].join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone={index === 0 ? 'green' : index < 3 ? 'gold' : 'muted'}>
                      {`#${index + 1}`}
                    </Badge>
                  </View>
                }
              />
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

/* ─── Broker-rating moderation — GET /api/broker-reviews?status= ────── */
// Client ratings of brokers waiting for CEO review. Approve / reject through
// PATCH /api/broker-reviews/:id { status }, the same contract as the
// visitor-review queue in mobile/src/app/ceo/reviews.tsx.

type BrokerQueueReview = {
  id: string;
  rating: number;
  comment?: string | null;
  status: string;
  createdAt: string;
  rater?: { name?: string | null } | null;
  broker?: { name?: string | null } | null;
};

function BrokerReviewsQueue() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation();

  const { data, error, loading, refresh } = useApi<{ reviews?: BrokerQueueReview[] }>(
    '/api/broker-reviews?status=PENDING',
  );

  async function decide(review: BrokerQueueReview, status: 'APPROVED' | 'REJECTED') {
    setBusyId(review.id);
    setProblem(null);
    try {
      await mutation.run(`/api/broker-reviews/${review.id}`, 'PATCH', { status });
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.reviews ?? [];

  return (
    <>
      <SectionTitle>{t('brate.moderationTitle')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('brate.moderationHint')}</Text>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {loading ? (
        <Loading label={t('common.loading')} />
      ) : !error && items.length === 0 ? (
        <Empty title={t('brate.nonePending')} message={t('brate.nonePendingHint')} />
      ) : (
        <Card style={styles.card}>
          {items.map((review, index) => {
            const busy = busyId === review.id;
            return (
              <View key={review.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={review.rater?.name || t('brate.client')}
                  subtitle={
                    [
                      review.broker?.name ?? undefined,
                      formatDate(review.createdAt),
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  badge={
                    <Badge tone={review.status === 'PENDING' ? 'gold' : 'muted'}>
                      {t('brate.pending')}
                    </Badge>
                  }
                />
                <View style={[styles.revStars, row]}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= review.rating ? 'star' : 'star-outline'}
                      size={16}
                      color={star <= review.rating ? theme.primary : theme.mutedForeground}
                    />
                  ))}
                </View>
                {review.comment ? (
                  <Text style={[styles.revComment, align]}>{review.comment}</Text>
                ) : null}
                <View style={[styles.revActions, row]}>
                  <Btn
                    title={t('brate.approve')}
                    style={styles.action}
                    busy={busy}
                    onPress={() => void decide(review, 'APPROVED')}
                  />
                  <Btn
                    title={t('brate.reject')}
                    variant="danger"
                    style={styles.action}
                    disabled={busy}
                    onPress={() => void decide(review, 'REJECTED')}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </>
  );
}

function tabLabel(tab: Exclude<StatusTab, 'ALL'>): 'ceoP.brokers.verifiedTab' | 'ceoP.brokers.unverifiedTab' | 'ceoP.brokers.activeTab' | 'ceoP.brokers.suspendedTab' {
  switch (tab) {
    case 'VERIFIED':
      return 'ceoP.brokers.verifiedTab';
    case 'UNVERIFIED':
      return 'ceoP.brokers.unverifiedTab';
    case 'ACTIVE':
      return 'ceoP.brokers.activeTab';
    case 'SUSPENDED':
      return 'ceoP.brokers.suspendedTab';
  }
}

function sortLabel(sort: SortKey): 'ceoP.brokers.sortDeals' | 'ceoP.brokers.sortRating' | 'ceoP.brokers.sortLeads' | 'ceoP.brokers.sortName' {
  switch (sort) {
    case 'deals':
      return 'ceoP.brokers.sortDeals';
    case 'rating':
      return 'ceoP.brokers.sortRating';
    case 'leads':
      return 'ceoP.brokers.sortLeads';
    case 'name':
      return 'ceoP.brokers.sortName';
  }
}

/* ─── Sheet chrome — the website Modal, restated for the phone ─────────── */

function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
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
              <View style={styles.sheetTitles}>
                <Text style={[styles.sheetTitle, align]}>{title}</Text>
                {subtitle ? <Text style={[styles.sheetSubtitle, align]}>{subtitle}</Text> : null}
              </View>
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

/* ─── Edit broker — PATCH /api/ceo/brokers/[id] ────────────────────────── */

function EditBrokerSheet({
  broker,
  onClose,
  onSaved,
  onError,
}: {
  broker: Broker;
  onClose: () => void;
  onSaved: (patch: Partial<Broker>) => void;
  onError: (message: string) => void;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const mutation = useMutation();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(broker.name ?? '');
  const [phone, setPhone] = useState(broker.phone ?? '');
  const [agencyName, setAgencyName] = useState(broker.agencyName ?? '');
  const [licenseNumber, setLicenseNumber] = useState(broker.licenseNumber ?? '');
  const [commissionRate, setCommissionRate] = useState(
    broker.commissionRate == null ? '' : String(broker.commissionRate),
  );
  const [yearsExperience, setYearsExperience] = useState(
    broker.yearsExperience == null ? '' : String(broker.yearsExperience),
  );
  const [rating, setRating] = useState(broker.rating == null ? '' : String(broker.rating));
  const [specialization, setSpecialization] = useState((broker.specializations ?? []).join(', '));
  const [bio, setBio] = useState(broker.bio ?? '');
  const [password, setPassword] = useState('');
  const [socialLinks, setSocialLinks] = useState(broker.socialLinks ?? '');
  const [nameArabic, setNameArabic] = useState(broker.nameArabic ?? '');
  const [avatar, setAvatar] = useState(broker.avatar ?? '');
  const [prefLang, setPrefLang] = useState(broker.preferredLang ?? 'en');
  const [prefCurrency, setPrefCurrency] = useState(broker.preferredCurrency ?? 'EGP');

  async function submit() {
    if (!name.trim()) return;
    if (password.trim() && password.trim().length < 6) {
      onError(t('ceoP.brokers.passwordShort'));
      return;
    }
    if (socialLinks.trim()) {
      try {
        JSON.parse(socialLinks.trim());
      } catch {
        onError(t('ceoP.brokers.socialLinksBad'));
        return;
      }
    }
    if (avatar.trim() && !/^(https?:\/\/|\/).+/.test(avatar.trim())) {
      onError(t('ceoP.brokers.avatarBad'));
      return;
    }
    if (nameArabic.trim().length > 100) {
      onError(t('common.error'));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        agencyName: agencyName.trim(),
        licenseNumber: licenseNumber.trim(),
        commissionRate: commissionRate.trim() === '' ? null : Number(commissionRate),
        yearsExperience: yearsExperience.trim() === '' ? null : Number(yearsExperience),
        rating: rating.trim() === '' ? 0 : Number(rating),
        specialization,
        bio: bio.trim(),
        nameArabic: nameArabic.trim(),
        avatar: avatar.trim(),
        preferredLang: prefLang.trim() || 'en',
        preferredCurrency: (prefCurrency.trim() || 'EGP').toUpperCase(),
        socialLinks: socialLinks.trim() ? socialLinks.trim() : null,
        ...(password.trim() ? { password: password.trim() } : {}),
      };
      await mutation.run(`/api/ceo/brokers/${broker.id}`, 'PATCH', payload);
      onSaved({
        name: payload.name as string,
        phone: payload.phone as string,
        agencyName: payload.agencyName as string,
        licenseNumber: payload.licenseNumber as string,
        commissionRate: payload.commissionRate as number | null,
        yearsExperience: payload.yearsExperience as number | null,
        rating: payload.rating as number,
        specializations: specialization
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        bio: payload.bio as string,
        nameArabic: (payload.nameArabic as string) || null,
        avatar: (payload.avatar as string) || null,
        preferredLang: payload.preferredLang as string,
        preferredCurrency: payload.preferredCurrency as string,
        socialLinks: (payload.socialLinks as string | null) ?? null,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('ceoP.brokers.editTitle')} subtitle={broker.email} onClose={onClose}>
      <Field label={t('ceoP.brokers.fieldName')} value={name} onChangeText={setName} />
      <Field
        label={t('ceoP.brokers.fieldNameArabic')}
        value={nameArabic}
        onChangeText={setNameArabic}
        maxLength={100}
      />
      <Field
        label={t('ceoP.brokers.fieldPhone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <Field label={t('ceoP.brokers.fieldAgency')} value={agencyName} onChangeText={setAgencyName} />
      <Field
        label={t('ceoP.brokers.fieldLicense')}
        value={licenseNumber}
        onChangeText={setLicenseNumber}
      />
      <Field
        label={t('ceoP.brokers.fieldCommission')}
        value={commissionRate}
        onChangeText={setCommissionRate}
        keyboardType="decimal-pad"
      />
      <Field
        label={t('ceoP.brokers.fieldYears')}
        value={yearsExperience}
        onChangeText={setYearsExperience}
        keyboardType="number-pad"
      />
      <Field
        label={t('ceoP.brokers.fieldRating')}
        value={rating}
        onChangeText={setRating}
        keyboardType="decimal-pad"
      />
      <Field
        label={t('ceoP.brokers.fieldSpecs')}
        value={specialization}
        onChangeText={setSpecialization}
      />
      <Field
        label={t('ceoP.brokers.fieldBio')}
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
      />
      <Field
        label={t('ceoP.brokers.fieldPassword')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('ceoP.brokers.passwordHint')}
        secureTextEntry
        autoCapitalize="none"
      />
      <Field
        label={t('ceoP.brokers.fieldAvatar')}
        value={avatar}
        onChangeText={setAvatar}
        placeholder={t('ceoP.brokers.avatarHint')}
        autoCapitalize="none"
      />
      <Field
        label={t('ceoP.brokers.fieldSocialLinks')}
        value={socialLinks}
        onChangeText={setSocialLinks}
        placeholder={t('ceoP.brokers.socialLinksHint')}
        multiline
        numberOfLines={3}
        autoCapitalize="none"
      />
      <Text style={[styles.sheetSubtitle, align]}>{t('ceoP.brokers.fieldPrefLang')}</Text>
      <View style={[styles.bulkBar, row]}>
        <Btn
          title={t('ceoP.brokers.langEnglish')}
          variant={prefLang === 'en' ? 'primary' : 'ghost'}
          style={styles.bulkAction}
          onPress={() => setPrefLang('en')}
        />
        <Btn
          title={t('ceoP.brokers.langArabic')}
          variant={prefLang === 'ar' ? 'primary' : 'ghost'}
          style={styles.bulkAction}
          onPress={() => setPrefLang('ar')}
        />
      </View>
      <Field
        value={prefLang}
        onChangeText={setPrefLang}
        autoCapitalize="none"
        maxLength={10}
      />
      <Text style={[styles.sheetSubtitle, align]}>{t('ceoP.brokers.fieldPrefCurrency')}</Text>
      <View style={[styles.bulkBar, row]}>
        {['EGP', 'USD', 'EUR', 'SAR'].map((code) => (
          <Btn
            key={code}
            title={code}
            variant={prefCurrency.trim().toUpperCase() === code ? 'primary' : 'ghost'}
            style={styles.bulkAction}
            onPress={() => setPrefCurrency(code)}
          />
        ))}
      </View>
      <Field
        value={prefCurrency}
        onChangeText={setPrefCurrency}
        placeholder={t('ceoP.brokers.currencyCustom')}
        autoCapitalize="characters"
        maxLength={10}
      />
      <Btn
        title={t('ceoP.brokers.saveChanges')}
        busy={saving || mutation.busy}
        disabled={!name.trim()}
        onPress={() => void submit()}
      />
      <Btn title={t('common.cancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/* ─── Assign / release leads ────────────────────────────────────────────── */

function AssignLeadsSheet({
  broker,
  onClose,
  onDone,
  onError,
}: {
  broker: Broker;
  onClose: () => void;
  onDone: (count: number, mode: 'assign' | 'release') => void;
  onError: (message: string) => void;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const mutation = useMutation();
  const [mode, setMode] = useState<'assign' | 'release'>('assign');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, error, loading, refresh } = useApi<{ leads?: LeadLite[] }>('/api/ceo/leads');
  const leads = data?.leads ?? [];
  const owned = (lead: LeadLite) => lead.broker?.id === broker.id;

  const q = filter.trim().toLowerCase();
  const visible = leads
    .filter((lead) => (mode === 'assign' ? !owned(lead) : owned(lead)))
    .filter((lead) =>
      q
        ? [lead.name, lead.phone, lead.email, lead.leadCode].some((v) =>
            (v ?? '').toLowerCase().includes(q),
          )
        : true,
    );

  const ownedCount = leads.filter(owned).length;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      if (mode === 'assign') {
        const res = (await mutation.run(`/api/ceo/brokers/${broker.id}/assign-lead`, 'POST', {
          leadIds: selected,
        })) as { assigned?: number };
        onDone(res?.assigned ?? selected.length, 'assign');
      } else {
        let done = 0;
        for (const id of selected) {
          await mutation.run('/api/ceo/leads', 'PATCH', {
            id,
            brokerId: null,
            reason: `Released by CEO from ${broker.name ?? broker.email ?? broker.id}`,
          });
          done += 1;
        }
        onDone(done, 'release');
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={t(mode === 'assign' ? 'ceoP.brokers.assignTitle' : 'ceoP.brokers.releaseTitle')}
      subtitle={`${t(mode === 'assign' ? 'ceoP.brokers.assignHint' : 'ceoP.brokers.releaseHint')} ${broker.name ?? broker.email ?? ''}`}
      onClose={onClose}>
      <Segmented<'assign' | 'release'>
        options={[
          { value: 'assign', label: `${t('ceoP.brokers.assignMode')} (${leads.length - ownedCount})` },
          { value: 'release', label: `${t('ceoP.brokers.releaseMode')} (${ownedCount})` },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setSelected([]);
        }}
      />

      <SearchBar
        value={filter}
        onChangeText={setFilter}
        placeholder={t('ceoP.brokers.leadSearch')}
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {loading ? <Loading label={t('common.loading')} /> : null}

      {!loading && !error && visible.length === 0 ? (
        <Empty
          title={t(mode === 'assign' ? 'ceoP.brokers.noAssignLeads' : 'ceoP.brokers.noReleaseLeads')}
        />
      ) : null}

      {visible.map((lead) => {
        const checked = selected.includes(lead.id);
        return (
          <Pressable
            key={lead.id}
            onPress={() => toggle(lead.id)}
            style={({ pressed }) => [styles.leadRow, checked && styles.leadRowChecked, pressed && styles.rowPressed]}>
            <View style={styles.leadMain}>
              <Text style={[styles.leadName, align]} numberOfLines={1}>
                {lead.name}
                {lead.leadCode ? <Text style={styles.leadCode}>{` · ${lead.leadCode}`}</Text> : null}
              </Text>
              <Text style={[styles.leadSub, align]} numberOfLines={1}>
                {`${lead.phone} · ${
                  lead.broker
                    ? `${t('ceoP.brokers.owner')}: ${lead.broker.user?.name ?? '—'}`
                    : t('ceoP.brokers.unassigned')
                }`}
              </Text>
            </View>
            <View style={[styles.badges, row]}>
              <Badge tone="muted">{humanise(lead.status)}</Badge>
              <View style={[styles.check, checked && styles.checkOn]}>
                {checked ? <Ionicons name="checkmark" size={14} color={theme.primaryForeground} /> : null}
              </View>
            </View>
          </Pressable>
        );
      })}

      <Btn
        title={`${t(mode === 'assign' ? 'ceoP.brokers.assignBtn' : 'ceoP.brokers.releaseBtn')}${
          selected.length > 0 ? ` (${selected.length})` : ''
        }`}
        variant={mode === 'assign' ? 'primary' : 'danger'}
        busy={saving || mutation.busy}
        disabled={selected.length === 0}
        onPress={() => void submit()}
      />
      <Btn title={t('common.cancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/* ─── Project & developer access — POST /api/ceo/partnerships ──────────── */

function AccessSheet({
  broker,
  onClose,
  onChanged,
  onError,
}: {
  broker: Broker;
  onClose: () => void;
  onChanged: (rows: BrokerAccess[]) => void;
  onError: (message: string) => void;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const mutation = useMutation();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [devFilter, setDevFilter] = useState('');
  const [selRules, setSelRules] = useState<string[]>([]);
  const [selDevs, setSelDevs] = useState<string[]>([]);
  const [selProjects, setSelProjects] = useState<string[]>([]);

  const { data: projectData, error: projectsError } = useApi<{ items?: ProjectRow[] }>(
    '/api/ceo/projects-all?limit=100',
  );
  const { data: developerData, error: developersError } = useApi<{ developers?: DeveloperRow[] }>(
    '/api/ceo/developers',
  );

  const rows = broker.projectAccess ?? [];
  const projects = (projectData?.items ?? []).map((p) => ({
    ...p,
    developerId: p.developerId ?? p.developer?.id ?? '',
  }));
  const developers = developerData?.developers ?? [];

  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? t('ceoP.brokers.unknownProject');
  const developerName = (id: string | null | undefined) =>
    (id && developers.find((d) => d.id === id)?.companyName) || t('ceoP.brokers.unknownDeveloper');

  async function post(body: Record<string, unknown>, key: string, apply: (prev: BrokerAccess[]) => BrokerAccess[]) {
    setBusyKey(key);
    try {
      await mutation.run('/api/ceo/partnerships', 'POST', body);
      onChanged(apply(rows));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyKey(null);
    }
  }

  function upsertLocal(
    prev: BrokerAccess[],
    target: { developerId: string; projectId: string | null },
    access: 'APPROVED' | 'BLOCKED',
  ): BrokerAccess[] {
    const next = [...prev];
    const idx = target.projectId
      ? next.findIndex((r) => r.projectId === target.projectId)
      : next.findIndex((r) => !r.projectId && r.developerId === target.developerId);
    if (idx >= 0) next[idx] = { ...next[idx], access };
    else
      next.push({
        id: target.projectId ? `local-${target.projectId}` : `local-dev-${target.developerId}`,
        developerId: target.developerId,
        projectId: target.projectId,
        access,
        expiresAt: null,
      });
    return next;
  }

  function setProjectAccess(project: { id: string; developerId: string }, access: 'APPROVED' | 'BLOCKED') {
    void post(
      {
        type: 'ACCESS_UPSERT',
        brokerId: broker.id,
        developerId: project.developerId,
        projectId: project.id,
        access,
      },
      project.id,
      (prev) => upsertLocal(prev, { developerId: project.developerId, projectId: project.id }, access),
    );
  }

  function setDeveloperAccess(dev: DeveloperRow, access: 'APPROVED' | 'BLOCKED') {
    void post(
      { type: 'ACCESS_UPSERT', brokerId: broker.id, developerId: dev.id, access },
      `dev-${dev.id}`,
      (prev) => upsertLocal(prev, { developerId: dev.id, projectId: null }, access),
    );
  }

  function revoke(rule: BrokerAccess) {
    const apply = (prev: BrokerAccess[]) => prev.filter((r) => r.id !== rule.id);
    if (rule.id.startsWith('local-')) {
      onChanged(apply(rows));
      return;
    }
    void post({ type: 'ACCESS_DELETE', accessId: rule.id }, rule.id, apply);
  }

  function bulkRevoke() {
    const picked = rows.filter((r) => selRules.includes(r.id));
    if (picked.length === 0) return;
    const remote = picked.map((r) => r.id).filter((id) => !id.startsWith('local-'));
    const apply = (prev: BrokerAccess[]) => prev.filter((r) => !selRules.includes(r.id));
    if (remote.length === 0) {
      onChanged(apply(rows));
      setSelRules([]);
      return;
    }
    void post(
      { type: 'ACCESS_DELETE_BULK', brokerId: broker.id, accessIds: remote },
      'bulk-rules',
      apply,
    ).then(() => setSelRules([]));
  }

  function bulkApply(kind: 'dev' | 'proj', access: 'APPROVED' | 'BLOCKED') {
    const ids = kind === 'dev' ? selDevs : selProjects;
    if (ids.length === 0) return;
    const targets =
      kind === 'dev'
        ? ids.map((developerId) => ({ developerId, projectId: null as string | null }))
        : ids
            .map((projectId) => ({
              developerId: projects.find((p) => p.id === projectId)?.developerId ?? '',
              projectId,
            }))
            .filter((target) => target.developerId);
    void post(
      {
        type: 'ACCESS_BULK',
        brokerId: broker.id,
        access,
        projectIds: kind === 'proj' ? ids : [],
        developerIds: kind === 'dev' ? ids : [],
      },
      `bulk-${kind}-${access}`,
      (prev) => {
        let next = [...prev];
        for (const target of targets) next = upsertLocal(next, target, access);
        return next;
      },
    ).then(() => (kind === 'dev' ? setSelDevs([]) : setSelProjects([])));
  }

  const q = filter.trim().toLowerCase();
  const visibleProjects = projects.filter((p) =>
    q ? p.name.toLowerCase().includes(q) : true,
  );
  const dq = devFilter.trim().toLowerCase();
  const visibleDevelopers = developers.filter((d) =>
    dq ? d.companyName.toLowerCase().includes(dq) : true,
  );

  function toggle(list: string[], set: (next: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <Sheet
      title={t('ceoP.brokers.accessTitle')}
      subtitle={`${broker.name ?? broker.email ?? ''} — ${t('ceoP.brokers.accessHint')}`}
      onClose={onClose}>
      <SectionTitle>{`${t('ceoP.brokers.activeRules')} (${rows.length})`}</SectionTitle>
      {selRules.length > 0 ? (
        <View style={[styles.bulkBar, row]}>
          <Text style={[styles.bulkCount, align]}>
            {`${selRules.length} ${t('ceoP.brokers.selected')}`}
          </Text>
          <Btn
            title={t('ceoP.brokers.revokeSelected')}
            variant="danger"
            style={styles.bulkAction}
            busy={busyKey === 'bulk-rules' || mutation.busy}
            onPress={bulkRevoke}
          />
          <Btn
            title={t('ceoP.brokers.clear')}
            variant="ghost"
            style={styles.bulkAction}
            onPress={() => setSelRules([])}
          />
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Text style={[styles.hint, align]}>{t('ceoP.brokers.noRules')}</Text>
      ) : (
        rows.map((rule) => {
          const picked = selRules.includes(rule.id);
          const busy = busyKey === rule.id;
          return (
            <Pressable
              key={rule.id}
              onPress={() => toggle(selRules, setSelRules, rule.id)}
              style={[styles.pickRow, picked && styles.pickRowOn]}>
              <View style={styles.leadMain}>
                <Text style={[styles.leadName, align]} numberOfLines={1}>
                  {rule.projectId ? projectName(rule.projectId) : developerName(rule.developerId)}
                </Text>
                <Text style={[styles.leadSub, align]}>
                  {rule.projectId ? t('ceoP.brokers.singleProject') : t('ceoP.brokers.allDevProjects')}
                </Text>
              </View>
              <View style={[styles.badges, row]}>
                <Badge tone={rule.access === 'BLOCKED' ? 'red' : 'green'}>
                  {humanise(rule.access)}
                </Badge>
                <Btn
                  title={t('ceoP.brokers.revoke')}
                  variant="ghost"
                  style={styles.mini}
                  disabled={busy}
                  onPress={() => revoke(rule)}
                />
              </View>
            </Pressable>
          );
        })
      )}

      <SectionTitle>{`${t('ceoP.brokers.developers')} (${visibleDevelopers.length})`}</SectionTitle>
      {developersError ? <ErrorBar message={developersError} /> : null}
      <SearchBar
        value={devFilter}
        onChangeText={setDevFilter}
        placeholder={t('ceoP.brokers.filterDevelopers')}
      />
      {selDevs.length > 0 ? (
        <View style={[styles.bulkBar, row]}>
          <Text style={[styles.bulkCount, align]}>
            {`${selDevs.length} ${t('ceoP.brokers.selected')}`}
          </Text>
          <Btn
            title={t('ceoP.brokers.allowSelected')}
            variant="ghost"
            style={styles.bulkAction}
            busy={mutation.busy}
            onPress={() => bulkApply('dev', 'APPROVED')}
          />
          <Btn
            title={t('ceoP.brokers.blockSelected')}
            variant="danger"
            style={styles.bulkAction}
            busy={mutation.busy}
            onPress={() => bulkApply('dev', 'BLOCKED')}
          />
        </View>
      ) : null}
      {visibleDevelopers.length === 0 ? (
        <Text style={[styles.hint, align]}>{t('ceoP.brokers.noDevelopers')}</Text>
      ) : (
        visibleDevelopers.map((dev) => {
          const current = rows.find((r) => r.developerId === dev.id && !r.projectId);
          const busy = busyKey === `dev-${dev.id}`;
          const picked = selDevs.includes(dev.id);
          return (
            <Pressable
              key={dev.id}
              onPress={() => toggle(selDevs, setSelDevs, dev.id)}
              style={[styles.pickRow, picked && styles.pickRowOn]}>
              <View style={styles.leadMain}>
                <Text style={[styles.leadName, align]} numberOfLines={1}>
                  {dev.companyName}
                </Text>
                <Text style={[styles.leadSub, align]}>
                  {`${projects.filter((p) => p.developerId === dev.id).length} ${t('ceoP.brokers.projects')}${
                    current ? ` · ${humanise(current.access)}` : ''
                  }`}
                </Text>
              </View>
              <View style={[styles.badges, row]}>
                <Btn
                  title={t('ceoP.brokers.allowAll')}
                  variant="ghost"
                  style={styles.mini}
                  disabled={busy}
                  onPress={() => setDeveloperAccess(dev, 'APPROVED')}
                />
                <Btn
                  title={t('ceoP.brokers.blockAll')}
                  variant="danger"
                  style={styles.mini}
                  disabled={busy}
                  onPress={() => setDeveloperAccess(dev, 'BLOCKED')}
                />
              </View>
            </Pressable>
          );
        })
      )}

      <SectionTitle>{`${t('ceoP.brokers.projects')} (${visibleProjects.length})`}</SectionTitle>
      {projectsError ? <ErrorBar message={projectsError} /> : null}
      <SearchBar
        value={filter}
        onChangeText={setFilter}
        placeholder={t('ceoP.brokers.filterProjects')}
      />
      {selProjects.length > 0 ? (
        <View style={[styles.bulkBar, row]}>
          <Text style={[styles.bulkCount, align]}>
            {`${selProjects.length} ${t('ceoP.brokers.selected')}`}
          </Text>
          <Btn
            title={t('ceoP.brokers.allowSelected')}
            variant="ghost"
            style={styles.bulkAction}
            busy={mutation.busy}
            onPress={() => bulkApply('proj', 'APPROVED')}
          />
          <Btn
            title={t('ceoP.brokers.blockSelected')}
            variant="danger"
            style={styles.bulkAction}
            busy={mutation.busy}
            onPress={() => bulkApply('proj', 'BLOCKED')}
          />
        </View>
      ) : null}
      {visibleProjects.length === 0 ? (
        <Text style={[styles.hint, align]}>{t('ceoP.brokers.noProjects')}</Text>
      ) : (
        visibleProjects.map((project) => {
          const current = rows.find((r) => r.projectId === project.id);
          const busy = busyKey === project.id;
          const picked = selProjects.includes(project.id);
          return (
            <Pressable
              key={project.id}
              onPress={() => toggle(selProjects, setSelProjects, project.id)}
              style={[styles.pickRow, picked && styles.pickRowOn]}>
              <View style={styles.leadMain}>
                <Text style={[styles.leadName, align]} numberOfLines={1}>
                  {project.name}
                </Text>
                <Text style={[styles.leadSub, align]} numberOfLines={1}>
                  {developerName(project.developerId)}
                </Text>
              </View>
              <View style={[styles.badges, row]}>
                {current ? (
                  <Badge tone={current.access === 'BLOCKED' ? 'red' : 'green'}>
                    {humanise(current.access)}
                  </Badge>
                ) : null}
                <Btn
                  title={t('ceoP.brokers.allow')}
                  variant="ghost"
                  style={styles.mini}
                  disabled={busy}
                  onPress={() => setProjectAccess(project, 'APPROVED')}
                />
                <Btn
                  title={t('ceoP.brokers.block')}
                  variant="ghost"
                  style={styles.mini}
                  disabled={busy}
                  onPress={() => setProjectAccess(project, 'BLOCKED')}
                />
              </View>
            </Pressable>
          );
        })
      )}

      <Btn title={t('ceoP.brokers.done')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/* ─── Tones & styles ────────────────────────────────────────────────────── */

function toneForAccount(isActive: boolean, status?: string): 'green' | 'red' | 'gold' {
  if ((status ?? '') === 'SUSPENDED' || !isActive) return 'red';
  if ((status ?? '') === 'PENDING') return 'gold';
  return 'green';
}

function toneForPartnership(status: string, isActive?: boolean): 'green' | 'red' | 'gold' | 'muted' {
  if (isActive === false) return 'red';
  if (status === 'APPROVED' || status === 'ACTIVE') return 'green';
  if (status === 'REJECTED' || status === 'SUSPENDED' || status === 'EXPIRED') return 'red';
  if (status === 'PENDING' || status === 'UNDER_REVIEW') return 'gold';
  return 'muted';
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md, flexWrap: 'wrap', gap: 8 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 0, marginTop: Spacing.xs },
    badges: { gap: 6, flexWrap: 'wrap', alignItems: 'center' },
    actions: { gap: 8, marginTop: 8 },
    action: { flexGrow: 1, minWidth: 110 },
    meta: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    filters: { flexWrap: 'wrap', gap: 8 },
    sortRow: { gap: 6 },
    sortLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '600' },
    more: { marginTop: Spacing.sm },
    endNote: { color: t.mutedForeground, fontSize: 13, marginTop: Spacing.sm },

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
    sheetTitles: { flex: 1, gap: 2 },
    sheetTitle: { color: t.foreground, fontSize: 17, lineHeight: 24, fontWeight: '700' },
    sheetSubtitle: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
    detailLabel: { color: t.mutedForeground, fontSize: 14, flexShrink: 1 },
    detailValue: { color: t.foreground, fontSize: 14, fontWeight: '600', flexShrink: 1 },

    leadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      padding: 10,
    },
    leadRowChecked: { borderColor: t.primary, backgroundColor: t.muted },
    rowPressed: { opacity: 0.7 },
    leadMain: { flex: 1, gap: 2 },
    leadName: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    leadCode: { color: t.mutedForeground, fontSize: 12, fontWeight: '400' },
    leadSub: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.controlBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: t.primary, borderColor: t.primary },

    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      padding: 10,
    },
    pickRowOn: { borderColor: t.primary, backgroundColor: t.muted },
    mini: { minHeight: 32, paddingHorizontal: 10, paddingVertical: 4 },
    bulkBar: {
      gap: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.primary,
      borderRadius: Radius.md,
      padding: 8,
    },
    bulkCount: { color: t.primary, fontSize: 13, fontWeight: '700', flex: 1 },
    bulkAction: { minHeight: 32, paddingHorizontal: 10, paddingVertical: 4 },

    // Broker-rating moderation queue
    revStars: { flexDirection: 'row', gap: 2, marginTop: 6 },    revComment: { color: t.mutedForeground, fontSize: 14, lineHeight: 19, marginTop: 4 },
    revActions: { gap: 8, flexWrap: 'wrap', marginTop: 8 },

    // Targets progress bars + leaderboard medals
    barOuter: {
      height: 6,
      borderRadius: 3,
      backgroundColor: t.muted,
      overflow: 'hidden',
      marginTop: 4,
    },
    barInner: { height: 6, borderRadius: 3, backgroundColor: t.primary },
    barInnerGold: { height: 6, borderRadius: 3, backgroundColor: t.goldFg },
  }),
);
