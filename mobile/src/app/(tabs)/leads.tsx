import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRequireAuth } from '@/components/auth-gate';
import {
  Badge,
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
import { useAuth } from '@/auth/auth-context';
import { Radius } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, humanise, timeAgo } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

type Lead = {
  id: string;
  leadCode?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  source?: string | null;
  createdAt: string;
  reviewStatus?: string;
  protectionExpiresAt?: string | null;
  protectionStatus?: 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE';
  project?: { name: string } | null;
  broker?: { agencyName?: string | null; user?: { name?: string | null } | null } | null;
  deals?: { id: string; status: string; dealValue?: number | null }[];
};

type LeadsResponse = {
  leads?: Lead[];
  total?: number;
  page?: number;
  totalPages?: number;
};

/** The nine cards `GET /api/leads/stats` feeds. */
type Stats = {
  totalLeads: number;
  activeProtected: number;
  expiringSoon: number;
  expired: number;
  duplicateReview: number;
  qualified: number;
  viewings: number;
  reservations: number;
  sold: number;
};

type StatsResponse = { stats?: Stats };

/**
 * The website's `ALL_STATUSES` on /dashboard/leads — every value the status
 * `<select>` offers, and all of them real `LEAD_STATUSES` values. The old list
 * carried `NEGOTIATION` and `WON`, which exist nowhere in the lifecycle, so
 * those two chips always filtered to nothing.
 */
const STATUS_FILTERS = [
  '',
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VIEWING',
  'INTERESTED',
  'RESERVATION',
  'CONTRACT',
  'SOLD',
  'LOST',
  'CANCELLED',
  'EXPIRED',
];

/** The site's protection chips — the four keys `?protection=` understands. */
const PROTECTION_FILTERS = ['', 'active', 'expiring', 'expired'] as const;

const PAGE_SIZE = 25;

