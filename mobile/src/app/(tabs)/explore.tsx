import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';

import { useAuth } from '@/auth/auth-context';
import { Badge, Btn, Chip, Empty, ErrorBar, Field, Loading, Screen, SearchBar, Segmented } from '@/components/ui';
import { Estate, Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatArea, formatMoney, humanise, type CurrencyCode } from '@/lib/format';
import { useAppFonts } from '@/lib/fonts';
import { imageUrl } from '@/lib/image';
import { LANDMARK_IMAGES, slugifyCityName } from '@/lib/landmarks';
import { useCompare } from '@/lib/compare';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Searchable = {
  id: string;
  slug?: string | null;
  name: string;
  nameArabic?: string | null;
  coverImage?: string | null;
  price?: number | null;
  startPrice?: number | null;
  status?: string | null;
  unitType?: string | null;
  listingType?: string | null;
  bedrooms?: number | null;
  area?: number | null;
  governorate?: { name: string } | null;
  city?: { name: string; nameArabic?: string | null } | null;
  district?: { name: string } | null;
  developer?: { companyName?: string | null; isVerified?: boolean } | null;
  project?: { name?: string; slug?: string; coverImage?: string | null } | null;

  // ── Project-card scan-and-compare data (src/components/projects/project-card.tsx)
  viewCount?: number;
  favoriteCount?: number;
  completionPercent?: number | null;
  /** Prisma `Json` column arriving as a JSON string: `'["APARTMENT","VILLA"]'`. */
  propertyTypes?: string | null;
  createdAt?: string | null;
  /** Server-computed by /api/projects; /api/search does not send it. */
  isNewLaunch?: boolean;
  /** Three cheapest available units — where the card's lowest price comes from. */
  units?: { price?: number | null }[] | null;
};

type SearchResponse = {
  items?: Searchable[];
  total?: number;
  page?: number;
  totalPages?: number;
};

/** One pin from `GET /api/projects/map` — same corpus as the list above. */
type MapPin = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  startPrice?: number | null;
  lat: number;
  lng: number;
  /** `exact` = project coordinates; `city` = city-centroid fallback. */
  precision: 'exact' | 'city';
  city?: { name: string; nameArabic?: string | null; nameSlug?: string | null } | null;
};

type MapResponse = {
  pins?: MapPin[];
  total?: number;
  exactCount?: number;
  cityCount?: number;
};

/** Egypt-wide default — the map opens on the whole country, pins decide focus. */
const EGYPT_REGION = {
  latitude: 30.0444,
  longitude: 31.2357,
  latitudeDelta: 7,
  longitudeDelta: 7,
};

type Kind = 'projects' | 'units';

/** Values `searchProjects()` / `searchUnits()` in src/lib/search.ts switch on. */
const SORTS: Record<Kind, string[]> = {
  projects: ['newest', 'popular', 'price_asc', 'price_desc', 'area_desc'],
  units: ['newest', 'popular', 'price_asc', 'price_desc', 'area_asc', 'area_desc'],
};

const SORT_LABEL: Record<string, MessageKey> = {
  newest: 'explore.sortNewest',
  popular: 'explore.sortPopular',
  price_asc: 'explore.sortPriceAsc',
  price_desc: 'explore.sortPriceDesc',
  area_asc: 'explore.sortAreaAsc',
  area_desc: 'explore.sortAreaDesc',
};

const PROPERTY_TYPES = [
  'APARTMENT',
  'VILLA',
  'TOWNHOUSE',
  'PENTHOUSE',
  'STUDIO',
  'DUPLEX',
  'CHALET',
  'COMMERCIAL',
] as const;

const LISTING_TYPES = ['SALE', 'RENT', 'RESALE', 'INSTALLMENT'] as const;

/** Slugs the API matches on `city.nameSlug`, same list the website offers. */
const CITIES = [
  'new-cairo',
  'new-capital',
  'sheikh-zayed',
  '6th-october',
  'ain-sokhna',
  'north-coast',
  'fifth-settlement',
] as const;

/** `[min, max]` pairs straight off the website's quick filters. */
const PRICE_BANDS: [string, string][] = [
  ['', '5000000'],
  ['5000000', '10000000'],
  ['10000000', '20000000'],
  ['20000000', '50000000'],
  ['50000000', ''],
];

/** `APARTMENT` → "Apartment" / "شقة". Mirrors the table in `(tabs)/saved.tsx`. */
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

function labelOf(
  value: string,
  table: Record<string, MessageKey>,
  t: (key: MessageKey) => string
): string {
  const key = table[value];
  return key ? t(key) : humanise(value);
}

/**
 * The exact `filters` body `POST /api/saved-searches` accepts, built the way
 * src/components/saved-searches/save-search-button.tsx builds it from the
 * URL: trimmed non-empty strings, then numbers that are finite and above zero.
 *
 * `q` is only carried for the projects corpus — the units route has no free
 * text — so what gets saved is what actually filtered the list.
 */
function buildSaveableFilters(input: {
  kind: Kind;
  q: string;
  city: string;
  propertyType: string;
  listingType: string;
  bedrooms: string;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
}): Record<string, string | number> {
  const raw: Record<string, string> = {
    q: input.kind === 'projects' ? input.q : '',
    city: input.city,
    propertyType: input.propertyType,
    listingType: input.listingType,
    bedrooms: input.bedrooms,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    minArea: input.minArea,
    maxArea: input.maxArea,
  };

  const filters: Record<string, string | number> = {};
  for (const key of ['q', 'city', 'propertyType', 'listingType'] as const) {
    const value = raw[key];
    if (value && value.trim()) filters[key] = value.trim();
  }
  for (const key of ['minPrice', 'maxPrice', 'bedrooms', 'minArea', 'maxArea'] as const) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value > 0) filters[key] = value;
  }
  return filters;
}

