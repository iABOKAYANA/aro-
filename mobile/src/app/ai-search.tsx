import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
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
  SectionTitle,
  type Tone,
} from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatArea, formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/**
 * "Ayn" — the mobile counterpart of the website's `/ai-tools/search`, posting
 * the same sentence to `POST /api/ai/search` so both clients read one
 * catalogue through one extractor.
 *
 * **Nothing here is invented.** The explanation, the extracted filters, both
 * counts and every price are values the route returned; when the catalogue has
 * no match the screen says so rather than suggesting properties that do not
 * exist. `explanation` is the server's own sentence, so it is printed verbatim
 * instead of being rewritten on the device.
 */

/* ── Response shapes, transcribed from src/app/api/ai/search/route.ts ───── */

type ExtractedFilters = {
  budget: { min?: number; max?: number } | null;
  location: string | null;
  bedrooms: number | null;
  propertyType: string | null;
  listingType: string | null;
  deliveryPreference: string | null;
  keywords: string[];
};

/** The cheapest three units the route previews under each project. */
type ProjectUnitPreview = {
  price?: number | null;
  area?: number | null;
  bedrooms?: number | null;
  unitType?: string | null;
};

type AiProject = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  status?: string | null;
  startPrice?: number | null;
  developer?: { companyName?: string | null; isVerified?: boolean } | null;
  governorate?: { name?: string | null } | null;
  city?: { name?: string | null } | null;
  district?: { name?: string | null } | null;
  units?: ProjectUnitPreview[] | null;
  amenities?: { amenity?: { name?: string | null } | null }[] | null;
};

type AiUnit = {
  id: string;
  slug?: string | null;
  name: string;
  nameArabic?: string | null;
  unitType: string;
  listingType: string;
  status: string;
  bedrooms?: number | null;
  area?: number | null;
  price: number;
  project?: { name?: string | null; slug?: string | null } | null;
};

type SearchResponse = {
  query: string;
  extractedFilters: ExtractedFilters;
  explanation: string;
  projects: AiProject[];
  units: AiUnit[];
  totalProjects: number;
  totalUnits: number;
};

/** The subset of the server's `SavedFilters` this screen can fill honestly. */
type SavedFilters = {
  q?: string;
  city?: string;
  propertyType?: string;
  listingType?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
};

const EXAMPLES: MessageKey[] = ['aiSearch.example1', 'aiSearch.example2', 'aiSearch.example3'];

/** Enum → dictionary key, written out so a renamed key fails `tsc`. */
const TYPE_LABELS: Record<string, MessageKey> = {
  APARTMENT: 'aiSearch.type.APARTMENT',
  VILLA: 'aiSearch.type.VILLA',
  TOWNHOUSE: 'aiSearch.type.TOWNHOUSE',
  PENTHOUSE: 'aiSearch.type.PENTHOUSE',
  STUDIO: 'aiSearch.type.STUDIO',
  DUPLEX: 'aiSearch.type.DUPLEX',
  CHALET: 'aiSearch.type.CHALET',
  COMMERCIAL: 'aiSearch.type.COMMERCIAL',
};

const LISTING_LABELS: Record<string, MessageKey> = {
  SALE: 'aiSearch.list.SALE',
  RENT: 'aiSearch.list.RENT',
  RESALE: 'aiSearch.list.RESALE',
  INSTALLMENT: 'aiSearch.list.INSTALLMENT',
};

const DELIVERY_LABELS: Record<string, MessageKey> = {
  delivered: 'aiSearch.delivery.delivered',
  under_construction: 'aiSearch.delivery.underConstruction',
};

/** City slugs the website's own filter bar writes into `/projects?city=…`. */
const CITY_SLUGS = [
  'new-cairo',
  'new-capital',
  'sheikh-zayed',
  '6th-october',
  'ain-sokhna',
  'north-coast',
  'fifth-settlement',
];

function labelFor(
  value: string,
  table: Record<string, MessageKey>,
  t: (key: MessageKey) => string
): string {
  const key = table[value];
  return key ? t(key) : humanise(value);
}

/**
 * Map Ayn's extracted filters onto the body `POST /api/saved-searches` accepts
 * (it sanitises down to q/governorate/city/district/propertyType/listingType
 * plus the numeric price, bedroom and area keys).
 *
 * Deliberately **not** saved: the raw sentence. The saved-search matcher treats
 * `q` as a substring of a project's name/description, so a whole sentence would
 * match nothing and quietly pin the match count to zero. A canonical city slug
 * goes to `city` — the same value the website's "Save this search" button writes
 * from `/projects?city=…` — while any other extracted location (free text such
 * as "maadi") goes to `q`, the only field that can carry it. `deliveryPreference`
 * and `keywords` have no saved-search counterpart, so they are left out rather
 * than forced into the wrong key.
 */