export default function LeadsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, isRtl } = useI18n();
  const { t: theme } = useTheme();
  const { hasRole } = useAuth();
  const [status, setStatus] = useState('');
  const [protection, setProtection] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Same trio `POST /api/leads` allows — a developer never sees the button
  // for a form the server would answer with a 403.
  const canCreate = hasRole('BROKER', 'CEO', 'ADMIN');

  const path = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (protection) params.set('protection', protection);
    if (query.trim()) params.set('search', query.trim());
    return `/api/leads?${params.toString()}`;
  }, [page, status, protection, query]);

  const { data, error, loading, refreshing, refresh } = useApi<LeadsResponse>(path);
  // Same scoped numbers the website's header cards read. A failure just
  // withholds the cards — the list below is the screen's real content.
  const { data: statsData, refresh: refreshStats } = useApi<StatsResponse>('/api/leads/stats');

  const leads = data?.leads ?? [];
  const totalPages = data?.totalPages ?? 1;
  const stats = statsData?.stats ?? null;

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  if (loading) return <Loading label={t('leads.loading')} />;

  const statCards: { key: MessageKey; value: number }[] = stats
    ? [
        { key: 'leads.statMyLeads', value: stats.totalLeads },
        { key: 'leads.statActiveProtected', value: stats.activeProtected },
        { key: 'leads.expiringSoon', value: stats.expiringSoon },
        { key: 'leads.statExpired', value: stats.expired },
        { key: 'leads.statDuplicate', value: stats.duplicateReview },
        { key: 'leads.statQualified', value: stats.qualified },
        { key: 'leads.statViewings', value: stats.viewings },
        { key: 'leads.statReservations', value: stats.reservations },
        { key: 'leads.statSold', value: stats.sold },
      ]
    : [];

  function reload() {
    refresh();
    refreshStats();
  }

  function protectionLabelOf(value: (typeof PROTECTION_FILTERS)[number]): string {
    if (value === 'active') return t('leads.protected');
    if (value === 'expiring') return t('leads.expiringSoon');
    if (value === 'expired') return t('leads.expired');
    return t('common.all');
  }

  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <View style={[styles.searchRow, row]}>
        <View style={styles.searchGrow}>
          <SearchBar value={query} onChangeText={(next) => { setQuery(next); setPage(1); }} placeholder={t('leads.searchPlaceholder')} />
        </View>
        {canCreate ? (
          <Pressable
            onPress={() => router.push('/lead/new')}
            accessibilityRole="button"
            accessibilityLabel={t('leads.new')}
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}>
            <Ionicons name="add" size={22} color={theme.primaryForeground} />
          </Pressable>
        ) : null}
      </View>

      {stats ? (
        <Card style={[styles.kpiGrid, row]}>
          {statCards.map((card) => (
            <View key={card.key} style={styles.kpiCell}>
              <Stat value={card.value} label={t(card.key)} />
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.filterGroup}>
        <Text style={[styles.filterLabel, align]}>{t('leads.filterProtection')}</Text>
        <View style={[styles.filters, row]}>
          {PROTECTION_FILTERS.map((value) => (
            <Chip
              key={value || 'all-protection'}
              label={protectionLabelOf(value)}
              selected={protection === value}
              onPress={() => {
                setProtection(value);
                setPage(1);
              }}
            />
          ))}
        </View>
      </View>

      <View style={styles.filterGroup}>
        <Text style={[styles.filterLabel, align]}>{t('common.status')}</Text>
        <View style={[styles.filters, row]}>
          {STATUS_FILTERS.map((value) => (
            <Chip
              key={value || 'all-status'}
              label={value ? humanise(value) : t('leads.allStatuses')}
              selected={status === value}
              onPress={() => {
                setStatus(value);
                setPage(1);
              }}
            />
          ))}
        </View>
      </View>

      {data?.total !== undefined ? (
        <Text style={[styles.count, align]}>
          {data.total.toLocaleString('en-US')}{' '}
          {data.total === 1 ? t('leads.countOne') : t('leads.countMany')}
        </Text>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={reload} /> : null}

      {!error && leads.length === 0 ? (
        <Empty title={t('leads.empty')} message={t('leads.emptyHint')} />
      ) : null}

      <Card style={styles.list}>
        {leads.map((lead, index) => {
          const deal = lead.deals && lead.deals.length > 0 ? lead.deals[0] : null;
          return (
            <View key={lead.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={lead.name}
                subtitle={[
                  lead.leadCode,
                  lead.phone ?? lead.email,
                  lead.project?.name,
                  timeAgo(lead.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone={toneFor(lead.status)}>{humanise(lead.status)}</Badge>
                    {lead.reviewStatus === 'DUPLICATE_REVIEW' ? (
                      <Badge tone="gold">{t('leads.duplicateBadge')}</Badge>
                    ) : null}
                  </View>
                }
                right={
                  <View style={[styles.right, isRtl && styles.rightRtl]}>
                    <View style={[styles.badges, row]}>
                      <Badge tone={protectionTone(lead.protectionStatus)}>
                        {protectionLabel(lead.protectionStatus, t)}
                      </Badge>
                      {deal ? <Badge tone="blue">{humanise(deal.status)}</Badge> : null}
                    </View>
                    {lead.protectionExpiresAt ? (
                      <Text style={[styles.expiry, align]}>{formatDate(lead.protectionExpiresAt)}</Text>
                    ) : null}
                  </View>
                }
                onPress={() => router.push(`/lead/${lead.id}`)}
              />
            </View>
          );
        })}
      </Card>

      {totalPages > 1 ? (
        <View style={[styles.pager, row]}>
          <Chip label={t('common.prev')} selected={false} onPress={page > 1 ? () => setPage(page - 1) : undefined} />
          <Text style={styles.pageLabel}>
            {page} / {totalPages}
          </Text>
          <Chip
            label={t('common.next')}
            selected={false}
            onPress={page < totalPages ? () => setPage(page + 1) : undefined}
          />
        </View>
      ) : null}
    </Screen>
  );
}

/** The site's `protectionBadge()` colours, on the kit's badge palette. */
function protectionTone(status: string | undefined): 'green' | 'gold' | 'red' | 'muted' {
  const s = (status ?? 'NONE').toUpperCase();
  if (s === 'PROTECTED') return 'green';
  if (s === 'EXPIRING_SOON') return 'gold';
  if (s === 'EXPIRED') return 'red';
  return 'muted';
}

function protectionLabel(status: string | undefined, t: (key: MessageKey) => string): string {
  const s = (status ?? 'NONE').toUpperCase();
  if (s === 'PROTECTED') return t('leads.protected');
  if (s === 'EXPIRING_SOON') return t('leads.expiring');
  if (s === 'EXPIRED') return t('leads.expired');
  return t('leads.noProtection');
}

/** The site's STATUS_COLORS mapped onto the five badge tones. */
function toneFor(status: string): 'green' | 'red' | 'gold' | 'blue' | 'muted' {
  const s = (status ?? '').toUpperCase();
  if (['WON', 'QUALIFIED', 'CONVERTED', 'CLOSED_WON', 'SOLD'].includes(s)) return 'green';
  if (['LOST', 'DISQUALIFIED', 'REJECTED', 'CLOSED_LOST', 'CANCELLED'].includes(s)) return 'red';
  if (['NEW', 'CONTACTED', 'FOLLOW_UP', 'NEGOTIATION', 'RESERVATION'].includes(s)) return 'gold';
  if (['VIEWING', 'INTERESTED', 'PROPOSAL', 'CONTRACT'].includes(s)) return 'blue';
  return 'muted';
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    searchRow: { alignItems: 'center', gap: 8 },
    searchGrow: { flex: 1 },
    // New-lead action — the primary button's fill, mirroring the trailing
    // edge in RTL via `row` on the container.
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: Radius.md,
      backgroundColor: t.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnPressed: { opacity: 0.85 },

    // KPI grid — `Stat` cells that wrap three to a row on a phone, the same
    // grid the website runs at `lg:grid-cols-5` (nine cards → 3 × 3).
    kpiGrid: { flexWrap: 'wrap', gap: 8 },
    kpiCell: { flexGrow: 1, flexBasis: '30%', minWidth: 96, alignItems: 'center' },

    filterGroup: { gap: 6 },
    filterLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '600' },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    count: { color: t.mutedForeground, fontSize: 14 },

    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    right: { alignItems: 'flex-end', gap: 4 },
    rightRtl: { alignItems: 'flex-start' },
    expiry: { color: t.mutedForeground, fontSize: 12 },

    list: { gap: 0 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
    pageLabel: { color: t.mutedForeground, fontSize: 14 },
  })
);
