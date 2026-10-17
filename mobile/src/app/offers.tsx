import { Stack, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Btn, Card, Empty, ErrorBar, Loading, Screen, SectionTitle } from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { useCurrency } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { createStyles } from '@/lib/theme';

type OfferPlan = {
  id: string;
  name: string;
  nameArabic?: string | null;
  downPaymentPct: number;
  installmentYears: number;
  cashDiscountPct: number;
  priceBefore: number | null;
  priceAfter: number | null;
  savings: number | null;
};

type Offer = {
  project: {
    id: string;
    slug: string;
    name: string;
    nameArabic?: string | null;
    coverImage?: string | null;
    city?: { name?: string | null; nameArabic?: string | null } | null;
    district?: { name?: string | null; nameArabic?: string | null } | null;
    developer?: { companyName?: string | null } | null;
  };
  plans: OfferPlan[];
};

type OffersPayload = {
  offers?: Offer[];
  total?: number;
};

/**
 * Developer offers radar: every live cash-discount offer — project + plan +
 * discount % + price before/after — from public `GET /api/offers`.
 *
 * Browsing is open, so no auth gate: an anonymous visitor sees the same radar
 * as a signed-in one, like the website's offers page.
 */
export default function OffersScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, text, localized } = useI18n();
  const { currency, rates } = useCurrency();

  const { data, error, loading, refreshing, refresh } = useApi<OffersPayload>('/api/offers?limit=20');

  if (loading) return <Loading label={t('offers.loading')} />;

  const offers = data?.offers ?? [];
  const money = (value: number | null) => formatMoney(value, currency, rates);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('offers.title') }} />

      <SectionTitle>{t('offers.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('offers.subtitle')}</Text>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && offers.length === 0 ? (
        <Card>
          <Empty
            title={t('offers.empty')}
            message={t('offers.emptyHint')}
            action={
              <Btn
                title={t('offers.browse')}
                variant="ghost"
                onPress={() => router.push('/(tabs)/explore')}
              />
            }
          />
        </Card>
      ) : null}

      {offers.map((offer) => {
        const place = [
          offer.project.district
            ? localized(offer.project.district.name, offer.project.district.nameArabic)
            : '',
          offer.project.city
            ? localized(offer.project.city.name, offer.project.city.nameArabic)
            : '',
        ]
          .filter(Boolean)
          .join(', ');
        const src = imageUrl(offer.project.coverImage);
        return (
          <Card key={offer.project.id} style={styles.card}>
            <View style={[styles.head, row]}>
              {src ? (
                <Image source={{ uri: src }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.headText}>
                <Text style={[styles.name, align]} numberOfLines={1}>
                  {localized(offer.project.name, offer.project.nameArabic)}
                </Text>
                {place ? (
                  <Text style={[styles.place, align]} numberOfLines={1}>
                    {place}
                  </Text>
                ) : null}
                {offer.project.developer?.companyName ? (
                  <Text style={[styles.dev, align]} numberOfLines={1}>
                    {offer.project.developer.companyName}
                  </Text>
                ) : null}
              </View>
            </View>

            {offer.plans.map((plan) => (
              <View key={plan.id} style={styles.plan}>
                <View style={[styles.planHead, row]}>
                  <Text style={[styles.planName, align]} numberOfLines={1}>
                    {localized(plan.name, plan.nameArabic)}
                  </Text>
                  <Badge tone="green">
                    {`${t('offers.cashDiscount')} ${Math.round(plan.cashDiscountPct)}%`}
                  </Badge>
                </View>
                <Text style={[styles.terms, align]}>
                  {`${t('offers.downPayment')} ${plan.downPaymentPct}% · ${plan.installmentYears} ${t('offers.years')}`}
                </Text>
                <View style={[styles.prices, row]}>
                  <View style={styles.priceCell}>
                    <Text style={[styles.priceLabel, align]}>{t('offers.before')}</Text>
                    <Text style={[styles.priceBefore, text]}>{money(plan.priceBefore)}</Text>
                  </View>
                  <View style={styles.priceCell}>
                    <Text style={[styles.priceLabel, align]}>{t('offers.after')}</Text>
                    <Text style={[styles.priceAfter, text]}>{money(plan.priceAfter)}</Text>
                  </View>
                  {plan.savings !== null && plan.savings > 0 ? (
                    <View style={styles.priceCell}>
                      <Text style={[styles.priceLabel, align]}>{t('offers.youSave')}</Text>
                      <Text style={[styles.saved, text]}>{money(plan.savings)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}

            <Pressable
              onPress={() => router.push(`/project/${offer.project.slug}`)}
              style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
              <Text style={styles.linkText}>{t('offers.viewProject')}</Text>
            </Pressable>
          </Card>
        );
      })}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 19, marginBottom: 4 },
    card: { gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    thumb: { width: 56, height: 56, borderRadius: Radius.lg, backgroundColor: t.muted },
    thumbEmpty: { backgroundColor: t.muted },
    headText: { flex: 1, gap: 2 },
    name: { color: t.foreground, fontSize: 16, fontWeight: '800' },
    place: { color: t.mutedForeground, fontSize: 13 },
    dev: { color: t.mutedForeground, fontSize: 12 },
    plan: {
      gap: 4,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.border,
      borderRadius: Radius.lg,
      padding: 10,
    },
    planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    planName: { color: t.foreground, fontSize: 15, fontWeight: '700', flexShrink: 1 },
    terms: { color: t.mutedForeground, fontSize: 12 },
    prices: { flexDirection: 'row', gap: 12, marginTop: 2 },
    priceCell: { flex: 1, gap: 1 },
    priceLabel: { color: t.mutedForeground, fontSize: 11 },
    priceBefore: {
      color: t.mutedForeground,
      fontSize: 14,
      fontWeight: '600',
      textDecorationLine: 'line-through',
    },
    priceAfter: { color: t.primary, fontSize: 15, fontWeight: '800' },
    saved: { color: t.successFg, fontSize: 14, fontWeight: '800' },
    link: { alignItems: 'center', paddingVertical: 4 },
    linkText: { color: t.primary, fontSize: 14, fontWeight: '700' },
  })
);
