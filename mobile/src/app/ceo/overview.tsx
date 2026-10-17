import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Card,
  Empty,
  ErrorBar,
  Loading,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatDate, humanise } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

/** `GET /api/ceo/stats` — the field set `src/app/ceo/overview/page.tsx` reads;
 *  `CeoCharts` is drawn from the same object, so the eight charts at the
 *  bottom of this screen are those eight, recomputed client-side. */
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

type Stats = {
  totalUsers?: number;
  totalBrokers?: number;
  totalDevelopers?: number;
  totalProjects?: number;
  totalUnits?: number;
  totalLeads?: number;
  newLeadsToday?: number;
  newLeadsThisWeek?: number;
  totalInquiries?: number;
  conversionRate?: number;
  activeProjects?: number;
  availableUnits?: number;
  totalFavorites?: number;
  totalViewings?: number;
  leadsByStatus?: Slice[];
  usersByRole?: Slice[];
  leadsByMonth?: MonthPoint[];
  usersByMonth?: MonthPoint[];
  inquiriesByMonth?: MonthPoint[];
  topProjects?: TopProject[];
  topLocations?: { name: string; count: number }[];
  propertyTypeDemand?: PropertyType[];
};

/** `GET /api/ceo/notifications` — pending viewings, the site's bell payload. */
type Meeting = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  projectName: string;
  scheduledAt: string;
  meetingType: string;
  meetingLink: string | null;
  notes: string | null;
  createdAt: string;
};

type MeetingFeed = { notifications?: Meeting[]; count?: number };

type BarRow = { key: string; label: string; value: number; note?: string };

/**
 * The console's front door.
 *
 * Every CEO screen on the website lives behind its own sidebar page; on a
 * phone the equivalent of that sidebar is this hub — the pending meeting
 * requests, one figure board, the same eight charts the site's overview
 * draws, and a list of the consoles that actually get touched from a device.
 */
