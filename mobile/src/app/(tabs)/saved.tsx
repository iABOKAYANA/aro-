import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useRequireAuth } from '@/components/auth-gate';
import { Badge, Card, Chip, Divider, Empty, ErrorBar, Loading, Row, Screen, SectionTitle, Btn } from '@/components/ui';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, formatArea, formatMoney, humanise, timeAgo, type CurrencyCode } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { useSavedProjects } from '@/lib/saved-projects';
import { createStyles, useTheme } from '@/lib/theme';

type Favorite = {
  id: string;
  unitId?: string | null;
  unit?: {
    id: string;
    name: string;
    slug?: string | null;
    price?: number | null;
    bedrooms?: number | null;
    area?: number | null;
    status?: string | null;
    project?: { id: string; slug: string; name: string } | null;
  } | null;
};

type SavedSearch = {
  id: string;
  name: string;
  filters?: Record<string, unknown>;
  notifyNew?: boolean;
  matchCount?: number;
  createdAt?: string;
};

/** One row of `GET /api/watch` — src/app/api/watch/route.ts. */
type WatchRow = {
  id: string;
  targetType: 'UNIT' | 'PROJECT' | 'CITY';
  /** For `CITY` rows this is the followed city slug (`new-cairo`, …). */
  targetId: string;
  name: string;
  link: string | null;
  exists: boolean;
  /** Live unit price / project startPrice; null when unknown or unlisted. */
  currentPrice?: number | null;
  alertsEnabled: boolean;
  lastNotifiedAt: string | null;
  snapshot?: Record<string, unknown>;
  createdAt?: string;
};

/** Project row for per-city counts — `GET /api/projects?limit=200`. */
type CityProjectRow = {
  id: string;
  city?: { name?: string | null; nameArabic?: string | null; nameSlug?: string | null } | null;
};

/**
 * Display name for a followed city slug. The server stores the canonical
 * `City.nameSlug`; unknown slugs fall back to spaced-out words — the same
 * treatment Explore's city chips use for raw slugs.
 */
