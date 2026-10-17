import { Stack } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
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
  Segmented,
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useRoleDenied } from '@/components/role-gate';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, humanise, timeAgo } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

type Inquiry = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  type?: string | null;
  status: string;
  source?: string | null;
  priority?: number | null;
  assignedTo?: string | null;
  notes?: string | null;
  contactedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  unit?: {
    name?: string;
    unitType?: string;
    project?: { name?: string } | null;
  } | null;
  user?: { name?: string | null; email?: string | null } | null;
};

type BrokerLite = {
  id: string;
  name?: string;
  email?: string;
  user?: { name?: string | null; email?: string | null } | null;
};

type Status = 'ALL' | 'NEW' | 'CONTACTED' | 'RESOLVED' | 'CLOSED';

const STATUSES: Status[] = ['ALL', 'NEW', 'CONTACTED', 'RESOLVED', 'CLOSED'];

/** Status → dictionary key. Written out rather than built by concatenation so
 *  a renamed key is a compile error instead of a raw key on screen. */
const LABEL: Record<Exclude<Status, 'ALL'>, MessageKey> = {
  NEW: 'ceo.status.new',
  CONTACTED: 'ceo.status.contacted',
  RESOLVED: 'ceo.status.resolved',
  CLOSED: 'ceo.status.closed',
};

/**
 * Contact-form submissions, triaged from the phone.
 *
 * `PATCH /api/ceo/inquiries` stamps `contactedAt` when a row moves to
 * CONTACTED and `resolvedAt` at RESOLVED, so marking one up here advances the
 * same clock the website's reports read. The same endpoint carries
 * `assignedTo`, which is what the broker picker writes — the website's
 * "Assign Broker" control in `src/app/ceo/inquiries/page.tsx`.
 *
 * Priority, source and the internal notes have no editor on the website —
 * they are shown in the expanded row — so this screen shows them read-only
 * too rather than inventing a control the page never calls.
 */
