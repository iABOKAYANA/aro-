import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRoleDenied } from '@/components/role-gate';
import {
  Avatar,
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
  SectionTitle,
  Segmented,
  Stat,
  toneForStatus,
} from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatDate, formatMoney, humanise, initials, timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Profile = {
  id: string;
  agencyName: string | null;
  /** Not in the route payload today; kept so Arabic picks it up the day it is. */
  agencyNameArabic?: string | null;
  licenseNumber: string | null;
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  yearsExperience: number | null;
  totalDeals: number;
  commissionRate: number | null;
  accountStatus: string;
  isActive: boolean;
};

type Stats = {
  totalLeads: number;
  statusCounts: Record<string, number>;
  activeLeads: number;
  deals: number;
  totalValue: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionPending: number;
  projects: number;
};

type PipelineRow = { status: string; count: number };

type PortalLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  nextFollowUp: string | null;
  createdAt: string;
  projectName: string | null;
  projectSlug: string | null;
  developerName: string | null;
};

type PortalDeal = {
  id: string;
  status: string;
  dealValue: number | null;
  createdAt: string;
  projectName: string;
  developerName: string;
  unitName: string | null;
  commissionAmount: number | null;
  commissionStatus: string | null;
};

type PortalCommission = {
  id: string;
  status: string;
  totalAmount: number;
  brokerAmount: number;
  dueDate: string | null;
  paidDate: string | null;
  createdAt: string;
  projectName: string;
  dealStatus: string;
};

type PortalProject = {
  id: string;
  name: string;
  slug: string;
  coverImage: string | null;
  location: string | null;
  startPrice: number | null;
  developerName: string;
  scope: 'PROJECT' | 'DEVELOPER';
  expiresAt: string | null;
};

type PortalViewing = {
  id: string;
  scheduledAt: string;
  status: string;
  meetingType: string;
  contactPhone: string | null;
};

type PortalResponse = {
  profile: Profile | null;
  viewer: { name: string | null; role: string };
  stats: Stats;
  pipeline: PipelineRow[];
  leads: PortalLead[];
  deals: PortalDeal[];
  commissions: PortalCommission[];
  projects: PortalProject[];
  viewings: PortalViewing[];
};

type Tab = 'overview' | 'leads' | 'deals' | 'commissions' | 'projects';

/** The exact set `PATCH /api/broker/leads` accepts — keep in sync with it. */
const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VIEWING',
  'NEGOTIATION',
  'CONVERTED',
  'LOST',
] as const;

/** The portal already caps its own queries; this caps what one screen paints. */
const MAX_ROWS = 40;
/** How many leads the Overview tab shows before pointing at the full list. */
const OVERVIEW_LEADS = 6;

/**
 * The broker's corner of the platform — the mobile counterpart of the
 * website's `/broker` page.
 *
 * `GET /api/broker/portal` mirrors that page query-for-query, so this screen
 * is a read-mostly port of it: one round trip, five tabs, no local state
 * beyond which tab is open. Lead and project rows deep-link into the app's own
 * detail screens rather than re-implementing them here.
 *
 * CEO/ADMIN pass `useRoleDenied` and land on `profile: null` — the same
 * "no broker profile yet" state the website shows an administrator previewing
 * the portal.
 */
