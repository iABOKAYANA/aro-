import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Btn, Card, Empty, ErrorBar, Loading, Screen, SectionTitle } from '@/components/ui';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { useCurrency } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { LANDMARK_IMAGES } from '@/lib/landmarks';
import { createStyles } from '@/lib/theme';

type AreaSummary = {
  city: { name: string; nameArabic?: string | null; nameSlug: string };
  projectCount: number;
  minPrice: number | null;
  image?: string | null;
};

type RegionSummary = {
  key: string;
  name: string;
  nameArabic?: string | null;
  projectCount: number;
  minPrice: number | null;
  image?: string | null;
  citySlugs: string[];
};

type UnassignedSummary = {
  count: number;
  projects: { id: string; slug: string; name: string }[];
};

type AreasPayload = {
  areas?: AreaSummary[];
  regions?: RegionSummary[];
  unassigned?: UnassignedSummary | null;
};

type CoverRow = {
  id: string;
  coverImage?: string | null;
  city?: { name?: string | null; nameSlug?: string | null } | null;
};

type ProjectsPayload = {
  projects?: CoverRow[];
};

/**
 * "All areas with projects" directory — every city that has active projects in
 * one place, straight from `GET /api/areas` (uncapped, reused as-is).
 *
 * A regions strip sits on top: tapping a region filters the cities list below
 * to its `citySlugs` (client-side, second tap clears). One image card per
 * city: the api `image` first, a famous landmark second, a listed project's
 * cover third, a neutral block last. Tapping a city opens explore filtered to
 * that city; a second card links across to the Area Guide (`/areas`), which
 * stays the services-facts screen — the two are linked, not merged.
 */
