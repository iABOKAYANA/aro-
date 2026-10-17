import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Share, StyleSheet, Image, Text, View } from 'react-native';

import {
  Badge,
  Btn,
  Card,
  Chip,
  Empty,
  ErrorBar,
  Loading,
  Row,
  Screen,
  SearchBar,
  SectionTitle,
  GoldDivider,
} from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { COMPARE_MAX, useCompare, type CompareItem } from '@/lib/compare';
import { API_URL } from '@/api/config';
import { formatArea, formatMoney, formatPercent, humanise } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

/** Exactly what `GET /api/compare?ids=` selects — nothing invented here. */
type CompareProject = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  tagline?: string | null;
  status?: string | null;
  startPrice?: number | null;
  endPrice?: number | null;
  pricePerSqm?: number | null;
  downPaymentMin?: number | null;
  installmentYears?: number | null;
  totalUnits?: number | null;
  totalArea?: number | null;
  compoundArea?: number | null;
  completionPercent?: number | null;
  deliveryDate?: string | null;
  propertyTypes?: string[];
  viewCount?: number;
  developer?: {
    companyName?: string | null;
    isVerified?: boolean;
    rating?: number | null;
    reviewCount?: number | null;
  } | null;
  governorate?: { name?: string } | null;
  city?: { name?: string } | null;
  location?: string | null;
  amenities?: { name: string; category?: string | null }[];
  paymentPlans?: {
    id: string;
    name: string;
    downPaymentPct: number;
    installmentYears: number;
    cashDiscount?: number | null;
    isDefault: boolean;
  }[];
};

/** One row of the empty-state picker — `GET /api/projects?limit=40`. */
type BrowseProject = {
  id: string;
  slug: string;
  name: string;
  coverImage?: string | null;
  startPrice?: number | null;
  developer?: { companyName?: string | null } | null;
};

type SearchResult = { items?: { id: string; slug: string; name: string }[] };

/** Rows are the same attributes the website's compare table prints. */
type RowSpec = {
  label: string;
  text: (p: CompareProject) => string;
  /** Small badge under the value — the site's `LOWEST` / `BEST` flags. */
  flag?: (p: CompareProject) => ReactNode;
};

const DASH = '—';

/** `2027-03-01` → `Mar 2027`, localised the way the website formats it. */
function monthYear(iso: string | null | undefined, locale: string): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

