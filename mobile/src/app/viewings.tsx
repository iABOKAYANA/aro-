import { useEffect, useState } from 'react';
import { Alert, Clipboard, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';

import { useRequireAuth } from '@/components/auth-gate';
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
  Segmented,
} from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatDate, humanise } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

type Viewing = {
  id: string;
  meetingType: string;
  meetingLink?: string | null;
  contactPhone?: string | null;
  scheduledAt: string;
  duration?: number | null;
  notes?: string | null;
  status: string;
  unit?: { id: string; name?: string; project?: { name: string; slug: string } | null } | null;
  project?: { id: string; name: string; slug: string } | null;
  broker?: { id: string; user?: { name?: string | null } } | null;
};

/** Same split as the website: these statuses are never "upcoming" again. */
const PAST_STATUSES = ['CANCELLED', 'COMPLETED', 'NO_SHOW'];

/**
 * "My appointments" — `GET /api/viewings` is scoped to the signed-in user by
 * the server, so this is exactly the list the website's dashboard shows, split
 * the same way: **upcoming** (scheduled in the future, soonest first) and
 * **past** (cancelled/completed/no-show or already behind us, most recent
 * first).
 *
 * The meeting link gets the website's "Copy Link" button too — next to Join —
 * with a Copied confirmation.
 */