export default function CeoInquiriesScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [tab, setTab] = useState<Status>('ALL');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<Inquiry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const params = new URLSearchParams({ limit: '60' });
  if (query.trim()) params.set('search', query.trim());
  if (tab !== 'ALL') params.set('status', tab);

  const { data, error, loading, refreshing, refresh } = useApi<{ inquiries?: Inquiry[]; total?: number }>(
    `/api/ceo/inquiries?${params.toString()}`,
  );
  const { data: brokerData } = useApi<{ brokers?: BrokerLite[] }>('/api/ceo/brokers');
  const mutation = useMutation();

  const brokers = brokerData?.brokers ?? [];
  const brokerName = (id: string | null | undefined) => {
    if (!id) return null;
    const found = brokers.find((b) => b.id === id);
    if (!found) return t('ceoP.inq.unassigned');
    return found.user?.name || found.name || found.user?.email || found.email || t('ceoP.inq.unassigned');
  };

  async function change(inquiry: Inquiry, status: string) {
    setBusyId(inquiry.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/inquiries', 'PATCH', { id: inquiry.id, status });
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function assign(inquiry: Inquiry, brokerId: string) {
    setBusyId(inquiry.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/inquiries', 'PATCH', { id: inquiry.id, assignedTo: brokerId });
      setAssignTarget(null);
      setNotice(t('ceoP.inq.assignedOk'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const items = data?.inquiries ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.inquiries') }} />

      <Segmented<Status>
        options={STATUSES.map((value) => ({
          value,
          label: value === 'ALL' ? t('common.all') : t(LABEL[value]),
        }))}
        value={tab}
        onChange={setTab}
      />

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.inquiries.search')} />

      {data?.total ? <Text style={styles.count}>{data.total} · {t('ceo.inquiriesCount')}</Text> : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && items.length === 0 ? (
        <Empty title={t('ceo.inquiries.none')} message={t('ceo.inquiries.noneHint')} />
      ) : null}

      {items.map((inquiry, index) => {
        const busy = busyId === inquiry.id;
        const isOpen = expanded === inquiry.id;
        const subject = [inquiry.unit?.project?.name, inquiry.unit?.name].filter(Boolean).join(' · ');
        const assigned = brokerName(inquiry.assignedTo);

        return (
          <View key={inquiry.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={inquiry.name}
                subtitle={[
                  [inquiry.phone, inquiry.email].filter(Boolean).join(' · ') || undefined,
                  subject || undefined,
                  timeAgo(inquiry.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={styles.badges}>
                    <Badge tone={inquiry.status === 'RESOLVED' || inquiry.status === 'CLOSED' ? 'green' : inquiry.status === 'NEW' ? 'gold' : 'blue'}>
                      {humanise(inquiry.status)}
                    </Badge>
                    {inquiry.type ? <Badge tone="muted">{humanise(inquiry.type)}</Badge> : null}
                  </View>
                }
                onPress={() => setExpanded(isOpen ? null : inquiry.id)}
              />

              {inquiry.message && !isOpen ? (
                <Text style={[styles.message, align]} numberOfLines={2}>
                  {inquiry.message}
                </Text>
              ) : null}

              {isOpen ? (
                <View style={styles.detail}>
                  <Text style={[styles.section, align]}>{t('ceoP.inq.clientInfo')}</Text>
                  {inquiry.phone ? (
                    <Detail label={t('ceoP.brokers.fieldPhone')} value={inquiry.phone} />
                  ) : null}
                  {inquiry.email ? <Detail label={t('ceoP.inq.email')} value={inquiry.email} /> : null}
                  <Detail label={t('ceoP.inq.date')} value={formatDate(inquiry.createdAt, true)} />
                  {inquiry.user ? (
                    <Detail
                      label={t('ceoP.inq.registeredUser')}
                      value={inquiry.user.name || inquiry.user.email || '—'}
                    />
                  ) : null}

                  <Text style={[styles.section, align]}>{t('ceoP.inq.details')}</Text>
                  {inquiry.type ? (
                    <Detail label={t('ceoP.inq.type')} value={humanise(inquiry.type)} />
                  ) : null}
                  {inquiry.source ? (
                    <Detail label={t('ceoP.inq.source')} value={humanise(inquiry.source)} />
                  ) : null}
                  {inquiry.priority != null ? (
                    <Detail label={t('ceoP.inq.priority')} value={String(inquiry.priority)} />
                  ) : null}
                  {inquiry.unit ? (
                    <Detail
                      label={t('ceoP.inq.linkedUnit')}
                      value={[inquiry.unit.name, inquiry.unit.unitType, inquiry.unit.project?.name]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ) : null}

                  {inquiry.message ? (
                    <View style={styles.block}>
                      <Text style={[styles.section, align]}>{t('ceoP.inq.fullMessage')}</Text>
                      <Text style={[styles.message, align]}>{inquiry.message}</Text>
                    </View>
                  ) : null}

                  {inquiry.notes ? (
                    <View style={styles.block}>
                      <Text style={[styles.section, align]}>{t('ceoP.inq.notes')}</Text>
                      <Text style={[styles.message, align]}>{inquiry.notes}</Text>
                    </View>
                  ) : null}

                  <Text style={[styles.section, align]}>{t('ceoP.inq.actions')}</Text>
                  <Detail
                    label={t('ceoP.inq.assignedBroker')}
                    value={assigned ?? t('ceoP.inq.unassigned')}
                  />
                  <Btn
                    title={assigned ?? t('ceoP.inq.assignBroker')}
                    variant="ghost"
                    disabled={busy}
                    onPress={() => setAssignTarget(inquiry)}
                  />
                </View>
              ) : null}

              <View style={[styles.statusRow, row]}>
                {(['NEW', 'CONTACTED', 'RESOLVED', 'CLOSED'] as const).map((status) => (
                  <Chip
                    key={status}
                    label={t(LABEL[status])}
                    selected={inquiry.status === status}
                    disabled={busy || inquiry.status === status}
                    onPress={() => void change(inquiry, status)}
                  />
                ))}
              </View>
            </Card>
          </View>
        );
      })}

      {assignTarget ? (
        <AssignSheet
          inquiry={assignTarget}
          brokers={brokers}
          busy={busyId === assignTarget.id}
          onClose={() => setAssignTarget(null)}
          onPick={(brokerId) => void assign(assignTarget, brokerId)}
        />
      ) : null}
    </Screen>
  );
}

/* ─── Broker picker — PATCH /api/ceo/inquiries { id, assignedTo } ──────── */

function AssignSheet({
  inquiry,
  brokers,
  busy,
  onClose,
  onPick,
}: {
  inquiry: Inquiry;
  brokers: BrokerLite[];
  busy: boolean;
  onClose: () => void;
  onPick: (brokerId: string) => void;
}) {
  const styles = useStyles();
  const { t, align } = useI18n();
  const { t: theme } = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <SheetHead title={t('ceoP.inq.assignTitle')} subtitle={t('ceoP.inq.assignHint')} onClose={onClose} />
            <Text style={[styles.forName, align]}>{inquiry.name}</Text>
            {brokers.length === 0 ? (
              <Empty title={t('ceoP.inq.noBrokers')} />
            ) : (
              brokers.map((broker) => {
                const label =
                  broker.user?.name || broker.name || broker.user?.email || broker.email || broker.id;
                const current = inquiry.assignedTo === broker.id;
                return (
                  <Pressable
                    key={broker.id}
                    disabled={busy || current}
                    onPress={() => onPick(broker.id)}
                    style={[styles.pickRow, current && styles.pickRowOn]}>
                    <Text style={[styles.pickLabel, align]} numberOfLines={1}>
                      {label}
                    </Text>
                    {current ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                    ) : null}
                  </Pressable>
                );
              })
            )}
            <Btn title={t('common.cancel')} variant="ghost" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetHead({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  const styles = useStyles();
  const { row, align } = useI18n();
  const { t: theme } = useTheme();
  return (
    <View style={[styles.sheetHead, row]}>
      <View style={styles.sheetTitles}>
        <Text style={[styles.sheetTitle, align]}>{title}</Text>
        {subtitle ? <Text style={[styles.sheetSubtitle, align]}>{subtitle}</Text> : null}
      </View>
      <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={title}>
        <Ionicons name="close" size={20} color={theme.mutedForeground} />
      </Pressable>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { align, isRtl } = useI18n();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, align]}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          { textAlign: isRtl ? 'left' : 'right', writingDirection: isRtl ? 'rtl' : 'ltr' },
        ]}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    card: { gap: 6, marginTop: Spacing.xs },
    count: { color: t.mutedForeground, fontSize: 14 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    message: { color: t.mutedForeground, fontSize: 14, lineHeight: 19 },
    statusRow: { flexWrap: 'wrap', gap: 8 },
    detail: { gap: 2 },
    section: { color: t.foreground, fontSize: 14, fontWeight: '700', marginTop: 8 },
    block: { gap: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
    detailLabel: { color: t.mutedForeground, fontSize: 13, flexShrink: 1 },
    detailValue: { color: t.foreground, fontSize: 13, fontWeight: '600', flexShrink: 1 },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    sheet: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '90%',
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
    forName: { color: t.mutedForeground, fontSize: 13 },
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
    pickLabel: { color: t.foreground, fontSize: 15, fontWeight: '600', flex: 1 },
  }),
);
