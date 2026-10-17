import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { useRequireAuth } from '@/components/auth-gate';
import {
  Badge,
  Btn,
  Card,
  Empty,
  ErrorBar,
  Loading,
  Row,
  Screen,
  SearchBar,
  toneForStatus,
} from '@/components/ui';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { humanise, timeAgo } from '@/lib/format';
import { createStyles } from '@/lib/theme';

/** Every scalar `GET /api/inquiries` returns, plus its `unit` projection. */
type Inquiry = {
  id: string;
  userId?: string | null;
  unitId?: string | null;
  name: string;
  email?: string | null;
  phone: string;
  message?: string | null;
  type: string;
  status: string;
  source: string;
  priority: number;
  assignedTo?: string | null;
  notes?: string | null;
  contactedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unit?: { name?: string | null; slug?: string | null } | null;
};

type InquiriesResponse = {
  inquiries: Inquiry[];
  total: number;
  page: number;
  totalPages: number;
};

/**
 * One page big enough to hold a whole inbox: the route paginates on `page` /
 * `limit`.
 */
const PAGE_SIZE = 200;

/**
 * The staff/buyer inquiry list — `GET /api/inquiries`, plus the contact
 * details the website shows so a lead can actually be called back.
 *
 * **Scoping is the server's job.** The route itself decides what a caller may
 * read (`src/app/api/inquiries/route.ts`): BROKER → the rows assigned to them,
 * CEO / ADMIN / DEVELOPER → the whole inbox, everyone else → only the rows they
 * created. An earlier version of this screen re-implemented that check with a
 * narrower role list, which hid the shared inbox from a DEVELOPER — so nothing
 * is filtered client-side here, exactly like the website's page.
 *
 * The search box mirrors the site: name or phone, case-insensitive.
 */
export default function InquiriesScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align } = useI18n();
  const [query, setQuery] = useState('');

  const { data, error, loading, refreshing, refresh } = useApi<InquiriesResponse>(
    `/api/inquiries?page=1&limit=${PAGE_SIZE}`
  );

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  if (loading) return <Loading label={t('inquiries.loading')} />;

  const all = data?.inquiries ?? [];
  const needle = query.trim().toLowerCase();
  const items = needle
    ? all.filter(
        (inquiry) =>
          inquiry.name.toLowerCase().includes(needle) || inquiry.phone.includes(query.trim())
      )
    : all;
  const count = data?.total ?? items.length;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('inquiries.title') }} />

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('inquiries.search')}
      />

      {count > 0 ? (
        <Text style={[styles.count, align]}>
          {count.toLocaleString('en-US')}{' '}
          {count === 1 ? t('inquiries.countOne') : t('inquiries.countMany')}
        </Text>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && items.length === 0 ? (
        <Empty
          title={t('inquiries.empty')}
          message={t('inquiries.emptyHint')}
          action={
            <Btn
              title={t('inquiries.browse')}
              variant="ghost"
              onPress={() => router.push('/(tabs)/explore')}
            />
          }
        />
      ) : null}

      {items.map((inquiry) => {
        const sent = [t('inquiries.sent'), timeAgo(inquiry.createdAt)].filter(Boolean).join(' ');
        const reply = inquiry.contactedAt
          ? [t('inquiries.reply'), timeAgo(inquiry.contactedAt)].filter(Boolean).join(' · ')
          : t('inquiries.noReply');
        const target = inquiry.unit ? inquiry.unit.slug ?? inquiry.unitId : null;

        return (
          <Card key={inquiry.id} style={styles.card}>
            <View style={[styles.head, row]}>
              <Text style={[styles.when, align]}>{sent}</Text>
              <View style={[styles.badges, row]}>
                <Badge tone={toneForStatus(inquiry.status)}>{humanise(inquiry.status)}</Badge>
                {inquiry.type ? <Badge tone="muted">{humanise(inquiry.type)}</Badge> : null}
              </View>
            </View>

            <Text style={[styles.name, align]}>{inquiry.name}</Text>

            {inquiry.phone ? (
              <Row
                title={inquiry.phone}
                subtitle={t('inquiries.call')}
                onPress={() => Linking.openURL(`tel:${inquiry.phone}`)}
              />
            ) : null}

            {inquiry.email ? (
              <Row
                title={inquiry.email}
                subtitle={t('inquiries.email')}
                onPress={() => Linking.openURL(`mailto:${inquiry.email}`)}
              />
            ) : null}

            {inquiry.message ? (
              <Text style={[styles.message, align]}>{inquiry.message}</Text>
            ) : null}

            <Text style={[styles.meta, align]}>
              {`${t('inquiries.source')}: ${humanise(inquiry.source)}`}
            </Text>

            <Text style={[styles.reply, align]}>{reply}</Text>

            {inquiry.unit && target ? (
              <Row
                title={`${t('inquiries.regarding')} ${inquiry.unit.name ?? ''}`.trim()}
                subtitle={t('inquiries.openProject')}
                onPress={() => router.push(`/unit/${target}`)}
              />
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    count: { color: t.mutedForeground, fontSize: 14 },
    card: { gap: 8 },
    head: { alignItems: 'center', justifyContent: 'space-between' },
    when: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    badges: { flexWrap: 'wrap', gap: 6 },
    name: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    message: { color: t.foreground, fontSize: 14, lineHeight: 20 },
    meta: { color: t.mutedForeground, fontSize: 13 },
    reply: { color: t.mutedForeground, fontSize: 13 },
  })
);
