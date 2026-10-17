import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Chip, Empty, ErrorBar, Loading, Screen, SectionTitle } from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/** `GET /api/leads/stats` → `stats`, the website's card payload verbatim. */
type LeadStats = {
  totalLeads: number;
  newLeads: number;
  activeProtected: number;
  expiringSoon: number;
  expired: number;
  duplicateReview: number;
  qualified: number;
  viewings: number;
  reservations: number;
  contracts: number;
  sold: number;
  lost: number;
};

/** `GET /api/deals` — only the fields the report cards add up. */
type Deal = { status?: string | null; dealValue?: number | null };

/** `GET /api/commissions` — a broker gets `brokerAmount`, a developer the
 *  obligation view with `totalAmount`; the site reads `?? totalAmount`. */
type Commission = {
  status?: string | null;
  brokerAmount?: number | null;
  totalAmount?: number | null;
};

type ProjectViews = { id: string; name: string; viewCount?: number | null };
type InquiryRow = { source?: string | null };

/**
 * The website's `/dashboard/analytics` — "Lead Protection & Deal Reports"
 * scoped to the caller, the three legacy overview cards, and the two charts.
 *
 * Every number comes from a real endpoint the site itself reads:
 * `/api/leads/stats` (broker → own leads, developer → own org, CEO → all),
 * `/api/deals` and `/api/commissions`. The two charts have no aggregate API
 * on either side, so they are grouped client-side from `/api/projects`
 * (viewCount) and `/api/inquiries` (source) — the same list endpoints the rest
 * of the dashboard already consumes.
 *
 * The three legacy cards (page views, conversion, response time) are static
 * markup on the website with nothing behind them, so their values travel here
 * as copy rather than as an invented endpoint.
 */