const PAGE_SIZE = 12;
const ALL = '';

/**
 * Discovery — projects *and* units, with the full filter set the website's
 * `/projects` page exposes.
 *
 * The mobile app previously sent only `q` and `sortBy`, so a phone could not
 * filter by price, type or bedroom count at all. Every control here maps to a
 * parameter `src/lib/search.ts` actually reads; anything the API ignores (the
 * route drops `q` for units) is left out of the request rather than sent and
 * silently discarded.
 */
export default function ExploreScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, localized } = useI18n();
  const { t: theme } = useTheme();
  const { currency, rates } = useCurrency();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();

  const [kind, setKind] = useState<Kind>('projects');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [propertyType, setPropertyType] = useState<string>(ALL);
  const [listingType, setListingType] = useState<string>(ALL);
  const [bedrooms, setBedrooms] = useState<string>(ALL);
  const [city, setCity] = useState<string>(ALL);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');

  // A seeded `sortBy` has to survive the corpus switch it may also trigger.
  const seededSort = useRef<string | null>(null);

  // Type-as-you-search, without firing a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  // Live project suggestions — additive only; the full-search flow above is untouched.
  const [suggestTerm, setSuggestTerm] = useState('');
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSuggestTerm('');
      return;
    }
    const timer = setTimeout(() => setSuggestTerm(q), 220);
    return () => clearTimeout(timer);
  }, [query]);
  // Typing re-opens the dropdown after a dismiss; selecting / clearing hides it.
  useEffect(() => {
    setSuggestDismissed(false);
  }, [query]);

  // Switching between projects and units re-runs the search for that corpus.
  useEffect(() => {
    setPage(1);
    setSort(seededSort.current ?? 'newest');
    seededSort.current = null;
  }, [kind]);

  /**
   * "View results" on a saved search pushes this screen with the stored filters
   * as route params (the website's `toQuery(filters)` → `/projects?…`). A plain
   * tab visit carries no params, so it never wipes what the user set by hand.
   */
  const seedSignature = JSON.stringify(routeParams);
  useEffect(() => {
    const incoming = JSON.parse(seedSignature) as Record<string, string | string[]>;
    const pick = (key: string) => {
      const raw = incoming[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      return typeof value === 'string' ? value.trim() : '';
    };
    const keys = ['q', 'city', 'propertyType', 'listingType', 'bedrooms', 'minPrice', 'maxPrice', 'minArea', 'maxArea', 'sortBy'];
    if (!keys.some((key) => pick(key))) return;

    const nextSort = pick('sortBy') || 'newest';
    if (kind !== 'projects') seededSort.current = nextSort;
    // The website's View results always lands on its projects page.
    setKind('projects');
    setQuery(pick('q'));
    setDebounced(pick('q'));
    setPropertyType(pick('propertyType') || ALL);
    setListingType(pick('listingType') || ALL);
    setBedrooms(pick('bedrooms') || ALL);
    setCity(pick('city') || ALL);
    setMinPrice(pick('minPrice'));
    setMaxPrice(pick('maxPrice'));
    setMinArea(pick('minArea'));
    setMaxArea(pick('maxArea'));
    setSort(nextSort);
    setPage(1);
    // Only the payload changes — re-running on `kind` would fight the switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedSignature]);

  const path = useMemo(() => {
    const params = new URLSearchParams({
      type: kind,
      page: String(page),
      limit: String(PAGE_SIZE),
      sortBy: sort,
    });
    if (debounced && kind === 'projects') params.set('q', debounced);
    if (propertyType) params.set('propertyType', propertyType);
    if (listingType) params.set('listingType', listingType);
    if (bedrooms) params.set('bedrooms', bedrooms);
    if (city) params.set('city', city);
    if (minPrice.trim()) params.set('minPrice', minPrice.trim());
    if (maxPrice.trim()) params.set('maxPrice', maxPrice.trim());
    if (minArea.trim()) params.set('minArea', minArea.trim());
    if (maxArea.trim()) params.set('maxArea', maxArea.trim());
    return `/api/search?${params.toString()}`;
  }, [kind, page, sort, debounced, propertyType, listingType, bedrooms, city, minPrice, maxPrice, minArea, maxArea]);

  const { data, error, loading, refreshing, refresh } = useApi<SearchResponse>(path);

  /**
   * Suggestion dropdown — projects corpus only, `limit=6`. `useApi` aborts the
   * stale request whenever the debounced term changes. Errors stay silent (the
   * full search below still works); the box hides when there was never anything
   * to show. `SearchBar` exposes no `onBlur` and `ui.tsx` is off-limits, so
   * blur-hide is approximated: X (clears the query), tap-to-open, view-all tap,
   * and the projects/units switch all hide the box.
   */
  const suggestPath =
    kind === 'projects' && suggestTerm
      ? `/api/search?type=projects&q=${encodeURIComponent(suggestTerm)}&limit=6`
      : null;
  const suggestApi = useApi<SearchResponse>(suggestPath, kind === 'projects' && suggestTerm.length > 0);
  const suggestItems = (suggestApi.data?.items ?? []).filter((item) => item.slug);
  const suggestPending = suggestTerm !== query.trim();
  const suggestSettled = !suggestPending && !suggestApi.loading && suggestApi.data !== null;
  const showSuggest =
    kind === 'projects' &&
    !suggestDismissed &&
    query.trim().length >= 1 &&
    (suggestPending || suggestApi.loading || suggestApi.data !== null);
  const showSuggestEmpty = suggestSettled && suggestItems.length === 0;

  /**
   * Map pins — the same corpus as the list above (`q` / city / type / price
   * band), minus what a map cannot use: bedroom/area subqueries are
   * unit-level, and sort/page order nothing on a map. Units have no map view,
   * so the request only runs for the projects corpus in map mode.
   */
  const mapPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (debounced) params.set('q', debounced);
    if (propertyType) params.set('propertyType', propertyType);
    if (listingType) params.set('listingType', listingType);
    if (city) params.set('city', city);
    if (minPrice.trim()) params.set('minPrice', minPrice.trim());
    if (maxPrice.trim()) params.set('maxPrice', maxPrice.trim());
    return `/api/projects/map?${params.toString()}`;
  }, [debounced, propertyType, listingType, city, minPrice, maxPrice]);

  const mapActive = view === 'map' && kind === 'projects';
  const mapApi = useApi<MapResponse>(mapPath, mapActive);
  const pins = mapApi.data?.pins ?? [];

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const activeFilters =
    [propertyType, listingType, bedrooms, city].filter(Boolean).length +
    [minPrice, maxPrice, minArea, maxArea].filter((value) => value.trim()).length;

  // Same payload the website's SaveSearchButton posts from its searchParams.
  const saveableFilters = useMemo(
    () =>
      buildSaveableFilters({
        kind,
        q: query.trim(),
        city,
        propertyType,
        listingType,
        bedrooms,
        minPrice,
        maxPrice,
        minArea,
        maxArea,
      }),
    [kind, query, city, propertyType, listingType, bedrooms, minPrice, maxPrice, minArea, maxArea]
  );

  function resetFilters() {
    setPropertyType(ALL);
    setListingType(ALL);
    setBedrooms(ALL);
    setCity(ALL);
    setMinPrice('');
    setMaxPrice('');
    setMinArea('');
    setMaxArea('');
    setPage(1);
  }

  const moneyLabel = (raw: string) => {
    const value = Number(raw);
    return Number.isFinite(value) && raw.trim() ? formatMoney(value, currency, rates, { compact: true }) : raw.trim();
  };
  const areaLabel = (raw: string) => {
    const value = Number(raw);
    return Number.isFinite(value) && raw.trim() ? formatArea(value) : raw.trim();
  };

  // The website's ActiveChip row — every applied filter, each individually removable.
  const activeChips: { key: string; label: string; remove: () => void }[] = [];
  if (debounced) {
    activeChips.push({
      key: 'q',
      label: `"${debounced}"`,
      remove: () => {
        setQuery('');
        setDebounced('');
        setPage(1);
      },
    });
  }
  if (city) activeChips.push({ key: 'city', label: city.replace(/-/g, ' '), remove: () => { setCity(ALL); setPage(1); } });
  if (propertyType) {
    activeChips.push({
      key: 'propertyType',
      label: labelOf(propertyType, PROP_LABELS, t),
      remove: () => { setPropertyType(ALL); setPage(1); },
    });
  }
  if (listingType) {
    activeChips.push({
      key: 'listingType',
      label: labelOf(listingType, LISTING_LABELS, t),
      remove: () => { setListingType(ALL); setPage(1); },
    });
  }
  if (bedrooms) activeChips.push({ key: 'bedrooms', label: `${bedrooms} ${t('explore.bedrooms')}`, remove: () => { setBedrooms(ALL); setPage(1); } });
  if (minPrice.trim()) activeChips.push({ key: 'minPrice', label: `${t('explore.min')} ${moneyLabel(minPrice)}`, remove: () => { setMinPrice(''); setPage(1); } });
  if (maxPrice.trim()) activeChips.push({ key: 'maxPrice', label: `${t('explore.max')} ${moneyLabel(maxPrice)}`, remove: () => { setMaxPrice(''); setPage(1); } });
  if (minArea.trim()) activeChips.push({ key: 'minArea', label: `${t('explore.min')} ${areaLabel(minArea)}`, remove: () => { setMinArea(''); setPage(1); } });
  if (maxArea.trim()) activeChips.push({ key: 'maxArea', label: `${t('explore.max')} ${areaLabel(maxArea)}`, remove: () => { setMaxArea(''); setPage(1); } });

  if (loading) return <Loading label={t('common.loading')} />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} scroll={mapActive ? false : true}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={kind === 'projects' ? t('explore.searchProjects') : t('explore.searchUnits')}
      />
      {showSuggest ? (
        <View style={styles.suggestBox}>
          {suggestPending || suggestApi.loading ? (
            <View style={styles.suggestLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} accessibilityLabel={t('common.loading')} />
            </View>
          ) : null}
          {suggestItems.map((item) => {
            const displayName = localized(item.name, item.nameArabic);
            const lowest = lowestPriceOf(item);
            const detail = [
              localized(item.city?.name, item.city?.nameArabic),
              lowest ? `${t('explore.from')} ${formatMoney(lowest, currency, rates, { compact: true })}` : null,
            ].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSuggestDismissed(true);
                  router.push(`/project/${item.slug}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={displayName}
                style={({ pressed }) => [styles.suggestRow, row, pressed && styles.suggestRowPressed]}>
                <SuggestCover uri={item.coverImage} citySlug={slugifyCityName(item.city?.name)} />
                <View style={styles.suggestText}>
                  <HighlightName name={displayName} term={suggestTerm} />
                  {detail ? (
                    <Text style={[styles.suggestDetail, align]} numberOfLines={1}>
                      {detail}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          {showSuggestEmpty ? (
            <Pressable
              onPress={() => setSuggestDismissed(true)}
              accessibilityRole="button"
              accessibilityLabel={t('explore.suggestEmpty')}
              style={({ pressed }) => [styles.suggestEmptyRow, pressed && styles.suggestRowPressed]}>
              <Text style={[styles.suggestEmptyText, align]}>{t('explore.suggestEmpty')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={[styles.hint, align]}>{t('explore.searchHint')}</Text>

      <View style={[styles.toolbar, row]}>
        <Chip label={t('explore.projects')} selected={kind === 'projects'} onPress={() => setKind('projects')} />
        <Chip label={t('explore.units')} selected={kind === 'units'} onPress={() => { setKind('units'); setView('list'); }} />
        <Chip
          label={activeFilters ? `${t('explore.filtersActive')} (${activeFilters})` : t('explore.moreFilters')}
          selected={showFilters}
          onPress={() => setShowFilters((open) => !open)}
        />
      </View>
      <Text style={[styles.hint, align]}>{t('explore.filtersHint')}</Text>

      {showFilters ? (
        <View style={styles.panel}>
          <Field
            label={`${t('explore.areaRange')} · ${t('explore.min')}`}
            value={minArea}
            onChangeText={(next) => {
              setMinArea(next);
              setPage(1);
            }}
            keyboardType="numeric"
          />
          <Field
            label={`${t('explore.areaRange')} · ${t('explore.max')}`}
            value={maxArea}
            onChangeText={(next) => {
              setMaxArea(next);
              setPage(1);
            }}
            keyboardType="numeric"
          />

          <Text style={styles.groupLabel}>{t('explore.type')}</Text>
          <View style={styles.wrap}>
            <Chip label={t('explore.anyType')} selected={!propertyType} onPress={() => { setPropertyType(ALL); setPage(1); }} />
            {PROPERTY_TYPES.map((value) => (
              <Chip
                key={value}
                label={t(`prop.${value}` as MessageKey)}
                selected={propertyType === value}
                onPress={() => { setPropertyType(propertyType === value ? ALL : value); setPage(1); }}
              />
            ))}
          </View>

          <Text style={styles.groupLabel}>{t('explore.listing')}</Text>
          <View style={styles.wrap}>
            <Chip label={t('explore.anyListing')} selected={!listingType} onPress={() => { setListingType(ALL); setPage(1); }} />
            {LISTING_TYPES.map((value) => (
              <Chip
                key={value}
                label={t(`list.${value}` as MessageKey)}
                selected={listingType === value}
                onPress={() => { setListingType(listingType === value ? ALL : value); setPage(1); }}
              />
            ))}
          </View>

          <Text style={styles.groupLabel}>{t('explore.bedrooms')}</Text>
          <View style={styles.wrap}>
            <Chip label={t('explore.anyBedrooms')} selected={!bedrooms} onPress={() => { setBedrooms(ALL); setPage(1); }} />
            {['1', '2', '3', '4', '5'].map((value) => (
              <Chip
                key={value}
                label={`${value}+`}
                selected={bedrooms === value}
                onPress={() => { setBedrooms(bedrooms === value ? ALL : value); setPage(1); }}
              />
            ))}
          </View>

          <Text style={styles.groupLabel}>{t('explore.city')}</Text>
          <View style={styles.wrap}>
            <Chip label={t('explore.anyCity')} selected={!city} onPress={() => { setCity(ALL); setPage(1); }} />
            {CITIES.map((value) => (
              <Chip
                key={value}
                label={value.replace(/-/g, ' ')}
                selected={city === value}
                onPress={() => { setCity(city === value ? ALL : value); setPage(1); }}
              />
            ))}
          </View>

          <Text style={styles.groupLabel}>{t('explore.price')}</Text>
          <View style={[styles.priceInputs, row]}>
            <View style={styles.priceField}>
              <Field
                label={t('explore.minPrice')}
                value={minPrice}
                onChangeText={(next) => {
                  setMinPrice(next);
                  setPage(1);
                }}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
            <View style={styles.priceField}>
              <Field
                label={t('explore.maxPrice')}
                value={maxPrice}
                onChangeText={(next) => {
                  setMaxPrice(next);
                  setPage(1);
                }}
                keyboardType="numeric"
                placeholder="∞"
              />
            </View>
          </View>
          <View style={styles.wrap}>
            <Chip
              label={t('explore.anyPrice')}
              selected={!minPrice.trim() && !maxPrice.trim()}
              onPress={() => { setMinPrice(''); setMaxPrice(''); setPage(1); }}
            />
            {PRICE_BANDS.map(([min, max], index) => {
              const active = minPrice.trim() === min && maxPrice.trim() === max;
              return (
                <Chip
                  key={index}
                  label={
                    max
                      ? `< ${formatMoney(Number(max), currency, rates, { compact: true })}`
                      : `> ${formatMoney(Number(min), currency, rates, { compact: true })}`
                  }
                  selected={active}
                  onPress={() => {
                    setMinPrice(active ? '' : min);
                    setMaxPrice(active ? '' : max);
                    setPage(1);
                  }}
                />
              );
            })}
          </View>

          <Chip label={t('common.clearAll')} onPress={resetFilters} />
        </View>
      ) : null}

      {/* Applied filters, each one removable on its own — the site's ActiveChip row. */}
      {activeChips.length > 0 ? (
        <View style={[styles.activeRow, row]}>
          <Text style={[styles.activeHeading, align]}>{t('explore.filters')}:</Text>
          {activeChips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={chip.remove}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${chip.label} — ${t('explore.removeFilter')}`}
              style={({ pressed }) => [styles.activeChip, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.activeChipText, align]}>{chip.label}</Text>
              <Ionicons name="close" size={12} color={theme.mutedForeground} />
            </Pressable>
          ))}
          <Pressable onPress={resetFilters} hitSlop={8}>
            <Text style={[styles.clearAll, align]}>{t('common.clearAll')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.hint, align]}>{t('explore.sortHint')}</Text>
      <View style={[styles.toolbar, row]}>
        {SORTS[kind].map((value) => (
          <Chip
            key={value}
            label={t(SORT_LABEL[value])}
            selected={sort === value}
            onPress={() => {
              setSort(value);
              setPage(1);
            }}
          />
        ))}
      </View>

      {/* List/Map toggle — projects only; the units list stays exactly as is. */}
      {kind === 'projects' ? (
        <View style={styles.viewToggle}>
          <Segmented<'list' | 'map'>
            options={[
              { value: 'list', label: t('explore.list') },
              { value: 'map', label: t('explore.map') },
            ]}
            value={view}
            onChange={(next) => setView(next)}
          />
          {view === 'map' ? <Text style={[styles.hint, align]}>{t('explore.mapHint')}</Text> : null}
        </View>
      ) : null}

      <SaveSearchButton filters={saveableFilters} />

      {mapActive ? (
        <View style={styles.mapWrap}>
          {mapApi.loading ? <Loading label={t('common.loading')} /> : null}
          {mapApi.error ? <ErrorBar message={mapApi.error} onRetry={mapApi.refresh} /> : null}
          {!mapApi.loading && !mapApi.error && pins.length === 0 ? (
            <Empty
              title={t('explore.mapEmpty')}
              message={t('explore.mapEmptyHint')}
              action={
                activeFilters || debounced ? (
                  <Btn
                    title={t('explore.clearAndShowAll')}
                    variant="ghost"
                    onPress={() => {
                      resetFilters();
                      setQuery('');
                      setDebounced('');
                    }}
                  />
                ) : undefined
              }
            />
          ) : null}
          {!mapApi.loading && !mapApi.error && pins.length > 0 ? (
            <>
              <Text style={[styles.count, align]}>
                {pins.length.toLocaleString('en-US')} {t('explore.results')}
              </Text>
              <View style={styles.mapFrame}>
                <MapView style={styles.map} initialRegion={EGYPT_REGION}>
                  {pins.map((pin) => {
                    const price =
                      typeof pin.startPrice === 'number'
                        ? formatMoney(pin.startPrice, currency, rates, { compact: true })
                        : '';
                    const cityName = localized(pin.city?.name, pin.city?.nameArabic);
                    const detail = [price, cityName].filter(Boolean).join(' · ');
                    return (
                      <Marker
                        key={pin.id}
                        coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                        title={localized(pin.name, pin.nameArabic)}
                        description={detail || undefined}
                        pinColor={pin.precision === 'exact' ? Estate.gold : theme.gray400}
                        opacity={pin.precision === 'exact' ? 1 : 0.55}
                        onPress={() => router.push(`/project/${pin.slug}`)}
                      />
                    );
                  })}
                </MapView>
              </View>
              <View style={[styles.legend, row]}>
                <View style={[styles.legendDot, { backgroundColor: Estate.gold }]} />
                <Text style={[styles.legendText, align]}>{t('explore.exactPin')}</Text>
                <View style={[styles.legendDot, { backgroundColor: theme.gray400 }]} />
                <Text style={[styles.legendText, align]}>{t('explore.cityPin')}</Text>
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <>
      {data?.total ? (
        <Text style={styles.count}>
          {data.total.toLocaleString('en-US')} {t('explore.results')}
        </Text>
      ) : null}

      {/* Fogg — 2–6 project results: one inline nudge toward compare. The row
          itself never touches the compare tray; the tap navigates with an
          explicit batch the compare screen queues (still manual after that). */}
      {kind === 'projects' && !error && items.length >= 2 && items.length <= 6 ? (
        <CompareNudge items={items} />
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && items.length === 0 ? (
        <Empty
          title={t('explore.noMatch')}
          message={
            activeFilters || debounced ? t('explore.noMatchHint') : t('explore.noProjectsYet')
          }
          action={
            activeFilters || debounced ? (
              <Btn
                title={t('explore.clearAndShowAll')}
                variant="ghost"
                onPress={() => {
                  resetFilters();
                  setQuery('');
                  setDebounced('');
                }}
              />
            ) : undefined
          }
        />
      ) : null}

      <View style={styles.grid}>
        {items.map((item) =>
          kind === 'projects' ? (
            <ProjectCard
              key={item.id}
              item={item}
              currency={currency}
              rates={rates}
              fromLabel={t('explore.from')}
              onPress={() => router.push(`/project/${item.slug}`)}
            />
          ) : (
            <UnitCard
              key={item.id}
              item={item}
              currency={currency}
              rates={rates}
              onPress={() => router.push(`/unit/${item.slug ?? item.id}`)}
            />
          ),
        )}
      </View>

      {totalPages > 1 ? (
        <View style={styles.pager}>
          <Pressable
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}>
            <Text style={styles.pageBtnText}>{t('common.prev')}</Text>
          </Pressable>
          <Text style={styles.pageLabel}>
            {page} / {totalPages}
          </Text>
          <Pressable
            disabled={page >= totalPages}
            onPress={() => setPage((p) => p + 1)}
            style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}>
            <Text style={styles.pageBtnText}>{t('common.next')}</Text>
          </Pressable>
        </View>
      ) : null}
        </>
      )}
    </Screen>
  );
}

