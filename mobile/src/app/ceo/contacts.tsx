import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatDate, humanise, initials } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type ContactSubmission = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: string;
  createdAt: string;
};

/** The route answers `{ items, total, page, totalPages }` — the website also
 *  tolerates a bare array, so this type does too. */
type ContactList = ContactSubmission[] | { items?: ContactSubmission[]; total?: number };

type Status = 'ALL' | 'NEW' | 'READ' | 'REPLIED' | 'ARCHIVED';

const STATUS_TABS: Status[] = ['ALL', 'NEW', 'READ', 'REPLIED', 'ARCHIVED'];

/** Exactly the set `PATCH /api/contact/list` validates `status` against. */
const STATUS_CHOICES = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'] as const;

const MAX_RENDER = 50;

/**
 * Contact form submissions — the website's /ceo/contacts table as a card list.
 *
 * `GET /api/contact/list?limit=50` reads and `PATCH /api/contact/list` with
 * `{ id, status }` writes, the same NEW → READ → REPLIED → ARCHIVED flow the
 * site runs: opening a NEW submission marks it READ on the spot, and the
 * expanded card carries the message plus the quick status actions.
 */
export default function CeoContactsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useApi<ContactList>(
    '/api/contact/list?limit=50',
  );
  const mutation = useMutation();

  const submissions = Array.isArray(data) ? data : (data?.items ?? []);

  async function updateStatus(id: string, next: string): Promise<boolean> {
    setBusyId(id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/contact/list', 'PATCH', { id, status: next });
      refresh();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function changeStatus(sub: ContactSubmission, next: string) {
    if (sub.status === next) return;
    void updateStatus(sub.id, next).then((ok) => {
      if (ok) setNotice(t('ceo.statusUpdated'));
    });
  }

  /** Same as the site's `handleExpand`: opening a NEW row flips it to READ. */
  function handleExpand(sub: ContactSubmission) {
    if (expanded === sub.id) {
      setExpanded(null);
      return;
    }
    setExpanded(sub.id);
    setProblem(null);
    setNotice(null);
    if (sub.status === 'NEW') void updateStatus(sub.id, 'READ');
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const counts: Record<string, number> = {};
  for (const sub of submissions) counts[sub.status] = (counts[sub.status] ?? 0) + 1;

  const needle = query.trim().toLowerCase();
  const filtered = submissions.filter((sub) => {
    if (status !== 'ALL' && sub.status !== status) return false;
    if (!needle) return true;
    return (
      sub.name.toLowerCase().includes(needle) ||
      sub.email.toLowerCase().includes(needle) ||
      (sub.subject?.toLowerCase().includes(needle) ?? false)
    );
  });
  const rows = filtered.slice(0, MAX_RENDER);
  const searching = needle.length > 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoPpl.contactsTitle') }} />

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceoPpl.contacts.search')} />

      <View style={[styles.filters, row]}>
        {STATUS_TABS.map((value) => (
          <Chip
            key={value}
            label={
              value === 'ALL'
                ? `${t('common.all')} (${submissions.length})`
                : `${humanise(value)} (${counts[value] ?? 0})`
            }
            selected={status === value}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && rows.length === 0 ? (
        <Empty
          title={t('ceoPpl.contacts.none')}
          message={
            searching
              ? t('ceoPpl.contacts.trySearch')
              : status !== 'ALL'
                ? t('ceoPpl.contacts.noneStatus')
                : t('ceoPpl.contacts.noneYet')
          }
        />
      ) : null}

      {filtered.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${filtered.length}`}
        </Text>
      ) : null}

      {rows.map((sub, index) => {
        const isOpen = expanded === sub.id;
        const busy = busyId === sub.id;

        return (
          <View key={sub.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={<Avatar text={initials(sub.name)} />}
                title={sub.name}
                subtitle={[sub.email, sub.subject].filter(Boolean).join(' · ')}
                badge={<Badge tone={toneForContact(sub.status)}>{humanise(sub.status)}</Badge>}
                onPress={() => handleExpand(sub)}
              />

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />

                  <Text style={[styles.sectionLabel, align]}>{t('ceoPpl.contacts.info')}</Text>
                  <Detail label={t('common.email')} value={sub.email} />
                  {sub.phone ? <Detail label={t('common.phone')} value={sub.phone} /> : null}
                  <Detail label={t('common.created')} value={formatDate(sub.createdAt, true)} />

                  {sub.subject ? (
                    <View style={styles.messageBlock}>
                      <Text style={[styles.prefLabel, align]}>{t('ceoPpl.contacts.subject')}</Text>
                      <Text style={[styles.subject, align]}>{sub.subject}</Text>
                    </View>
                  ) : null}

                  <View style={styles.messageBlock}>
                    <Text style={[styles.prefLabel, align]}>{t('ceoPpl.contacts.message')}</Text>
                    <Text style={[styles.message, align]}>{sub.message}</Text>
                  </View>

                  <Text style={[styles.sectionLabel, align]}>{t('ceoPpl.contacts.quickActions')}</Text>
                  <View style={[styles.chipRow, row]}>
                    {STATUS_CHOICES.map((value) => (
                      <Chip
                        key={value}
                        label={humanise(value)}
                        disabled={busy}
                        selected={sub.status === value}
                        onPress={() => changeStatus(sub, value)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

/** Label/value line used by the expanded submission block. */
function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { row, align } = useI18n();
  return (
    <View style={[styles.detailRow, row]}>
      <Text style={[styles.detailLabel, align]}>{label}</Text>
      <Text style={[styles.detailValue, align]}>{value}</Text>
    </View>
  );
}

function toneForContact(status: string): 'green' | 'blue' | 'gold' | 'muted' {
  const s = status.toUpperCase();
  if (s === 'NEW') return 'green';
  if (s === 'READ') return 'blue';
  if (s === 'REPLIED') return 'gold';
  return 'muted';
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    filters: { flexWrap: 'wrap', gap: 8 },
    count: { color: t.mutedForeground, fontSize: 13 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 0, marginTop: Spacing.xs },
    editor: { gap: 8, marginTop: 8 },
    sectionLabel: { color: t.primary, fontSize: 14, fontWeight: '700', marginTop: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    detailLabel: { color: t.mutedForeground, fontSize: 14, flexShrink: 1 },
    detailValue: { color: t.foreground, fontSize: 14, flexShrink: 1 },
    prefLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '600' },
    messageBlock: { gap: 4 },
    subject: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    message: { color: t.foreground, fontSize: 14, lineHeight: 20 },
    chipRow: { flexWrap: 'wrap', gap: 8 },
  }),
);