export default function DashboardAnalyticsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();

  const statsApi = useApi<{ stats?: LeadStats }>('/api/leads/stats');
  const dealsApi = useApi<{ deals?: Deal[] }>('/api/deals');
  const commissionsApi = useApi<{ commissions?: Commission[] }>('/api/commissions');
  const projectsApi = useApi<{ projects?: ProjectViews[] }>('/api/projects?limit=50');
  const inquiriesApi = useApi<{ inquiries?: InquiryRow[] }>('/api/inquiries?limit=200');

  const refreshAll = () => {
    void statsApi.refresh();
    void dealsApi.refresh();
    void commissionsApi.refresh();
    void projectsApi.refresh();
    void inquiriesApi.refresh();
  };

  const denied = useRoleDenied('dash.forbidden', ['BROKER', 'DEVELOPER', 'ADMIN']);
  if (denied) return denied;

  if (statsApi.loading || dealsApi.loading || commissionsApi.loading) {
    return <Loading label={t('dash.loading')} />;
  }

  const stats = statsApi.data?.stats ?? null;
  const deals = dealsApi.data?.deals ?? [];
  const commissions = commissionsApi.data?.commissions ?? [];

  // Same arithmetic as the website: paid vs pending commission share, and the
  // total value of every deal that reached SOLD.
  let commissionPaid = 0;
  let commissionPending = 0;
  for (const c of commissions) {
    const share = c.brokerAmount ?? c.totalAmount ?? 0;
    if (c.status === 'PAID') commissionPaid += share;
    else if (c.status !== 'CANCELLED') commissionPending += share;
  }
  const soldValue = deals
    .filter((d) => d.status === 'SOLD')
    .reduce((sum, d) => sum + (d.dealValue || 0), 0);

  const money = (value: number) => formatMoney(value, currency, rates, { compact: true });
  const reports = stats
    ? [
        { label: t('dash.registeredLeads'), value: String(stats.totalLeads) },
        { label: t('dash.protectedLeads'), value: String(stats.activeProtected) },
        { label: t('dash.expiringSoon'), value: String(stats.expiringSoon) },
        { label: t('dash.expiredProtection'), value: String(stats.expired) },
        { label: t('dash.viewings'), value: String(stats.viewings) },
        { label: t('dash.reservations'), value: String(stats.reservations) },
        { label: t('dash.soldDeals'), value: String(stats.sold) },
        {
          label: t('dash.commissionPaid'),
          value: commissionsApi.data ? money(commissionPaid) : '—',
        },
        {
          label: t('dash.commissionPending'),
          value: commissionsApi.data ? money(commissionPending) : '—',
        },
        { label: t('dash.totalDealValue'), value: dealsApi.data ? money(soldValue) : '—' },
      ]
    : [];

  const footerChips = stats
    ? [
        { label: t('dash.chipNew'), value: stats.newLeads },
        { label: t('dash.chipQualified'), value: stats.qualified },
        { label: t('dash.chipDuplicate'), value: stats.duplicateReview },
        { label: t('dash.chipContracts'), value: stats.contracts },
        { label: t('dash.chipLost'), value: stats.lost },
      ]
    : [];

  /** Derived, never fetched twice: `/api/leads/stats` already splits the pool. */
  const statusBars = stats
    ? [
        { label: t('dash.chipNew'), count: stats.newLeads },
        { label: t('dash.chipQualified'), count: stats.qualified },
        { label: t('dash.viewings'), count: stats.viewings },
        { label: t('dash.reservations'), count: stats.reservations },
        { label: t('dash.chipContracts'), count: stats.contracts },
        { label: t('dash.soldDeals'), count: stats.sold },
        { label: t('dash.chipLost'), count: stats.lost },
      ].filter((bar) => bar.count > 0)
    : [];
  const maxStatus = Math.max(1, ...statusBars.map((bar) => bar.count));

  const topProjects = [...(projectsApi.data?.projects ?? [])]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .filter((project) => (project.viewCount ?? 0) > 0)
    .slice(0, 5);
  const maxViews = Math.max(1, ...topProjects.map((project) => project.viewCount ?? 0));

  const sourceCounts = new Map<string, number>();
  for (const inquiry of inquiriesApi.data?.inquiries ?? []) {
    const key = humanise(inquiry.source ?? 'UNKNOWN');
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const inquirySources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxSources = Math.max(1, ...inquirySources.map(([, count]) => count));

  const errors = [
    { error: statsApi.error, retry: statsApi.refresh },
    { error: dealsApi.error, retry: dealsApi.refresh },
    { error: commissionsApi.error, retry: commissionsApi.refresh },
    { error: projectsApi.error, retry: projectsApi.refresh },
    { error: inquiriesApi.error, retry: inquiriesApi.refresh },
  ].filter(
    (entry): entry is { error: string; retry: () => Promise<void> } => Boolean(entry.error)
  );

  return (
    <Screen refreshing={statsApi.refreshing} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: t('dash.analyticsTitle') }} />

      <Text style={[styles.lead, align]}>{t('dash.analyticsOverview')}</Text>

      {errors.map((entry, index) => (
        <ErrorBar key={`${entry.error}-${index}`} message={entry.error} onRetry={entry.retry} />
      ))}

      <Card>
        <SectionTitle action={<Text style={[styles.scoped, align]}>{t('dash.scopedToAccount')}</Text>}>
          {t('dash.leadProtectionReports')}
        </SectionTitle>

        {stats ? (
          <>
            <View style={[styles.tiles, row]}>
              {reports.map((report) => (
                <View key={report.label} style={styles.tile}>
                  <Text style={[styles.tileLabel, align]} numberOfLines={2}>
                    {report.label}
                  </Text>
                  <Text style={[styles.tileValue, align]} numberOfLines={1}>
                    {report.value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.chipRow, row]}>
              {footerChips.map((chip) => (
                <Chip key={chip.label} label={`${chip.label}: ${chip.value}`} />
              ))}
            </View>
          </>
        ) : (
          <Empty title={t('dash.reportsUnavailable')} />
        )}
      </Card>

      <View style={[styles.legacy, row]}>
        <Card style={styles.legacyCard}>
          <Text style={[styles.legacyLabel, align]}>{t('dash.totalPageViews')}</Text>
          <Text style={[styles.legacyValue, align]}>{t('dash.pageViewsValue')}</Text>
          <Text style={[styles.legacyDelta, align]}>{t('dash.pageViewsDelta')}</Text>
        </Card>
        <Card style={styles.legacyCard}>
          <Text style={[styles.legacyLabel, align]}>{t('dash.inquiryConversion')}</Text>
          <Text style={[styles.legacyValue, align]}>{t('dash.conversionValue')}</Text>
          <Text style={[styles.legacyDelta, align]}>{t('dash.conversionDelta')}</Text>
        </Card>
        <Card style={styles.legacyCard}>
          <Text style={[styles.legacyLabel, align]}>{t('dash.avgResponseTime')}</Text>
          <Text style={[styles.legacyValue, align]}>{t('dash.responseValue')}</Text>
          <Text style={[styles.legacyDelta, align]}>{t('dash.responseTarget')}</Text>
        </Card>
      </View>

      <Card>
        <SectionTitle>{t('dash.topProjects')}</SectionTitle>
        {projectsApi.loading ? (
          <Loading label={t('dash.loading')} />
        ) : topProjects.length === 0 ? (
          <Text style={[styles.noData, align]}>{t('dash.noChart')}</Text>
        ) : (
          topProjects.map((project) => {
            const views = project.viewCount ?? 0;
            return (
              <View key={project.id} style={styles.chartBlock}>
                <View style={[styles.chartHead, row]}>
                  <Text style={[styles.chartLabel, align]} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <Text style={[styles.chartValue, align]}>{`${views.toLocaleString('en-US')} ${t('dash.views')}`}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(views / maxViews) * 100}%` }]} />
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <SectionTitle>{t('dash.inquirySources')}</SectionTitle>
        {inquiriesApi.loading ? (
          <Loading label={t('dash.loading')} />
        ) : inquirySources.length === 0 ? (
          <Text style={[styles.noData, align]}>{t('dash.noChart')}</Text>
        ) : (
          inquirySources.map(([source, count]) => (
            <View key={source} style={styles.chartBlock}>
              <View style={[styles.chartHead, row]}>
                <Text style={[styles.chartLabel, align]} numberOfLines={1}>
                  {source}
                </Text>
                <Text style={[styles.chartValue, align]}>{count.toLocaleString('en-US')}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(count / maxSources) * 100}%` }]} />
              </View>
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>{t('dash.leadsByStatus')}</SectionTitle>
        {statusBars.length === 0 ? (
          <Text style={[styles.noData, align]}>{t('dash.noChart')}</Text>
        ) : (
          statusBars.map((bar) => (
            <View key={bar.label} style={styles.chartBlock}>
              <View style={[styles.chartHead, row]}>
                <Text style={[styles.chartLabel, align]} numberOfLines={1}>
                  {bar.label}
                </Text>
                <Text style={[styles.chartValue, align]}>{bar.count.toLocaleString('en-US')}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(bar.count / maxStatus) * 100}%` }]} />
              </View>
            </View>
          ))
        )}
      </Card>

      <View style={[styles.scopeRow, row]}>
        <Text style={[styles.scopeNote, align]}>{t('dash.scopeNote')}</Text>
      </View>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    lead: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    scoped: { color: t.mutedForeground, fontSize: 12 },

    tiles: { flexWrap: 'wrap', gap: 8 },
    tile: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 100,
      gap: 2,
      padding: Spacing.sm,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      backgroundColor: t.muted,
    },
    tileLabel: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
    tileValue: { color: t.foreground, fontSize: 20, lineHeight: 26, fontWeight: '800' },
    chipRow: { flexWrap: 'wrap', gap: 8 },

    legacy: { flexWrap: 'wrap', gap: Spacing.sm },
    legacyCard: { flexGrow: 1, flexBasis: '45%', minWidth: 150, gap: 4 },
    legacyLabel: { color: t.mutedForeground, fontSize: 12 },
    legacyValue: { color: t.foreground, fontSize: 26, lineHeight: 32, fontWeight: '800' },
    legacyDelta: { color: t.successFg, fontSize: 12 },

    noData: { color: t.mutedForeground, fontSize: 14, paddingVertical: Spacing.sm },

    chartBlock: { gap: 6, paddingVertical: 4 },
    chartHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    chartLabel: { color: t.foreground, fontSize: 14, flexShrink: 1 },
    chartValue: { color: t.mutedForeground, fontSize: 13, fontWeight: '600' },
    track: {
      height: 8,
      borderRadius: Radius.sm,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    fill: { height: 8, borderRadius: Radius.sm, backgroundColor: t.primary },

    scopeRow: { paddingTop: 2 },
    scopeNote: { color: t.mutedForeground, fontSize: 12, lineHeight: 18, flex: 1 },
  })
);
