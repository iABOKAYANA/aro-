import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { Btn, Card, Chip, Divider, ErrorBar, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { ApiError, apiFetch } from '@/api/client';
import { useI18n } from '@/i18n';
import { formatArea, formatMoney } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/**
 * Price estimator — the same heuristic as
 * `src/app/(public)/ai-tools/price-estimator/page.tsx`, plus the same
 * `GET /api/units` comparable sweep, so the app and the website quote the same
 * number for the same inputs.
 */

type Comparable = {
  id: string;
  name?: string;
  area?: number | null;
  price?: number | null;
  project?: { name: string; slug: string } | null;
};

type Result = {
  estimatedPrice: number;
  pricePerSqm: number;
  min: number;
  max: number;
  factors: { label: string; value: string }[];
  comparables: Comparable[];
};

const BEDROOMS = ['', '1', '2', '3', '4', '5'];

function parseNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function PriceEstimatorScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { currency, rates } = useCurrency();
  const { t, row, text, align } = useI18n();

  const [area, setArea] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [location, setLocation] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function estimate() {
    const areaNum = parseNumber(area);
    if (areaNum <= 0 || busy) return;

    setBusy(true);
    setError(null);

    // The website's own baseline: 45k EGP/m², +10k for New Cairo.
    const avgPricePerSqm = 45_000 + (location.toLowerCase().includes('new cairo') ? 10_000 : 0);
    const basePrice = areaNum * avgPricePerSqm;
    const bedroomMultiplier = bedrooms ? 1 + (parseNumber(bedrooms) - 1) * 0.15 : 1;
    const estimatedPrice = basePrice * bedroomMultiplier;

    let comparables: Comparable[] = [];
    try {
      const data = await apiFetch<{ units?: Comparable[] }>('/api/units');
      comparables = (data.units ?? [])
        .filter((unit) => (unit.area ?? 0) > areaNum * 0.8 && (unit.area ?? 0) < areaNum * 1.2)
        .slice(0, 5);
    } catch (e) {
      // Comparables are a nice-to-have: a failed sweep still shows the estimate.
      if (e instanceof ApiError && e.status === 0) {
        setError(t('calculators.estError'));
      }
    }

    setResult({
      estimatedPrice,
      pricePerSqm: estimatedPrice / areaNum,
      min: estimatedPrice * 0.85,
      max: estimatedPrice * 1.15,
      factors: [
        { label: t('calculators.factorLocation'), value: location ? '+10%' : t('calculators.standard') },
        {
          label: t('calculators.factorBedrooms'),
          value: bedrooms
            ? `${bedrooms} ${t('calculators.br')} (+${((bedroomMultiplier - 1) * 100).toFixed(0)}%)`
            : t('calculators.any'),
        },
        { label: t('calculators.marketTrend'), value: t('calculators.stable') },
      ],
      comparables,
    });
    setBusy(false);
  }

  const money = (valueInEgp: number) => formatMoney(valueInEgp, currency, rates);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('calculators.estimator') }} />

      <SectionTitle>{t('calculators.propertyDetails')}</SectionTitle>
      <Text style={[styles.intro, align]}>{t('calculators.estimatorIntro')}</Text>
      <Card>
        <Field
          label={t('calculators.areaSqm')}
          value={area}
          onChangeText={setArea}
          keyboardType="numeric"
          placeholder={t('calculators.areaExample')}
        />
        <Text style={[styles.hint, align]}>{t('calculators.hintArea')}</Text>
        <Text style={[styles.label, align]}>{t('calculators.bedrooms')}</Text>
        <Text style={[styles.hint, align]}>{t('calculators.hintBedrooms')}</Text>
        <View style={[styles.chips, row]}>
          {BEDROOMS.map((value) => (
            <Chip
              key={value || 'any'}
              label={value ? `${value}${value === '5' ? '+' : ''}` : t('calculators.any')}
              selected={bedrooms === value}
              onPress={() => setBedrooms(value)}
            />
          ))}
        </View>
        <Field
          label={t('calculators.location')}
          value={location}
          onChangeText={setLocation}
          placeholder={t('calculators.locationExample')}
        />
        <Text style={[styles.hint, align]}>{t('calculators.hintLocation')}</Text>
      </Card>

      {error ? <ErrorBar message={error} /> : null}

      <Btn
        title={busy ? t('calculators.estimating') : t('calculators.estimatePrice')}
        busy={busy}
        disabled={parseNumber(area) <= 0}
        onPress={estimate}
      />

      {result ? (
        <>
          <SectionTitle>{t('calculators.estValue')}</SectionTitle>
          <Text style={[styles.intro, align]}>{t('calculators.estValueHint')}</Text>
          <Card>
            <Text style={[styles.big, text]}>{money(result.estimatedPrice)}</Text>
            <Text style={[styles.range, text]}>
              {t('calculators.range')} {money(result.min)} – {money(result.max)}
            </Text>
            <Text style={[styles.range, text]}>
              {money(result.pricePerSqm)} {t('calculators.perSqm')}
            </Text>
          </Card>

          <SectionTitle>{t('calculators.factors')}</SectionTitle>
          <Card>
            {result.factors.map((factor, index) => (
              <View key={factor.label}>
                {index > 0 ? <Divider /> : null}
                <Row title={factor.value} subtitle={factor.label} />
              </View>
            ))}
          </Card>

          {result.comparables.length > 0 ? (
            <>
              <SectionTitle>{t('calculators.comparables')}</SectionTitle>
              <Text style={[styles.intro, align]}>{t('calculators.comparablesHint')}</Text>
              <Card>
                {result.comparables.map((unit, index) => (
                  <View key={unit.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      title={unit.project?.name ?? unit.name ?? t('common.unit')}
                      subtitle={[
                        unit.area ? formatArea(unit.area) : null,
                        unit.price ? money(unit.price) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      onPress={
                        unit.project?.slug
                          ? () => router.push(`/project/${unit.project!.slug}`)
                          : undefined
                      }
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <Text style={[styles.note, align]}>{t('calculators.estimatorNote')}</Text>
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    label: { color: t.mutedForeground, fontSize: 14, fontWeight: '600' },
    intro: { color: t.mutedForeground, fontSize: 13, lineHeight: 19 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    big: { color: t.primary, fontSize: 32, fontWeight: '800', textAlign: 'center' },
    range: { color: t.mutedForeground, fontSize: 14, textAlign: 'center' },
    note: { color: t.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 4 },
  }),
);