export default function LocationsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, text, localized } = useI18n();
  const { currency, rates } = useCurrency();
  // Landmark/cover photos that failed to load remove themselves (see card).
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});
  // Active region filter — a city-slug set, toggled off on second tap.
  const [regionKey, setRegionKey] = useState<string | null>(null);

  const areasApi = useApi<AreasPayload>('/api/areas');
  // Covers only — counts and prices come from `/api/areas`, so a capped or
  // failed page here never drops a city, it just falls back to landmark art.
  const coversApi = useApi<ProjectsPayload>('/api/projects?limit=50');

  // First listed cover per city slug, for the image → landmark → cover chain.
  const covers = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of coversApi.data?.projects ?? []) {
      const raw = p.city?.nameSlug || p.city?.name;
      if (!raw) continue;
      const slug = raw.toLowerCase().replace(/\s+/g, '-');
      if (map.has(slug)) continue;
      const src = imageUrl(p.coverImage);
      if (src) map.set(slug, src);
    }
    return map;
  }, [coversApi.data]);

  if (areasApi.loading) return <Loading label={t('locations.loading')} />;

  const areas = areasApi.data?.areas ?? [];
  const regions = areasApi.data?.regions ?? [];
  const unassignedCount = areasApi.data?.unassigned?.count ?? 0;
  const activeRegion = regions.find((r) => r.key === regionKey) ?? null;
  const visibleAreas = activeRegion
    ? areas.filter((a) => activeRegion.citySlugs.includes(a.city.nameSlug))
    : areas;
  const refreshing = areasApi.refreshing || coversApi.refreshing;
  const refresh = () => {
    areasApi.refresh();
    coversApi.refresh();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('locations.title') }} />

      <SectionTitle>{t('locations.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('locations.subtitle')}</Text>

      {areasApi.error ? <ErrorBar message={areasApi.error} onRetry={refresh} /> : null}

      {regions.length > 0 ? (
        <View>
          <Text style={[styles.stripTitle, align]}>{t('locations.regionsTitle')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}>
            {regions.map((region) => {
              const selected = region.key === regionKey;
              const name = localized(region.name, region.nameArabic);
              const live = (u?: string | null) => (u && !deadImgs[u] ? u : undefined);
              const imgSrc = live(imageUrl(region.image)) ?? live(LANDMARK_IMAGES[region.key]);
              const price =
                typeof region.minPrice === 'number'
                  ? formatMoney(region.minPrice, currency, rates, { compact: true })
                  : null;
              return (
                <Pressable
                  key={region.key}
                  onPress={() => setRegionKey((prev) => (prev === region.key ? null : region.key))}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.regionPress,
                    selected && styles.regionSelected,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <View style={styles.regionCover}>
                    {imgSrc ? (
                      <Image
                        source={{ uri: imgSrc }}
                        style={styles.regionImg}
                        onError={() =>
                          setDeadImgs((prev) =>
                            prev[imgSrc] ? prev : { ...prev, [imgSrc]: true }
                          )
                        }
                      />
                    ) : (
                      <View style={[styles.regionImg, styles.imgEmpty]} />
                    )}
                  </View>
                  <Text style={[styles.regionName, align]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.regionMeta, align]} numberOfLines={1}>
                    {t('locations.projectsCount').replace('{n}', String(region.projectCount))}
                    {price ? ` · ${price}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {activeRegion ? (
            <Btn
              title={t('locations.clearFilter')}
              variant="ghost"
              onPress={() => setRegionKey(null)}
            />
          ) : null}
        </View>
      ) : null}

      {!areasApi.error && areas.length === 0 ? (
        <Card>
          <Empty
            title={t('locations.empty')}
            message={t('locations.emptyHint')}
            action={
              <Btn
                title={t('locations.browse')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/explore')}
              />
            }
          />
        </Card>
      ) : null}

      {visibleAreas.map((area) => {
        const slug = area.city.nameSlug;
        const name = localized(area.city.name, area.city.nameArabic);
        // Api image first, famous landmark second, project cover third.
        const landmark = LANDMARK_IMAGES[slug];
        const cover = covers.get(slug);
        const live = (u?: string | null) => (u && !deadImgs[u] ? u : undefined);
        const imgSrc = live(imageUrl(area.image)) ?? live(landmark) ?? live(cover);
        const price =
          typeof area.minPrice === 'number'
            ? formatMoney(area.minPrice, currency, rates, { compact: true })
            : null;
        return (
          <Pressable
            key={slug}
            onPress={() => router.push({ pathname: '/(tabs)/explore', params: { city: slug } })}
            accessibilityRole="button"
            accessibilityLabel={name}
            style={({ pressed }) => [styles.cardPress, pressed && { opacity: 0.85 }]}>
            <Card style={styles.card}>
              <View style={styles.cover}>
                {imgSrc ? (
                  <Image
                    source={{ uri: imgSrc }}
                    style={styles.img}
                    onError={() =>
                      setDeadImgs((prev) => (prev[imgSrc] ? prev : { ...prev, [imgSrc]: true }))
                    }
                  />
                ) : (
                  <View style={[styles.img, styles.imgEmpty]} />
                )}
              </View>
              <View style={[styles.body, row]}>
                <View style={styles.bodyText}>
                  <Text style={[styles.name, align]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.count, align]}>
                    {t('locations.projectsCount').replace('{n}', String(area.projectCount))}
                  </Text>
                  {price ? (
                    <Text style={[styles.price, align]}>
                      {t('locations.startingFrom')}: <Text style={styles.priceValue}>{price}</Text>
                    </Text>
                  ) : (
                    <Text style={[styles.noPrice, align]}>{t('locations.noPrice')}</Text>
                  )}
                </View>
                <Text style={[styles.chevron, text]}>›</Text>
              </View>
            </Card>
          </Pressable>
        );
      })}

      {unassignedCount > 0 ? (
        <Text style={[styles.unassigned, align]}>
          {t('locations.unassigned').replace('{n}', String(unassignedCount))}
        </Text>
      ) : null}

      {areas.length > 0 ? (
        <Card>
          <Text style={[styles.guideCta, align]}>{t('locations.guideCta')}</Text>
          <Btn
            title={t('areas.title')}
            variant="ghost"
            onPress={() => router.push('/areas')}
          />
        </Card>
      ) : null}

      {areas.length > 0 ? (
        <Text style={[styles.photoCredit, align]}>{t('locations.photoCredit')}</Text>
      ) : null}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 19, marginBottom: 4 },
    stripTitle: { color: t.foreground, fontSize: 15, fontWeight: '800', marginBottom: 8 },
    strip: { gap: 10, paddingBottom: 4 },
    regionPress: {
      width: 140,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    regionSelected: { borderColor: t.primary, borderWidth: 2 },
    regionCover: { position: 'relative' },
    regionImg: { width: '100%', height: 80 },
    regionName: { color: t.foreground, fontSize: 14, fontWeight: '800', paddingHorizontal: 8, paddingTop: 8 },
    regionMeta: { color: t.mutedForeground, fontSize: 12, paddingHorizontal: 8, paddingBottom: 8 },
    cardPress: { marginBottom: 0 },
    card: { gap: 0, padding: 0, overflow: 'hidden' },
    cover: { position: 'relative' },
    img: { width: '100%', height: 140 },
    imgEmpty: { backgroundColor: t.muted },
    body: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    bodyText: { flex: 1, gap: 2 },
    name: { color: t.foreground, fontSize: 17, fontWeight: '800' },
    count: { color: t.mutedForeground, fontSize: 13 },
    price: { color: t.mutedForeground, fontSize: 13 },
    priceValue: { color: t.primary, fontSize: 14, fontWeight: '800' },
    noPrice: { color: t.mutedForeground, fontSize: 13 },
    chevron: { color: t.mutedForeground, fontSize: 24, fontWeight: '600' },
    unassigned: { color: t.mutedForeground, fontSize: 12, marginTop: 6 },
    guideCta: { color: t.mutedForeground, fontSize: 13, lineHeight: 19, marginBottom: 8 },
    photoCredit: { color: t.mutedForeground, fontSize: 11, marginTop: 6 },
  })
);