/**
 * Suggestion thumbnail — the `Cover` dead-remote pattern restated at 40×40.
 * `imageUrl` passes absolute `http(s)` through and joins site-relative paths
 * onto the API host; the chain is cover → city landmark → GHAYA block, each
 * dead source stepping forward onError.
 */
function SuggestCover({ uri, citySlug }: { uri?: string | null; citySlug?: string | null }) {
  const styles = useStyles();
  const cover = imageUrl(uri);
  const landmark = citySlug ? LANDMARK_IMAGES[citySlug] : undefined;
  const sources = useMemo(
    () =>
      [cover, landmark]
        .filter((s): s is string => !!s)
        .filter((s, i, a) => a.indexOf(s) === i),
    [cover, landmark]
  );
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
  }, [cover, landmark]);
  const src = sources[Math.min(stage, sources.length - 1)];
  if (src && stage < sources.length)
    return (
      <Image source={{ uri: src }} style={styles.suggestThumb} onError={() => setStage((s) => s + 1)} />
    );
  return (
    <View style={[styles.suggestThumb, styles.suggestThumbFallback]}>
      <Text style={styles.suggestThumbText}>GHAYA</Text>
    </View>
  );
}

/** Cheap nested-`<Text>` highlight of the matched substring — inline, RTL-safe. */
function HighlightName({ name, term }: { name: string; term: string }) {
  const styles = useStyles();
  const { align } = useI18n();
  const q = term.trim().toLowerCase();
  const idx = q ? name.toLowerCase().indexOf(q) : -1;
  if (idx < 0) {
    return (
      <Text style={[styles.suggestName, align]} numberOfLines={1}>
        {name}
      </Text>
    );
  }
  return (
    <Text style={[styles.suggestName, align]} numberOfLines={1}>
      {name.slice(0, idx)}
      <Text style={styles.suggestMark}>{name.slice(idx, idx + q.length)}</Text>
      {name.slice(idx + q.length)}
    </Text>
  );
}

