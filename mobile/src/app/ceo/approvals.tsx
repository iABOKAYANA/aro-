import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useRoleDenied } from '@/components/role-gate';
import { useI18n } from '@/i18n';
import { humanise, timeAgo } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type Approval = {
  id: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  metadata?: string | null;
  reviewNote?: string | null;
  requestedAt?: string | null;
  createdAt?: string;
  requestor?: { name?: string; email?: string; role?: string } | null;
  reviewer?: { name?: string } | null;
};

type Filter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

const FILTERS: Filter[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'];

/**
 * The review queue the website has an API for but no screen.
 *
 * `/api/ceo/approvals` is called by nothing on the web — project, price and AI
 * content requests are written by the server and only ever inspected in the
 * database. This is the first place a reviewer can actually clear the queue,
 * using the exact three decisions the endpoint validates.
 */
export default function CeoApprovalsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (filter !== 'ALL') params.set('status', filter);

  const { data, error, loading, refreshing, refresh } = useApi<{ approvals?: Approval[] }>(
    `/api/ceo/approvals?${params.toString()}`,
  );
  const mutation = useMutation();

  async function decide(approval: Approval, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED') {
    setBusyId(approval.id);
    setProblem(null);
    try {
      await mutation.run('/api/ceo/approvals', 'PATCH', {
        id: approval.id,
        status,
        ...(note.trim() ? { reviewNote: note.trim() } : {}),
      });
      setNote('');
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

  const needle = query.trim().toLowerCase();
  const all = data?.approvals ?? [];
  const items = needle
    ? all.filter((a) => [a.title, a.description, a.type, a.requestor?.name].some((v) => (v ?? '').toLowerCase().includes(needle)))
    : all;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.approvals') }} />

      <Segmented<Filter>
        options={FILTERS.map((value) => ({
          value,
          label: value === 'ALL' ? t('common.all') : humanise(value),
        }))}
        value={filter}
        onChange={setFilter}
      />

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.approvals.search')} />

      <Field
        label={t('ceo.reviewNote')}
        value={note}
        onChangeText={setNote}
        placeholder="Optional"
        multiline
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {!error && items.length === 0 ? (
        <Empty title={t('ceo.approvals.none')} message={t('ceo.approvals.noneHint')} />
      ) : null}

      {items.map((approval, index) => {
        const busy = busyId === approval.id;
        const pending = approval.status === 'PENDING';

        return (
          <View key={approval.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={approval.title}
                subtitle={[
                  approval.requestor?.name ? `${t('ceo.requestedBy')}: ${approval.requestor.name}` : null,
                  approval.requestedAt || approval.createdAt
                    ? `${t('ceo.requestedAt')} ${timeAgo((approval.requestedAt ?? approval.createdAt)!)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={styles.badges}>
                    <Badge tone={approval.status === 'APPROVED' ? 'green' : approval.status === 'REJECTED' ? 'red' : 'gold'}>
                      {humanise(approval.status)}
                    </Badge>
                    <Badge tone="muted">{humanise(approval.type)}</Badge>
                  </View>
                }
              />

              {approval.description ? (
                <Text style={[styles.description, align]} numberOfLines={6}>
                  {approval.description}
                </Text>
              ) : null}

              {approval.reviewNote ? (
                <Text style={[styles.review, align]}>{approval.reviewNote}</Text>
              ) : null}

              {pending ? (
                <View style={[styles.actions, row]}>
                  <Btn
                    title={t('ceo.approve')}
                    busy={busy}
                    style={styles.action}
                    onPress={() => void decide(approval, 'APPROVED')}
                  />
                  <Btn
                    title={t('ceo.changesRequested')}
                    variant="ghost"
                    style={styles.action}
                    onPress={() => void decide(approval, 'CHANGES_REQUESTED')}
                  />
                  <Btn
                    title={t('ceo.reject')}
                    variant="danger"
                    style={styles.action}
                    onPress={() => void decide(approval, 'REJECTED')}
                  />
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    card: { gap: 6, marginTop: Spacing.xs },
    badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    description: { color: t.mutedForeground, fontSize: 14, lineHeight: 19 },
    review: { color: t.primary, fontSize: 14, lineHeight: 19 },
    actions: { gap: 8, flexWrap: 'wrap' },
    action: { flexGrow: 1, minWidth: 110 },
  }),
);
