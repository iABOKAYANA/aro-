import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ApiError } from '@/api/client';
import { useRequireAuth } from '@/components/auth-gate';
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
import { useAuth } from '@/auth/auth-context';
import { Radius } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatMoney, formatDate, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

/** `commissions[0]` projected by `GET /api/deals` — BROKER gets a subset. */
type Commission = {
  id?: string;
  status: string;
  totalPct?: number | null;
  totalAmount?: number | null;
  brokerPct?: number | null;
  brokerAmount?: number | null;
  estateaiPct?: number | null;
  estateaiAmount?: number | null;
  dueDate?: string | null;
  paidDate?: string | null;
  currency?: string | null;
};

type Deal = {
  id: string;
  status: string;
  source?: string | null;
  dealValue?: number | null;
  currency?: string | null;
  createdAt: string;
  reservationDate?: string | null;
  contractDate?: string | null;
  saleDate?: string | null;
  lead?: { id?: string; leadCode?: string | null; name?: string | null; status?: string | null } | null;
  unit?: { name?: string | null } | null;
  project?: { name?: string | null } | null;
  broker?: {
    id?: string;
    agencyName?: string | null;
    user?: { id?: string; name?: string | null } | null;
  } | null;
  developer?: { companyName?: string | null } | null;
  commission?: Commission | null;
};

type DealsResponse = { deals?: Deal[]; total?: number };

const FILTERS = ['', 'RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST'];

