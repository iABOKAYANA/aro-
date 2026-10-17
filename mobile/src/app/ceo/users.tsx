import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/auth-context';

import {
  Avatar,
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorBar,
  Loading,
  Row,
  Screen,
  SearchBar,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { humanise, initials, timeAgo } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  status?: string;
  isVerified?: boolean;
  isActive?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
};

/** The exact list `PATCH /api/ceo/users/[id]/role` validates against. */
const ROLES = ['CEO', 'ADMIN', 'BROKER', 'DEVELOPER', 'SELLER', 'BUYER'];

/** The statuses `PATCH /api/ceo/users` accepts, as the website's pills show. */
const STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED', 'DISABLED'];

const MAX_RENDER = 60;

/**
 * First-page size for the opt-in cursor pagination
 * (`GET /api/ceo/users?limit=` → `{ items, nextCursor }`). No `limit` param
 * means the legacy `{ users }` full list — the pager below falls back to it.
 */
const PAGE_LIMIT = 50;

/**
 * Every account on the platform, with the two levers the website's user
 * directory has: a role change and a suspend/reactivate.
 *
 * Both write through the same calls the web console uses —
 * `PATCH /api/ceo/users/[id]/role` for the role (audited as
 * `USER_ROLE_CHANGED`) and `PATCH /api/ceo/users` for the account state with
 * the exact `{ userId, isActive, status }` payload, so a change here and a
 * change on the site land in the same row. Role changes and suspensions ask
 * first: both take effect immediately and one of them locks someone out.
 */