export default function CompareScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { t, row, align, lang } = useI18n();
  const { items, has, toggle, remove, clear, full, ready } = useCompare();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  // Dead remote covers remove themselves — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});

  // Shared-link entry: `/compare?token=…` (WhatsApp shares, universal-link
  // fallback). The token only *loads* projects into the normal list — after
  // that manual add/remove works exactly as if the user had picked them.
  // `?batch=[{id,slug,name}]` is the explore Fogg nudge ("compare these few"):
  // queued the same manual way on arrival — nothing is ever added by merely
  // rendering a list elsewhere.
  const params = useLocalSearchParams<{ token?: string | string[]; batch?: string | string[] }>();
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const sharedToken = (rawToken ?? '').trim() || null;
  const rawBatch = Array.isArray(params.batch) ? params.batch[0] : params.batch;
  const batchKey = (rawBatch ?? '').trim();
  const mutation = useMutation();
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [tokenApplied, setTokenApplied] = useState(false);
  const [pendingShared, setPendingShared] = useState<CompareItem[]>([]);
  const appliedTokenRef = useRef<string | null>(null);
  const appliedBatchRef = useRef<string | null>(null);

  type SharedPayload = {
    token?: string;
    projectIds?: string[];
    items?: { id: string; slug: string; name: string }[];
  };
  const shared = useApi<SharedPayload>(
    sharedToken ? `/api/compare/share?token=${encodeURIComponent(sharedToken)}` : null,
    Boolean(sharedToken)
  );

  // Queue the shared projects once the GET lands (and storage is hydrated so
  // the queued adds cannot be clobbered by the persisted list loading late).
  useEffect(() => {
    if (!sharedToken || !ready || appliedTokenRef.current === sharedToken) return;
    const incoming = shared.data?.items;
    if (!incoming) return;
    appliedTokenRef.current = sharedToken;
    setTokenApplied(true);
    setPendingShared(
      incoming
        .filter(
          (p): p is { id: string; slug: string; name: string } =>
            !!p && typeof p.id === 'string' && typeof p.slug === 'string' && typeof p.name === 'string'
        )
        .slice(0, COMPARE_MAX)
        .map((p) => ({ id: p.id, slug: p.slug, name: p.name }))
    );
  }, [sharedToken, shared.data, ready]);

  // Drain one queued project per pass — `toggle` closes over the current list,
  // so firing them in a loop would keep only the last one.
  useEffect(() => {
    if (pendingShared.length === 0) return;
    if (full) {
      setPendingShared([]);
      return;
    }
    const [next, ...rest] = pendingShared;
    if (!next || has(next.id) || has(next.slug)) {
      setPendingShared(rest);
      return;
    }
    toggle(next);
    setPendingShared(rest);
  }, [pendingShared, full, has, toggle]);

  // Explore batch (?batch=…): validate the explicit tap payload, then queue it
  // through the same one-per-pass drain above. Runs once per batch string.
  const batchItems = useMemo<CompareItem[]>(() => {
    if (!batchKey) return [];
    try {
      const parsed: unknown = JSON.parse(batchKey);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (p): p is { id: string; slug: string; name: string } =>
            !!p &&
            typeof p === 'object' &&
            typeof (p as CompareItem).id === 'string' &&
            typeof (p as CompareItem).slug === 'string' &&
            typeof (p as CompareItem).name === 'string'
        )
        .slice(0, COMPARE_MAX)
        .map((p) => ({ id: p.id, slug: p.slug, name: p.name }));
    } catch {
      return [];
    }
  }, [batchKey]);

  useEffect(() => {
    if (!batchKey || !ready || appliedBatchRef.current === batchKey) return;
    appliedBatchRef.current = batchKey;
    if (batchItems.length === 0) return;
    setPendingShared((prev) => {
      const fresh = batchItems.filter(
        (b) => !prev.some((p) => p.id === b.id || p.slug === b.slug)
      );
      return [...prev, ...fresh].slice(0, COMPARE_MAX);
    });
  }, [batchKey, batchItems, ready]);

  async function shareComparison() {
    if (items.length === 0 || sharing) return;
    setSharing(true);
    setShareNote(null);
    try {
      const res = (await mutation.run('/api/compare/share', 'POST', {
        projectIds: items.map((item) => item.id),
      })) as { token?: string; url?: string } | null;
      const link = res?.url ?? `${API_URL}/compare/shared/${res?.token ?? ''}`;
      await Share.share({ message: `${t('compare.shareMessage')}\n${link}`, url: link });
      setShareNote(t('compare.linkReady'));
    } catch {
      setShareNote(t('compare.shareFailed'));
    } finally {
      setSharing(false);
    }
  }

  const ids = items.map((item) => item.id).join(',');
  const empty = items.length === 0;

  const searchPath = useMemo(() => {
    const q = debounced.trim();
    if (!q) return null;
    const params = new URLSearchParams({ type: 'projects', q, limit: '6' });
    return `/api/search?${params.toString()}`;
  }, [debounced]);

  const results = useApi<SearchResult>(searchPath, Boolean(searchPath));
  const comparison = useApi<{ items?: CompareProject[]; total?: number }>(
    ids ? `/api/compare?ids=${encodeURIComponent(ids)}` : null,
    Boolean(ids)
  );
  // Empty state: browse the catalogue instead of making the visitor type a name.
  const browse = useApi<{ projects?: BrowseProject[] }>(
    empty ? '/api/projects?limit=40' : null,
    empty
  );

  // Search-as-you-type without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const projects = useMemo(() => comparison.data?.items ?? [], [comparison.data]);
  const suggestions = (results.data?.items ?? []).filter((hit) => !has(hit.id) && !has(hit.slug));
  const picks = useMemo(() => browse.data?.projects ?? [], [browse.data]);
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';

  const filteredPicks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return picks;
    return picks.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.developer?.companyName || '').toLowerCase().includes(q)
    );
  }, [picks, query]);

  /** Same rules as the site: a flag only means something across 2+ candidates. */
  const cheapestId = useMemo(() => {
    const withPrice = projects.filter((p) => typeof p.startPrice === 'number');
    if (withPrice.length < 2) return null;
    return [...withPrice].sort((a, b) => (a.startPrice ?? 0) - (b.startPrice ?? 0))[0].id;
  }, [projects]);

  const bestRatedId = useMemo(() => {
    const rated = projects.filter((p) => (p.developer?.rating ?? 0) > 0);
    if (rated.length < 2) return null;
    return [...rated].sort((a, b) => (b.developer?.rating ?? 0) - (a.developer?.rating ?? 0))[0].id;
  }, [projects]);

  /** One row per amenity *any* selected project has — the union matrix. */
  const amenityUnion = useMemo(() => {
    const names = new Set<string>();
    for (const project of projects) for (const amenity of project.amenities ?? []) names.add(amenity.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const rows: RowSpec[] = [
    { label: t('common.status'), text: (p) => humanise(p.status) },
    {
      label: t('project.from'),
      text: (p) => formatMoney(p.startPrice, currency, rates, { compact: true }),
      flag: (p) =>
        p.id === cheapestId ? <Badge tone="green">{t('compare.lowestFlag')}</Badge> : null,
    },
    { label: t('saved.to'), text: (p) => formatMoney(p.endPrice, currency, rates, { compact: true }) },
    { label: t('saved.perSqm'), text: (p) => formatMoney(p.pricePerSqm, currency, rates) },
    {
      label: t('saved.downPayment'),
      text: (p) => (p.downPaymentMin != null ? `${p.downPaymentMin}%` : DASH),
    },
    {
      label: t('saved.installments'),
      text: (p) => (p.installmentYears != null ? `${p.installmentYears} ${t('saved.yrs')}` : DASH),
    },
    { label: t('project.units'), text: (p) => (p.totalUnits != null ? String(p.totalUnits) : DASH) },
    { label: t('common.area'), text: (p) => formatArea(p.totalArea) },
    { label: t('saved.compound'), text: (p) => formatArea(p.compoundArea) },
    {
      label: t('project.completion'),
      text: (p) => (p.completionPercent != null ? formatPercent(p.completionPercent) : DASH),
    },
    {
      label: t('common.developer'),
      text: (p) =>
        p.developer?.companyName
          ? `${p.developer.companyName}${p.developer.isVerified ? ' ✓' : ''}`
          : DASH,
    },
    {
      label: t('saved.location'),
      text: (p) =>
        p.location || [p.city?.name, p.governorate?.name].filter(Boolean).join(', ') || DASH,
    },
    {
      label: t('compare.rating'),
      text: (p) =>
        p.developer?.rating
          ? `${p.developer.rating.toFixed(1)} (${p.developer.reviewCount ?? 0} ${t('compare.reviews')})`
          : DASH,
      flag: (p) =>
        p.id === bestRatedId ? <Badge tone="gold">{t('compare.bestFlag')}</Badge> : null,
    },
    { label: t('compare.delivery'), text: (p) => monthYear(p.deliveryDate, locale) },
    {
      label: t('compare.propertyTypes'),
      text: (p) =>
        p.propertyTypes?.length
          ? p.propertyTypes.map((type) => type.replace(/_/g, ' ')).join(', ')
          : DASH,
    },
    {
      label: t('compare.paymentPlan'),
      text: (p) => {
        const plan = p.paymentPlans?.find((entry) => entry.isDefault) ?? p.paymentPlans?.[0];
        return plan
          ? `${plan.downPaymentPct}% ${t('compare.downShort')} · ${plan.installmentYears} ${t('compare.years')}`
          : DASH;
      },
    },
    { label: t('compare.views'), text: (p) => (p.viewCount ?? 0).toLocaleString() },
  ];

  function reload() {
    comparison.refresh();
    browse.refresh();
    results.refresh();
    shared.refresh();
  }

  function addProject(hit: { id: string; slug: string; name: string }) {
    if (full) return;
    toggle(hit);
  }

  const pickedList = empty ? null : (
    <Card style={styles.picked}>
      {items.map((item) => (
        <Row
          key={item.id}
          title={item.name}
          subtitle={item.slug}
          right={<Chip label={t('saved.remove')} selected={false} onPress={() => remove(item.id)} />}
        />
      ))}
    </Card>
  );

  /** Empty-state picker — every project is one tap away, no typing required. */
  const picker = !empty || query.trim() ? null : browse.loading ? (
    <Loading label={t('compare.loadingProjects')} />
  ) : browse.error ? (
    <ErrorBar message={browse.error} onRetry={browse.refresh} />
  ) : filteredPicks.length === 0 ? (
    <Empty title={t('compare.empty')} message={t('compare.emptyHint')} />
  ) : (
    <Card style={styles.picked}>
      <SectionTitle>{t('compare.browse')}</SectionTitle>
      <Text style={[styles.pickerHint, align]}>{t('compare.browseHint')}</Text>
      {filteredPicks.slice(0, 30).map((project) => {
        const src = imageUrl(project.coverImage);
        return (
        <Row
          key={project.id}
          left={
            src && !deadImgs[src] ? (
              <Image
                source={{ uri: src }}
                style={styles.thumb}
                onError={() =>
                  setDeadImgs((prev) => (prev[src] ? prev : { ...prev, [src]: true }))
                }
              />
            ) : null
          }
          title={project.name}
          subtitle={[
            project.developer?.companyName,
            typeof project.startPrice === 'number'
              ? `${t('project.from')} ${formatMoney(project.startPrice, currency, rates, { compact: true })}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          right={
            <Chip
              label={full ? t('saved.full') : t('action.add')}
              selected={false}
              onPress={() => addProject(project)}
            />
          }
        />
        );
      })}
    </Card>
  );

  if (comparison.loading) return <Loading label={t('saved.building')} />;

  // A shared token with an empty manual list: hold the spinner until the token
  // resolves (or fails) instead of flashing the empty picker for a frame.
  if (sharedToken && !tokenApplied && !shared.error && empty) {
    return <Loading label={t('compare.sharedLoading')} />;
  }

  return (
    <Screen refreshing={comparison.refreshing || browse.refreshing} onRefresh={reload}>
      <SectionTitle
        action={
          !empty ? (
            <View style={[styles.headerActions, row]}>
              <Chip
                label={sharing ? t('compare.sharing') : t('compare.share')}
                selected={false}
                disabled={sharing}
                onPress={() => void shareComparison()}
              />
              <Chip label={t('common.clearAll')} selected={false} onPress={clear} />
            </View>
          ) : undefined
        }>
        {`${t('saved.compare')}${!empty ? ` (${items.length}/${COMPARE_MAX})` : ''}`}
      </SectionTitle>
      <GoldDivider />

      {shareNote && !empty ? <Text style={[styles.pickerHint, align]}>{shareNote}</Text> : null}

      {/* Unknown/expired token: friendly empty state, never the raw error.
          The manual picker below keeps working regardless. */}
      {sharedToken && !tokenApplied && shared.error ? (
        <Empty
          title={t('compare.badLink')}
          message={t('compare.badLinkHint')}
          action={<Chip label={t('common.retry')} selected={false} onPress={shared.refresh} />}
        />
      ) : null}

      {pickedList}

      {empty ? (
        <Text style={[styles.pickerHint, align]}>{t('compare.subtitle')}</Text>
      ) : null}

      {/* Add more */}
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('compare.searchPlaceholder')}
      />
      {results.error ? <ErrorBar message={results.error} onRetry={results.refresh} /> : null}
      {query.trim() && suggestions.length > 0 ? (
        <Card style={styles.picked}>
          {suggestions.map((hit) => (
            <Row
              key={hit.id}
              title={hit.name}
              subtitle={full ? t('saved.comparisonFull') : t('saved.tapToAdd')}
              right={
                <Chip
                  label={full ? t('saved.full') : t('action.add')}
                  selected={false}
                  onPress={() => !full && toggle(hit)}
                />
              }
            />
          ))}
        </Card>
      ) : null}

      {picker}

      {/* The table */}
      {ids ? (
        comparison.error ? (
          <ErrorBar message={comparison.error} onRetry={comparison.refresh} />
        ) : projects.length > 0 ? (
          <Card style={styles.tableCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                {/* Header row */}
                <View style={[styles.tableRow, row]}>
                  <View style={[styles.labelCell, styles.headerCell]}>
                    <Text style={[styles.headerText, align]}>{t('saved.attribute')}</Text>
                  </View>
                  {projects.map((project) => (
                    <View key={project.id} style={[styles.valueCell, styles.headerCell]}>
                      <Text style={[styles.projectName, align]} numberOfLines={2}>
                        {project.name}
                      </Text>
                      <Badge tone={project.status === 'AVAILABLE' ? 'green' : 'gold'}>
                        {humanise(project.status)}
                      </Badge>
                    </View>
                  ))}
                </View>

                {rows.map((spec, index) => (
                  <View key={spec.label} style={[styles.tableRow, index % 2 === 1 && styles.zebra, row]}>
                    <View style={styles.labelCell}>
                      <Text style={[styles.labelText, align]}>{spec.label}</Text>
                    </View>
                    {projects.map((project) => (
                      <View key={project.id} style={styles.valueCell}>
                        <Text style={[styles.valueText, align]} numberOfLines={1}>
                          {spec.text(project)}
                        </Text>
                        {spec.flag?.(project)}
                      </View>
                    ))}
                  </View>
                ))}

                {/* Amenities: union header, per-project ✓ / — */}
                <View style={[styles.tableRow, styles.amenityHead, row]}>
                  <View style={styles.labelCell}>
                    <Text style={[styles.amenityHeadText, align]} numberOfLines={2}>
                      {`${t('compare.amenities')} (${amenityUnion.length})`}
                    </Text>
                  </View>
                  {projects.map((project) => (
                    <View key={project.id} style={styles.valueCell}>
                      <Text style={[styles.amenityCount, align]} numberOfLines={1}>
                        {`${project.amenities?.length ?? 0} ${t('compare.included')}`}
                      </Text>
                    </View>
                  ))}
                </View>

                {amenityUnion.map((name, index) => (
                  <View
                    key={name}
                    style={[styles.tableRow, index % 2 === 1 && styles.zebra, row]}>
                    <View style={styles.labelCell}>
                      <Text style={[styles.labelText, align]} numberOfLines={2}>
                        {name}
                      </Text>
                    </View>
                    {projects.map((project) => {
                      const hasAmenity = (project.amenities ?? []).some(
                        (amenity) => amenity.name === name
                      );
                      return (
                        <View key={project.id} style={styles.valueCell}>
                          <View style={styles.cellCenter}>
                            <Ionicons
                              name={hasAmenity ? 'checkmark' : 'remove'}
                              size={16}
                              color={hasAmenity ? theme.successFg : theme.gray500}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </Card>
        ) : (
          <Empty title={t('saved.cantLoad')} message={t('saved.cantLoadHint')} />
        )
      ) : null}

      {ids && projects.length > 0 ? (
        <Text style={[styles.disclaimer, align]}>{t('compare.disclaimer')}</Text>
      ) : null}

      <Btn
        title={t('saved.exploreMore')}
        variant="ghost"
        onPress={() => router.push('/(tabs)/explore')}
      />
    </Screen>
  );
}

const CELL = 140;

const useStyles = createStyles((t) =>
  StyleSheet.create({
    picked: { gap: 0 },
    headerActions: { alignItems: 'center', gap: 8 },
    thumb: { width: 56, height: 40, borderRadius: 8, backgroundColor: t.muted },
    pickerHint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    tableCard: { padding: 0, overflow: 'hidden' },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    zebra: { backgroundColor: t.muted },
    headerCell: { backgroundColor: t.muted },
    labelCell: {
      width: 116,
      paddingVertical: 11,
      paddingHorizontal: Spacing.sm,
      justifyContent: 'center',
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    valueCell: {
      width: CELL,
      paddingVertical: 11,
      paddingHorizontal: Spacing.sm,
      justifyContent: 'center',
      gap: 4,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    cellCenter: { alignItems: 'center' },
    headerText: { color: t.mutedForeground, fontSize: 12, fontWeight: '700' },
    labelText: { color: t.mutedForeground, fontSize: 14 },
    valueText: { color: t.foreground, fontSize: 14 },
    projectName: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    amenityHead: { backgroundColor: t.goldBg },
    amenityHeadText: { color: t.primary, fontSize: 12, fontWeight: '700' },
    amenityCount: { color: t.mutedForeground, fontSize: 12 },
    disclaimer: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
  }),
);