function Cover({ uri, citySlug }: { uri?: string | null; citySlug?: string | null }) {
  const styles = useStyles();
  // Display chain: cover → city landmark → GHAYA block. Dead remotes step
  // forward onError instead of rendering grey — home city-card pattern.
  const cover = imageUrl(uri);
  const landmark = citySlug ? LANDMARK_IMAGES[citySlug] : undefined;
  const sources = useMemo(
    () =>
      [cover, landmark]
        .filter((s): s is string => !!s)
        .filter((s, i, a) => a.indexOf(s) === i),
    [cover, landmark]
  );
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
  }, [cover, landmark]);
  const src = sources[Math.min(stage, sources.length - 1)];
  if (src && stage < sources.length)
    return <Image source={{ uri: src }} style={styles.coverImage} onError={() => setStage((s) => s + 1)} />;
  return (
    <View style={[styles.coverImage, styles.coverFallback]}>
      <Text style={styles.coverFallbackText}>GHAYA</Text>
    </View>
  );
}

/**
 * "Save this search" / "Search saved" — the website renders
 * `<SaveSearchButton searchParams={…} />` on its projects page; this posts the
 * same `filters` to `POST /api/saved-searches` and flips once the exact set is
 * already stored.
 */
function SaveSearchButton({ filters }: { filters: Record<string, string | number> }) {
  const styles = useStyles();
  const router = useRouter();
  const { t, align } = useI18n();
  const { status } = useAuth();
  const mutation = useMutation();
  const signedIn = status === 'signedIn';

  const saved = useApi<{ items?: { filters?: Record<string, unknown> }[] }>(
    signedIn ? '/api/saved-searches' : null,
    signedIn
  );

  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const signature = JSON.stringify(filters);
  const already =
    done ||
    (saved.data?.items ?? []).some((item) => JSON.stringify(item.filters ?? {}) === signature);

  if (Object.keys(filters).length === 0) return null;

  // No session: the website offers the same button as a link to /auth/login.
  if (!signedIn) {
    return (
      <View style={styles.saveWrap}>
        <Btn title={t('explore.saveSearch')} variant="ghost" onPress={() => router.push('/login')} />
      </View>
    );
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await mutation.run('/api/saved-searches', 'POST', { filters, notifyNew: true });
      setDone(true);
      setMessage(t('explore.saveSearchNote'));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('explore.saveSearchFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.saveWrap}>
      <Text style={[styles.saveHint, align]}>{t('explore.saveSearchHint')}</Text>
      <Btn
        title={already ? t('explore.searchSaved') : t('explore.saveSearch')}
        variant={already ? 'primary' : 'ghost'}
        busy={busy}
        disabled={already}
        onPress={() => void save()}
      />
      {already ? (
        <Btn
          title={t('explore.manageAlerts')}
          variant="ghost"
          onPress={() => router.push('/(tabs)/saved')}
        />
      ) : null}
      {message ? <Text style={[styles.saveNote, align]}>{message}</Text> : null}
    </View>
  );
}

/** Fogg nudge — rendered only for 2–6 project results with slugs. */
function CompareNudge({ items }: { items: Searchable[] }) {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align } = useI18n();
  const batch = items
    .filter((item) => item.slug)
    .slice(0, 6)
    .map((item) => ({ id: item.id, slug: String(item.slug), name: item.name }));
  if (batch.length < 2) return null;
  return (
    <View style={[styles.nudge, row]}>
      <Text style={[styles.nudgeText, align]}>{t('explore.compareNudge')}</Text>
      <Chip
        label={t('explore.compare')}
        selected={false}
        onPress={() =>
          router.push({ pathname: '/compare', params: { batch: JSON.stringify(batch) } })
        }
      />
    </View>
  );
}

