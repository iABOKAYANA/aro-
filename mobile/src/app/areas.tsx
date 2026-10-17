import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, Card, Empty, ErrorBar, Loading, Screen, SectionTitle } from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { useCurrency } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type AreaSummary = {
  city: { name: string; nameArabic?: string | null; nameSlug: string };
  projectCount: number;
  minPrice: number | null;
  categories: {
    schools: number;
    hospitals: number;
    transport: number;
    malls: number;
    other: number;
  };
};

type AreasPayload = {
  areas?: AreaSummary[];
};

/**
 * Area livability guide — facts only, straight from listed projects.
 *
 * One card per city: how many active projects, the lowest listed start price,
 * and how many nearby schools / hospitals / transport stops / malls those
 * projects report. No scores, no rankings, no advice — just counts.
 *
 * Tapping a city opens explore filtered to that city, like the website's
 * `/projects?city=` links.
 */
export default function AreasScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, text, localized } = useI18n();
  const { currency, rates } = useCurrency();

  const { data, error, loading, refreshing, refresh } = useApi<AreasPayload>('/api/areas');

  if (loading) return <Loading label={t('areas.loading')} />;

  const areas = data?.areas ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('areas.title') }} />

      <SectionTitle>{t('areas.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('areas.subtitle')}</Text>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && areas.length === 0 ? (
        <Card>
          <Empty
            title={t('areas.empty')}
            message={t('areas.emptyHint')}
            action={
              <Btn
                title={t('areas.browse')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/explore')}
              />
            }
          />
        </Card>
      ) : null}

      {areas.map((area) => {
        const name = localized(area.city.name, area.city.nameArabic);
        const cats = area.categories ?? { schools: 0, hospitals: 0, transport: 0, malls: 0, other: 0 };
        const main = [
          { label: t('areas.schools'), value: cats.schools },
          { label: t('areas.hospitals'), value: cats.hospitals },
          { label: t('areas.transport'), value: cats.transport },
          { label: t('areas.malls'), value: cats.malls },
        ];
        const hasServices =
          cats.schools + cats.hospitals + cats.transport + cats.malls + cats.other > 0;
        const price =
          typeof area.minPrice === 'number'
            ? formatMoney(area.minPrice, currency, rates, { compact: true })
            : null;
        return (
          <Card key={area.city.nameSlug} style={styles.card}>
            <View style={[styles.head, row]}>
              <View style={styles.headText}>
                <Text style={[styles.name, align]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.count, align]}>
                  {t('areas.projectsCount').replace('{n}', String(area.projectCount))}
                </Text>
              </View>
            </View>

            <Text style={[styles.price, align]}>
              {price ? (
                <>
                  {t('areas.startingFrom')}: <Text style={styles.priceValue}>{price}</Text>
                </>
              ) : (
                <Text style={styles.noPrice}>{t('areas.noPrice')}</Text>
              )}
            </Text>

            {hasServices ? (
              <View style={styles.grid}>
                {main.map((c) => (
                  <View key={c.label} style={styles.cell}>
                    <Text style={[styles.cellValue, text]}>
                      {c.value.toLocaleString('en-US')}
                    </Text>
                    <Text style={[styles.cellLabel, align]}>{c.label}</Text>
                  </View>
                ))}
                {cats.other > 0 ? (
                  <View style={styles.cell}>
                    <Text style={[styles.cellValue, text]}>
                      {cats.other.toLocaleString('en-US')}
                    </Text>
                    <Text style={[styles.cellLabel, align]}>{t('areas.other')}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.noInfo, align]}>{t('areas.noCategoryInfo')}</Text>
            )}

            <Pressable
              onPress={() =>
                router.push({ pathname: '/(tabs)/explore', params: { city: area.city.nameSlug } })
              }
              style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
              <Text style={styles.linkText}>{t('areas.viewProjects')}</Text>
            </Pressable>
          </Card>
        );
      })}

      {areas.length > 0 ? (
        <Text style={[styles.note, align]}>{t('areas.factsNote')}</Text>
      ) : null}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 19, marginBottom: 4 },
    card: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headText: { flex: 1, gap: 2 },
    name: { color: t.foreground, fontSize: 17, fontWeight: '800' },
    count: { color: t.mutedForeground, fontSize: 13 },
    price: { color: t.mutedForeground, fontSize: 13 },
    priceValue: { color: t.primary, fontSize: 14, fontWeight: '800' },
    noPrice: { color: t.mutedForeground, fontSize: 13 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    cell: {
      flexGrow: 1,
      flexBasis: '45%',
      backgroundColor: t.muted,
      borderRadius: Radius.lg,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 2,
    },
    cellValue: { color: t.foreground, fontSize: 18, fontWeight: '800' },
    cellLabel: { color: t.mutedForeground, fontSize: 12 },
    noInfo: { color: t.mutedForeground, fontSize: 13, lineHeight: 19 },
    link: { alignItems: 'center', paddingVertical: 4 },
    linkText: { color: t.primary, fontSize: 14, fontWeight: '700' },
    note: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
  })
);
