import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { apiFetch } from '@/api/client';
import { API_URL } from '@/api/config';
import { useAuth } from '@/auth/auth-context';

import { useRequireAuth } from '@/components/auth-gate';
import { Badge, Btn, Card, Chip, Divider, Empty, ErrorBar, Field, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, formatMoney, humanise, timeAgo } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

type Activity = { id: string; type?: string; content?: string; createdAt?: string };

type LinkedDeal = { id: string; status: string; dealValue?: number | null };

type VoiceNote = {
  id: string;
  leadId: string;
  audioUrl: string;
  durationSec?: number | null;
  createdById: string;
  createdAt: string;
  createdBy?: { id: string; name?: string | null } | null;
};

/** Recording cap — the server enforces 180s, the UI stops at 2 minutes. */
const MAX_VN_SECONDS = 120;

function formatVnTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, '0')}`;
}

type Lead = {
  id: string;
  leadCode?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  source?: string | null;
  score?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  notes?: string | null;
  nextFollowUp?: string | null;
  createdAt: string;
  reviewStatus?: string;
  duplicateNote?: string | null;
  protectionStartsAt?: string | null;
  protectionExpiresAt?: string | null;
  protectionDays?: number | null;
  protectionStatus?: 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE';
  project?: { id: string; slug?: string; name: string } | null;
  unit?: { id: string; name?: string } | null;
  broker?: { agencyName?: string | null; user?: { name?: string } | null } | null;
  developer?: { companyName?: string | null } | null;
  deals?: LinkedDeal[];
  activities?: Activity[];
  _count?: { activities?: number };
};

/**
 * The website DetailModal's "Move to stage" targets: the subset of
 * `ALL_STATUSES` it offers, minus the lead's current status. Every one is
 * accepted by `leadStatusUpdateSchema`, so the PATCH can never 400 here.
 */
const STAGE_ACTIONS = [
  'CONTACTED',
  'QUALIFIED',
  'VIEWING',
  'INTERESTED',
  'RESERVATION',
  'CONTRACT',
  'SOLD',
  'LOST',
];

/** The three stages at which the server auto-creates the linked Deal. */
const DEAL_STAGES = ['RESERVATION', 'CONTRACT', 'SOLD'];

export default function LeadDetailScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, row, align, text, isRtl } = useI18n();
  const { currency, rates } = useCurrency();
  const mutation = useMutation();

  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // The wall clock the protection bar measures against. Captured once after
  // mount so render itself stays pure (`react-hooks/purity` bans Date.now).
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const { data, error, loading, refresh } = useApi<{ lead?: Lead }>(
    id ? `/api/leads/${encodeURIComponent(String(id))}` : null
  );

  async function patch(body: Record<string, unknown>) {
    setProblem(null);
    try {
      await mutation.run(`/api/leads/${id}`, 'PATCH', body);
      refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : t('leads.updateFailed');
      setProblem(message);
      Alert.alert(t('leads.updateFailedTitle'), message);
    }
  }

  /**
   * The website's inline confirm box before `PATCH { status }`: deal stages
   * warn that a Deal record is created for them, everything else warns about
   * the notifications the server fans out.
   */
  function confirmMove(to: string) {
    const dealStage = DEAL_STAGES.includes(to);
    Alert.alert(
      `${t('leads.moveTitle')} ${humanise(to)}${isRtl ? '؟' : '?'}`,
      dealStage ? t('leads.moveDealHint') : t('leads.moveNotifyHint'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: () => void patch({ status: to }) },
      ]
    );
  }

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  if (loading) return <Loading label={t('leads.detailLoading')} />;

  const lead = data?.lead;

  if (error || !lead) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('leads.title') }} />
        {error ? <ErrorBar message={error} onRetry={refresh} /> : <Empty title={t('leads.notFound')} />}
      </Screen>
    );
  }

  // Elapsed share of the protection window — the bar the website draws in
  // the lead DetailModal, clamped to 0…100 and full when the dates are odd.
  const startMs = lead.protectionStartsAt ? new Date(lead.protectionStartsAt).getTime() : NaN;
  const endMs = lead.protectionExpiresAt ? new Date(lead.protectionExpiresAt).getTime() : now;
  const protectionPct =
    now > 0 && Number.isFinite(startMs) && endMs > startMs
      ? Math.min(100, Math.max(0, ((now - startMs) / (endMs - startMs)) * 100))
      : 100;

  return (
    <Screen>
      <Stack.Screen options={{ title: lead.leadCode ?? t('leads.title') }} />

      <Card>
        <View style={[styles.header, row]}>
          <View style={styles.headerText}>
            <Text style={[styles.name, align]}>{lead.name}</Text>
            <Text style={[styles.code, align]}>{lead.leadCode}</Text>
          </View>
          <View style={[styles.badges, row]}>
            <Badge tone={toneFor(lead.status)}>{humanise(lead.status)}</Badge>
            <Badge tone={protectionTone(lead.protectionStatus)}>
              {protectionLabel(lead.protectionStatus, t)}
            </Badge>
            {lead.reviewStatus === 'DUPLICATE_REVIEW' ? (
              <Badge tone="gold">{t('leads.underDuplicateReview')}</Badge>
            ) : null}
          </View>
        </View>
        <Divider />
        <Row title={lead.email ?? '—'} subtitle={t('common.email')} />
        <Divider />
        <Row
          title={lead.phone ?? '—'}
          subtitle={t('common.phone')}
          right={
            lead.phone ? (
              <Btn title={t('leads.call')} variant="ghost" onPress={() => Linking.openURL(`tel:${lead.phone}`)} />
            ) : undefined
          }
        />
        {lead.budgetMin || lead.budgetMax ? (
          <>
            <Divider />
            <Row
              title={`${formatMoney(lead.budgetMin, currency, rates, { compact: true })} – ${formatMoney(lead.budgetMax, currency, rates, { compact: true })}`}
              subtitle={t('leads.budget')}
            />
          </>
        ) : null}
      </Card>

      {lead.protectionStartsAt ? (
        <Card>
          <View style={[styles.windowHead, row]}>
            <Text style={[styles.windowTitle, align]}>{t('leads.protectionWindow')}</Text>
            <Text style={[styles.windowDays, align]}>{`${lead.protectionDays ?? '—'} ${t('leads.days')}`}</Text>
          </View>
          <View style={[styles.track, isRtl && styles.trackRtl]}>
            <View
              style={[
                styles.fill,
                lead.protectionStatus === 'PROTECTED'
                  ? styles.fillProtected
                  : lead.protectionStatus === 'EXPIRING_SOON'
                    ? styles.fillExpiring
                    : styles.fillExpired,
                { width: `${protectionPct}%` },
              ]}
            />
          </View>
          <View style={[styles.windowDates, row]}>
            <Text style={[styles.meta, align]}>{formatDate(lead.protectionStartsAt)}</Text>
            <Text style={[styles.meta, align]}>{formatDate(lead.protectionExpiresAt)}</Text>
          </View>
        </Card>
      ) : null}

      {lead.duplicateNote && lead.reviewStatus === 'DUPLICATE_REVIEW' ? (
        <View style={styles.dupNote}>
          <Text style={[styles.dupNoteText, align]}>{lead.duplicateNote}</Text>
        </View>
      ) : null}

      {lead.project ? (
        <Card>
          <SectionTitle>{t('leads.related')}</SectionTitle>
          <Row
            title={lead.project.name}
            subtitle={lead.unit?.name ?? lead.developer?.companyName ?? t('common.project')}
            onPress={lead.project.slug ? () => router.push(`/project/${lead.project!.slug}`) : undefined}
          />
          {lead.broker?.agencyName || lead.broker?.user?.name ? (
            <>
              <Divider />
              <Row title={lead.broker?.agencyName ?? lead.broker?.user?.name ?? ''} subtitle={t('leads.assignedBroker')} />
            </>
          ) : null}
        </Card>
      ) : null}

      {lead.deals && lead.deals.length > 0 ? (
        <Card>
          <SectionTitle>{t('leads.linkedDeal')}</SectionTitle>
          <Row
            title={humanise(lead.deals[0].status)}
            right={
              <Text style={[styles.dealValue, align]}>
                {formatMoney(lead.deals[0].dealValue, currency, rates, { compact: true })}
              </Text>
            }
          />
        </Card>
      ) : null}

      <Card>
        <SectionTitle
          action={mutation.busy ? <Text style={[styles.saving, text]}>{t('common.saving')}</Text> : undefined}>
          {t('leads.moveStage')}
        </SectionTitle>
        <View style={[styles.chips, row]}>
          {STAGE_ACTIONS.filter((stage) => stage !== lead.status).map((stage) => (
            <Chip
              key={stage}
              label={`${humanise(stage)}${isRtl ? ' ‹' : ' ›'}`}
              disabled={mutation.busy}
              onPress={() => confirmMove(stage)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('common.notes')}</SectionTitle>
        <Field
          label={t('leads.addNote')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('leads.notePlaceholder')}
          multiline
          numberOfLines={4}
          style={styles.notes}
        />
        <Btn
          title={t('leads.saveNote')}
          disabled={!notes.trim()}
          busy={mutation.busy}
          onPress={async () => {
            await patch({ notes: notes.trim() });
            setNotes('');
          }}
        />
        {lead.notes ? <Text style={[styles.existing, align]}>{lead.notes}</Text> : null}
      </Card>

      <VoiceNotesSection leadId={lead.id} />

      {problem ? <ErrorBar message={problem} /> : null}

      {(lead.activities?.length ?? 0) > 0 ? (
        <Card>
          <SectionTitle>{t('leads.activity')}</SectionTitle>
          {lead.activities!.slice(0, 25).map((activity, index) => (
            <View key={activity.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={activity.content ?? humanise(activity.type)}
                subtitle={[activity.type ? humanise(activity.type) : null, timeAgo(activity.createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Text style={[styles.created, text]}>
        {t('leads.created')} {formatDate(lead.createdAt, true)}
      </Text>
    </Screen>
  );
}

/**
 * Voice memos on this lead — record via `expo-audio`, play back, delete.
 * One shared player serves the whole list so only one note plays at a time;
 * uploads go straight to POST /api/voice-notes as multipart (apiFetch stamps
 * JSON content-type, which would corrupt the boundary — same reason the image
 * upload helper uses raw fetch).
 */
function VoiceNotesSection({ leadId }: { leadId: string }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { session, user, hasRole } = useAuth();
  const token = session?.token ?? null;

  const { data, error, loading, refresh } = useApi<{ voiceNotes?: VoiceNote[] }>(
    leadId ? `/api/voice-notes?leadId=${encodeURIComponent(leadId)}` : null
  );
  const items = data?.voiceNotes ?? [];

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 500);
  const player = useAudioPlayer(null);
  const playStatus = useAudioPlayerStatus(player);

  const [recording, setRecording] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [recFailed, setRecFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [pending, setPending] = useState<{ uri: string; seconds: number } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playFailed, setPlayFailed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const uploadUri = useCallback(
    async (uri: string, seconds: number) => {
      setUploading(true);
      setUploadFailed(false);
      try {
        const base = uri.split('/').pop()?.split('?')[0] || `voice-note-${Date.now()}.m4a`;
        const body = new FormData();
        body.append('leadId', leadId);
        body.append('durationSec', String(seconds));
        body.append('audio', { uri, name: base, type: 'audio/mp4' } as unknown as Blob);
        const res = await fetch(`${API_URL}/api/voice-notes`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            ...(token ? { 'X-Session-Token': encodeURIComponent(token) } : {}),
          },
          body,
        });
        if (!res.ok) throw new Error(`voice-note upload answered ${res.status}`);
        setPending(null);
        refresh();
      } catch {
        // Keep the file for the retry button — never surface the raw error.
        setPending({ uri, seconds });
        setUploadFailed(true);
      } finally {
        setUploading(false);
      }
    },
    [leadId, token, refresh]
  );

  const stopRecording = useCallback(
    async (discard = false) => {
      const wasRecording = recorder.isRecording;
      setRecording(false);
      if (!wasRecording) return;
      try {
        const seconds = Math.max(1, Math.round(recorder.getStatus().durationMillis / 1000));
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri || discard) return;
        await uploadUri(uri, seconds);
      } catch {
        setRecFailed(true);
      }
    },
    [recorder, uploadUri]
  );

  // Hard stop at the 2-minute cap — the server's 180s ceiling only absorbs
  // stop-latency so a full-length memo is never rejected for overshooting.
  useEffect(() => {
    if (recording && recState.isRecording && recState.durationMillis >= MAX_VN_SECONDS * 1000) {
      void stopRecording();
    }
  }, [recording, recState.isRecording, recState.durationMillis, stopRecording]);

  const startRecording = useCallback(async () => {
    setMicDenied(false);
    setRecFailed(false);
    try {
      const current = await getRecordingPermissionsAsync();
      let granted = current.granted;
      if (!granted) {
        granted = (await requestRecordingPermissionsAsync()).granted;
      }
      // Mic denied (or the request threw on a restricted device): plain
      // Egyptian hint, never a crash.
      if (!granted) {
        setMicDenied(true);
        return;
      }
      recorder.record();
      setRecording(true);
    } catch {
      setRecFailed(true);
    }
  }, [recorder]);

  const togglePlay = useCallback(
    (note: VoiceNote) => {
      setPlayFailed(false);
      try {
        if (playingId === note.id) {
          if (playStatus.playing) {
            player.pause();
          } else {
            if (playStatus.didJustFinish) void player.seekTo(0);
            player.play();
          }
          return;
        }
        player.replace({ uri: `${API_URL}${note.audioUrl}` });
        setPlayingId(note.id);
        player.play();
      } catch {
        setPlayingId(null);
        setPlayFailed(true);
      }
    },
    [player, playStatus.playing, playStatus.didJustFinish, playingId]
  );

  const confirmDelete = useCallback(
    (note: VoiceNote) => {
      Alert.alert(t('vn.deleteConfirm'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('vn.delete'),
          style: 'destructive',
          onPress: () => {
            setDeletingId(note.id);
            setDeleteFailed(false);
            apiFetch(`/api/voice-notes?id=${encodeURIComponent(note.id)}`, {
              method: 'DELETE',
              token,
            })
              .then(() => {
                if (playingId === note.id) {
                  player.pause();
                  setPlayingId(null);
                }
                refresh();
              })
              .catch(() => setDeleteFailed(true))
              .finally(() => setDeletingId(null));
          },
        },
      ]);
    },
    [t, token, playingId, player, refresh]
  );

  const canDelete = useCallback(
    (note: VoiceNote) => note.createdById === user?.id || hasRole('CEO', 'ADMIN'),
    [user?.id, hasRole]
  );

  return (
    <Card>
      <SectionTitle
        action={
          recording ? (
            <Text style={styles.vnTimer}>{formatVnTime(recState.durationMillis / 1000)}</Text>
          ) : undefined
        }>
        {t('vn.section')}
      </SectionTitle>
      <Text style={[styles.vnHint, align]}>{t('vn.maxHint')}</Text>

      {micDenied ? <ErrorBar message={t('vn.micDenied')} /> : null}
      {recFailed ? <ErrorBar message={t('vn.recFailed')} /> : null}
      {uploadFailed ? (
        <ErrorBar
          message={t('vn.uploadFailed')}
          onRetry={pending ? () => void uploadUri(pending.uri, pending.seconds) : refresh}
        />
      ) : null}
      {playFailed ? <ErrorBar message={t('vn.playFailed')} /> : null}
      {deleteFailed ? <ErrorBar message={t('vn.deleteFailed')} /> : null}
      {error && !uploadFailed ? <ErrorBar message={error} onRetry={refresh} /> : null}

      <View style={[styles.vnControls, row]}>
        {!recording ? (
          <Btn
            title={uploading ? t('vn.uploading') : t('vn.record')}
            busy={uploading}
            disabled={uploading}
            onPress={() => void startRecording()}
          />
        ) : (
          <>
            <Btn title={t('vn.stopAndSend')} onPress={() => void stopRecording()} />
            <Btn title={t('vn.cancel')} variant="ghost" onPress={() => void stopRecording(true)} />
          </>
        )}
      </View>

      {loading ? (
        <Loading label={t('leads.loading')} />
      ) : items.length === 0 ? (
        <Text style={[styles.vnHint, align]}>{t('vn.empty')}</Text>
      ) : (
        items.map((note, index) => {
          const active = playingId === note.id;
          const total = active && playStatus.duration > 0 ? playStatus.duration : (note.durationSec ?? 0);
          const current = active ? playStatus.currentTime : 0;
          const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
          const label =
            active && playStatus.duration > 0
              ? `${formatVnTime(current)} / ${formatVnTime(total)}`
              : formatVnTime(note.durationSec ?? 0);
          return (
            <View key={note.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.vnRow}>
                <Btn
                  title={active && playStatus.playing ? t('vn.pause') : t('vn.play')}
                  variant="ghost"
                  disabled={recording || uploading}
                  onPress={() => togglePlay(note)}
                />
                <View style={styles.vnBody}>
                  <View style={styles.vnTrack}>
                    <View style={[styles.vnFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={[styles.vnMeta, align]}>
                    {label}
                    {note.createdBy?.name ? ` · ${note.createdBy.name}` : ''}
                    {note.createdAt ? ` · ${timeAgo(note.createdAt)}` : ''}
                  </Text>
                </View>
                {canDelete(note) ? (
                  <Btn
                    title={t('vn.delete')}
                    variant="danger"
                    busy={deletingId === note.id}
                    disabled={deletingId !== null}
                    onPress={() => confirmDelete(note)}
                  />
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

function toneFor(status: string) {
  const s = (status ?? '').toUpperCase();
  if (['SOLD', 'CONVERTED', 'CONTRACT', 'RESERVATION', 'QUALIFIED'].includes(s)) return 'green' as const;
  if (['LOST', 'CANCELLED', 'EXPIRED'].includes(s)) return 'red' as const;
  if (['NEW', 'CONTACTED', 'VISITED'].includes(s)) return 'gold' as const;
  return 'blue' as const;
}

/** The site's `protectionBadge()` colours, on the kit's badge palette. */
function protectionTone(status: string | undefined) {
  const s = (status ?? 'NONE').toUpperCase();
  if (s === 'PROTECTED') return 'green' as const;
  if (s === 'EXPIRING_SOON') return 'gold' as const;
  if (s === 'EXPIRED') return 'red' as const;
  return 'muted' as const;
}

function protectionLabel(status: string | undefined, t: (key: MessageKey) => string) {
  const s = (status ?? 'NONE').toUpperCase();
  if (s === 'PROTECTED') return t('leads.protected');
  if (s === 'EXPIRING_SOON') return t('leads.expiring');
  if (s === 'EXPIRED') return t('leads.expired');
  return t('leads.noProtection');
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerText: { flex: 1, gap: 2 },
    name: { color: t.foreground, fontSize: 20, fontWeight: '800' },
    code: { color: t.mutedForeground, fontSize: 14 },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', flexShrink: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    saving: { color: t.primary, fontSize: 12, fontWeight: '700' },

    // Protection window — `h-2 rounded-full bg-muted` with the elapsed share
    // filled in the status colour, drawn from the reading edge in RTL too.
    windowHead: { alignItems: 'center', justifyContent: 'space-between' },
    windowTitle: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    windowDays: { color: t.mutedForeground, fontSize: 12 },
    windowDates: { alignItems: 'center', justifyContent: 'space-between' },
    track: { height: 8, borderRadius: Radius.full, backgroundColor: t.muted, overflow: 'hidden' },
    trackRtl: { justifyContent: 'flex-end' },
    fill: { height: 8, borderRadius: Radius.full, backgroundColor: t.primary },
    fillProtected: { backgroundColor: t.successFg },
    fillExpiring: { backgroundColor: t.warningFg },
    fillExpired: { backgroundColor: t.dangerFg },
    meta: { color: t.mutedForeground, fontSize: 12 },

    // Duplicate-review note — the amber callout from the website's modal.
    dupNote: {
      backgroundColor: t.warningBg,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      padding: 12,
    },
    dupNoteText: { color: t.warningFg, fontSize: 14, lineHeight: 20 },

    dealValue: { color: t.foreground, fontSize: 15, fontWeight: '700' },

    notes: { minHeight: 90, textAlignVertical: 'top', paddingTop: 10 },
    existing: { color: t.mutedForeground, fontSize: 14, lineHeight: 19 },
    created: { color: t.mutedForeground, fontSize: 12, textAlign: 'center', marginTop: 4 },

    // Voice notes — record button + per-note player row with progress track.
    vnHint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    vnTimer: { color: t.dangerFg, fontSize: 14, fontWeight: '700' },
    vnControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    vnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    vnBody: { flex: 1, gap: 4 },
    vnTrack: { height: 6, borderRadius: Radius.full, backgroundColor: t.muted, overflow: 'hidden' },
    vnFill: { height: 6, borderRadius: Radius.full, backgroundColor: t.primary },
    vnMeta: { color: t.mutedForeground, fontSize: 12 },
  }),
);
