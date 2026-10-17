import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SearchBar,
  Stat,
} from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useRoleDenied } from '@/components/role-gate';
import { useI18n } from '@/i18n';
import { formatArea, formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type HistoryEntry = {
  id: string;
  price: number;
  change?: number | null;
  reason?: string | null;
  recordedAt?: string;
};

type Unit = {
  id: string;
  name: string;
  unitNumber?: string | null;
  unitType?: string;
  listingType?: string;
  area?: number | null;
  price: number;
  pricePerSqm?: number | null;
  status?: string;
  project?: { name?: string } | null;
  priceHistory?: HistoryEntry[];
};

type BulkMode = 'percentage' | 'fixed';

const MAX_RENDER = 60;

/**
 * Unit pricing: single reprices plus the website's bulk price update.
 *
 * Single edits speak the route's real contract (`PATCH /api/ceo/pricing` with
 * `{ id, price, reason }` — the website sends `{ unitId, newPrice }`, which
 * the endpoint answers with 400). Bulk updates go to `POST /api/ceo/pricing`
 * with `{ unitIds, type: 'percentage' | 'fixed', value, reason }`, previewed
 * first exactly like the website's Bulk Price Update card. Every write lands
 * in `PriceHistory`, re-runs the anomaly check and reaches price watchers.
 */
export default function CeoPricingScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkMode>('percentage');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkReason, setBulkReason] = useState('');

  const params = new URLSearchParams();
  if (query.trim()) params.set('search', query.trim());

  const { data, error, loading, refreshing, refresh } = useApi<{ units?: Unit[] }>(
    `/api/ceo/pricing?${params.toString()}`,
  );
  const mutation = useMutation();

  function open(unit: Unit) {
    setOpenId(unit.id);
    setPrice(String(unit.price ?? ''));
    setReason('');
    setProblem(null);
    setSavedId(null);
  }

  async function applySingleEdit(unit: Unit) {
    const next = Number(price.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(next) || next <= 0) {
      setProblem(t('ceo.pricing.newPrice'));
      return;
    }
    setProblem(null);
    try {
      await mutation.run('/api/ceo/pricing', 'PATCH', {
        id: unit.id,
        price: next,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setSavedId(unit.id);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  /** The website's "Confirm Price Change" dialog: current, new, difference. */
  function confirmSingleEdit(unit: Unit) {
    const next = Number(price.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(next) || next <= 0) {
      setProblem(t('ceo.pricing.newPrice'));
      return;
    }
    const diff = next - unit.price;
    const sign = diff >= 0 ? '+' : '';
    Alert.alert(
      t('ceoI.confirmPriceTitle'),
      [
        `${t('ceoI.previewCurrent')}: ${formatMoney(unit.price, currency, rates)}`,
        `${t('ceoI.previewNew')}: ${formatMoney(next, currency, rates)}`,
        `${t('ceoI.previewDiff')}: ${sign}${formatMoney(diff, currency, rates)}`,
      ].join('\n'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: () => void applySingleEdit(unit) },
      ],
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
  }

  function bulkPriceFor(current: number, value: number): number {
    if (bulkMode === 'percentage') return Math.round(current * (1 + value / 100));
    return current + value;
  }

  async function applyBulkUpdate() {
    const value = Number(bulkValue);
    const ids = selectedIds.slice();
    if (!Number.isFinite(value) || value === 0 || ids.length === 0) return;
    try {
      await mutation.run('/api/ceo/pricing', 'POST', {
        unitIds: ids,
        type: bulkMode,
        value,
        ...(bulkReason.trim() ? { reason: bulkReason.trim() } : {}),
      });
      setSelectedIds([]);
      setBulkValue('');
      setBulkReason('');
      setSavedId(null);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  /** Mirrors the website's bulk preview + destructive confirm in one step. */
  function confirmBulkUpdate(preview: { count: number; totalOld: number; totalNew: number; difference: number }) {
    const sign = preview.difference >= 0 ? '+' : '';
    Alert.alert(
      t('ceoI.bulkUpdate'),
      [
        `${t('ceoI.previewAffected')}: ${preview.count}`,
        `${t('ceoI.previewCurrent')}: ${formatMoney(preview.totalOld, currency, rates)}`,
        `${t('ceoI.previewNew')}: ${formatMoney(preview.totalNew, currency, rates)}`,
        `${t('ceoI.previewDiff')}: ${sign}${formatMoney(preview.difference, currency, rates)}`,
      ].join('\n'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('ceoI.confirmUpdate'), onPress: () => void applyBulkUpdate() },
      ],
    );
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const items = data?.units ?? [];
  const perSqm = items.map((u) => u.pricePerSqm).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const avgPerSqm = perSqm.length > 0 ? perSqm.reduce((sum, v) => sum + v, 0) / perSqm.length : null;
  const totalValue = items.reduce((sum, u) => sum + (Number.isFinite(u.price) ? u.price : 0), 0);

  const bulkNumber = Number(bulkValue);
  const selected = items.filter((u) => selectedIds.includes(u.id));
  const preview =
    selected.length > 0 && Number.isFinite(bulkNumber) && bulkNumber !== 0
      ? (() => {
          const totalOld = selected.reduce((sum, u) => sum + u.price, 0);
          const totalNew = selected.reduce((sum, u) => sum + bulkPriceFor(u.price, bulkNumber), 0);
          return { count: selected.length, totalOld, totalNew, difference: totalNew - totalOld };
        })()
      : null;

  const rows = items.slice(0, MAX_RENDER);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.pricing') }} />

      <Card style={[styles.summary, row]}>
        <Stat value={items.length} label={t('ceoPr.totalUnits')} />
        <Stat
          value={avgPerSqm !== null ? formatMoney(Math.round(avgPerSqm), currency, rates) : '—'}
          label={t('ceoI.avgPerSqm')}
        />
        <Stat value={formatMoney(totalValue, currency, rates)} label={t('ceoI.totalValue')} />
      </Card>

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.pricing.search')} />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {selectedIds.length > 0 ? (
        <Card style={styles.bulk}>
          <View style={[styles.bulkHead, row]}>
            <Text style={[styles.bulkTitle, align]}>
              {`${t('ceoI.bulkUpdate')} (${selectedIds.length})`}
            </Text>
            <Pressable onPress={() => setSelectedIds([])} hitSlop={8}>
              <Text style={styles.bulkLink}>{t('common.clear')}</Text>
            </Pressable>
          </View>

          <Text style={[styles.formLabel, align]}>{t('ceoI.updateMode')}</Text>
          <View style={[styles.modes, row]}>
            <Chip
              label={t('ceoI.modePercentage')}
              selected={bulkMode === 'percentage'}
              onPress={() => setBulkMode('percentage')}
            />
            <Chip
              label={t('ceoI.modeFixed')}
              selected={bulkMode === 'fixed'}
              onPress={() => setBulkMode('fixed')}
            />
          </View>

          <Field
            label={t('ceoI.changeValue')}
            value={bulkValue}
            onChangeText={setBulkValue}
            keyboardType="numeric"
            placeholder={t('ceoI.changeHint')}
          />
          <Field
            label={t('ceo.pricing.reason')}
            value={bulkReason}
            onChangeText={setBulkReason}
          />

          {preview ? (
            <View style={styles.preview}>
              <View style={[styles.previewRow, row]}>
                <Text style={[styles.previewLabel, align]}>{t('ceoI.previewAffected')}</Text>
                <Text style={styles.previewValue}>{preview.count}</Text>
              </View>
              <View style={[styles.previewRow, row]}>
                <Text style={[styles.previewLabel, align]}>{t('ceoI.previewCurrent')}</Text>
                <Text style={styles.previewValue}>{formatMoney(preview.totalOld, currency, rates)}</Text>
              </View>
              <View style={[styles.previewRow, row]}>
                <Text style={[styles.previewLabel, align]}>{t('ceoI.previewNew')}</Text>
                <Text style={styles.previewGold}>{formatMoney(preview.totalNew, currency, rates)}</Text>
              </View>
              <View style={[styles.previewRow, row]}>
                <Text style={[styles.previewLabel, align]}>{t('ceoI.previewDiff')}</Text>
                <Text style={preview.difference >= 0 ? styles.previewUp : styles.previewDown}>
                  {`${preview.difference >= 0 ? '+' : ''}${formatMoney(preview.difference, currency, rates)}`}
                </Text>
              </View>
            </View>
          ) : null}

          <Btn
            title={t('ceoI.confirmUpdate')}
            busy={mutation.busy}
            disabled={!preview}
            onPress={() => preview && confirmBulkUpdate(preview)}
          />
        </Card>
      ) : null}

      {!error && rows.length === 0 ? (
        <Empty title={t('ceo.pricing.none')} message={t('ceo.content.autoSaveHint')} />
      ) : null}

      {items.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${items.length}`}
        </Text>
      ) : null}

      {rows.length > 0 ? (
        <Pressable onPress={() => toggleSelectAll(rows.map((u) => u.id))} hitSlop={8}>
          <Text style={[styles.bulkLink, align]}>{t('ceoI.selectAll')}</Text>
        </Pressable>
      ) : null}

      {rows.map((unit, index) => {
        const open_ = openId === unit.id;
        const checked = selectedIds.includes(unit.id);
        const history = unit.priceHistory ?? [];

        return (
          <View key={unit.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={
                  <Pressable onPress={() => toggleSelect(unit.id)} hitSlop={8}>
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? theme.primary : theme.mutedForeground}
                    />
                  </Pressable>
                }
                title={unit.name}
                subtitle={[
                  unit.project?.name,
                  unit.unitType ? humanise(unit.unitType) : null,
                  unit.area ? formatArea(unit.area) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <Badge tone={unit.status === 'AVAILABLE' ? 'green' : unit.status === 'SOLD' ? 'red' : 'gold'}>
                    {humanise(unit.status ?? 'AVAILABLE')}
                  </Badge>
                }
                right={
                  <Text style={styles.price}>
                    {formatMoney(unit.price, currency, rates, { compact: true })}
                  </Text>
                }
                onPress={() => (open_ ? setOpenId(null) : open(unit))}
              />

              {open_ ? (
                <View style={styles.editor}>
                  <Field
                    label={t('ceo.pricing.newPrice')}
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numeric"
                  />
                  <Field
                    label={t('ceo.pricing.reason')}
                    value={reason}
                    onChangeText={setReason}
                  />
                  {savedId === unit.id ? (
                    <Text style={styles.saved}>{t('ceo.pricing.updated')} ✓</Text>
                  ) : null}
                  <Btn
                    title={t('ceo.pricing.edit')}
                    busy={mutation.busy}
                    onPress={() => confirmSingleEdit(unit)}
                  />

                  {history.length > 0 ? (
                    <View style={styles.history}>
                      <Text style={styles.historyTitle}>{t('ceo.pricing.history')}</Text>
                      {history.slice(0, 6).map((entry) => (
                        <View key={entry.id} style={[styles.historyRow, row]}>
                          <Text style={[styles.historyPrice, align]}>
                            {formatMoney(entry.price, currency, rates, { compact: true })}
                          </Text>
                          <Text style={styles.historyMeta}>
                            {entry.reason ?? entry.recordedAt ? new Date(entry.recordedAt ?? '').toLocaleDateString() : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
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
    summary: { justifyContent: 'space-around', paddingVertical: Spacing.md, gap: 8 },
    count: { color: t.mutedForeground, fontSize: 13 },
    card: { gap: 6, marginTop: Spacing.xs },
    price: { color: t.primary, fontSize: 14, fontWeight: '800' },
    editor: { gap: 6, marginTop: 4 },
    saved: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    history: { gap: 4, marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border },
    historyTitle: { color: t.mutedForeground, fontSize: 12, fontWeight: '700' },
    historyRow: { justifyContent: 'space-between', gap: 8 },
    historyPrice: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    historyMeta: { color: t.mutedForeground, fontSize: 12, flexShrink: 1, textAlign: 'right' },
    bulk: { gap: 8 },
    bulkHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    bulkTitle: { color: t.foreground, fontSize: 16, fontWeight: '700', flexShrink: 1 },
    bulkLink: { color: t.primary, fontSize: 14, fontWeight: '700' },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    modes: { gap: 8, flexWrap: 'wrap' },
    preview: {
      gap: 4,
      padding: Spacing.sm,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    previewRow: { justifyContent: 'space-between', gap: 8 },
    previewLabel: { color: t.mutedForeground, fontSize: 13 },
    previewValue: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    previewGold: { color: t.primary, fontSize: 14, fontWeight: '800' },
    previewUp: { color: t.successFg, fontSize: 14, fontWeight: '800' },
    previewDown: { color: t.dangerFg, fontSize: 14, fontWeight: '800' },
  }),
);