export default function ViewingsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The wall clock the upcoming/past split measures against. Captured once
  // after mount so render itself stays pure (`react-hooks/purity` bans
  // Date.now) — same pattern as src/app/lead/[id].tsx.
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const { data, error, loading, refreshing, refresh } = useApi<{ viewings?: Viewing[] }>(
    '/api/viewings?limit=100'
  );
  const mutation = useMutation();

  // The server currently ignores `limit` and returns every appointment, so the
  // render slice below is the real bound — the query param is forward-compatible.
  const VIEWINGS_LIMIT = 100;
  const viewings = (data?.viewings ?? [])
    .filter((viewing) => {
      const isPast =
        PAST_STATUSES.includes((viewing.status ?? '').toUpperCase()) ||
        new Date(viewing.scheduledAt).getTime() < now;
      return tab === 'past' ? isPast : !isPast;
    })
    .sort((a, b) =>
      tab === 'past'
        ? new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
        : new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    .slice(0, VIEWINGS_LIMIT);
  const truncated = (data?.viewings ?? []).length > VIEWINGS_LIMIT;

  async function cancel(viewing: Viewing) {
    Alert.alert(
      t('viewings.cancelTitle'),
      `${formatDate(viewing.scheduledAt, true)} — ${t('viewings.cancelBody')}`,
      [
        { text: t('viewings.keepIt'), style: 'cancel' },
        {
          text: t('viewings.cancelIt'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(viewing.id);
            try {
              await mutation.run(`/api/viewings?id=${viewing.id}`, 'DELETE');
              refresh();
            } catch (e) {
              Alert.alert(
                t('viewings.cancelFailed'),
                e instanceof Error ? e.message : t('common.retry')
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  async function copyLink(viewing: Viewing) {
    const link = viewing.meetingLink;
    if (!link) return;
    const copied = await writeToClipboard(link);
    if (!copied) {
      // Nothing on the device will take the string — show it so it can be
      // copied by hand instead of pretending the tap worked.
      Alert.alert(t('viewings.copyFailed'), link);
      return;
    }
    setCopiedId(viewing.id);
    setTimeout(() => setCopiedId((current) => (current === viewing.id ? null : current)), 2000);
  }

  const authGate = useRequireAuth('viewings.signIn');
  if (authGate) return authGate;

  if (loading) return <Loading label={t('viewings.loading')} />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('viewings.mine') }} />

      <Btn title={t('viewings.book')} onPress={() => router.push('/(tabs)/explore')} />

      <Segmented<'upcoming' | 'past'>
        options={[
          { value: 'upcoming', label: t('viewings.upcoming') },
          { value: 'past', label: t('viewings.past') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {truncated ? (
        <Text style={[styles.truncated, align]}>
          {t('viewings.showingFirst').replace('{n}', String(VIEWINGS_LIMIT))}
        </Text>
      ) : null}

      {!error && viewings.length === 0 ? (
        <Empty
          title={tab === 'past' ? t('viewings.emptyPast') : t('viewings.emptyUpcoming')}
          message={
            tab === 'past' ? t('viewings.emptyPastHint') : t('viewings.emptyUpcomingHint')
          }
          action={
            tab === 'past' ? undefined : (
              <Btn
                title={t('viewings.findProject')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/explore')}
              />
            )
          }
        />
      ) : null}

      {viewings.map((viewing) => {
        const when = new Date(viewing.scheduledAt);
        const property =
          viewing.unit?.project?.name ?? viewing.project?.name ?? viewing.unit?.name ?? t('viewings.property');
        const slug = viewing.project?.slug ?? viewing.unit?.project?.slug;
        const status = (viewing.status ?? '').toUpperCase();
        const canCancel =
          ['REQUESTED', 'CONFIRMED'].includes(status) && when.getTime() > now;
        const canJoin = Boolean(viewing.meetingLink) && status !== 'CANCELLED';
        const duration = viewing.duration ? viewing.duration : 30;
        const brokerName = viewing.broker?.user?.name;

        return (
          <Card key={viewing.id} style={styles.card}>
            <View style={[styles.head, row]}>
              <Text style={[styles.when, align]}>{formatDate(when, true)}</Text>
              <Badge tone={toneFor(viewing.status)}>{humanise(viewing.status)}</Badge>
            </View>

            <Divider />
            <Row title={property} subtitle={viewing.unit?.name ?? undefined} />

            <Divider />
            <Row
              title={
                viewing.meetingType === 'online' ? t('viewings.onlineMeeting') : t('viewings.inPerson')
              }
              subtitle={[
                `(${duration} ${t('viewings.minutes')})`,
                brokerName ? `${t('viewings.with')} ${brokerName}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />

            {canJoin ? (
              <>
                <Divider />
                <Row
                  title={t('viewings.joinRoom')}
                  subtitle={t('viewings.opensBrowser')}
                  onPress={() => Linking.openURL(String(viewing.meetingLink))}
                />
              </>
            ) : null}

            {viewing.contactPhone ? (
              <>
                <Divider />
                <Row
                  title={viewing.contactPhone}
                  subtitle={t('viewings.contactNumber')}
                  onPress={() => Linking.openURL(`tel:${viewing.contactPhone}`)}
                />
              </>
            ) : null}

            {viewing.notes ? (
              <>
                <Divider />
                <Text style={[styles.notes, align]}>{viewing.notes}</Text>
              </>
            ) : null}

            <View style={[styles.actions, row]}>
              {canJoin ? (
                <Pressable
                  onPress={() => void copyLink(viewing)}
                  hitSlop={6}
                  style={[styles.copyBtn, row]}>
                  <Ionicons
                    name={copiedId === viewing.id ? 'checkmark' : 'copy-outline'}
                    size={14}
                    color={copiedId === viewing.id ? theme.successFg : theme.primary}
                  />
                  <Text style={styles.copyText}>
                    {copiedId === viewing.id ? t('viewings.copied') : t('viewings.copyLink')}
                  </Text>
                </Pressable>
              ) : null}

              {slug ? (
                <Chip
                  label={t('viewings.openProject')}
                  selected={false}
                  onPress={() => router.push(`/project/${slug}`)}
                />
              ) : null}

              {status === 'COMPLETED' && slug ? (
                <Chip
                  label={t('rev.rate')}
                  selected
                  onPress={() =>
                    router.push({ pathname: '/project/[slug]', params: { slug, review: viewing.id } })
                  }
                />
              ) : null}

              {canCancel ? (
                <Chip
                  label={busyId === viewing.id ? t('viewings.cancelling') : t('common.cancel')}
                  selected={false}
                  onPress={() => busyId !== viewing.id && cancel(viewing)}
                />
              ) : null}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

/**
 * Clipboard without a new dependency: the web build gets the browser's
 * clipboard, native falls back to the core `Clipboard` module React Native
 * 0.86 still ships. Returns false when neither accepts the string, so the
 * caller never reports a copy that did not happen.
 */
async function writeToClipboard(value: string): Promise<boolean> {
  const globals = globalThis as unknown as {
    navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
  };
  const webClipboard = globals.navigator?.clipboard;
  if (webClipboard?.writeText) {
    try {
      await webClipboard.writeText(value);
      return true;
    } catch {
      // Permission denied or insecure context — try the native path.
    }
  }
  try {
    Clipboard.setString(value);
    return true;
  } catch {
    return false;
  }
}

function toneFor(status: string) {
  const s = (status ?? '').toUpperCase();
  if (s === 'COMPLETED' || s === 'CONFIRMED') return 'green' as const;
  if (s === 'CANCELLED' || s === 'NO_SHOW') return 'red' as const;
  return 'gold' as const;
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    card: { gap: 0 },
    truncated: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    when: { color: t.foreground, fontSize: 16, fontWeight: '800' },
    notes: { color: t.mutedForeground, fontSize: 14, lineHeight: 19, paddingVertical: 8 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' },
    copyBtn: {
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: t.input,
      borderRadius: Radius.full,
      paddingHorizontal: 14,
      minHeight: 32,
      justifyContent: 'center',
    },
    copyText: { color: t.primary, fontSize: 12, fontWeight: '600' },
  }),
);