/** Small "+ Compare" chip — the website's CompareToggle on every project card. */
function CompareChip({
  project,
}: {
  project: { id: string; slug?: string | null; name: string };
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const { has, toggle } = useCompare();

  const slug = project.slug;
  if (!slug) return null;

  const active = has(project.id);

  return (
    <Pressable
      onPress={() => {
        const problem = toggle({ id: project.id, slug, name: project.name });
        if (problem) alert(problem);
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? t('explore.added') : t('explore.compare')}
      style={[styles.compareChip, row, active ? styles.compareChipActive : styles.compareChipIdle]}>
      <Ionicons
        name="git-compare"
        size={11}
        color={active ? Estate.navy : theme.controlFg}
      />
      <Text style={[styles.compareChipText, align, active && styles.compareChipTextActive]}>
        {active ? t('explore.added') : t('explore.compare')}
      </Text>
    </Pressable>
  );
}

/** The three cheapest available units decide the card's "from" price. */
function lowestPriceOf(item: Searchable): number | null {
  const prices = (item.units ?? [])
    .map((unit) => Number(unit.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length > 0) return Math.min(...prices);
  return typeof item.startPrice === 'number' ? item.startPrice : null;
}

/** Server-computed `isNewLaunch`, else the website's 30-day rule. */
function isNewLaunchOf(item: Searchable): boolean {
  if (typeof item.isNewLaunch === 'boolean') return item.isNewLaunch;
  if (!item.createdAt) return false;
  const created = Date.parse(item.createdAt);
  return Number.isFinite(created) && Date.now() - created < 30 * 24 * 60 * 60 * 1000;
}

function parsePropertyTypes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string').slice(0, 3);
    }
  } catch {
    // Not JSON — nothing to chip.
  }
  return [];
}

