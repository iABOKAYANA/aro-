import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  Badge,
  Btn,
  Card,
  Divider,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SearchBar,
  Segmented,
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useRoleDenied } from '@/components/role-gate';
import { useI18n } from '@/i18n';
import { formatDate, humanise } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

type Viewing = {
  id: string;
  scheduledAt: string;
  duration?: number | null;
  status: string;
  notes?: string | null;
  feedback?: string | null;
  meetingType?: string | null;
  meetingLink?: string | null;
  contactPhone?: string | null;
  createdAt?: string;
  user?: { name?: string; email?: string; phone?: string | null } | null;
  unit?: { name?: string; unitNumber?: string | null; project?: { name?: string } } | null;
  project?: { name?: string; address?: string | null } | null;
  lead?: { name?: string; phone?: string | null } | null;
  broker?: { id: string; user?: { name?: string | null; email?: string | null } | null } | null;
};

type BrokerLite = {
  id: string;
  name?: string;
  email?: string;
  user?: { name?: string | null; email?: string | null } | null;
};

type Status = 'ALL' | 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

const STATUSES: Status[] = ['ALL', 'REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

/**
 * Every appointment on the platform, with the same transitions the website's
 * CEO viewings page applies (`PATCH /api/ceo/viewings`
 * in `src/app/ceo/viewings/page.tsx`).
 *
 * A row offers only the transitions the state machine allows: a requested
 * viewing can be confirmed or cancelled, a confirmed one completed or marked
 * no-show — the buttons follow the status rather than offering everything and
 * hoping the server says no.
 *
 * The expanded row mirrors the website's detail row: contact, meeting,
 * property, the assigned broker (rewritten through the same `{ id, brokerId
 * }` payload as the website's assign menu), editable notes and feedback
 * (`{ id, notes }` / `{ id, feedback }`), and reschedule, which posts
 * `{ id, scheduledAt, status: 'REQUESTED' }` exactly like the website.
 */
export default function CeoViewingsScreen() {
  const styles = useStyles();
  const { t, row, align, lang } = useI18n();
  const [tab, setTab] = useState<Status>('ALL');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<Viewing | null>(null);
  const [notesId, setNotesId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleText, setRescheduleText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const path =
    `/api/ceo/viewings?${new URLSearchParams({
      ...(query.trim() ? { search: query.trim() } : {}),
      ...(tab === 'ALL' ? {} : { status: tab }),
    }).toString()}`;

  const { data, error, loading, refreshing, refresh } = useApi<{ viewings?: Viewing[] }>(path);
  const { data: brokerData } = useApi<{ brokers?: BrokerLite[] }>('/api/ceo/brokers');
  const mutation = useMutation();

  const brokers = brokerData?.brokers ?? [];
  const brokerLabel = (viewing: Viewing) =>
    viewing.broker?.user?.name ||
    viewing.broker?.user?.email ||
    (viewing.broker ? t('ceoP.view.broker') : null);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setProblem(null);
    try {
      await mutation.run('/api/ceo/viewings', 'PATCH', { id, ...body });
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function change(viewing: Viewing, status: string) {
    await patch(viewing.id, { status });
  }

  async function assignBroker(viewing: Viewing, brokerId: string) {
    await patch(viewing.id, { brokerId });
    setAssignTarget(null);
  }

  async function saveNotes(viewing: Viewing) {
    await patch(viewing.id, { notes: notesText });
    setNotesId(null);
  }

  async function saveFeedback(viewing: Viewing) {
    await patch(viewing.id, { feedback: feedbackText });
    setFeedbackId(null);
  }

  async function reschedule(viewing: Viewing) {
    const parsed = parseDateTime(rescheduleText);
    if (!parsed) {
      setFormError(t('ceoP.view.badDate'));
      return;
    }
    setFormError(null);
    await patch(viewing.id, { scheduledAt: parsed.toISOString(), status: 'REQUESTED' });
    setRescheduleId(null);
    setRescheduleText('');
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const items = data?.viewings ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.viewings') }} />

      <Segmented<Status>
        options={STATUSES.map((value) => ({ value, label: value === 'ALL' ? t('common.all') : humanise(value) }))}
        value={tab}
        onChange={setTab}
      />

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.viewings.search')} />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {!error && items.length === 0 ? (
        <Empty title={t('ceo.viewings.none')} message={t('ceo.viewings.noneHint')} />
      ) : null}

      {items.map((viewing, index) => {
        const when = new Date(viewing.scheduledAt);
        const person = viewing.user?.name ?? viewing.lead?.name ?? '—';
        const subject = [
          viewing.unit?.project?.name ?? viewing.project?.name,
          viewing.unit?.name ?? viewing.unit?.unitNumber,
        ]
          .filter(Boolean)
          .join(' · ');

        const busy = busyId === viewing.id;
        const isOpen = expanded === viewing.id;
        const canConfirm = viewing.status === 'REQUESTED';
        const canComplete = viewing.status === 'CONFIRMED';
        const phone = viewing.contactPhone ?? viewing.user?.phone ?? viewing.lead?.phone;
        // Staff one-tap WhatsApp confirm — pure `wa.me` deep link to the
        // client, no API, no auto-send. Upcoming = REQUESTED/CONFIRMED;
        // hidden when no diallable client phone exists.
        const waDigits = (phone ?? '').replace(/\D/g, '');
        const canWa = (canConfirm || canComplete) && waDigits.length >= 7;
        const waHref = canWa
          ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
              t('viewings.waConfirm')
                .replace('{name}', person)
                .replace('{project}', subject || '—')
                .replace(
                  '{date}',
                  when.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                )
                .replace(
                  '{time}',
                  when.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                )
                .replace(
                  '{type}',
                  viewing.meetingType === 'online' ? t('ceo.online') : t('ceo.inPerson')
                )
            )}`
          : null;
        const editingNotes = notesId === viewing.id;
        const editingFeedback = feedbackId === viewing.id;
        const rescheduling = rescheduleId === viewing.id;

        return (
          <View key={viewing.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={person}
                subtitle={[
                  when.toLocaleString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  subject || undefined,
                  viewing.meetingType === 'online' ? t('ceo.online') : t('ceo.inPerson'),
                  phone ?? undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={<Badge tone={viewing.status === 'COMPLETED' ? 'green' : viewing.status === 'CANCELLED' || viewing.status === 'NO_SHOW' ? 'red' : 'gold'}>{humanise(viewing.status)}</Badge>}
                right={<Text style={styles.duration}>{viewing.duration ?? 30}m</Text>}
                onPress={() => setExpanded(isOpen ? null : viewing.id)}
              />

              {!isOpen && viewing.notes ? (
                <Text style={[styles.notes, align]} numberOfLines={2}>
                  {viewing.notes}
                </Text>
              ) : null}

              {isOpen ? (
                <View style={styles.detail}>
                  <Text style={[styles.section, align]}>{t('ceoP.view.contact')}</Text>
                  {phone ? <Detail label={t('ceoP.brokers.fieldPhone')} value={phone} /> : null}
                  {viewing.user?.email ? (
                    <Detail label={t('ceoP.inq.email')} value={viewing.user.email} />
                  ) : null}
                  {viewing.createdAt ? (
                    <Detail label={t('ceoP.inq.date')} value={formatDate(viewing.createdAt, true)} />
                  ) : null}

                  <Text style={[styles.section, align]}>{t('ceoP.view.meeting')}</Text>
                  <Detail
                    label={t('ceoP.view.meeting')}
                    value={viewing.meetingType === 'online' ? t('ceo.online') : t('ceo.inPerson')}
                  />
                  <Detail label={t('ceoP.inq.date')} value={formatDate(viewing.scheduledAt, true)} />
                  {viewing.meetingLink ? (
                    <Detail label={t('ceoP.view.link')} value={viewing.meetingLink} />
                  ) : null}

                  <Text style={[styles.section, align]}>{t('ceoP.view.property')}</Text>
                  <Detail
                    label={t('ceoP.view.property')}
                    value={subject || '—'}
                  />
                  {viewing.project?.address ? (
                    <Detail label={t('ceoP.view.property')} value={viewing.project.address} />
                  ) : null}

                  <Text style={[styles.section, align]}>{t('ceoP.view.broker')}</Text>
                  <Detail
                    label={t('ceoP.view.broker')}
                    value={brokerLabel(viewing) ?? t('ceoP.view.unassigned')}
                  />
                  <Btn
                    title={brokerLabel(viewing) ?? t('ceoP.view.assignBroker')}
                    variant="ghost"
                    disabled={busy}
                    onPress={() => setAssignTarget(viewing)}
                  />

                  <View style={[styles.editHead, row]}>
                    <Text style={[styles.section, align]}>{t('ceoP.view.notes')}</Text>
                    <Btn
                      title={editingNotes ? t('common.cancel') : t('ceoP.view.edit')}
                      variant="ghost"
                      style={styles.mini}
                      onPress={() => {
                        setNotesId(editingNotes ? null : viewing.id);
                        setNotesText(viewing.notes ?? '');
                      }}
                    />
                  </View>
                  {editingNotes ? (
                    <View style={styles.editBox}>
                      <Field
                        value={notesText}
                        onChangeText={setNotesText}
                        placeholder={t('ceoP.view.notesPlaceholder')}
                        multiline
                        numberOfLines={3}
                      />
                      <Btn
                        title={t('common.save')}
                        busy={busy}
                        onPress={() => void saveNotes(viewing)}
                      />
                    </View>
                  ) : (
                    <Text style={[styles.notes, align]}>{viewing.notes || t('ceoP.view.noNotes')}</Text>
                  )}

                  <View style={[styles.editHead, row]}>
                    <Text style={[styles.section, align]}>{t('ceoP.view.feedback')}</Text>
                    <Btn
                      title={editingFeedback ? t('common.cancel') : t('ceoP.view.edit')}
                      variant="ghost"
                      style={styles.mini}
                      onPress={() => {
                        setFeedbackId(editingFeedback ? null : viewing.id);
                        setFeedbackText(viewing.feedback ?? '');
                      }}
                    />
                  </View>
                  {editingFeedback ? (
                    <View style={styles.editBox}>
                      <Field
                        value={feedbackText}
                        onChangeText={setFeedbackText}
                        placeholder={t('ceoP.view.feedbackPlaceholder')}
                        multiline
                        numberOfLines={3}
                      />
                      <Btn
                        title={t('common.save')}
                        busy={busy}
                        onPress={() => void saveFeedback(viewing)}
                      />
                    </View>
                  ) : (
                    <Text style={[styles.notes, align]}>
                      {viewing.feedback || t('ceoP.view.noFeedback')}
                    </Text>
                  )}

                  {rescheduling ? (
                    <View style={styles.editBox}>
                      <Field
                        label={t('ceoP.view.newDateTime')}
                        value={rescheduleText}
                        onChangeText={(next) => {
                          setRescheduleText(next);
                          setFormError(null);
                        }}
                        placeholder="2026-11-04 15:30"
                      />
                      {formError ? <ErrorBar message={formError} /> : null}
                      <Btn
                        title={t('ceoP.view.reschedule')}
                        busy={busy}
                        onPress={() => void reschedule(viewing)}
                      />
                      <Btn
                        title={t('common.cancel')}
                        variant="ghost"
                        onPress={() => {
                          setRescheduleId(null);
                          setRescheduleText('');
                          setFormError(null);
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {(canConfirm || canComplete) && !rescheduling ? (
                <View style={[styles.actions, row]}>
                  {waHref ? (
                    <Pressable
                      onPress={() => Linking.openURL(waHref)}
                      hitSlop={8}
                      accessibilityLabel={t('viewings.confirmWhatsApp')}
                      style={styles.waBtn}>
                      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                    </Pressable>
                  ) : null}
                  {canConfirm ? (
                    <Btn
                      title={t('ceo.confirm')}
                      busy={busy}
                      style={styles.action}
                      onPress={() => void change(viewing, 'CONFIRMED')}
                    />
                  ) : (
                    <Btn
                      title={t('ceo.complete')}
                      busy={busy}
                      style={styles.action}
                      onPress={() => void change(viewing, 'COMPLETED')}
                    />
                  )}
                  <Btn
                    title={t('common.cancel')}
                    variant="ghost"
                    style={styles.action}
                    onPress={() => void change(viewing, 'CANCELLED')}
                  />
                  {canConfirm ? null : (
                    <Btn
                      title={t('ceo.noShow')}
                      variant="ghost"
                      style={styles.action}
                      onPress={() => void change(viewing, 'NO_SHOW')}
                    />
                  )}
                </View>
              ) : null}

              {isOpen && !rescheduling ? (
                <View style={[styles.actions, row]}>
                  <Btn
                    title={t('ceoP.view.reschedule')}
                    variant="ghost"
                    style={styles.action}
                    disabled={busy}
                    onPress={() => {
                      setRescheduleId(viewing.id);
                      setRescheduleText('');
                      setFormError(null);
                    }}
                  />
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      {assignTarget ? (
        <AssignSheet
          viewing={assignTarget}
          brokers={brokers}
          busy={busyId === assignTarget.id}
          onClose={() => setAssignTarget(null)}
          onPick={(brokerId) => void assignBroker(assignTarget, brokerId)}
        />
      ) : null}
    </Screen>
  );
}

/** The website's `datetime-local` input, restated as plain text:
 *  `YYYY-MM-DD HH:mm` (a full ISO string still parses). */
function parseDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalised = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* ─── Broker picker — PATCH /api/ceo/viewings { id, brokerId } ─────────── */

function AssignSheet({
  viewing,
  brokers,
  busy,
  onClose,
  onPick,
}: {
  viewing: Viewing;
  brokers: BrokerLite[];
  busy: boolean;
  onClose: () => void;
  onPick: (brokerId: string) => void;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const person = viewing.user?.name ?? viewing.lead?.name ?? '';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <View style={[styles.sheetHeadRow, row]}>
              <View style={styles.sheetTitles}>
                <Text style={[styles.sheetTitle, align]}>{t('ceoP.view.assignTitle')}</Text>
                <Text style={[styles.sheetSubtitle, align]}>{t('ceoP.view.assignHint')}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('ceoP.view.assignTitle')}>
                <Ionicons name="close" size={20} color={theme.mutedForeground} />
              </Pressable>
            </View>
            {person ? <Text style={[styles.forName, align]}>{person}</Text> : null}
            {brokers.length === 0 ? (
              <Empty title={t('ceoP.view.noBrokers')} />
            ) : (
              brokers.map((broker) => {
                const label =
                  broker.user?.name || broker.name || broker.user?.email || broker.email || broker.id;
                const current = viewing.broker?.id === broker.id;
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
    duration: { color: t.mutedForeground, fontSize: 14, fontWeight: '700' },
    notes: { color: t.mutedForeground, fontSize: 14, lineHeight: 18 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    actions: { gap: 8, flexWrap: 'wrap' },
    action: { flexGrow: 1, minWidth: 110 },
    waBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.border,
    },
    detail: { gap: 2 },
    section: { color: t.foreground, fontSize: 14, fontWeight: '700', marginTop: 8 },
    editHead: { alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    editBox: { gap: 8 },
    mini: { minHeight: 32, paddingHorizontal: 10, paddingVertical: 4 },
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
    sheetHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' },
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