function cityLabel(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Client-side mirror of the slug the website cards follow by. */
function projectCitySlug(p: CityProjectRow): string | null {
  const stored = p.city?.nameSlug?.trim().toLowerCase();
  if (stored) return stored;
  const name = p.city?.name?.trim();
  if (!name) return null;
  return name.toLowerCase().replace(/\s+/g, '-') || null;
}

/**
 * Price-drop signal for a watched row: the live price sits below the
 * watch-time `snapshot.price` baseline (muted watchers, stacked drops behind
 * one unread alert, or any path that didn't advance the snapshot).
 */
function watchDropOf(w: WatchRow): { snap: number; current: number } | null {
  const snap = typeof w.snapshot?.price === 'number' ? w.snapshot.price : null;
  const current = typeof w.currentPrice === 'number' ? w.currentPrice : null;
  if (snap === null || current === null || !(current < snap)) return null;
  return { snap, current };
}

type State = {
  favorites?: Favorite[];
  items?: SavedSearch[];
};

export default function SavedScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const [tab, setTab] = useState<'searches' | 'projects' | 'favorites' | 'watching'>('searches');
  const mutation = useMutation();
  const savedProjects = useSavedProjects();

  const saved = useApi<State>('/api/saved-searches');
  const favorites = useApi<{ favorites?: Favorite[] }>('/api/favorites');
  const watches = useApi<{ watches?: WatchRow[] }>('/api/watch');
  // Per-city project counts for CITY rows — fetched only when at least one
  // city is followed (null skips the request; the hook itself stays unconditional).
  const followedCityCount = (watches.data?.watches ?? []).filter((w) => w.targetType === 'CITY').length;
  const cityProjects = useApi<{ projects?: CityProjectRow[] }>(
    followedCityCount > 0 ? '/api/projects?limit=200' : null
  );

  const reload = () => {
    saved.refresh();
    favorites.refresh();
    watches.refresh();
    cityProjects.refresh();
  };

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  if (saved.loading || favorites.loading || watches.loading) return <Loading label={t('saved.loading')} />;

  const searches = saved.data?.items ?? [];
  const favs = favorites.data?.favorites ?? [];
  const watchRows = watches.data?.watches ?? [];
  // CITY follows render in their own section (city name + project count +
  // unfollow); unit/project watches keep the existing rows below.
  const cityWatches = watchRows.filter((w) => w.targetType === 'CITY');
  const homeWatches = watchRows.filter((w) => w.targetType !== 'CITY');
  const cityCounts = (() => {
    const projects = cityProjects.data?.projects;
    if (!projects) return null;
    const counts = new Map<string, number>();
    for (const p of projects) {
      const slug = projectCitySlug(p);
      if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  })();
  const error = saved.error ?? favorites.error ?? watches.error;

  async function toggleAlert(item: SavedSearch) {
    const next = item.notifyNew === false;
    try {
      await mutation.run('/api/saved-searches', 'PATCH', { id: item.id, notifyNew: next });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('saved.cantUpdateAlerts'));
    }
  }

  async function removeSearch(item: SavedSearch) {
    try {
      await mutation.run(`/api/saved-searches?id=${item.id}`, 'DELETE');
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('saved.cantDelete'));
    }
  }

  async function removeFavorite(item: Favorite) {
    const unitId = item.unitId ?? item.unit?.id;
    if (!unitId) return;
    try {
      await mutation.run(`/api/favorites?unitId=${unitId}`, 'DELETE');
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('saved.cantRemove'));
    }
  }

  /** `PATCH /api/watch { id, alertsEnabled }` — the website's bell toggle. */
  async function toggleWatchAlerts(item: WatchRow) {
    try {
      await mutation.run('/api/watch', 'PATCH', { id: item.id, alertsEnabled: !item.alertsEnabled });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('saved.cantUpdateAlerts'));
    }
  }

  /** `DELETE /api/watch { id }` — body form, same as the website sends. */
  async function removeWatch(item: WatchRow) {
    try {
      await mutation.run('/api/watch', 'DELETE', { id: item.id });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('saved.cantRemove'));
    }
  }

  /**
   * "View results" — re-runs the stored filters in the Explore tab, the way the
   * website's `toQuery(filters)` links back to `/projects?…`.
   */
  function viewResults(item: SavedSearch) {
    router.push({ pathname: '/(tabs)/explore', params: toExploreParams(item.filters) });
  }

  return (
    <Screen
      refreshing={saved.refreshing || favorites.refreshing || watches.refreshing || cityProjects.refreshing}
      onRefresh={reload}
    >
      <View style={[styles.tabs, row]}>
        <Chip label={`${t('saved.searches')} (${searches.length})`} selected={tab === 'searches'} onPress={() => setTab('searches')} />
        <Chip label={`${t('saved.projects')} (${savedProjects.items.length})`} selected={tab === 'projects'} onPress={() => setTab('projects')} />
        <Chip label={`${t('saved.favorites')} (${favs.length})`} selected={tab === 'favorites'} onPress={() => setTab('favorites')} />
        <Chip label={`${t('saved.watching')} (${watchRows.length})`} selected={tab === 'watching'} onPress={() => setTab('watching')} />
      </View>

      <Btn title={t('saved.compareProjects')} variant="ghost" onPress={() => router.push('/compare')} />

      <Text style={[styles.tabHint, align]}>
        {tab === 'searches'
          ? t('saved.searchesHint')
          : tab === 'projects'
            ? t('saved.projectsHint')
            : tab === 'watching'
              ? t('saved.watchingHint')
              : t('saved.favoritesHint')}
      </Text>

      {error ? <ErrorBar message={error} onRetry={reload} /> : null}

      {tab === 'searches' ? (
        searches.length === 0 ? (
          <Empty
            title={t('saved.noSearches')}
            message={t('saved.noSearchesHint')}
            action={
              <Btn
                title={t('saved.exploreProjects')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/explore')}
              />
            }
          />
        ) : (
          <>
            <SectionTitle>{t('saved.savedSearches')}</SectionTitle>
            {searches.map((item) => (
              <Card key={item.id} style={styles.item}>
                <Row
                  title={item.name}
                  subtitle={[
                    item.matchCount !== undefined ? `${item.matchCount} ${t('saved.matches')}` : null,
                    item.createdAt ? timeAgo(item.createdAt) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
                {/* One labelled chip per stored filter — the site prints the same list. */}
                <View style={[styles.filterChips, row]}>
                  {describeFilters(item.filters, t, currency, rates).map((chip) => (
                    <Badge key={chip.key} tone="muted">
                      {chip.text}
                    </Badge>
                  ))}
                </View>
                <View style={styles.actions}>
                  <View style={[styles.alertRow, row]}>
                    <Text style={[styles.alertLabel, align]}>{t('saved.alertNew')}</Text>
                    <Switch
                      value={item.notifyNew !== false}
                      onValueChange={() => toggleAlert(item)}
                      trackColor={{ true: 'rgba(212,168,67,0.5)', false: theme.muted }}
                      thumbColor={item.notifyNew !== false ? theme.primary : theme.mutedForeground}
                    />
                  </View>
                  <View style={[styles.actionRow, row]}>
                    <Btn
                      title={t('saved.viewResults')}
                      variant="ghost"
                      style={styles.grow}
                      onPress={() => viewResults(item)}
                    />
                    <Btn title={t('common.delete')} variant="danger" onPress={() => removeSearch(item)} />
                  </View>
                </View>
              </Card>
            ))}
          </>
        )
      ) : tab === 'projects' ? (
        savedProjects.items.length === 0 ? (
          <Empty
            title={t('saved.noProjects')}
            message={t('saved.noProjectsHint')}
            action={
              <Btn
                title={t('saved.exploreProjects')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/explore')}
              />
            }
          />
        ) : (
          <>
            <SectionTitle>{t('saved.savedProjects')}</SectionTitle>
            <Card style={styles.list}>
              {savedProjects.items.map((project, index) => (
                <View key={project.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={localized(project.name, project.nameArabic)}
                    subtitle={[
                      timeAgo(project.savedAt) || undefined,
                      project.startPrice
                        ? formatMoney(project.startPrice, currency, rates, { compact: true })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      project.status ? <Badge tone="muted">{humanise(project.status)}</Badge> : undefined
                    }
                    right={
                      <Pressable onPress={() => savedProjects.remove(project.id)} hitSlop={10}>
                        <Text style={styles.remove}>✕</Text>
                      </Pressable>
                    }
                    onPress={() => router.push(`/project/${project.slug}`)}
                  />
                </View>
              ))}
            </Card>
          </>
        )
      ) : tab === 'watching' ? (
        watchRows.length === 0 ? (
          <Empty
            title={t('saved.noWatching')}
            message={t('saved.noWatchingHint')}
            action={
              <Btn
                title={t('saved.exploreProjects')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/explore')}
              />
            }
          />
        ) : (
          <>
            <SectionTitle>{t('saved.watching')}</SectionTitle>
            {cityWatches.map((w) => {
              const count = cityCounts?.get(w.targetId.toLowerCase()) ?? null;
              const followedAt =
                typeof w.snapshot?.followedAt === 'string' ? w.snapshot.followedAt : w.createdAt;
              const exploreCity = () =>
                router.push({ pathname: '/(tabs)/explore', params: { city: w.targetId } });
              return (
                <Card key={w.id} style={styles.item}>
                  <Row
                    title={cityLabel(w.targetId)}
                    subtitle={[
                      t('saved.city'),
                      count !== null ? `${count} ${t('saved.newProjects')}` : null,
                      t('saved.cityHint'),
                      followedAt ? `${t('saved.followedAt')}: ${formatDate(followedAt)}` : null,
                      w.lastNotifiedAt ? `${t('saved.lastAlert')}: ${formatDate(w.lastNotifiedAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      count !== null && count > 0 ? (
                        <Badge tone="gold">{`${count} ${t('saved.newProjects')}`}</Badge>
                      ) : undefined
                    }
                    onPress={exploreCity}
                  />
                  <View style={styles.actions}>
                    <View style={[styles.alertRow, row]}>
                      <Text style={[styles.alertLabel, align]}>
                        {w.alertsEnabled ? t('saved.alertsOn') : t('saved.muted')}
                      </Text>
                      <Switch
                        value={w.alertsEnabled}
                        onValueChange={() => toggleWatchAlerts(w)}
                        trackColor={{ true: 'rgba(212,168,67,0.5)', false: theme.muted }}
                        thumbColor={w.alertsEnabled ? theme.primary : theme.mutedForeground}
                      />
                    </View>
                    <View style={[styles.actionRow, row]}>
                      <Btn
                        title={t('saved.viewCity')}
                        variant="ghost"
                        style={styles.grow}
                        onPress={exploreCity}
                      />
                      <Btn title={t('saved.remove')} variant="danger" onPress={() => removeWatch(w)} />
                    </View>
                  </View>
                </Card>
              );
            })}
            {homeWatches.map((w) => {
              const snapPrice = typeof w.snapshot?.price === 'number' ? w.snapshot.price : null;
              const livePrice = typeof w.currentPrice === 'number' ? w.currentPrice : null;
              // Live price below the watch-time baseline — the drop the
              // price-alert fan-out (`src/lib/price-alerts.ts`) notified about.
              const drop = watchDropOf(w);
              const price = livePrice ?? snapPrice;
              const status = typeof w.snapshot?.status === 'string' ? w.snapshot.status : null;
              const href = watchHref(w.link);
              return (
                <Card key={w.id} style={drop ? [styles.item, styles.dropCard] : styles.item}>
                  <Row
                    title={w.name}
                    subtitle={[
                      w.targetType === 'UNIT' ? t('common.unit') : t('common.project'),
                      price !== null ? formatMoney(price, currency, rates, { compact: true }) : null,
                      drop
                        ? t('priceA.dropHint')
                            .replace('{old}', formatMoney(drop.snap, currency, rates, { compact: true }))
                            .replace('{new}', formatMoney(drop.current, currency, rates, { compact: true }))
                        : null,
                      status ? `${t('common.status')}: ${humanise(status)}` : null,
                      w.lastNotifiedAt ? `${t('saved.lastAlert')}: ${formatDate(w.lastNotifiedAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      !w.exists ? (
                        <Badge tone="gold">{t('saved.noLongerListed')}</Badge>
                      ) : drop ? (
                        <Badge tone="green">{t('priceA.dropped')}</Badge>
                      ) : undefined
                    }
                    onPress={href ? () => router.push(href) : undefined}
                  />
                  <View style={styles.actions}>
                    <View style={[styles.alertRow, row]}>
                      <Text style={[styles.alertLabel, align]}>
                        {w.alertsEnabled ? t('saved.alertsOn') : t('saved.muted')}
                      </Text>
                      <Switch
                        value={w.alertsEnabled}
                        onValueChange={() => toggleWatchAlerts(w)}
                        trackColor={{ true: 'rgba(212,168,67,0.5)', false: theme.muted }}
                        thumbColor={w.alertsEnabled ? theme.primary : theme.mutedForeground}
                      />
                    </View>
                    <Btn title={t('saved.remove')} variant="danger" onPress={() => removeWatch(w)} />
                  </View>
                </Card>
              );
            })}
          </>
        )
      ) : favs.length === 0 ? (
        <Empty
          title={t('saved.noFavorites')}
          message={t('saved.noFavoritesHint')}
          action={
            <Btn
              title={t('saved.exploreProjects')}
              variant="ghost"
              onPress={() => router.push('/(tabs)/explore')}
            />
          }
        />
      ) : (
        <>
          <SectionTitle>{t('saved.favorites')}</SectionTitle>
          <Card style={styles.list}>
            {favs.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={item.unit?.name ?? t('common.unit')}
                  subtitle={[
                    item.unit?.project?.name,
                    formatMoney(item.unit?.price, currency, rates, { compact: true }),
                    item.unit?.bedrooms ? `${item.unit.bedrooms} ${t('project.bed')}` : null,
                    item.unit?.area ? `${item.unit.area} m²` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={item.unit?.status ? <Badge tone="muted">{humanise(item.unit.status)}</Badge> : undefined}
                  right={
                    <Pressable onPress={() => removeFavorite(item)} hitSlop={10}>
                      <Text style={styles.remove}>✕</Text>
                    </Pressable>
                  }
                  onPress={
                    // `/api/favorites` carries the unit slug — a saved unit opens
                    // the unit page, exactly like the website's /units/{slug}.
                    item.unit?.slug
                      ? () => router.push(`/unit/${item.unit!.slug}`)
                      : item.unit?.project?.slug
                        ? () => router.push(`/project/${item.unit!.project!.slug}`)
                        : undefined
                  }
                />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

/**
 * Saved-search filter chips — the `describe()` list from
 * src/components/saved-searches/saved-searches-list.tsx: one labelled chip per
 * stored filter instead of a single badge that made every search look alike.
 */
function describeFilters(
  filters: Record<string, unknown> | undefined,
  t: (key: MessageKey) => string,
  currency: CurrencyCode,
  rates: Record<CurrencyCode, number>
): { key: string; text: string }[] {
  if (!filters) return [{ key: 'none', text: t('saved.filters') }];
  const entries = Object.entries(filters).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );
  if (entries.length === 0) return [{ key: 'all', text: t('saved.all') }];
  return entries.map(([key, value]) => ({
    key,
    text: `${filterLabel(key, t)}: ${filterValue(key, value, t, currency, rates)}`,
  }));
}

function filterLabel(key: string, t: (key: MessageKey) => string): string {
  switch (key) {
    case 'q': return t('saved.filterKeyword');
    case 'governorate': return t('saved.filterGovernorate');
    case 'city': return t('saved.filterCity');
    case 'district': return t('saved.filterDistrict');
    case 'propertyType': return t('saved.filterType');
    case 'listingType': return t('saved.filterListing');
    case 'minPrice': return t('saved.filterMinPrice');
    case 'maxPrice': return t('saved.filterMaxPrice');
    case 'bedrooms': return t('saved.filterBedrooms');
    case 'bathrooms': return t('saved.filterBathrooms');
    case 'minArea': return t('saved.filterMinArea');
    case 'maxArea': return t('saved.filterMaxArea');
    default: return humanise(key);
  }
}

function filterValue(
  key: string,
  value: unknown,
  t: (key: MessageKey) => string,
  currency: CurrencyCode,
  rates: Record<CurrencyCode, number>
): string {
  if (key === 'minPrice' || key === 'maxPrice') {
    const n = Number(value);
    return Number.isFinite(n) ? formatMoney(n, currency, rates, { compact: true }) : String(value);
  }
  if (key === 'minArea' || key === 'maxArea') {
    const n = Number(value);
    return Number.isFinite(n) ? formatArea(n) : String(value);
  }
  if (key === 'propertyType') return labelOf(String(value), PROP_LABELS, t);
  if (key === 'listingType') return labelOf(String(value), LISTING_LABELS, t);
  if (key === 'city' || key === 'governorate' || key === 'district') {
    // Slugs read better spaced out — the same treatment Explore's city chips use.
    return String(value).replace(/-/g, ' ');
  }
  return String(value);
}

/** `APARTMENT` → "Apartment" / "شقة"; unknown values fall back to `humanise`. */
function labelOf(
  value: string,
  table: Record<string, MessageKey>,
  t: (key: MessageKey) => string
): string {
  const key = table[value];
  return key ? t(key) : humanise(value);
}

const PROP_LABELS: Record<string, MessageKey> = {
  APARTMENT: 'prop.APARTMENT',
  VILLA: 'prop.VILLA',
  TOWNHOUSE: 'prop.TOWNHOUSE',
  PENTHOUSE: 'prop.PENTHOUSE',
  STUDIO: 'prop.STUDIO',
  DUPLEX: 'prop.DUPLEX',
  CHALET: 'prop.CHALET',
  LAND: 'prop.LAND',
  COMMERCIAL: 'prop.COMMERCIAL',
  ADMINISTRATIVE: 'prop.ADMINISTRATIVE',
  MEDICAL: 'prop.MEDICAL',
};

const LISTING_LABELS: Record<string, MessageKey> = {
  SALE: 'list.SALE',
  RENT: 'list.RENT',
  RESALE: 'list.RESALE',
  INSTALLMENT: 'list.INSTALLMENT',
};

/**
 * `toQuery(item.filters)` from the website, restated as Explore route params:
 * the keys Explore's own controls read (`propertyType`, `city`, `q`,
 * `bedrooms`, `minPrice`/`maxPrice`, `minArea`/`maxArea`) plus `sortBy`.
 *
 * Keys Explore has no control for — `governorate`, `district`, `bathrooms` —
 * are dropped rather than sent as params the screen would silently discard on
 * the next filter change.
 */
function toExploreParams(filters: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!filters) return out;

  const text = (key: string) => {
    const value = filters[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  };
  const number = (key: string) => {
    const value = Number(filters[key]);
    if (Number.isFinite(value) && value > 0) out[key] = String(value);
  };

  text('q');
  text('city');
  text('propertyType');
  text('listingType');
  number('minPrice');
  number('maxPrice');
  number('bedrooms');
  number('minArea');
  number('maxArea');
  return out;
}

/**
 * The watch API returns website paths (`/projects/{slug}`, `/units/{slug}`);
 * map them onto this app's routes so a watched row opens its own page.
 */
function watchHref(link: string | null): `/project/${string}` | `/unit/${string}` | undefined {
  if (!link) return undefined;
  const parts = link.split('/').filter(Boolean);
  if (parts.length < 2) return undefined;
  const [section, slug] = parts;
  if (section === 'projects') return `/project/${encodeURIComponent(slug)}`;
  if (section === 'units') return `/unit/${encodeURIComponent(slug)}`;
  return undefined;
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tabHint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    item: { gap: 0 },
    // Price-drop highlight — a success-tinted border that reads in both modes.
    dropCard: { borderColor: t.successFg, borderWidth: 1 },
    actions: { gap: 8, marginTop: 6 },
    alertRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    alertLabel: { color: t.foreground, fontSize: 14 },
    // One chip per stored filter, wrapping in the reading direction.
    filterChips: { flexWrap: 'wrap', gap: 6, marginTop: 6 },
    actionRow: { alignItems: 'center', gap: 8 },
    grow: { flexGrow: 1 },
    remove: { color: t.dangerFg, fontSize: 16, fontWeight: '700', paddingHorizontal: 6 },
    list: { gap: 0 },
  })
);
