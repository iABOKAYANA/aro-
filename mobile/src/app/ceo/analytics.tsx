import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Empty, ErrorBar, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/** `GET /api/ceo/stats` — every field `src/app/api/ceo/stats/route.ts` sends.
 *  The website's `src/app/ceo/analytics/page.tsx` and the `CeoAnalyticsCharts`
 *  component it renders read this same object, so each card below is the same
 *  field the site draws, recomputed client-side instead of by recharts. */
type Slice = { status?: string; role?: string; count: number };
type MonthPoint = { month: string; count: number };
type TopProject = {
  id: string;
  name: string;
  inquiryCount?: number;
  viewCount?: number;
  favoriteCount?: number;
};
type PropertyType = { type: string; count: number; avgPrice: number | null };
type Broker = {
  id: string;
  user?: { name?: string; email?: string };
  totalDeals?: number;
  rating?: number;
  _count?: { leads?: number };
};

type Stats = {
  totalUsers?: number;
  totalBrokers?: number;
  totalProjects?: number;
  totalLeads?: number;
  totalInquiries?: number;
  totalViewings?: number;
  conversionRate?: number;
  leadsByStatus?: Slice[];
  inquiriesByStatus?: Slice[];
  usersByRole?: Slice[];
  leadsByMonth?: MonthPoint[];
  usersByMonth?: MonthPoint[];
  inquiriesByMonth?: MonthPoint[];
  topProjects?: TopProject[];
  topLocations?: { name: string; count: number }[];
  propertyTypeDemand?: PropertyType[];
  brokerPerformance?: Broker[];
};

type BarRow = { key: string; label: string; value: number; note?: string };

/**
 * Numbers without a charting dependency.
 *
 * Every series here comes from `GET /api/ceo/stats`, the same endpoint the
 * website's overview and analytics pages read; the bars are plain Views sized
 * as a percentage of the largest value, which costs nothing to render and
 * needs no native chart module to link. Pie charts on the site become a
 * labelled bar with its share of the total — same figures, readable on a
 * 6-inch screen where a 60px donut is not.
 */