function ProjectCard({
  item,
  currency,
  rates,
  fromLabel,
  onPress,
}: {
  item: Searchable;
  currency: CurrencyCode;
  rates: Record<CurrencyCode, number>;
  fromLabel: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { t, row } = useI18n();
  const { t: theme } = useTheme();
  const fonts = useAppFonts();
  const location = [item.city?.name, item.governorate?.name].filter(Boolean).join(', ');
  const lowestPrice = lowestPriceOf(item);
  const types = parsePropertyTypes(item.propertyTypes);
  const completion =
    typeof item.completionPercent === 'number' && item.completionPercent > 0
      ? Math.min(100, Math.round(item.completionPercent))
      : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.cover}>
        <Cover uri={item.coverImage} citySlug={slugifyCityName(item.city?.name)} />
        {item.status ? (
          <View style={styles.coverBadge}>
            <Badge tone={item.status === 'AVAILABLE' ? 'green' : 'gold'}>
              {String(item.status).replace(/_/g, ' ')}
            </Badge>
          </View>
        ) : null}
        {isNewLaunchOf(item) ? (
          <View style={styles.coverBadgeNew}>
            <Badge tone="gold">{t('explore.new')}</Badge>
          </View>
        ) : null}
        {completion !== null ? (
          <View style={styles.progress}>
            <View style={[styles.progressLabels, row]}>
              <Text style={styles.progressLabel}>{t('explore.construction')}</Text>
              <Text style={styles.progressLabel}>{completion}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${completion}%` }]} />
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBody}>
        <Text style={[styles.name, fonts.displayBold]} numberOfLines={1}>
          {item.name}
        </Text>
        {location ? (
          <Text style={styles.location} numberOfLines={1}>
            {location}
          </Text>
        ) : null}
        {types.length > 0 ? (
          <View style={[styles.typeChips, row]}>
            {types.map((type) => (
              <View key={type} style={styles.typeChip}>
                <Text style={styles.typeChipText}>{labelOf(type, PROP_LABELS, t)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.price}>
          {formatMoney(lowestPrice, currency, rates, { compact: true })}
          {lowestPrice ? <Text style={styles.priceSub}> {fromLabel}</Text> : null}
        </Text>
        {item.developer?.companyName ? (
          <View style={[styles.devRow, row]}>
            <Text style={styles.developer} numberOfLines={1}>
              {item.developer.companyName}
            </Text>
            {item.developer.isVerified ? (
              <Ionicons
                name="checkmark-circle"
                size={13}
                color={theme.infoFg}
                accessibilityLabel={t('explore.verified')}
              />
            ) : null}
          </View>
        ) : null}
        <View style={[styles.cardStats, row]}>
          <CompareChip project={{ id: item.id, slug: item.slug, name: item.name }} />
          <View style={styles.stat}>
            <Ionicons
              name="eye-outline"
              size={12}
              color={theme.mutedForeground}
              accessibilityLabel={t('explore.views')}
            />
            <Text style={styles.statText}>{(item.viewCount ?? 0).toLocaleString('en-US')}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons
              name="heart-outline"
              size={12}
              color={theme.mutedForeground}
              accessibilityLabel={t('explore.favsCount')}
            />
            <Text style={styles.statText}>{(item.favoriteCount ?? 0).toLocaleString('en-US')}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function UnitCard({
  item,
  currency,
  rates,
  onPress,
}: {
  item: Searchable;
  currency: CurrencyCode;
  rates: Record<CurrencyCode, number>;
  onPress: () => void;
}) {
  const styles = useStyles();
  const fonts = useAppFonts();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.cover}>
        <Cover uri={item.project?.coverImage ?? item.coverImage} />
        <View style={styles.coverBadge}>
          <Badge tone={item.status === 'AVAILABLE' ? 'green' : item.status === 'SOLD' ? 'red' : 'gold'}>
            {humanise(item.status ?? 'AVAILABLE')}
          </Badge>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={[styles.name, fonts.displayBold]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.location} numberOfLines={1}>
          {item.project?.name ?? ''}
        </Text>
        <Text style={styles.location} numberOfLines={1}>
          {[item.unitType ? humanise(item.unitType) : null, item.bedrooms ? `${item.bedrooms} bed` : null, item.area ? formatArea(item.area) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text style={styles.price}>{formatMoney(item.price, currency, rates, { compact: true })}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    toolbar: { flexWrap: 'wrap', gap: 8 },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    panel: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      gap: 6,
      backgroundColor: t.card,
    },
    groupLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '700', marginTop: 6 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    // Free-form min/max price — the website's advanced panel takes raw numbers.
    priceInputs: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
    priceField: { flex: 1 },

    // Applied-filter chips — `border-estate-navy/10` row with an ✕ per filter.
    activeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    activeHeading: { color: t.mutedForeground, fontSize: 12 },
    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: t.goldBg,
      backgroundColor: t.goldBg,
      borderRadius: Radius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    activeChipText: { color: t.goldFg, fontSize: 12, fontWeight: '600' },
    clearAll: { color: t.dangerFg, fontSize: 12, fontWeight: '600' },

    // "Save this search" — mirrors the outlined-gold pill on /projects.
    saveWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    saveHint: { color: t.mutedForeground, fontSize: 12, width: '100%' },
    saveNote: { color: t.mutedForeground, fontSize: 12, width: '100%' },

    // Fogg nudge — one inline row toward compare for small result sets.
    nudge: {
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.goldBg,
      backgroundColor: t.goldBg,
      borderRadius: Radius.lg,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    nudgeText: { color: t.goldFg, fontSize: 13, fontWeight: '600', flex: 1 },

    // "+ Compare" chip — the site's CompareToggle.
    compareChip: {
      alignItems: 'center',
      gap: 4,
      borderRadius: Radius.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    compareChipIdle: { backgroundColor: t.card, borderWidth: 1, borderColor: t.controlBorder },
    compareChipActive: { backgroundColor: Estate.gold },
    compareChipText: { color: t.controlFg, fontSize: 10, fontWeight: '700' },
    compareChipTextActive: { color: Estate.navy },

    count: { color: t.mutedForeground, fontSize: 14 },
    // Live project suggestions — inline box under the search bar (tap only,
    // no keyboard nav on mobile). Errors never render here: silent by design.
    suggestBox: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      overflow: 'hidden',
    },
    suggestLoadingRow: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    suggestRow: { alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
    suggestRowPressed: { opacity: 0.7 },
    suggestText: { flex: 1, gap: 1 },
    suggestName: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    suggestMark: { color: t.primary, fontWeight: '800' },
    suggestDetail: { color: t.mutedForeground, fontSize: 12 },
    suggestThumb: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: t.muted },
    suggestThumbFallback: { alignItems: 'center', justifyContent: 'center' },
    suggestThumbText: { color: t.primary, fontWeight: '800', letterSpacing: 1, fontSize: 8 },
    suggestEmptyRow: { paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center' },
    suggestEmptyText: { color: t.mutedForeground, fontSize: 13, fontWeight: '600' },
    // List/Map toggle — projects only; `Segmented` already handles light+dark.
    viewToggle: { gap: 4 },
    // Map view — fixed height so gestures stay on the map, not the scroller
    // (the screen renders non-scrolling in map mode).
    mapWrap: { gap: 8 },
    mapFrame: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xxl,
      overflow: 'hidden',
    },
    map: { width: '100%', height: 420 },
    // Exact (gold) vs city-centroid (dimmed grey) pins.
    legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { color: t.mutedForeground, fontSize: 12, marginEnd: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    // Image card — `rounded-2xl` on the site, so `Radius.xxl`, with the
    // luxury `.arch-card` top (12rem radii clamp to a full arch, like the CSS)
    // and its hairline gold frame.
    card: {
      width: '48%',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.archBorder,
      borderRadius: Radius.xxl,
      borderTopLeftRadius: 192,
      borderTopRightRadius: 192,
      overflow: 'hidden',
    },
    cover: { position: 'relative' },
    coverImage: { width: '100%', height: 110, backgroundColor: t.muted },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    coverFallbackText: { color: t.primary, fontWeight: '800', letterSpacing: 3, fontSize: 12 },
    coverBadge: { position: 'absolute', top: 8, left: 8 },
    // "New" launch badge sits on the opposite corner of the status pill.
    coverBadgeNew: { position: 'absolute', top: 8, right: 8 },
    // Construction progress, overlaid on the bottom of the cover. The site uses
    // a `from-black/50` gradient here; a flat scrim is the RN equivalent.
    progress: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 8,
      paddingTop: 14,
      paddingBottom: 8,
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    progressLabels: { justifyContent: 'space-between' },
    progressLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '600' },
    progressTrack: { height: 4, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.25)' },
    progressFill: { height: 4, borderRadius: Radius.full, backgroundColor: Estate.gold },

    cardBody: { padding: 10, gap: 3 },
    name: { color: t.foreground, fontSize: 15, fontWeight: '700' },
    location: { color: t.mutedForeground, fontSize: 12 },
    typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
    typeChip: {
      backgroundColor: t.chipBg,
      borderRadius: Radius.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    typeChipText: { color: t.mutedForeground, fontSize: 10, fontWeight: '500' },
    price: { color: t.primary, fontSize: 14, fontWeight: '800', marginTop: 2 },
    priceSub: { color: t.mutedForeground, fontSize: 12, fontWeight: '500' },
    devRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    developer: { color: t.mutedForeground, fontSize: 12, flexShrink: 1 },
    // Views / saves / compare — the site's card footer stats.
    cardStats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 6 },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statText: { color: t.mutedForeground, fontSize: 11 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 4 },
    pageBtn: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    pageBtnDisabled: { opacity: 0.4 },
    pageBtnText: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    pageLabel: { color: t.mutedForeground, fontSize: 14 },
  })
);
