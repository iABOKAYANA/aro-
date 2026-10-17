import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useRequireAuth } from '@/components/auth-gate';
import { Badge, Btn, Card, Chip, Divider, Empty, ErrorBar, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { timeAgo, humanise } from '@/lib/format';
import { resolveLink } from '@/lib/links';

type Notification = {
  id: string;
  type?: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { t, row } = useI18n();
  const { data, error, loading, refreshing, refresh } = useApi<{
    notifications?: Notification[];
    unreadCount?: number;
  }>('/api/notifications?limit=60');
  const mutation = useMutation();
  const [notice, setNotice] = useState<string | null>(null);

  async function markAllRead() {
    try {
      await mutation.run('/api/notifications', 'PATCH', { all: true });
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('notifications.markReadFailed'));
    }
  }

  /** Marks one row read, then follows its link — or flags when unmapped. */
  async function open(item: Notification) {
    if (!item.isRead) {
      try {
        await mutation.run('/api/notifications', 'PATCH', { ids: [item.id] });
        refresh();
      } catch {
        // A failed read-receipt must never block opening the notification.
      }
    }
    const target = resolveLink(item.link);
    if (target) router.push(target);
    else {
      // Unmapped website link — brief notice instead of a silent dead tap.
      setNotice(t('notifications.unmapped'));
      setTimeout(() => setNotice((current) => (current ? null : current)), 2500);
    }
  }

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  if (loading) return <Loading label={t('notifications.loading')} />;

  const items = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SectionTitle
        action={
          unread > 0 ? (
            <Btn
              title={t('notifications.markNRead').replace('{n}', String(unread))}
              variant="ghost"
              busy={mutation.busy}
              onPress={markAllRead}
            />
          ) : undefined
        }>
        {unread > 0
          ? t('notifications.unreadCount').replace('{n}', String(unread))
          : t('notifications.allCaughtUp')}
      </SectionTitle>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {notice ? <ErrorBar message={notice} /> : null}

      {!error && items.length === 0 ? (
        <Empty
          title={t('notifications.empty')}
          message={t('notifications.emptyHint')}
        />
      ) : null}

      <Card style={styles.list}>
        {items.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={item.title}
              subtitle={[item.message, timeAgo(item.createdAt)].filter(Boolean).join(' · ')}
              // Links arrive in the website's URL space; the shared resolver
              // maps them to app routes. Unmapped links stay tappable so the
              // tap lands on the brief notice above, never silently dead.
              onPress={() => open(item)}
              badge={
                <View style={[styles.badges, row]}>
                  {item.type ? <Badge tone="muted">{humanise(item.type)}</Badge> : null}
                  {!item.isRead ? <Badge tone="gold">{t('notifications.new')}</Badge> : null}
                </View>
              }
            />
          </View>
        ))}
      </Card>

      {items.length > 0 && unread > 0 ? (
        <Chip label={t('notifications.markAll')} selected={false} onPress={markAllRead} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  badges: { flexDirection: 'row', gap: 6 },
});