export default function DealsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { currency, rates } = useCurrency();
  const { t, row, align, isRtl } = useI18n();
  const { t: theme } = useTheme();
  const { hasRole } = useAuth();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Deal | null>(null);

  // Mirrors `POST /api/deals` (`requireActor(['CEO','ADMIN','DEVELOPER'])`) —
  // brokers are attributed on deals but cannot open the form.
  const canCreate = hasRole('CEO', 'ADMIN', 'DEVELOPER');

  // Same pair the website sends — `take` is dropped because `GET /api/deals`
  // hardcodes `take: 200` and ignores any limit it is handed.
  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (query.trim()) params.set('search', query.trim());
    const qs = params.toString();
    return qs ? `/api/deals?${qs}` : '/api/deals';
  }, [status, query]);

  const { data, error, loading, refreshing, refresh } = useApi<DealsResponse>(path);
  // `GET /api/deals` hardcodes `take: 200` — the slice below is the render
  // bound so a full pipeline never mounts 200 rows at once.
  const DEALS_RENDER_LIMIT = 100;
  const deals = (data?.deals ?? []).slice(0, DEALS_RENDER_LIMIT);

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  if (loading) return <Loading label={t('deals.loading')} />;

  const money = (value: number | null | undefined, compact = false) =>
    formatMoney(value, currency, rates, compact ? { compact: true } : {});

  // The website's five header cards, summed from the same rows — no extra call.
  const totals = deals.reduce(
    (acc, deal) => {
      if (deal.status === 'SOLD') acc.sold += Number(deal.dealValue) || 0;
      if (deal.status === 'RESERVATION') acc.reservations += 1;
      if (deal.status === 'CONTRACT') acc.contracts += 1;
      const commission = deal.commission;
      if (commission) {
        const amount = Number(commission.totalAmount) || 0;
        acc.commissionTotal += amount;
        if (commission.status === 'PAID') acc.commissionPaid += amount;
        else if (commission.brokerAmount !== undefined && commission.brokerAmount !== null) {
          acc.brokerPending += Number(commission.brokerAmount) || 0;
        }
      }
      return acc;
    },
    { sold: 0, reservations: 0, contracts: 0, commissionTotal: 0, commissionPaid: 0, brokerPending: 0 }
  );
  const commissionPending = totals.brokerPending || totals.commissionTotal - totals.commissionPaid;

  const statCards: { key: MessageKey; value: string }[] = [
    { key: 'deals.statTotal', value: String(deals.length) },
    { key: 'deals.statReservations', value: String(totals.reservations) },
    { key: 'deals.statContracts', value: String(totals.contracts) },
    { key: 'deals.statSoldValue', value: money(totals.sold, true) },
    { key: 'deals.statCommissionPending', value: money(commissionPending, true) },
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={[styles.headerRow, row]}>
        <View style={styles.searchGrow}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t('deals.searchPlaceholder')}
          />
        </View>
        {canCreate ? (
          <Pressable
            onPress={() => router.push('/deal/new')}
            accessibilityRole="button"
            accessibilityLabel={t('deals.new')}
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}>
            <Ionicons name="add" size={22} color={theme.primaryForeground} />
          </Pressable>
        ) : null}
      </View>

      <Card style={[styles.kpiGrid, row]}>
        {statCards.map((card) => (
          <View key={card.key} style={styles.kpiCell}>
            <Stat value={card.value} label={t(card.key)} />
          </View>
        ))}
      </Card>

      <View style={[styles.filters, row]}>
        {FILTERS.map((value) => (
          <Chip
            key={value || 'all'}
            label={value ? humanise(value) : t('common.all')}
            selected={status === value}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && deals.length === 0 ? (
        <Empty title={t('deals.empty')} message={t('deals.emptyHint')} />
      ) : null}

      <Card style={styles.list}>
        {deals.map((deal, index) => {
          const commission = deal.commission ?? null;
          return (
            <View key={deal.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={deal.lead?.name ?? deal.project?.name ?? t('deals.deal')}
                subtitle={[
                  deal.lead?.leadCode,
                  deal.project?.name,
                  deal.unit?.name,
                  deal.broker?.agencyName ?? deal.broker?.user?.name ?? deal.developer?.companyName,
                  formatDate(deal.reservationDate ?? deal.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  <View style={[styles.right, isRtl && styles.rightRtl]}>
                    <Text style={[styles.value, align]}>
                      {money(deal.dealValue, true)}
                    </Text>
                    <Badge tone={toneFor(deal.status)}>{humanise(deal.status)}</Badge>
                    {commission ? (
                      <View style={[styles.commissionCell, row]}>
                        <Badge tone={commissionTone(commission.status)}>
                          {humanise(commission.status)}
                        </Badge>
                        <Text style={[styles.commissionText, align]}>
                          {`${money(commission.brokerAmount ?? commission.totalAmount, true)}${
                            commission.brokerAmount !== undefined && commission.brokerAmount !== null
                              ? ` · ${commission.brokerPct ?? ''}%`
                              : ''
                          }`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                }
                onPress={() => setDetail(deal)}
              />
            </View>
          );
        })}
      </Card>

      {detail ? <DealDetailModal deal={detail} onClose={() => setDetail(null)} /> : null}
    </Screen>
  );
}

// ─── Rate broker — client rating of a SOLD deal's broker ─────────────────
// Shown on SOLD deals that carry a broker. Whether the viewer is really the
// deal's client (and whether it was already rated) is enforced server-side by
// POST /api/broker-reviews — 403/409 surface here as plain words, never a
// form that pretends to have worked.

type BrokerReviewLite = {
  id: string;
  rating: number;
  dealId?: string | null;
  deal?: { id: string } | null;
};

type BrokerReviewsResponse = {
  reviews?: BrokerReviewLite[];
  average?: number | null;
  count?: number;
};

function RateBrokerBox({ deal }: { deal: Deal }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const mutation = useMutation();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [complaint, setComplaint] = useState<'pick' | 'rated' | 'forbidden' | 'failed' | null>(
    null,
  );

  const brokerId = deal.broker?.id ?? null;
  const { data } = useApi<BrokerReviewsResponse>(
    brokerId ? `/api/broker-reviews?brokerId=${brokerId}` : null,
  );
  const alreadyRated =
    complaint === 'rated' ||
    (data?.reviews ?? []).some((r) => (r.dealId ?? r.deal?.id) === deal.id);

  async function submit() {
    if (alreadyRated || sent || mutation.busy) return;
    if (stars < 1 || stars > 5) {
      setComplaint('pick');
      return;
    }
    setComplaint(null);
    try {
      await mutation.run('/api/broker-reviews', 'POST', {
        brokerId,
        dealId: deal.id,
        rating: stars,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setComplaint('rated');
      else if (e instanceof ApiError && e.status === 403) setComplaint('forbidden');
      else setComplaint('failed');
    }
  }

  const brokerName =
    deal.broker?.user?.name ?? deal.broker?.agencyName ?? t('common.broker');

  return (
    <View style={styles.rateBox}>
      <Text style={[styles.rateTitle, align]}>{t('brate.rateBroker')}</Text>
      <Text style={[styles.rateHint, align]}>
        {t('brate.rateHint')} ({brokerName})
      </Text>

      {sent ? (
        <Text style={[styles.rateOk, align]}>{t('brate.sent')} ✓</Text>
      ) : alreadyRated ? (
        <Text style={[styles.rateHint, align]}>{t('brate.alreadyRated')}</Text>
      ) : (
        <>
          <View style={[styles.stars, row]} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                hitSlop={8}
                accessibilityRole="radio"
                accessibilityState={{ checked: stars === star }}
                accessibilityLabel={`${star} / 5`}
                onPress={() => {
                  setStars(star);
                  setComplaint(null);
                }}>
                <Ionicons
                  name={star <= stars ? 'star' : 'star-outline'}
                  size={30}
                  color={star <= stars ? theme.primary : theme.mutedForeground}
                />
              </Pressable>
            ))}
          </View>
          <Field
            value={comment}
            onChangeText={setComment}
            placeholder={t('brate.commentHint')}
            multiline
            numberOfLines={3}
          />
          {complaint === 'pick' ? (
            <Text style={[styles.rateError, align]}>{t('brate.pickStars')}</Text>
          ) : null}
          {complaint === 'forbidden' ? (
            <Text style={[styles.rateError, align]}>{t('brate.notEligible')}</Text>
          ) : null}
          {complaint === 'failed' ? (
            <Text style={[styles.rateError, align]}>{t('brate.sendFailed')}</Text>
          ) : null}
          <Btn
            title={mutation.busy ? t('brate.sending') : t('brate.send')}
            busy={mutation.busy}
            disabled={stars < 1}
            onPress={() => void submit()}
          />
        </>
      )}
    </View>
  );
}

// ─── Detail sheet — the website's DealDetailModal ────────────────────────

function DealDetailModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const { currency, rates } = useCurrency();

  const money = (value: number | null | undefined, compact = false) =>
    formatMoney(value, currency, rates, compact ? { compact: true } : {});
  const commission = deal.commission ?? null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Taps inside the sheet stop here so only the backdrop closes. */}
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <View style={[styles.sheetHead, row]}>
              <Text style={[styles.sheetTitle, align]}>
                {`${t('deals.deal')}${deal.lead?.leadCode ? ` · ${deal.lead.leadCode}` : ''}`}
              </Text>
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={20} color={theme.mutedForeground} />
              </Pressable>
            </View>

            <View style={[styles.badges, row]}>
              <Badge tone={toneFor(deal.status)}>{humanise(deal.status)}</Badge>
              {deal.source ? <Badge>{humanise(deal.source)}</Badge> : null}
            </View>

            <Detail label={t('deals.client')} value={deal.lead?.name ?? '—'} />
            <Detail
              label={t('common.broker')}
              value={deal.broker?.user?.name ?? deal.broker?.agencyName ?? '—'}
            />
            <Detail label={t('common.developer')} value={deal.developer?.companyName ?? '—'} />
            <Detail label={t('common.project')} value={deal.project?.name ?? '—'} />
            {deal.unit?.name ? <Detail label={t('common.unit')} value={deal.unit.name} /> : null}
            <Detail label={t('deals.dealValue')} value={money(deal.dealValue)} />
            {deal.reservationDate ? (
              <Detail label={t('deals.reservationDate')} value={formatDate(deal.reservationDate)} />
            ) : null}
            {deal.contractDate ? (
              <Detail label={t('deals.contractDate')} value={formatDate(deal.contractDate)} />
            ) : null}
            {deal.saleDate ? (
              <Detail label={t('deals.saleDate')} value={formatDate(deal.saleDate)} />
            ) : null}

            {commission ? (
              <View style={styles.commissionBox}>
                <View style={[styles.commissionHead, row]}>
                  <Text style={[styles.commissionTitle, align]}>{t('deals.commission')}</Text>
                  <Badge tone={commissionTone(commission.status)}>
                    {humanise(commission.status)}
                  </Badge>
                </View>
                <Detail
                  label={`${t('deals.commissionTotal')} (${commission.totalPct ?? 0}%)`}
                  value={money(commission.totalAmount)}
                />
                {commission.brokerAmount !== undefined && commission.brokerAmount !== null ? (
                  <Detail
                    label={`${t('deals.brokerShare')} (${commission.brokerPct ?? 0}%)`}
                    value={money(commission.brokerAmount)}
                  />
                ) : null}
                {commission.estateaiAmount !== undefined && commission.estateaiAmount !== null ? (
                  <Detail
                    label={`${t('deals.estateaiShare')} (${commission.estateaiPct ?? 0}%)`}
                    value={money(commission.estateaiAmount)}
                  />
                ) : null}
                {commission.dueDate ? (
                  <Detail label={t('deals.dueDate')} value={formatDate(commission.dueDate)} />
                ) : null}
                {commission.paidDate ? (
                  <Detail label={t('deals.paidDate')} value={formatDate(commission.paidDate)} />
                ) : null}
                <Text style={[styles.commissionNote, align]}>{t('deals.commissionNote')}</Text>
              </View>
            ) : null}

            {deal.status === 'SOLD' && deal.broker ? <RateBrokerBox deal={deal} /> : null}

            <Btn title={t('common.close')} variant="ghost" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Label/value line used by the detail sheet. */
function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { align, isRtl } = useI18n();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, align]}>{label}</Text>
      {/* Value sits on the trailing edge — the mirror of the label. */}
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

function toneFor(status: string) {
  const s = (status ?? '').toUpperCase();
  if (s === 'SOLD') return 'green' as const;
  if (s === 'CANCELLED' || s === 'LOST') return 'red' as const;
  return 'gold' as const;
}

/** The site's COMMISSION_COLORS, on the kit's five badge tones. */
function commissionTone(status: string) {
  const s = (status ?? '').toUpperCase();
  if (s === 'PAID') return 'green' as const;
  if (s === 'DISPUTED') return 'red' as const;
  if (s === 'PENDING' || s === 'DUE') return 'gold' as const;
  if (s === 'APPROVED' || s === 'INVOICED') return 'blue' as const;
  return 'muted' as const;
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    // Search + new-deal action on the trailing edge (mirrors in RTL via `row`).
    headerRow: { alignItems: 'center', gap: 8 },
    searchGrow: { flex: 1 },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: Radius.md,
      backgroundColor: t.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnPressed: { opacity: 0.85 },

    // KPI grid — the website's five `grid-cols-5` cards, three to a row here.
    kpiGrid: { flexWrap: 'wrap', gap: 8 },
    kpiCell: { flexGrow: 1, flexBasis: '30%', minWidth: 96, alignItems: 'center' },

    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    list: { gap: 0 },

    right: { alignItems: 'flex-end', gap: 4 },
    rightRtl: { alignItems: 'flex-start' },
    value: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    commissionCell: { flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
    commissionText: { color: t.mutedForeground, fontSize: 12 },

    // Detail sheet — the site's `bg-black/70` overlay and rounded sheet.
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
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 24,
    },
    sheetBody: { padding: 16, gap: 8 },
    sheetHead: { alignItems: 'center', gap: 8, justifyContent: 'space-between' },
    sheetTitle: { color: t.foreground, fontSize: 17, lineHeight: 24, fontWeight: '700', flexShrink: 1 },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
    detailLabel: { color: t.mutedForeground, fontSize: 14, flexShrink: 1 },
    detailValue: { color: t.foreground, fontSize: 14, fontWeight: '600', flexShrink: 1 },

    // Commission block — `rounded-lg border bg-muted/30 p-3`.
    commissionBox: {
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      padding: 12,
      gap: 2,
      marginTop: 4,
    },
    commissionHead: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    commissionTitle: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    commissionNote: { color: t.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 6 },

    // Rate-broker box — same bordered block as the commission box above.
    rateBox: {
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      padding: 12,
      gap: 8,
      marginTop: 4,
    },
    rateTitle: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    rateHint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    rateOk: { color: t.successFg, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    rateError: { color: t.destructive, fontSize: 12, lineHeight: 17 },
    stars: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  })
);