export default function CeoOverviewScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, align, isRtl } = useI18n();
  const router = useRouter();
  const statsApi = useApi<Stats>('/api/ceo/stats');
  const meetingsApi = useApi<MeetingFeed>('/api/ceo/notifications');

  const refreshAll = () => {
    void statsApi.refresh();
    void meetingsApi.refresh();
  };

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (statsApi.loading) return <Loading label={t('common.loading')} />;

  const data = statsApi.data;
  const error = statsApi.error;
  const today = data?.newLeadsToday ?? 0;

  // The website's primary grid: six cards, in its order.
  const tiles: { key: keyof Stats; label: string; format?: 'percent' }[] = [
    { key: 'totalUsers', label: t('ceoM.totalUsers') },
    { key: 'totalBrokers', label: t('ceoM.totalBrokers') },
    { key: 'totalProjects', label: t('ceoM.totalProjects') },
    { key: 'totalLeads', label: t('ceoM.totalLeads') },
    { key: 'totalInquiries', label: t('ceoM.totalInquiries') },
    { key: 'conversionRate', label: t('ceoM.conversionRate'), format: 'percent' },
  ];

  // …and its four secondary cards, plus the two inventory figures the app has
  // always shown here so nothing the console already surfaced disappears.
  const secondary: { key: keyof Stats; label: string }[] = [
    { key: 'activeProjects', label: t('ceo.activeProjects') },
    { key: 'availableUnits', label: t('ceo.availableUnits') },
    { key: 'totalFavorites', label: t('ceoM.totalFavorites') },
    { key: 'totalViewings', label: t('ceoM.totalViewings') },
    { key: 'totalUnits', label: t('ceo.units') },
    { key: 'totalDevelopers', label: t('ceo.developers') },
  ];

  const statusBars = data?.leadsByStatus ?? [];
  const roleBars = data?.usersByRole ?? [];
  const propertyTypes = data?.propertyTypeDemand ?? [];
  const topProjects = data?.topProjects ?? [];
  const topLocations = data?.topLocations ?? [];

  const statusRows: BarRow[] = statusBars.map((entry) => ({
    key: entry.status ?? 'status',
    label: humanise(entry.status),
    value: entry.count,
    note: entry.count.toLocaleString('en-US'),
  }));
  const roleTotal = roleBars.reduce((sum, entry) => sum + entry.count, 0);
  const roleRows: BarRow[] = roleBars.map((entry) => {
    const people =
      entry.count === 1
        ? t('ceoM.perRoleOne')
        : t('ceoM.perRole').replace('{n}', String(entry.count));
    const percent = roleTotal > 0 ? Math.round((entry.count / roleTotal) * 100) : 0;
    return {
      key: entry.role ?? 'role',
      label: humanise(entry.role),
      value: entry.count,
      note: `${people} · ${percent}%`,
    };
  });
  const typeRows: BarRow[] = propertyTypes.map((entry) => ({
    key: entry.type,
    label: humanise(entry.type),
    value: entry.count,
    note: entry.count.toLocaleString('en-US'),
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

  const consoles: {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    hint: string;
    href: Href;
  }[] = [
    { id: 'viewings', icon: 'calendar-outline', label: t('ceo.viewings'), hint: t('ceo.viewings.noneHint'), href: '/ceo/viewings' },
    { id: 'inquiries', icon: 'mail-outline', label: t('ceo.inquiries'), hint: t('ceo.inquiries.noneHint'), href: '/ceo/inquiries' },
    { id: 'approvals', icon: 'checkmark-done-outline', label: t('ceo.approvals'), hint: t('ceo.approvals.noneHint'), href: '/ceo/approvals' },
    { id: 'content', icon: 'create-outline', label: t('ceo.content'), hint: t('ceo.content.autoSaveHint'), href: '/ceo/content' },
    { id: 'pricing', icon: 'pricetag-outline', label: t('ceo.pricing'), hint: t('ceo.pricing.hint'), href: '/ceo/pricing' },
    { id: 'analytics', icon: 'analytics-outline', label: t('ceo.analytics'), hint: t('ceo.analytics.hint'), href: '/ceo/analytics' },
  ];

  return (
    <Screen
      refreshing={statsApi.refreshing || meetingsApi.refreshing}
      onRefresh={refreshAll}>
      <Stack.Screen options={{ title: t('ceo.title') }} />

      <MeetingRequestsCard />

      {error ? <ErrorBar message={error} onRetry={statsApi.refresh} /> : null}

      {data ? (
        <>
          <Card style={styles.tiles}>
            {tiles.map((tile) => (
              <View key={tile.key} style={styles.tile}>
                {tile.key === 'totalLeads' && today > 0 ? (
                  <View style={styles.tileBadge}>
                    <Badge tone="green">
                      {t('ceoM.todayBadge').replace('{n}', String(today))}
                    </Badge>
                  </View>
                ) : null}
                <Text style={styles.tileValue}>
                  {tile.format === 'percent'
                    ? `${Number(data?.[tile.key] ?? 0).toFixed(1)}%`
                    : (data?.[tile.key] ?? 0).toLocaleString('en-US')}
                </Text>
                <Text style={styles.tileLabel}>{tile.label}</Text>
              </View>
            ))}
          </Card>

          <Card style={styles.tiles}>
            {secondary.map((tile) => (
              <View key={tile.key} style={styles.tile}>
                <Text style={styles.tileValue}>
                  {(data?.[tile.key] ?? 0).toLocaleString('en-US')}
                </Text>
                <Text style={styles.tileLabel}>{tile.label}</Text>
              </View>
            ))}
          </Card>

          {/* The site's weekly lead indicator */}
          <Card>
            <View style={[styles.weekly, row]}>
              <View style={styles.weeklyCell}>
                <Text style={[styles.weeklyLabel, align]}>{t('ceo.newWeek')}</Text>
                <Text style={[styles.weeklyValue, align]}>
                  {t('ceoM.newLeadsWeek').replace('{n}', String(data?.newLeadsThisWeek ?? 0))}
                </Text>
              </View>
              <View style={[styles.weeklyCell, { alignItems: isRtl ? 'flex-start' : 'flex-end' }]}>
                <Text style={[styles.weeklyLabel, align]}>{t('ceo.newToday')}</Text>
                <Text style={[styles.weeklyValueGold, align]}>{today.toLocaleString('en-US')}</Text>
              </View>
            </View>
          </Card>

          {/* The eight charts `src/components/ceo/ceo-charts.tsx` draws */}
          <SectionTitle>{t('ceoM.summary')}</SectionTitle>

          {leadPoints.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.leadsOverTime')}</CardTitle>
              <Columns rows={leadPoints} />
            </Card>
          ) : null}

          {userPoints.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.userRegistrations')}</CardTitle>
              <Columns rows={userPoints} />
            </Card>
          ) : null}

          {inquiryPoints.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.inquiriesOverTime')}</CardTitle>
              <Columns rows={inquiryPoints} />
            </Card>
          ) : null}

          {projectRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.topProjectsInquiries')}</CardTitle>
              <Bars rows={projectRows} />
            </Card>
          ) : null}

          {typeRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.propertyTypeDemand')}</CardTitle>
              <Bars rows={typeRows} />
            </Card>
          ) : null}

          {roleRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.usersByRole')}</CardTitle>
              <Bars rows={roleRows} />
            </Card>
          ) : null}

          {statusRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceo.leadsByStatus')}</CardTitle>
              <Bars rows={statusRows} />
            </Card>
          ) : null}

          {locationRows.length > 0 ? (
            <Card>
              <CardTitle>{t('ceoM.topLocationsByProjects')}</CardTitle>
              <Bars rows={locationRows} />
            </Card>
          ) : null}
        </>
      ) : error ? null : (
        <Empty title={t('ceoM.empty')} />
      )}

      <SectionTitle>{t('ceo.title')}</SectionTitle>
      <Card style={styles.list}>
        {consoles.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => router.push(entry.href)}
            style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }, row]}>
            <View style={styles.linkIcon}>
              <Ionicons name={entry.icon} size={18} color={theme.primary} />
            </View>
            <View style={styles.linkText}>
              <Text style={[styles.linkLabel, align]}>{entry.label}</Text>
              <Text style={styles.linkHint} numberOfLines={2}>
                {entry.hint}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

