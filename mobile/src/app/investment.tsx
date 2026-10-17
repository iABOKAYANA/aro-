import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';

import { Badge, Card, Divider, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatMoney, formatPercent } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/**
 * Investment calculator — the identical arithmetic to
 * `src/app/(public)/ai-tools/investment/page.tsx`, so a figure typed into the
 * app and the same figure on the website always agree.
 *
 * Inputs are entered in the *display* currency and converted to the EGP the
 * maths is denominated in, then presented back in the display currency.
 */

function parseNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function InvestmentScreen() {
  const styles = useStyles();
  const { currency, rates } = useCurrency();
  const { t, align } = useI18n();

  const [price, setPrice] = useState('10000000');
  const [downPct, setDownPct] = useState('10');
  const [years, setYears] = useState('7');
  const [rent, setRent] = useState('');

  const calc = useMemo(() => {
    const priceDisplay = parseNumber(price);
    const priceEgp = currency === 'EGP' ? priceDisplay : priceDisplay * rates[currency];
    if (priceEgp <= 0) return null;

    const dpPct = Math.min(99, Math.max(0, parseNumber(downPct))) / 100;
    const term = Math.min(35, Math.max(1, parseNumber(years)));
    // Default assumption matches the website: rent at 8% of the price/yr.
    const rentDisplay = rent ? parseNumber(rent) : priceDisplay * 0.08;
    const annualRentEgp = currency === 'EGP' ? rentDisplay : rentDisplay * rates[currency];

    const downPayment = priceEgp * dpPct;
    const loan = priceEgp - downPayment;
    const monthlyInstallment = loan / (term * 12);
    const monthlyRent = annualRentEgp / 12;
    const rentalYield = (annualRentEgp / priceEgp) * 100;
    const cashOnCash = downPayment > 0 ? (annualRentEgp / downPayment) * 100 : 0;

    // Same flat 8% appreciation assumption the website uses.
    const appreciation = 0.08;
    const future5 = priceEgp * Math.pow(1 + appreciation, 5);
    const future10 = priceEgp * Math.pow(1 + appreciation, 10);

    return {
      downPayment,
      loan,
      monthlyInstallment,
      monthlyRent,
      rentalYield,
      cashOnCash,
      future5,
      future10,
      rental5: annualRentEgp * 5,
      rental10: annualRentEgp * 10,
      netMonthly: monthlyRent - monthlyInstallment,
    };
  }, [price, downPct, years, rent, currency, rates]);

  const money = (valueInEgp: number) => formatMoney(valueInEgp, currency, rates);
  const percent = (value: number) => formatPercent(Math.round(value * 10) / 10);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('calculators.investment') }} />

      <SectionTitle>{t('calculators.investDetails')}</SectionTitle>
      <Text style={[styles.intro, align]}>{t('calculators.investIntro')}</Text>
      <Card>
        <Field
          label={`${t('calculators.propertyPrice')} (${currency})`}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="10,000,000"
        />
        <Text style={[styles.hint, align]}>{t('calculators.hintInvestPrice')}</Text>
        <Field label={t('calculators.downPaymentPct')} value={downPct} onChangeText={setDownPct} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintInvestDown')}</Text>
        <Field label={t('calculators.installmentYears')} value={years} onChangeText={setYears} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintInvestYears')}</Text>
        <Field
          label={`${t('calculators.expectedRent')} (${currency}) — ${t('calculators.rentBlank')}`}
          value={rent}
          onChangeText={setRent}
          keyboardType="numeric"
          placeholder={t('calculators.auto')}
        />
        <Text style={[styles.hint, align]}>{t('calculators.hintInvestRent')}</Text>
      </Card>

      {calc ? (
        <>
          <SectionTitle>{t('calculators.financing')}</SectionTitle>
          <Card>
            <Row title={money(calc.downPayment)} subtitle={t('calculators.downPayment')} />
            <Divider />
            <Row title={money(calc.loan)} subtitle={t('calculators.amountFinanced')} />
            <Divider />
            <Row title={money(calc.monthlyInstallment)} subtitle={t('calculators.monthlyInstallment')} />
          </Card>

          <SectionTitle>{t('calculators.rentalReturn')}</SectionTitle>
          <Card>
            <Row title={money(calc.monthlyRent)} subtitle={t('calculators.monthlyRent')} />
            <Divider />
            <Row title={`${percent(calc.rentalYield)}%`} subtitle={t('calculators.rentalYield')} />
            <Text style={[styles.hint, align]}>{t('calculators.yieldHint')}</Text>
            <Divider />
            <Row title={`${percent(calc.cashOnCash)}%`} subtitle={t('calculators.cashOnCash')} />
            <Text style={[styles.hint, align]}>{t('calculators.cashHint')}</Text>
            <Divider />
            <Row
              title={money(calc.netMonthly)}
              subtitle={t('calculators.netMonthly')}
              badge={<Badge tone={calc.netMonthly >= 0 ? 'green' : 'red'}>{calc.netMonthly >= 0 ? '+' : '−'}</Badge>}
            />
            <Text style={[styles.hint, align]}>{t('calculators.netHint')}</Text>
          </Card>

          <SectionTitle>{t('calculators.projection')}</SectionTitle>
          <Card>
            <Row title={money(calc.rental5)} subtitle={t('calculators.rental5')} />
            <Divider />
            <Row title={money(calc.rental10)} subtitle={t('calculators.rental10')} />
            <Divider />
            <Row title={money(calc.future5)} subtitle={t('calculators.value5')} />
            <Divider />
            <Row title={money(calc.future10)} subtitle={t('calculators.value10')} />
          </Card>

          <Text style={[styles.note, align]}>{t('calculators.investNote')}</Text>
        </>
      ) : (
        <Text style={[styles.note, align]}>{t('calculators.enterPrice')}</Text>
      )}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    note: { color: t.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 4 },
    intro: { color: t.mutedForeground, fontSize: 13, lineHeight: 19 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
  }),
);
