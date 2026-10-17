import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRoleDenied } from '@/components/role-gate';
import {
  Badge,
  Btn,
  Card,
  Divider,
  Empty,
  ErrorBar,
  Loading,
  Row,
  Screen,
  Segmented,
} from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatDate, humanise } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

type Review = {
  id: string;
  rating: number;
  comment?: string | null;
  status: string;
  createdAt: string;
  user?: { name?: string | null } | null;
  project?: { name?: string | null } | null;
};

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const FILTERS: Filter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

/**
 * Visitor-review moderation queue — `GET /api/reviews?status=` (no
 * `projectId` is the global queue, CEO/ADMIN only) with approve / reject
 * through `PATCH /api/reviews/:id { status }`, the same contract the
 * website's `src/app/ceo/reviews/page.tsx` uses.
 */
export default function CeoReviewsScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, align } = useI18n();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (filter !== 'ALL') params.set('status', filter);

  const { data, error, loading, refreshing, refresh } = useApi<{ reviews?: Review[] }>(
    `/api/reviews?${params.toString()}`
  );
  const mutation = useMutation();

  async function decide(review: Review, status: 'APPROVED' | 'REJECTED') {
    setBusyId(review.id);
    setProblem(null);
    try {
      await mutation.run(`/api/reviews/${review.id}`, 'PATCH', { status });
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

  const items = data?.reviews ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('rev.ceoTitle') }} />

      <Segmented<Filter>
        options={FILTERS.map((value) => ({
          value,
          label:
            value === 'ALL'
              ? t('rev.all')
              : value === 'PENDING'
                ? t('rev.pending')
                : value === 'APPROVED'
                  ? t('rev.approved')
                  : t('rev.rejected'),
        }))}
        value={filter}
        onChange={setFilter}
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {!error && items.length === 0 ? (
        <Empty title={t('rev.none')} message={t('rev.noneHint')} />
      ) : null}

      {items.map((review, index) => {
        const busy = busyId === review.id;
        const pending = review.status === 'PENDING';
        return (
          <View key={review.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={review.user?.name || t('rev.visitor')}
                subtitle={[
                  review.project?.name ?? undefined,
                  formatDate(review.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <Badge
                    tone={
                      review.status === 'APPROVED'
                        ? 'green'
                        : review.status === 'REJECTED'
                          ? 'red'
                          : 'gold'
                    }>
                    {humanise(review.status)}
                  </Badge>
                }
              />

              <View style={[styles.stars, row]}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= review.rating ? 'star' : 'star-outline'}
                    size={16}
                    color={star <= review.rating ? theme.primary : theme.mutedForeground}
                  />
                ))}
              </View>

              {review.comment ? (
                <Text style={[styles.comment, align]}>{review.comment}</Text>
              ) : null}

              {pending ? (
                <View style={[styles.actions, row]}>
                  <Btn
                    title={t('rev.approve')}
                    busy={busy}
                    style={styles.action}
                    onPress={() => void decide(review, 'APPROVED')}
                  />
                  <Btn
                    title={t('rev.reject')}
                    variant="danger"
                    style={styles.action}
                    onPress={() => void decide(review, 'REJECTED')}
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
    stars: { flexDirection: 'row', gap: 2 },
    comment: { color: t.mutedForeground, fontSize: 14, lineHeight: 19 },
    actions: { gap: 8, flexWrap: 'wrap' },
    action: { flexGrow: 1, minWidth: 110 },
  })
);