export default function BrokerScreen() {
  const styles = useStyles();
  const { t, row, align, isRtl, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  // Leads-tab controls — the website's search box + status dropdown + inline
  // status select, restated as a SearchBar, filter chips and a badge that
  // expands into a status picker. All hooks stay above the early returns.
  const [leadQuery, setLeadQuery] = useState('');
  const [leadStatus, setLeadStatus] = useState<string>('ALL');
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Dead remote covers hide — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});
  const mutation = useMutation();

  const { data, error, loading, refreshing, refresh, setData } =
    useApi<PortalResponse>('/api/broker/portal');

  // Before the loading check on purpose: a wrong-role deep link gets the
  // refusal instead of a spinner that resolves into a 403.
  const denied = useRoleDenied('broker.noProfile', ['BROKER']);
  if (denied) return denied;

  if (loading) return <Loading label={t('broker.loading')} />;

  // No payload at all: either the first load failed (say that, and offer a
  // retry) or the account simply has no broker record attached.
  if (!data || !data.profile) {
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Stack.Screen options={{ title: t('broker.title') }} />
        {error && !data ? (
          <ErrorBar message={error} onRetry={refresh} />
        ) : (
          <Empty title={t('broker.noProfile')} message={t('broker.noProfileHint')} />
        )}
      </Screen>
    );
  }

  const profile = data.profile;
  const stats = data.stats;
  const pipeline = data.pipeline;
  const leads = data.leads;
  const deals = data.deals;
  const commissions = data.commissions;
  const projects = data.projects;
  const viewings = data.viewings;

  const money = (value: number | null | undefined) =>
    formatMoney(value, currency, rates, { compact: true });

  const agency = localized(profile.agencyName, profile.agencyNameArabic) || data.viewer.name || '—';
  const suspended = profile.accountStatus !== 'ACTIVE' || !profile.isActive;
  const maxPipeline = Math.max(1, ...pipeline.map((bar) => bar.count));

  /** "E£ 1M – E£ 2M", or whichever single bound the lead actually carries. */
  const budgetOf = (lead: PortalLead): string | null => {
    if (lead.budgetMin == null && lead.budgetMax == null) return null;
    const low = lead.budgetMin ?? lead.budgetMax!;
    const high = lead.budgetMax ?? lead.budgetMin!;
    return `${t('broker.budget')} ${money(low)}${high !== low ? ` – ${money(high)}` : ''}`;
  };

  /** The booked date, not a countdown — `timeAgo` would read "just now" for
   *  every follow-up still in the future, and render must stay pure. */
  const followUpOf = (iso: string | null): string | null =>
    iso ? `${t('broker.followUp')} ${formatDate(iso)}` : null;

  // The website's Leads-tab filter: status first, then one search box over
  // name / phone / email / project — the same four fields it matches.
  const leadNeedle = leadQuery.trim().toLowerCase();
  const filteredLeads = leads.filter((lead) => {
    if (leadStatus !== 'ALL' && lead.status !== leadStatus) return false;
    if (!leadNeedle) return true;
    return [lead.name, lead.phone, lead.email, lead.projectName].some((field) =>
      (field ?? '').toLowerCase().includes(leadNeedle),
    );
  });

  /**
   * The website's inline status select (`PATCH /api/broker/leads { id, status }`),
   * optimistic with a rollback — the same shape it uses, so a rejection never
   * strands a row on a status the server refused.
   */
  async function changeLeadStatus(lead: PortalLead, next: string): Promise<void> {
    if (next === lead.status || savingLeadId !== null) return;
    const previous = lead.status;
    setSavingLeadId(lead.id);
    setStatusError(null);
    setData((prev) =>
      prev
        ? { ...prev, leads: prev.leads.map((row) => (row.id === lead.id ? { ...row, status: next } : row)) }
        : prev,
    );
    try {
      await mutation.run('/api/broker/leads', 'PATCH', { id: lead.id, status: next });
      setExpandedLead(null);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : t('broker.statusUpdateFailed'));
      setData((prev) =>
        prev
          ? {
              ...prev,
              leads: prev.leads.map((row) => (row.id === lead.id ? { ...row, status: previous } : row)),
            }
          : prev,
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('broker.title') }} />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {/* Non-blocking: a paused account keeps working, it just may lose leads. */}
      {suspended ? (
        <ErrorBar message={`${t('broker.suspended')} — ${t('broker.suspendedHint')}`} />
      ) : null}

      <Segmented<Tab>
        options={[
          { value: 'overview', label: t('broker.tab.overview') },
          { value: 'leads', label: t('broker.tab.leads') },
          { value: 'deals', label: t('broker.tab.deals') },
          { value: 'commissions', label: t('broker.tab.commissions') },
          { value: 'projects', label: t('broker.tab.projects') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
        <>
          <Card>
            <View style={[styles.profile, row]}>
              <Avatar text={initials(agency)} size={52} />
              <View style={styles.profileMain}>
                <Text style={[styles.agency, align]} numberOfLines={1}>
                  {agency}
                </Text>
                <Text style={[styles.meta, align]}>
                  ★ {profile.rating.toFixed(1)} · {profile.reviewCount} {t('broker.reviews')}
                </Text>
              </View>
            </View>

            <View style={[styles.chipRow, row]}>
              {profile.licenseNumber ? (
                <Badge tone="blue">{`${t('broker.license')} ${profile.licenseNumber}`}</Badge>
              ) : null}
              <Badge tone={profile.isVerified ? 'green' : 'muted'}>
                {profile.isVerified ? t('broker.verified') : t('broker.unverified')}
              </Badge>
              <Badge tone={suspended ? 'red' : toneForStatus(profile.accountStatus)}>
                {suspended ? t('broker.suspended') : humanise(profile.accountStatus)}
              </Badge>
            </View>

            <Divider />

            {/* The website's "Your account" panel, condensed into the profile
                card: experience, recorded deals, rate and status. */}
            <Row
              title={t('broker.experience')}
              right={
                <Text style={[styles.rate, align]}>
                  {profile.yearsExperience != null
                    ? `${profile.yearsExperience} ${t('broker.years')}`
                    : '—'}
                </Text>
              }
            />
            <Row
              title={t('broker.dealsRecorded')}
              right={<Text style={[styles.rate, align]}>{profile.totalDeals}</Text>}
            />
            <Row
              title={t('broker.commissionRate')}
              right={
                <Text style={[styles.rate, align]}>
                  {profile.commissionRate != null ? `${profile.commissionRate}%` : '—'}
                </Text>
              }
            />
            <Row
              title={t('broker.status')}
              right={<Text style={[styles.rate, align]}>{humanise(profile.accountStatus)}</Text>}
            />
          </Card>

          <MyRatingCard brokerId={profile.id} />

          <Card style={[styles.kpiGrid, row]}>
            <View style={styles.kpiCell}>
              <Stat value={String(stats.totalLeads)} label={t('broker.totalLeads')} />
            </View>
            <View style={styles.kpiCell}>
              <Stat value={String(stats.activeLeads)} label={t('broker.activeLeads')} />
            </View>
            <View style={styles.kpiCell}>
              <Stat value={String(stats.deals)} label={t('broker.dealsCount')} />
            </View>
            <View style={styles.kpiCell}>
              <Stat value={money(stats.totalValue)} label={t('broker.dealValue')} />
            </View>
            <View style={styles.kpiCell}>
              <Stat value={money(stats.commissionTotal)} label={t('broker.yourShare')} />
            </View>
            <View style={styles.kpiCell}>
              <Stat value={String(stats.projects)} label={t('broker.tab.projects')} />
            </View>
          </Card>

          {pipeline.length > 0 && stats.totalLeads > 0 ? (
            <Card>
              <SectionTitle>{t('broker.pipeline')}</SectionTitle>
              {pipeline.map((bar) => (
                <View key={bar.status} style={[styles.barRow, row]}>
                  <Text style={[styles.barLabel, align]} numberOfLines={1}>
                    {humanise(bar.status)}
                  </Text>
                  <View style={[styles.track, isRtl && styles.trackRtl]}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${Math.round((bar.count / maxPipeline) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barValue, align]}>{bar.count}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          <Card>
            <SectionTitle>{t('broker.upcoming')}</SectionTitle>
            {viewings.length === 0 ? (
              <Empty title={t('broker.noUpcoming')} />
            ) : (
              viewings.map((viewing, index) => (
                <View key={viewing.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={formatDate(viewing.scheduledAt, true)}
                    subtitle={[
                      viewing.meetingType ? humanise(viewing.meetingType) : null,
                      viewing.contactPhone,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      <Badge tone={toneForStatus(viewing.status)}>
                        {humanise(viewing.status)}
                      </Badge>
                    }
                  />
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle
              action={
                <Chip
                  label={t('broker.tab.leads')}
                  selected={false}
                  onPress={() => setTab('leads')}
                />
              }>
              {t('broker.recentLeads')}
            </SectionTitle>
            {leads.length === 0 ? (
              <Empty title={t('broker.noLeads')} message={t('broker.noLeadsHint')} />
            ) : (
              leads.slice(0, OVERVIEW_LEADS).map((lead, index) => (
                <View key={lead.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={lead.name}
                    subtitle={[
                      lead.phone ?? lead.email,
                      lead.projectName,
                      budgetOf(lead),
                      followUpOf(lead.nextFollowUp),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={<Badge tone={toneForStatus(lead.status)}>{humanise(lead.status)}</Badge>}
                    onPress={() => router.push(`/lead/${lead.id}`)}
                  />
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}

      {tab === 'leads' ? (
        <>
          <SearchBar
            value={leadQuery}
            onChangeText={setLeadQuery}
            placeholder={t('broker.searchLeads')}
          />
          <View style={[styles.chipRow, row]}>
            <Chip
              label={t('broker.allStatuses')}
              selected={leadStatus === 'ALL'}
              onPress={() => setLeadStatus('ALL')}
            />
            {LEAD_STATUSES.map((status) => (
              <Chip
                key={status}
                label={humanise(status)}
                selected={leadStatus === status}
                onPress={() => setLeadStatus(leadStatus === status ? 'ALL' : status)}
              />
            ))}
          </View>
          <Text style={[styles.hint, align]}>{t('broker.tapStatusHint')}</Text>
          {statusError ? <ErrorBar message={statusError} /> : null}
          {filteredLeads.length === 0 ? (
            <Empty title={t('broker.noLeads')} message={t('broker.noLeadsHint')} />
          ) : (
            <Card style={styles.list}>
              <SectionTitle>{`${t('broker.tab.leads')} (${filteredLeads.length})`}</SectionTitle>
              {filteredLeads.slice(0, MAX_ROWS).map((lead, index) => (
                <View key={lead.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={lead.name}
                    subtitle={[
                      lead.phone ?? lead.email,
                      lead.projectName,
                      budgetOf(lead),
                      followUpOf(lead.nextFollowUp),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      <Pressable
                        hitSlop={8}
                        accessibilityRole="button"
                        onPress={() =>
                          setExpandedLead(expandedLead === lead.id ? null : lead.id)
                        }>
                        <Badge tone={toneForStatus(lead.status)}>
                          {humanise(lead.status)}
                        </Badge>
                      </Pressable>
                    }
                    onPress={() => router.push(`/lead/${lead.id}`)}
                  />
                  {expandedLead === lead.id ? (
                    <View style={[styles.statusEditor, row]}>
                      {LEAD_STATUSES.map((status) => (
                        <Chip
                          key={status}
                          label={humanise(status)}
                          selected={status === lead.status}
                          disabled={status === lead.status || savingLeadId === lead.id}
                          onPress={() => void changeLeadStatus(lead, status)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}

      {tab === 'deals' ? (
        deals.length === 0 ? (
          <Empty title={t('broker.noDeals')} message={t('broker.noDealsHint')} />
        ) : (
          <Card style={styles.list}>
            {deals.slice(0, MAX_ROWS).map((deal, index) => (
              <View key={deal.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={deal.projectName}
                  subtitle={[
                    deal.unitName,
                    deal.developerName,
                    deal.commissionAmount != null
                      ? `${t('broker.brokerShare')} ${money(deal.commissionAmount)}`
                      : null,
                    timeAgo(deal.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={<Badge tone={toneForStatus(deal.status)}>{humanise(deal.status)}</Badge>}
                  right={
                    <Text style={[styles.amount, align]}>{money(deal.dealValue)}</Text>
                  }
                />
              </View>
            ))}
          </Card>
        )
      ) : null}

      {tab === 'commissions' ? (
        <>
          <Card style={[styles.kpiGrid, row]}>
            <View style={styles.kpiCell}>
              <Stat value={money(stats.commissionTotal)} label={t('broker.total')} />
            </View>
            <View style={styles.kpiCell}>
              <Stat value={money(stats.commissionPaid)} label={t('broker.paid')} />
            </View>
            <View style={styles.kpiCell}>
              <Stat value={money(stats.commissionPending)} label={t('broker.pending')} />
            </View>
          </Card>

          {commissions.length === 0 ? (
            <Empty title={t('broker.noCommissions')} message={t('broker.noCommissionsHint')} />
          ) : (
            <Card style={styles.list}>
              {commissions.slice(0, MAX_ROWS).map((commission, index) => (
                <View key={commission.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={commission.projectName}
                    subtitle={[
                      `${t('broker.brokerShare')} ${money(commission.brokerAmount)}`,
                      `${t('broker.total')} ${money(commission.totalAmount)}`,
                      commission.dueDate
                        ? `${t('broker.dueDate')} ${formatDate(commission.dueDate)}`
                        : null,
                      commission.paidDate
                        ? `${t('broker.paidDate')} ${formatDate(commission.paidDate)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      <Badge tone={toneForStatus(commission.status)}>
                        {humanise(commission.status)}
                      </Badge>
                    }
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}

      {tab === 'projects' ? (
        projects.length === 0 ? (
          <Empty title={t('broker.noProjects')} message={t('broker.noProjectsHint')} />
        ) : (
          <Card style={styles.list}>
            {projects.slice(0, MAX_ROWS).map((project, index) => {
              const src = imageUrl(project.coverImage);
              return (
              <View key={project.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  left={
                    src && !deadImgs[src] ? (
                      <Image
                        source={{ uri: src }}
                        style={styles.thumb}
                        onError={() =>
                          setDeadImgs((prev) => (prev[src] ? prev : { ...prev, [src]: true }))
                        }
                      />
                    ) : undefined
                  }
                  title={project.name}
                  subtitle={[
                    project.location,
                    project.developerName || null,
                    project.startPrice != null
                      ? `${t('broker.startPrice')} ${money(project.startPrice)}`
                      : null,
                    project.expiresAt ? `${t('broker.expires')} ${formatDate(project.expiresAt)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={
                    <Badge tone="blue">
                      {project.scope === 'PROJECT'
                        ? t('broker.scopeProject')
                        : t('broker.scopeDeveloper')}
                    </Badge>
                  }
                  onPress={() => router.push(`/project/${project.slug}`)}
                />
              </View>
              );
            })}
          </Card>
        )
      ) : null}
    </Screen>
  );
}

// ─── My rating — approved client ratings of this broker ─────────────────
// `brokerId` is the BrokerProfile id the portal already hands out; the API
// also accepts it (it resolves to the broker's User id server-side).

type BrokerRating = {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  rater?: { name?: string | null } | null;
};

type BrokerRatingsResponse = {
  reviews?: BrokerRating[];
  average?: number | null;
  count?: number;
};

function MyRatingCard({ brokerId }: { brokerId: string }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const { data, error, loading, refreshing, refresh } = useApi<BrokerRatingsResponse>(
    `/api/broker-reviews?brokerId=${brokerId}`,
  );

  const reviews = data?.reviews ?? [];
  const average = data?.average ?? null;
  const count = data?.count ?? 0;

  return (
    <Card>
      <SectionTitle>{t('brate.myRating')}</SectionTitle>
      {loading ? (
        <Loading label={t('broker.loading')} />
      ) : error ? (
        <ErrorBar message={error} onRetry={refresh} />
      ) : reviews.length === 0 ? (
        <Empty title={t('brate.noReviews')} message={t('brate.noReviewsHint')} />
      ) : (
        <View style={refreshing ? styles.dimmed : undefined}>
          <View style={[styles.ratingHead, row]}>
            <View style={[styles.ratingStars, row]}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= Math.round(average ?? 0) ? 'star' : 'star-outline'}
                  size={16}
                  color={star <= Math.round(average ?? 0) ? theme.primary : theme.mutedForeground}
                />
              ))}
            </View>
            <Text style={[styles.ratingSummary, align]}>
              {average != null ? average.toFixed(1) : '—'} {t('brate.from5')} · {count}{' '}
              {t('brate.ratings')}
            </Text>
          </View>
          {reviews.map((review, index) => (
            <View key={review.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={review.rater?.name || t('brate.client')}
                subtitle={
                  [
                    review.comment ?? undefined,
                    formatDate(review.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                badge={<Badge tone="gold">★ {review.rating}</Badge>}
              />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    // Profile card
    profile: { alignItems: 'center', gap: 12 },
    profileMain: { flex: 1, gap: 4 },
    agency: { color: t.foreground, fontSize: 18, fontWeight: '800' },
    meta: { color: t.mutedForeground, fontSize: 12 },
    chipRow: { flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    rate: { color: t.primary, fontSize: 15, fontWeight: '700' },

    // KPI grid — `Stat` cells that wrap three to a row on a phone.
    kpiGrid: { flexWrap: 'wrap', gap: 8 },
    kpiCell: { flexGrow: 1, flexBasis: '30%', minWidth: 96, alignItems: 'center' },

    // Pipeline bars — plain Views sized as a % of the largest count, the
    // same technique as src/app/ceo/analytics.tsx: no charting dependency.
    barRow: { alignItems: 'center', gap: 8, paddingVertical: 3 },
    barLabel: { color: t.mutedForeground, fontSize: 12, width: 96 },
    track: {
      flex: 1,
      height: 8,
      borderRadius: Radius.sm,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    // In RTL the bar grows from the right-hand (reading) edge instead.
    trackRtl: { justifyContent: 'flex-end' },
    fill: { height: 8, borderRadius: Radius.sm, backgroundColor: t.primary },
    barValue: { color: t.foreground, fontSize: 12, fontWeight: '700', minWidth: 26 },

    // List furniture
    amount: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    list: { gap: 0 },
    thumb: { width: 44, height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: t.border },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    // Inline status picker — the website's per-row `<select>`, restated as
    // wrapping chips so every status stays tappable on a narrow screen.
    statusEditor: { flexWrap: 'wrap', gap: 8, paddingTop: 8, paddingBottom: 4 },

    // My-rating card — the broker portal's approved client reviews.
    dimmed: { opacity: 0.6 },
    ratingHead: { alignItems: 'center', gap: 8, marginBottom: 4 },
    ratingStars: { flexDirection: 'row', gap: 2 },
    ratingSummary: { color: t.foreground, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  })
);