export default function CeoAnalyticsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const { data, error, loading, refreshing, refresh } = useApi<Stats>('/api/ceo/stats');

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const statusBars = data?.leadsByStatus ?? [];
  const inquiryBars = data?.inquiriesByStatus ?? [];
  const roleBars = data?.usersByRole ?? [];
  const propertyTypes = data?.propertyTypeDemand ?? [];
  const topProjects = data?.topProjects ?? [];
  const topLocations = data?.topLocations ?? [];
  const brokers = data?.brokerPerformance ?? [];

  const statusCount = (rows: Slice[], status: string) =>
    rows.find((entry) => entry.status === status)?.count ?? 0;

  const newLeads = statusCount(statusBars, 'NEW');
  const converted = statusCount(statusBars, 'CONVERTED');
  const lost = statusCount(statusBars, 'LOST');

  // The site's pie labels are `status 45%` — share of that pie's own total.
  const leadTotal = statusBars.reduce((sum, entry) => sum + entry.count, 0);
  const inquiryTotal = inquiryBars.reduce((sum, entry) => sum + entry.count, 0);
  const roleTotal = roleBars.reduce((sum, entry) => sum + entry.count, 0);

  const statusRows: BarRow[] = statusBars.map((entry) => ({
    key: entry.status ?? 'status',
    label: humanise(entry.status),
    value: entry.count,
    note: `${entry.count.toLocaleString('en-US')} · ${share(entry.count, leadTotal)}%`,
  }));
  // The same series again for the plain bar chart, without the pie's share.
  const statusPlainRows: BarRow[] = statusBars.map((entry) => ({
    key: entry.status ?? 'status',
    label: humanise(entry.status),
    value: entry.count,
    note: entry.count.toLocaleString('en-US'),
  }));
  const inquiryRows: BarRow[] = inquiryBars.map((entry) => ({
    key: entry.status ?? 'status',
    label: humanise(entry.status),
    value: entry.count,
    note: `${entry.count.toLocaleString('en-US')} · ${share(entry.count, inquiryTotal)}%`,
  }));
  const roleRows: BarRow[] = roleBars.map((entry) => {
    const people =
      entry.count === 1
        ? t('ceoM.perRoleOne')
        : t('ceoM.perRole').replace('{n}', String(entry.count));
    return {
      key: entry.role ?? 'role',
      label: humanise(entry.role),
      value: entry.count,
      note: `${people} · ${share(entry.count, roleTotal)}%`,
    };
  });

  const typeRows: BarRow[] = propertyTypes.map((entry) => ({
    key: entry.type,
    label: humanise(entry.type),
    value: entry.count,
    note: entry.count.toLocaleString('en-US'),
  }));
  const priceRows: BarRow[] = propertyTypes
    .filter((entry) => entry.avgPrice != null)
    .map((entry) => ({
      key: entry.type,
      label: humanise(entry.type),
      value: Math.round(Number(entry.avgPrice)),
      note: formatMoney(entry.avgPrice, currency, rates, { compact: true }),
    }));

  const projectRows: BarRow[] = topProjects.map((project) => ({
    key: project.id,
    label: project.name,
    value: project.inquiryCount ?? 0,
    note: (project.inquiryCount ?? 0).toLocaleString('en-US'),
  }));
  const locationRows: BarRow[] = topLocations.map((location) => ({
    key: location.name,
    label: location.name,
    value: location.count,
    note: location.count.toLocaleString('en-US'),
  }));

  const leadPoints = toPoints(data?.leadsByMonth);
  const userPoints = toPoints(data?.usersByMonth);
  const inquiryPoints = toPoints(data?.inquiriesByMonth);

  const maxViews = Math.max(1, ...topProjects.map((project) => project.viewCount ?? 0));
  const maxFavorites = Math.max(1, ...topProjects.map((project) => project.favoriteCount ?? 0));

  // Website funnel: Total Leads → Inquiries → Converted, narrowing 25% a step.
  const funnel = [
    { label: t('ceoM.totalLeads'), count: data?.totalLeads ?? 0 },
    { label: t('ceoM.totalInquiries'), count: data?.totalInquiries ?? 0 },
    { label: t('ceo.converted'), count: converted },
  ];

  const hasAnything =
    statusBars.length > 0 ||
    inquiryBars.length > 0 ||
    roleBars.length > 0 ||
    propertyTypes.length > 0 ||
    topProjects.length > 0 ||
    topLocations.length > 0 ||
    brokers.length > 0 ||
    leadPoints.length > 0 ||
    userPoints.length > 0 ||
    inquiryPoints.length > 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.analytics') }} />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {/* Quick KPIs — the five cards at the top of the website's analytics page */}
      <Card style={styles.kpis}>
        <Kpi value={`${Number(data?.conversionRate ?? 0).toFixed(1)}%`} label={t('ceo.conversion')} />
        <Kpi value={newLeads.toLocaleString('en-US')} label={t('ceoM.newLeads')} />
        <Kpi value={converted.toLocaleString('en-US')} label={t('ceoM.convertedLeads')} />
        <Kpi value={lost.toLocaleString('en-US')} label={t('ceoM.lostLeads')} />
        <Kpi value={(data?.totalViewings ?? 0).toLocaleString('en-US')} label={t('ceoM.totalViewings')} />
      </Card>

      {!error && !hasAnything ? <Empty title={t('ceo.noData')} /> : null}

      {hasAnything ? (
        <>
          <SectionTitle>{t('ceoM.summary')}</SectionTitle>
          <Card style={styles.kpis}>
            <Kpi
              value={(data?.totalUsers ?? 0).toLocaleString('en-US')}
              label={t('ceoM.totalUsers')}
            />
            <Kpi
              value={(data?.totalBrokers ?? 0).toLocaleString('en-US')}
              label={t('ceoM.totalBrokers')}
            />
            <Kpi
              value={(data?.totalProjects ?? 0).toLocaleString('en-US')}
              label={t('ceoM.activeProjects')}
            />
            <Kpi
              value={(data?.totalLeads ?? 0).toLocaleString('en-US')}
              label={t('ceoM.totalLeads')}
            />
            <Kpi
              value={(data?.totalInquiries ?? 0).toLocaleString('en-US')}
              label={t('ceoM.totalInquiries')}
            />
            <Kpi
              value={`${Number(data?.conversionRate ?? 0).toFixed(1)}%`}
              label={t('ceoM.conversionRate')}
            />
          </Card>

          {/* ── Lead analytics ─────────────────────────────────────────── */}
          <SectionTitle>{t('ceoM.leadAnalytics')}</SectionTitle>

          {statusRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.leadStatusBreakdown')}</CardTitle>
              <Bars rows={statusRows} />
            </Card>
          ) : null}

          <Card>
            <CardTitle>{t('ceoM.funnel')}</CardTitle>
            {funnel.map((step, index) => (
              <View key={step.label} style={styles.funnelStep}>
                <View style={[styles.funnelStage, { width: `${100 - index * 25}%` }]}>
                  <Text style={[styles.funnelLabel, align]}>{step.label}</Text>
                  <Text style={styles.funnelValue}>{step.count.toLocaleString('en-US')}</Text>
                </View>
                {index < funnel.length - 1 ? <View style={styles.funnelJoin} /> : null}
              </View>
            ))}
          </Card>

          {leadPoints.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.leadTrends')}</CardTitle>
              <Columns rows={leadPoints} />
            </Card>
          ) : null}

          {statusPlainRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceo.leadsByStatus')}</CardTitle>
              <Bars rows={statusPlainRows} />
            </Card>
          ) : null}

          {/* ── User analytics ─────────────────────────────────────────── */}
          <SectionTitle>{t('ceoM.userAnalytics')}</SectionTitle>

          {roleRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.usersByRole')}</CardTitle>
              <Bars rows={roleRows} />
            </Card>
          ) : null}

          {userPoints.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.registrationTrends')}</CardTitle>
              <Columns rows={userPoints} />
            </Card>
          ) : null}

          {/* ── Property analytics ─────────────────────────────────────── */}
          <SectionTitle>{t('ceoM.propertyAnalytics')}</SectionTitle>

          {typeRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.propertyTypeDemand')}</CardTitle>
              <Bars rows={typeRows} />
            </Card>
          ) : null}

          {priceRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.avgPriceByType')}</CardTitle>
              <Bars rows={priceRows} />
            </Card>
          ) : null}

          {locationRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceo.topLocations')}</CardTitle>
              <Bars rows={locationRows} />
            </Card>
          ) : null}

          {/* ── Broker performance ─────────────────────────────────────── */}
          <SectionTitle>{t('ceo.brokerPerformance')}</SectionTitle>

          {brokers.length > 0 ? (
            <Card>
              {brokers.map((broker, index) => (
                <Row
                  key={broker.id}
                  left={<Text style={styles.rank}>{index + 1}</Text>}
                  title={broker.user?.name ?? '—'}
                  subtitle={broker.user?.email ?? undefined}
                  right={
                    <View style={styles.brokerFigures}>
                      <Text style={styles.brokerFigure}>
                        {t('ceoM.leadsLabel').replace('{n}', String(broker._count?.leads ?? 0))}
                      </Text>
                      <Text style={styles.brokerFigure}>
                        {t('ceoM.dealsLabel').replace('{n}', String(broker.totalDeals ?? 0))}
                      </Text>
                      <Text style={styles.brokerFigure}>{`★ ${(broker.rating ?? 0).toFixed(1)}/5`}</Text>
                    </View>
                  }
                />
              ))}
            </Card>
          ) : null}

          {/* ── Project analytics ──────────────────────────────────────── */}
          <SectionTitle>{t('ceoM.projectAnalytics')}</SectionTitle>

          {projectRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.topProjectsInquiries')}</CardTitle>
              <Bars rows={projectRows} />
            </Card>
          ) : null}

          {topProjects.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.topProjectsViews')}</CardTitle>
              <View style={[styles.legend, row]}>
                <View style={[styles.legendDot, styles.fillViews]} />
                <Text style={styles.legendLabel}>{t('ceoM.views')}</Text>
                <View style={[styles.legendDot, styles.fillFavs]} />
                <Text style={styles.legendLabel}>{t('ceoM.favorites')}</Text>
              </View>
              {topProjects.map((project) => {
                const views = project.viewCount ?? 0;
                const favorites = project.favoriteCount ?? 0;
                return (
                  <View key={project.id} style={styles.chartBlock}>
                    <Text style={[styles.chartLabel, align]} numberOfLines={1}>
                      {project.name}
                    </Text>
                    <View style={[styles.chartHead, row]}>
                      <View style={styles.track}>
                        <View style={[styles.fill, styles.fillViews, { width: `${(views / maxViews) * 100}%` }]} />
                      </View>
                      <Text style={styles.chartValue}>{views.toLocaleString('en-US')}</Text>
                    </View>
                    <View style={[styles.chartHead, row]}>
                      <View style={styles.track}>
                        <View
                          style={[styles.fill, styles.fillFavs, { width: `${(favorites / maxFavorites) * 100}%` }]}
                        />
                      </View>
                      <Text style={styles.chartValue}>{favorites.toLocaleString('en-US')}</Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {/* ── Inquiry analytics ──────────────────────────────────────── */}
          <SectionTitle>{t('ceoM.inquiryAnalytics')}</SectionTitle>

          {inquiryPoints.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.inquiryTrends')}</CardTitle>
              <Columns rows={inquiryPoints} />
            </Card>
          ) : null}

          {inquiryRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.inquiryStatus')}</CardTitle>
              <Bars rows={inquiryRows} />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** One row of a horizontal bar chart: label, figure, then the bar itself. */
function Bars({ rows }: { rows: BarRow[] }) {
  const styles = useStyles();
  const { row, align, isRtl } = useI18n();
  const max = Math.max(1, ...rows.map((entry) => entry.value));
  return (
    <View>
      {rows.map((entry) => (
        <View key={entry.key} style={styles.chartBlock}>
          <View style={[styles.chartHead, row]}>
            <Text style={[styles.chartLabel, align]} numberOfLines={1}>
              {entry.label}
            </Text>
            <Text style={styles.chartValue}>{entry.note ?? entry.value.toLocaleString('en-US')}</Text>
          </View>
          <View style={[styles.track, isRtl && styles.trackRtl]}>
            <View style={[styles.fill, { width: `${(entry.value / max) * 100}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** One column of a monthly trend: the figure, the bar, the month under it. */
function Columns({ rows }: { rows: BarRow[] }) {
  const styles = useStyles();
  const max = Math.max(1, ...rows.map((entry) => entry.value));
  return (
    <View style={styles.columns}>
      {rows.map((entry) => (
        <View key={entry.key} style={styles.column}>
          <Text style={styles.columnValue} numberOfLines={1}>
            {entry.value.toLocaleString('en-US')}
          </Text>
          <View style={styles.columnTrack}>
            <View style={[styles.columnFill, { height: `${(entry.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.columnLabel} numberOfLines={1}>
            {entry.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The website's `ChartCard` heading: small, muted, uppercase. */
function CardTitle({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { align } = useI18n();
  return <Text style={[styles.cardTitle, align]}>{children}</Text>;
}

function Kpi({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

/** `2026-04` → `26-04`: the full stamp does not fit a ~40px column. */
function toPoints(points?: MonthPoint[]): BarRow[] {
  return (points ?? []).map((point) => ({
    key: point.month,
    label: point.month.slice(2),
    value: point.count,
  }));
}

/** Share of a total, rounded the way the site's pie labels round it. */
function share(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kpi: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 96,
      alignItems: 'center',
      gap: 2,
      paddingVertical: Spacing.sm,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xl,
    },
    kpiValue: { color: t.foreground, fontSize: 16, fontWeight: '800' },
    kpiLabel: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },

    cardTitle: {
      color: t.mutedForeground,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: Spacing.xs,
    },

    // Conversion funnel — each stage 25% narrower than the one above it.
    funnelStep: { width: '100%', alignItems: 'center' },
    funnelStage: {
      backgroundColor: t.goldBg,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      paddingVertical: Spacing.sm + 2,
      paddingHorizontal: Spacing.sm,
      alignItems: 'center',
      gap: 2,
    },
    funnelLabel: { color: t.mutedForeground, fontSize: 12 },
    funnelValue: { color: t.foreground, fontSize: 20, fontWeight: '800' },
    funnelJoin: { width: 1, height: 16, backgroundColor: t.border, marginVertical: 4 },

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
    // RTL grows the bar from the reading edge instead of the left.
    trackRtl: { alignItems: 'flex-end' },
    fill: { height: 8, borderRadius: Radius.sm, backgroundColor: t.primary },

    columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 160 },
    column: { flex: 1, alignItems: 'center', gap: 4 },
    columnValue: { color: t.mutedForeground, fontSize: 11 },
    columnTrack: {
      width: '100%',
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: t.muted,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    columnFill: { width: '100%', backgroundColor: t.primary, borderRadius: Radius.sm },
    // Left at 9px: with twelve months on screen a column is ~19px wide, and
    // 12px labels are truncated by `numberOfLines={1}`.
    columnLabel: { color: t.mutedForeground, fontSize: 9 },

    legend: { alignItems: 'center', gap: 6, paddingVertical: 4 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { color: t.mutedForeground, fontSize: 12, marginRight: 8 },
    // Views ride the info tint, favorites the estate gold — the site's
    // INDIGO / GOLD pair for this chart.
    fillViews: { backgroundColor: t.infoFg },
    fillFavs: { backgroundColor: t.primary },

    brokerFigures: { alignItems: 'center', gap: 2 },
    brokerFigure: { color: t.mutedForeground, fontSize: 12, fontWeight: '600' },
    rank: { color: t.primary, fontSize: 14, fontWeight: '800' },
  }),
);