function buildSavedFilters(f: ExtractedFilters): SavedFilters {
  const filters: SavedFilters = {};
  if (f.propertyType) filters.propertyType = f.propertyType;
  if (f.listingType) filters.listingType = f.listingType;
  if (f.bedrooms) filters.bedrooms = f.bedrooms;
  if (f.budget?.min) filters.minPrice = f.budget.min;
  if (f.budget?.max) filters.maxPrice = f.budget.max;
  if (f.location) {
    if (CITY_SLUGS.includes(f.location)) filters.city = f.location;
    else filters.q = f.location;
  }
  return filters;
}

type FilterChip = { key: string; label: string; tone: Tone };

export default function AiSearchScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { session } = useAuth();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const mutation = useMutation();

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const projects = result?.projects ?? [];
  const units = result?.units ?? [];
  const filters = result?.extractedFilters ?? null;
  const savedFilters = filters ? buildSavedFilters(filters) : null;
  const canSave = savedFilters !== null && Object.keys(savedFilters).length > 0;

  /** Prices are stored in EGP; only the display currency changes. */
  const money = (value: number) => formatMoney(value, currency, rates, { compact: true });

  async function run(text: string) {
    const next = text.trim();
    if (!next || busy) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setSaveError(null);
    setSubmitted(next);

    try {
      const data = await apiFetch<SearchResponse>('/api/ai/search', {
        method: 'POST',
        token: session?.token ?? null,
        body: JSON.stringify({ query: next }),
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('aiSearch.unavailable'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!savedFilters || Object.keys(savedFilters).length === 0) return;
    setSaveError(null);
    try {
      await mutation.run('/api/saved-searches', 'POST', {
        name: submitted,
        filters: savedFilters,
        notifyNew: true,
      });
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('aiSearch.saveFailed'));
    }
  }

  // "I understood this as" — only what the extractor actually returned.
  const chips: FilterChip[] = [];
  if (filters) {
    if (filters.budget) {
      const { min, max } = filters.budget;
      const range =
        min && max
          ? `${money(min)} – ${money(max)}`
          : max
            ? `${t('aiSearch.upTo')} ${money(max)}`
            : min
              ? `${t('aiSearch.fromPrice')} ${money(min)}`
              : '';
      if (range) chips.push({ key: 'budget', label: `${t('aiSearch.filterBudget')}: ${range}`, tone: 'gold' });
    }
    if (filters.location) {
      chips.push({
        key: 'location',
        label: `${t('aiSearch.filterLocation')}: ${humanise(filters.location)}`,
        tone: 'muted',
      });
    }
    if (filters.bedrooms) {
      chips.push({
        key: 'bedrooms',
        label: `${t('aiSearch.filterBedrooms')}: ${filters.bedrooms}`,
        tone: 'muted',
      });
    }
    if (filters.propertyType) {
      chips.push({
        key: 'propertyType',
        label: `${t('aiSearch.filterType')}: ${labelFor(filters.propertyType, TYPE_LABELS, t)}`,
        tone: 'muted',
      });
    }
    if (filters.listingType) {
      chips.push({
        key: 'listingType',
        label: `${t('aiSearch.filterListing')}: ${labelFor(filters.listingType, LISTING_LABELS, t)}`,
        tone: 'muted',
      });
    }
    if (filters.deliveryPreference) {
      chips.push({
        key: 'delivery',
        label: `${t('aiSearch.filterDelivery')}: ${labelFor(filters.deliveryPreference, DELIVERY_LABELS, t)}`,
        tone: 'muted',
      });
    }
  }

  // The suggested queries double as the pre-search state — and as the way out
  // of a search that matched nothing.
  const noMatches = result !== null && projects.length === 0 && units.length === 0;
  const showExamples = !busy && (!result || noMatches);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('aiSearch.title') }} />

      <Card style={styles.ask}>
        <Text style={[styles.intro, align]}>{t('aiSearch.subtitle')}</Text>
        <Text style={[styles.hint, align]}>{t('aiSearch.understandsHint')}</Text>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder={t('aiSearch.placeholder')}
          returnKeyType="search"
          editable={!busy}
          onSubmitEditing={() => void run(query)}
        />
        <Btn
          title={t('aiSearch.submit')}
          busy={busy}
          disabled={!query.trim()}
          onPress={() => void run(query)}
        />

        {showExamples ? (
          <View style={styles.examples}>
            <Text style={[styles.examplesLabel, align]}>{t('aiSearch.examples')}</Text>
            <View style={[styles.exampleRow, row]}>
              {EXAMPLES.map((key) => {
                const example = t(key);
                return (
                  <Chip
                    key={key}
                    label={example}
                    selected={false}
                    onPress={() => {
                      setQuery(example);
                      void run(example);
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </Card>

      {error ? <ErrorBar message={error} onRetry={() => void run(submitted || query)} /> : null}

      {busy ? <Loading label={t('aiSearch.searching')} /> : null}

      {!busy && !error && !result ? (
        <Empty title={t('aiSearch.empty')} message={t('aiSearch.emptyHint')} />
      ) : null}

      {result ? (
        <>
          <Card style={styles.summary}>
            <Text style={[styles.summaryTitle, align]}>{t('aiSearch.understood')}</Text>
            <Text style={[styles.explanation, align]}>{result.explanation}</Text>
            {chips.length ? (
              <View style={[styles.chipRow, row]}>
                {chips.map((chip) => (
                  <Badge key={chip.key} tone={chip.tone}>
                    {chip.label}
                  </Badge>
                ))}
              </View>
            ) : null}
          </Card>

          {canSave && !saved ? (
            <>
              <Text style={[styles.hint, align]}>{t('aiSearch.saveHint')}</Text>
              <Btn
                title={t('aiSearch.saveSearch')}
                variant="ghost"
                busy={mutation.busy}
                onPress={() => void save()}
              />
            </>
          ) : null}

          {saved ? (
            <>
              <Text style={[styles.savedNote, align]}>{t('aiSearch.saved')}</Text>
              <Btn
                title={t('saved.savedSearches')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/saved')}
              />
            </>
          ) : null}

          {saveError ? <ErrorBar message={saveError} onRetry={() => void save()} /> : null}

          {projects.length === 0 && units.length === 0 ? (
            <Empty title={t('aiSearch.noResults')} message={t('aiSearch.noResultsHint')} />
          ) : null}

          {projects.length > 0 ? (
            <>
              <SectionTitle action={<Badge tone="gold">{result.totalProjects}</Badge>}>
                {t('aiSearch.projects')}
              </SectionTitle>

              {projects.map((project) => {
                const location = [
                  project.district?.name,
                  project.city?.name,
                  project.governorate?.name,
                ]
                  .filter(Boolean)
                  .join(', ');

                const specs = (project.units ?? [])
                  .slice(0, 2)
                  .map((unit) =>
                    [
                      unit.bedrooms ? `${unit.bedrooms} ${t('aiSearch.beds')}` : null,
                      unit.area ? formatArea(unit.area) : null,
                      unit.price ? money(unit.price) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  )
                  .filter(Boolean);

                const amenities = (project.amenities ?? [])
                  .map((entry) => entry.amenity?.name)
                  .filter((name): name is string => Boolean(name))
                  .slice(0, 3);

                return (
                  <Card key={project.id} style={styles.result}>
                    <Row
                      title={localized(project.name, project.nameArabic)}
                      subtitle={[
                        location,
                        project.status ? humanise(project.status) : null,
                        project.developer?.companyName ?? null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      badge={
                        project.startPrice != null ? (
                          <Badge tone="gold">
                            {`${t('aiSearch.fromPrice')} ${money(project.startPrice)}`}
                          </Badge>
                        ) : undefined
                      }
                      onPress={() => router.push(`/project/${project.slug}`)}
                    />
                    {specs.map((spec, index) => (
                      <Text key={index} style={[styles.spec, align]}>
                        {spec}
                      </Text>
                    ))}
                    {amenities.length ? (
                      <Text style={[styles.spec, align]}>
                        {`${t('aiSearch.amenities')}: ${amenities.join(' · ')}`}
                      </Text>
                    ) : null}
                  </Card>
                );
              })}
            </>
          ) : null}

          {units.length > 0 ? (
            <>
              <SectionTitle action={<Badge tone="gold">{result.totalUnits}</Badge>}>
                {t('aiSearch.units')}
              </SectionTitle>

              <Card style={styles.list}>
                {units.map((unit, index) => (
                  <View key={unit.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      title={localized(unit.name, unit.nameArabic)}
                      subtitle={[
                        unit.project?.name ?? null,
                        unit.bedrooms ? `${unit.bedrooms} ${t('aiSearch.beds')}` : null,
                        unit.area ? formatArea(unit.area) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      badge={<Badge tone="gold">{money(unit.price)}</Badge>}
                      onPress={() => router.push(`/unit/${unit.slug ?? unit.id}`)}
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    ask: { gap: Spacing.sm },
    intro: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    examples: { gap: 6, marginTop: Spacing.xs },
    examplesLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '700' },
    exampleRow: { flexWrap: 'wrap', gap: 8 },

    summary: { gap: 6 },
    summaryTitle: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    explanation: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    chipRow: { flexWrap: 'wrap', gap: 6, marginTop: 2 },
    savedNote: { color: t.goldFg, fontSize: 13, fontWeight: '600' },

    result: { gap: 4 },
    spec: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    list: { gap: 0 },
  })
);
