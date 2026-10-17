import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Divider, Empty, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/**
 * "Rent or buy?" — compares total rent paid (growing every year) against the
 * total buying outlay (down payment + installments) over the same window, and
 * names the first year buying pulls ahead.
 *
 * Math (identical on the website's `ai-tools/rentbuy` page):
 * - monthly installment = the mortgage annuity on (price − down) over the
 *   same `years` window, so the loan always ends with the comparison
 * - rentCum(y) = monthlyRent × 12 × Σ(1+g)^(i−1) for i in 1..y
 * - buyCum(y) = down + monthly × 12 × y
 * - homeValue = price × (1+a)^N — informational only, never subtracted
 * - breakeven = first y ≤ N with buyCum(y) ≤ rentCum(y), else beyond N years
 * - verdict ties when |rent − buy| ≤ 1% of the bigger side
 *
 * Inputs are entered in the *display* currency and converted to the EGP the
 * maths is denominated in, then presented back in the display currency — the
 * same rule `mobile/src/app/mortgage.tsx` follows.
 */

/** Mortgage defaults — read from `mobile/src/app/mortgage.tsx` + website `mortgage-calculator.tsx`. */
const DEFAULT_RATE = 19;
const DEFAULT_YEARS = 15;
/** Cairo-guess defaults for the two growth inputs. */
const DEFAULT_RENT_GROWTH = 10;
const DEFAULT_APPRECIATION = 15;
/** Verdict ties when the gap is at most this share of the bigger side. */
const TIE_PCT = 1;

function parseNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Annuity formula — the identical one the mortgage calculator uses. */
function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export default function RentBuyScreen() {
  const styles = useStyles();
  const { currency, rates } = useCurrency();
  const { t, row, align } = useI18n();

  // Rent + price start empty so the empty state shows on open; the rest open
  // on the shared defaults.
  const [rent, setRent] = useState('');
  const [price, setPrice] = useState('');
  const [down, setDown] = useState('');
  const [years, setYears] = useState(String(DEFAULT_YEARS));
  const [rate, setRate] = useState(String(DEFAULT_RATE));
  const [rentGrowth, setRentGrowth] = useState(String(DEFAULT_RENT_GROWTH));
  const [appreciation, setAppreciation] = useState(String(DEFAULT_APPRECIATION));

  const calc = useMemo(() => {
    const toEgp = (display: number) => (currency === 'EGP' ? display : display * rates[currency]);
    const rentEgp = toEgp(parseNumber(rent));
    const priceEgp = toEgp(parseNumber(price));
    // A down payment above the price is just capped — the loan cannot go negative.
    const downEgp = Math.min(toEgp(parseNumber(down)), Math.max(0, priceEgp));
    const horizon = clamp(parseNumber(years) || DEFAULT_YEARS, 1, 30);
    const annual = clamp(parseNumber(rate) || 0, 0, 35);
    const growth = clamp(parseNumber(rentGrowth) || 0, 0, 50) / 100;
    const appr = clamp(parseNumber(appreciation) || 0, 0, 50) / 100;

    const hasInputs = rentEgp > 0 && priceEgp > 0;
    const loan = Math.max(0, priceEgp - downEgp);
    const monthly = monthlyPayment(loan, annual, horizon);

    let rentCum = 0;
    let breakeven: number | null = null;
    for (let y = 1; y <= Math.round(horizon); y++) {
      rentCum += rentEgp * 12 * Math.pow(1 + growth, y - 1);
      if (breakeven === null && downEgp + monthly * 12 * y <= rentCum) breakeven = y;
    }
    const outOfPocket = downEgp + monthly * 12 * Math.round(horizon);
    const homeValue = priceEgp * Math.pow(1 + appr, horizon);
    const gap = rentCum - outOfPocket;
    const tied = Math.abs(gap) <= (TIE_PCT / 100) * Math.max(rentCum, outOfPocket);
    const verdict: 'buy' | 'rent' | 'tie' = tied ? 'tie' : gap > 0 ? 'buy' : 'rent';

    return { hasInputs, horizon, monthly, rentCum, outOfPocket, homeValue, gap, verdict, breakeven };
  }, [rent, price, down, years, rate, rentGrowth, appreciation, currency, rates]);

  const money = (valueInEgp: number) => formatMoney(valueInEgp, currency, rates);
  const verdictTone = calc.verdict === 'buy' ? 'green' : calc.verdict === 'rent' ? 'blue' : 'gold';
  const verdictKey =
    calc.verdict === 'buy' ? 'rentbuy.verdictBuy' : calc.verdict === 'rent' ? 'rentbuy.verdictRent' : 'rentbuy.verdictTie';

  return (
    <Screen>
      <SectionTitle>{t('rentbuy.title')}</SectionTitle>
      <Text style={[styles.intro, align]}>{t('rentbuy.intro')}</Text>

      <Card>
        <Field
          label={`${t('rentbuy.rent')} (${currency})`}
          value={rent}
          onChangeText={setRent}
          keyboardType="numeric"
          placeholder={t('rentbuy.rentPlaceholder')}
        />
        <Text style={[styles.hint, align]}>{t('rentbuy.hintRent')}</Text>
        <Field
          label={`${t('rentbuy.price')} (${currency})`}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder={t('rentbuy.pricePlaceholder')}
        />
        <Text style={[styles.hint, align]}>{t('rentbuy.hintPrice')}</Text>
        <Field
          label={`${t('rentbuy.down')} (${currency})`}
          value={down}
          onChangeText={setDown}
          keyboardType="numeric"
          placeholder={t('rentbuy.downPlaceholder')}
        />
        <Text style={[styles.hint, align]}>{t('rentbuy.hintDown')}</Text>
        <View style={[styles.twoCol, row]}>
          <View style={styles.half}>
            <Field label={t('rentbuy.years')} value={years} onChangeText={setYears} keyboardType="numeric" />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintYears')}</Text>
          </View>
          <View style={styles.half}>
            <Field label={t('rentbuy.rate')} value={rate} onChangeText={setRate} keyboardType="numeric" />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintRate')}</Text>
          </View>
        </View>
        <View style={[styles.twoCol, row]}>
          <View style={styles.half}>
            <Field
              label={t('rentbuy.rentGrowth')}
              value={rentGrowth}
              onChangeText={setRentGrowth}
              keyboardType="numeric"
            />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintRentGrowth')}</Text>
          </View>
          <View style={styles.half}>
            <Field
              label={t('rentbuy.appreciation')}
              value={appreciation}
              onChangeText={setAppreciation}
              keyboardType="numeric"
            />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintAppreciation')}</Text>
          </View>
        </View>
      </Card>

      {!calc.hasInputs ? (
        <Card>
          <Empty title={t('rentbuy.enterInputs')} message={t('rentbuy.enterInputsHint')} />
        </Card>
      ) : (
        <>
          <SectionTitle>{t('rentbuy.title')}</SectionTitle>
          <Text style={[styles.intro, align]}>{t('rentbuy.resultsHint')}</Text>
          <Card>
            <View style={[styles.verdictHead, row]}>
              <Badge tone={verdictTone}>
                {calc.verdict === 'buy' ? '✓' : calc.verdict === 'rent' ? '−' : '='}
              </Badge>
              <Text style={[styles.verdict, align]}>{t(verdictKey)}</Text>
            </View>
            <Text style={[styles.hint, align]}>
              {calc.breakeven === null
                ? t('rentbuy.breakevenBeyond')
                : `${t('rentbuy.breakevenAtYear')} ${calc.breakeven}`}
            </Text>
            <Text style={[styles.hint, align]}>{t('rentbuy.hintBreakeven')}</Text>
            {calc.verdict !== 'tie' ? (
              <>
                <Divider />
                <Row
                  title={money(Math.abs(calc.gap))}
                  subtitle={
                    calc.verdict === 'buy' ? t('rentbuy.savedByBuying') : t('rentbuy.savedByRenting')
                  }
                />
              </>
            ) : null}
          </Card>

          <Card>
            <Row title={money(calc.rentCum)} subtitle={t('rentbuy.totalRent')} />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintTotalRent')}</Text>
            <Divider />
            <Row title={money(calc.outOfPocket)} subtitle={t('rentbuy.outOfPocket')} />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintOutOfPocket')}</Text>
            <Divider />
            <Row title={money(calc.homeValue)} subtitle={t('rentbuy.homeValue')} />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintHomeValue')}</Text>
            <Divider />
            <Row title={money(calc.monthly)} subtitle={t('rentbuy.monthly')} />
            <Text style={[styles.hint, align]}>{t('rentbuy.hintMonthly')}</Text>
          </Card>

          <Text style={[styles.disclaimer, align]}>{t('rentbuy.disclaimer')}</Text>
        </>
      )}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 13, lineHeight: 19 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    disclaimer: { color: t.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 4 },
    twoCol: { flexDirection: 'row', gap: 12 },
    half: { flex: 1 },
    verdictHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    verdict: { color: t.foreground, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  }),
);