export default function CeoUsersScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Cursor-pager accumulation: page 1 arrives via `useApi`, later pages append
  // through `loadMore`. `cursor` is the outstanding `nextCursor` (null = done
  // or legacy mode); it resets whenever the first-page response changes.
  const { session } = useAuth();
  const [extra, setExtra] = useState<User[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const firstPath = query.trim()
    ? `/api/ceo/users?search=${encodeURIComponent(query.trim())}&limit=${PAGE_LIMIT}`
    : `/api/ceo/users?limit=${PAGE_LIMIT}`;

  const { data, error, loading, refreshing, refresh } = useApi<{
    users?: User[];
    items?: User[];
    nextCursor?: string | null;
  }>(firstPath);
  const mutation = useMutation();

  useEffect(() => {
    setExtra([]);
    setMoreError(null);
    setCursor(data && Array.isArray(data.items) ? (data.nextCursor ?? null) : null);
  }, [data]);

  const pageItems = data && Array.isArray(data.items) ? data.items : null;
  const isPaged = pageItems !== null;
  const users = pageItems ? [...pageItems, ...extra] : (data?.users ?? []);
  const roleCounts: Record<string, number> = {};
  for (const role of ROLES) {
    roleCounts[role] = users.filter((u) => (u.role ?? '').toUpperCase() === role).length;
  }
  const statusCounts: Record<string, number> = {};
  for (const status of STATUSES) {
    statusCounts[status] = users.filter((u) => (u.status ?? '').toUpperCase() === status).length;
  }
  const suspended = users.filter((u) => u.status === 'SUSPENDED' || u.isActive === false).length;

  async function changeRole(user: User, role: string) {
    setBusyId(user.id);
    setProblem(null);
    setSavedId(null);
    try {
      await mutation.run(`/api/ceo/users/${user.id}/role`, 'PATCH', { role });
      setSavedId(user.id);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  /** The website's "Change User Role" dialog: this takes effect immediately. */
  function confirmRoleChange(user: User, role: string) {
    if ((user.role ?? '').toUpperCase() === role) return;
    const userName = user.name || user.email || user.id;
    Alert.alert(
      t('ceoI.changeRoleTitle'),
      `${userName}: ${humanise(user.role ?? '')} → ${role}. ${t('ceoI.takesEffect')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: () => void changeRole(user, role) },
      ],
    );
  }

  /** Same payload shape `manage.tsx` already sends for the directory rows. */
  async function setStatus(user: User, isActive: boolean) {
    setBusyId(user.id);
    setProblem(null);
    setSavedId(null);
    try {
      await mutation.run('/api/ceo/users', 'PATCH', {
        userId: user.id,
        isActive,
        status: isActive ? 'ACTIVE' : 'SUSPENDED',
      });
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  /** Reactivating is harmless; suspending locks the account out, so it asks. */
  function toggleStatus(user: User) {
    const isActive = user.isActive ?? user.status === 'ACTIVE';
    if (!isActive) {
      void setStatus(user, true);
      return;
    }
    Alert.alert(t('ceo.suspendTitle'), t('ceo.suspendBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => void setStatus(user, false),
      },
    ]);
  }

  /** Append the next cursor page. Guarded by `cursor == null` in legacy mode. */
  async function loadMore() {
    if (moreBusy || cursor == null) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await apiFetch<{ items?: User[]; nextCursor?: string | null }>(
        `${firstPath}&cursor=${encodeURIComponent(cursor)}`,
        { token: session?.token ?? null, cookieName: session?.cookieName ?? null },
      );
      const fresh = Array.isArray(page?.items) ? page.items : [];
      setExtra((prev) => {
        const seen = new Set([...(pageItems ?? []), ...prev].map((u) => u.id));
        return [...prev, ...fresh.filter((u) => !seen.has(u.id))];
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
  const searched = needle
    ? users.filter((u) =>
        [u.name, u.email, u.phone, u.role].some((v) => (v ?? '').toLowerCase().includes(needle)),
      )
    : users;
  const filtered = searched.filter((u) => {
    const matchesRole = roleFilter === 'ALL' || (u.role ?? '').toUpperCase() === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || (u.status ?? '').toUpperCase() === statusFilter;
    return matchesRole && matchesStatus;
  });
  // Paged mode grows through "Load more"; legacy full-list keeps the old cap.
  const rows = isPaged ? filtered : filtered.slice(0, MAX_RENDER);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.usersScreen') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={users.length} label={t('ceo.totalUsers')} />
        <Stat value={suspended} label={t('ceo.suspendedAccounts')} />
      </Card>

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.searchUsers')} />

      <Text style={[styles.filterLabel, align]}>{t('ceoI.roleFilter')}</Text>
      <View style={[styles.filters, row]}>
        <Chip
          label={`${t('common.all')} (${users.length})`}
          selected={roleFilter === 'ALL'}
          onPress={() => setRoleFilter('ALL')}
        />
        {ROLES.map((role) => (
          <Chip
            key={role}
            label={`${role} (${roleCounts[role] ?? 0})`}
            selected={roleFilter === role}
            onPress={() => setRoleFilter((prev) => (prev === role ? 'ALL' : role))}
          />
        ))}
      </View>

      <Text style={[styles.filterLabel, align]}>{t('ceoI.statusFilter')}</Text>
      <View style={[styles.filters, row]}>
        <Chip
          label={`${t('common.all')} (${users.length})`}
          selected={statusFilter === 'ALL'}
          onPress={() => setStatusFilter('ALL')}
        />
        {STATUSES.map((status) => (
          <Chip
            key={status}
            label={`${humanise(status)} (${statusCounts[status] ?? 0})`}
            selected={statusFilter === status}
            onPress={() => setStatusFilter((prev) => (prev === status ? 'ALL' : status))}
          />
        ))}
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {!error && rows.length === 0 ? (
        <Empty title={t('ceo.users.none')} message={t('ceo.users.noneHint')} />
      ) : null}

      {!isPaged && filtered.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${filtered.length}`}
        </Text>
      ) : null}

      {rows.map((user, index) => {
        const isOpen = expanded === user.id;
        const busy = busyId === user.id;
        const isActive = user.isActive ?? user.status === 'ACTIVE';

        return (
          <View key={user.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={<Avatar text={initials(user.name ?? user.email)} />}
                title={user.name || user.email || user.id}
                subtitle={[
                  user.email,
                  user.lastLoginAt
                    ? `${t('ceo.lastLogin')} ${timeAgo(user.lastLoginAt)}`
                    : user.createdAt
                      ? `${t('ceo.joinedAt')} ${timeAgo(user.createdAt)}`
                      : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone="blue">{(user.role ?? 'BUYER').toUpperCase()}</Badge>
                    <Badge tone={isActive ? 'green' : 'red'}>
                      {humanise(user.status ?? (isActive ? 'ACTIVE' : 'SUSPENDED'))}
                    </Badge>
                  </View>
                }
                onPress={() => setExpanded(isOpen ? null : user.id)}
              />

              {isOpen ? (
                <View style={styles.actions}>
                  <Divider />

                  <Text style={[styles.roleLabel, align]}>{t('ceo.setRole')}</Text>
                  <View style={[styles.roleRow, row]}>
                    {ROLES.map((role) => (
                      <Chip
                        key={role}
                        label={role}
                        disabled={busy}
                        selected={(user.role ?? '').toUpperCase() === role}
                        onPress={() => void confirmRoleChange(user, role)}
                      />
                    ))}
                  </View>

                  {savedId === user.id ? (
                    <Text style={styles.saved}>{`${t('ceo.roleUpdated')} ✓`}</Text>
                  ) : null}

                  <Btn
                    title={isActive ? t('ceo.suspend') : t('ceo.activate')}
                    variant={isActive ? 'danger' : 'primary'}
                    busy={busy}
                    onPress={() => toggleStatus(user)}
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
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md },
    filterLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '700' },
    filters: { flexWrap: 'wrap', gap: 8 },
    count: { color: t.mutedForeground, fontSize: 13 },
    more: { marginTop: Spacing.sm },
    endNote: { color: t.mutedForeground, fontSize: 13, marginTop: Spacing.sm },
    card: { gap: 0, marginTop: Spacing.xs },
    badges: { gap: 6, flexWrap: 'wrap' },
    actions: { gap: 8, marginTop: 8 },
    roleLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '700' },
    roleRow: { flexWrap: 'wrap', gap: 8 },
    saved: { color: t.successFg, fontSize: 14, fontWeight: '700' },
  }),
);