/**
 * Pending meeting requests — `GET /api/ceo/notifications`, the exact feed the
 * website's overview card and header bell read. Booked from either side, so a
 * request made on the site is answerable from the phone without a refresh.
 */
function MeetingRequestsCard() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const router = useRouter();
  const { data, error, loading, refresh } = useApi<MeetingFeed>('/api/ceo/notifications');

  const items = data?.notifications ?? [];
  const shown = items.slice(0, 5);

  return (
    <Card>
      <SectionTitle
        action={items.length > 0 ? <Badge tone="gold">{items.length}</Badge> : undefined}>
        {t('ceoM.meetingRequests')}
      </SectionTitle>

      {loading ? (
        <Loading label={t('ceoM.loading')} />
      ) : error ? (
        <ErrorBar message={error} onRetry={refresh} />
      ) : items.length === 0 ? (
        <Empty title={t('ceoM.meetingEmpty')} message={t('ceoM.meetingHint')} />
      ) : (
        <>
          <Text style={[styles.meetingSub, align]}>
            {t('ceoM.meetingPending').replace('{n}', String(items.length))}
          </Text>

          {shown.map((meeting) => {
            const phone = meeting.clientPhone;
            const link = meeting.meetingLink;
            return (
              <View key={meeting.id} style={styles.meeting}>
                <View style={[styles.meetingHead, row]}>
                  <Text style={styles.meetingName} numberOfLines={1}>
                    {meeting.clientName}
                  </Text>
                  <Text style={styles.meetingProject} numberOfLines={1}>
                    {meeting.projectName}
                  </Text>
                </View>

                <View style={[styles.meetingMeta, row]}>
                  <Text style={styles.meta}>{formatDate(meeting.scheduledAt, true)}</Text>
                  <Badge tone={meeting.meetingType === 'online' ? 'green' : 'muted'}>
                    {meeting.meetingType === 'online' ? t('ceo.online') : t('ceo.inPerson')}
                  </Badge>
                </View>

                {phone ? (
                  <Pressable onPress={() => void Linking.openURL(`tel:${phone}`)} hitSlop={6}>
                    <Text style={styles.meta}>{phone}</Text>
                  </Pressable>
                ) : null}

                {meeting.notes ? (
                  <Text style={styles.notes} numberOfLines={2}>
                    {meeting.notes}
                  </Text>
                ) : null}

                {link ? (
                  <Pressable onPress={() => void Linking.openURL(link)} hitSlop={6}>
                    <Text style={styles.join}>{t('ceoM.joinMeeting')}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {items.length > 5 ? (
            <Text style={[styles.meetingMore, align]}>
              {t('ceoM.meetingMore').replace('{n}', String(items.length - 5))}
            </Text>
          ) : null}

          <Pressable onPress={() => router.push('/ceo/viewings')} hitSlop={6}>
            <Text style={[styles.viewAll, align]}>{t('ceoM.viewAll')}</Text>
          </Pressable>
        </>
      )}
    </Card>
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

/** `2026-04` → `26-04`: the full stamp does not fit a ~40px column. */
function toPoints(points?: MonthPoint[]): BarRow[] {
  return (points ?? []).map((point) => ({
    key: point.month,
    label: point.month.slice(2),
    value: point.count,
  }));
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: {
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
    tileValue: { color: t.foreground, fontSize: 18, fontWeight: '800' },
    tileLabel: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    tileBadge: { alignSelf: 'center' },

    weekly: { justifyContent: 'space-between', gap: Spacing.sm },
    weeklyCell: { flex: 1, gap: 2 },
    weeklyLabel: { color: t.mutedForeground, fontSize: 12 },
    weeklyValue: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    weeklyValueGold: { color: t.primary, fontSize: 16, fontWeight: '800' },

    cardTitle: {
      color: t.mutedForeground,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: Spacing.xs,
    },

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

    meetingSub: { color: t.mutedForeground, fontSize: 12 },
    meeting: {
      gap: 6,
      padding: Spacing.sm,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      backgroundColor: t.muted,
    },
    meetingHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    meetingName: { color: t.foreground, fontSize: 15, fontWeight: '700', flexShrink: 1 },
    meetingProject: { color: t.goldFg, fontSize: 12, flexShrink: 1, textAlign: 'right' },
    meetingMeta: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    meta: { color: t.mutedForeground, fontSize: 12 },
    notes: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
    join: { color: t.primary, fontSize: 13, fontWeight: '700' },
    meetingMore: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    viewAll: { color: t.primary, fontSize: 13, fontWeight: '700', textAlign: 'right' },

    figure: { color: t.primary, fontSize: 14, fontWeight: '800' },
    list: { gap: 0 },
    link: { alignItems: 'center', gap: 12, paddingVertical: 8 },
    linkIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkText: { flex: 1, gap: 2 },
    linkLabel: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    linkHint: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
    chevron: { color: t.mutedForeground, fontSize: 20, fontWeight: '600' },
  }),
);
