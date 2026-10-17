import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';

import { Badge, Card, Empty, ErrorBar, Loading, Row, Screen, SearchBar, toneForStatus } from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatArea, formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Unit = {
  id: string;
  name: string;
  slug?: string | null;
  unitNumber?: string | null;
  unitType: string;
  listingType: string;
  status: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  price: number;
  finishingType?: string | null;
  viewCount?: number | null;
  project?: { name?: string; slug?: string } | null;
};

/**
 * The website's `/dashboard/units` — a *management* inventory list, which is
 * why it reads `GET /api/units` and not `/api/search`: the explore tab's
 * search endpoint drops SOLD units and projects out of the payload entirely.
 *
 * The route takes **no query parameters at all** (no `q`, no `status`), so the
 * search box filters the same two fields the site filters — the unit name and
 * the project name — client-side.
 */
export default function DashboardUnitsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');

  const { data, error, loading, refreshing, refresh } = useApi<{ units?: Unit[] }>('/api/units');

  const denied = useRoleDenied('dash.forbidden', ['DEVELOPER', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('dash.loading')} />;

  const units = data?.units ?? [];
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? units.filter(
        (unit) =>
          unit.name.toLowerCase().includes(needle) ||
          (unit.project?.name ?? '').toLowerCase().includes(needle)
      )
    : units;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('dash.unitsTitle') }} />

      <Text style={[styles.lead, align]}>{t('dash.unitsSubtitle')}</Text>

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('dash.searchUnits')} />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && filtered.length === 0 ? (
        <Empty title={t('dash.noUnits')} message={t('dash.emptyHint')} />
      ) : null}

      {filtered.map((unit) => {
        const details = [
          unit.bedrooms != null ? `${unit.bedrooms} ${t('dash.bed')}` : null,
          unit.bathrooms != null ? `${unit.bathrooms} ${t('dash.bath')}` : null,
          formatArea(unit.area ?? null),
          unit.finishingType ? humanise(unit.finishingType) : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <Card key={unit.id} style={styles.card}>
            <View style={[styles.badgeRow, row]}>
              <Badge tone="gold">{unit.unitType}</Badge>
              <Badge tone="muted">{unit.listingType}</Badge>
              {unit.status !== 'AVAILABLE' ? (
                <Badge tone={toneForStatus(unit.status)}>{unit.status.replace(/_/g, ' ')}</Badge>
              ) : null}
            </View>

            <Row
              title={unit.project?.name ?? t('dash.na')}
              subtitle={unit.unitNumber || unit.name}
            />

            {details ? <Text style={[styles.details, align]}>{details}</Text> : null}

            <View style={[styles.footer, row]}>
              <Text style={[styles.price, align]}>
                {unit.price ? formatMoney(unit.price, currency, rates, { compact: true }) : t('dash.na')}
              </Text>
              <View style={[styles.views, row]}>
                <Ionicons name="eye-outline" size={14} color={theme.mutedForeground} />
                <Text style={styles.viewsText}>
                  {`${(unit.viewCount ?? 0).toLocaleString('en-US')} ${t('dash.views')}`}
                </Text>
              </View>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    lead: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    card: { gap: 6 },
    badgeRow: { flexWrap: 'wrap', gap: 6 },
    details: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    footer: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    price: { color: t.primary, fontSize: 16, fontWeight: '800' },
    views: { alignItems: 'center', gap: 4 },
    viewsText: { color: t.mutedForeground, fontSize: 13 },
  })
);
