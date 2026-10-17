import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Chip, Divider, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useI18n, type MessageKey } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/**
 * Mortgage calculator — the identical arithmetic to
 * `src/components/tools/mortgage-calculator.tsx`, so a figure typed into the
 * app and the same figure on the website always agree.
 *
 * The two things the site does that a naive port gets wrong:
 *  - the developer plan is **0% interest**: `devRemaining / (devYears * 12)`,
 *    never the annuity formula;
 *  - `totalPaid` is the loan repayments only — the down payment and the fees
 *    are added once, in `totalCost` / `bankTotal`.
 *
 * Inputs are entered in the *display* currency and converted to the EGP the
 * maths is denominated in, then presented back in the display currency.
 */

type ScheduleRow = {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
};

/** Annuity formula — the identical one the website calculator uses. */
function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Reducing-balance schedule — the identical one the website toggles open. */
function amortisation(principal: number, annualRatePct: number, years: number): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const r = annualRatePct / 100 / 12;
  const n = Math.max(1, Math.round(years * 12));
  const pay = monthlyPayment(principal, annualRatePct, years);
  let balance = principal;
  for (let i = 1; i <= n && balance > 0.005; i++) {
    const interest = balance * r;
    const toPrincipal = Math.min(pay - interest, balance);
    balance = Math.max(0, balance - toPrincipal);
    rows.push({ period: i, payment: interest + toPrincipal, interest, principal: toPrincipal, balance });
  }
  return rows;
}

function parseNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** The bounds of the website's sliders — a stray keystroke cannot produce a
 *  figure the site could never show. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const PRESETS: { label: MessageKey; years: number }[] = [
  { label: 'calculators.preset5', years: 5 },
  { label: 'calculators.preset10', years: 10 },
  { label: 'calculators.preset15', years: 15 },
  { label: 'calculators.preset20', years: 20 },
];

/** CBE mortgage-initiative shortcuts — rate+term only, the annuity math below is untouched. */
const CBE_PRESETS: {
  key: 'free' | 'cbe3' | 'cbe8';
  label: MessageKey;
  hint: MessageKey;
  rate: string | null;
  years: string | null;
}[] = [
  { key: 'free', label: 'calculators.cbePresetFree', hint: 'calculators.cbeHintFree', rate: null, years: null },
  { key: 'cbe3', label: 'calculators.cbePreset3', hint: 'calculators.cbeHint3', rate: '3', years: '30' },
  { key: 'cbe8', label: 'calculators.cbePreset8', hint: 'calculators.cbeHint8', rate: '8', years: '25' },
];

export default function MortgageScreen() {
  const styles = useStyles();
  const { currency, rates } = useCurrency();
  const { t, row, align, isRtl } = useI18n();

  // Defaults are the website's, so both screens open on the same numbers.
  const [price, setPrice] = useState('8500000');
  const [downPct, setDownPct] = useState('20');
  const [years, setYears] = useState('15');
  const [rate, setRate] = useState('19');
  const [feesPct, setFeesPct] = useState('2');
  const [devDownPct, setDevDownPct] = useState('10');
  const [devYears, setDevYears] = useState('8');
  const [showSchedule, setShowSchedule] = useState(false);
  // One-tap CBE initiative shortcut — 'free' is the current custom-input behaviour.
  const [cbe, setCbe] = useState<'free' | 'cbe3' | 'cbe8'>('free');

  const calc = useMemo(() => {
    const entered = parseNumber(price);
    const p = currency === 'EGP' ? entered : entered * rates[currency];

    const down = clamp(parseNumber(downPct), 0, 90);
    const term = clamp(parseNumber(years), 1, 30);
    const annual = clamp(parseNumber(rate), 0, 35);
    const feesRate = clamp(parseNumber(feesPct), 0, 10);
    const devDown = clamp(parseNumber(devDownPct), 0, 90);
    const devTerm = clamp(parseNumber(devYears), 1, 15);

    const downAmount = p * (down / 100);
    const loan = Math.max(0, p - downAmount);
    const fees = loan * (feesRate / 100);
    const monthly = monthlyPayment(loan, annual, term);
    const totalPaid = monthly * Math.round(term * 12);
    const totalInterest = Math.max(0, totalPaid - loan);
    const totalCost = downAmount + fees + totalPaid;

    const devDownAmount = p * (devDown / 100);
    const devRemaining = Math.max(0, p - devDownAmount);
    // 0% interest: the remainder is split evenly over the plan's months.
    const devMonthly = devTerm > 0 ? devRemaining / (devTerm * 12) : 0;
    const devTotal = devDownAmount + devRemaining;

    const schedule = loan > 0 && term > 0 ? amortisation(loan, annual, term) : [];
    const bankTotal = downAmount + fees + totalPaid;
    const cashTotal = p;

    return {
      down,
      term,
      annual,
      devDown,
      devTerm,
      downAmount,
      loan,
      fees,
      monthly,
      totalPaid,
      totalInterest,
      totalCost,
      devDownAmount,
      devMonthly,
      devTotal,
      schedule,
      ltv: p > 0 ? (loan / p) * 100 : 0,
      bankTotal,
      cashTotal,
    };
  }, [price, downPct, years, rate, feesPct, devDownPct, devYears, currency, rates]);

  const cheapest: 'cash' | 'developer' | 'bank' =
    calc.cashTotal <= calc.devTotal && calc.cashTotal <= calc.bankTotal
      ? 'cash'
      : calc.devTotal <= calc.bankTotal
        ? 'developer'
        : 'bank';

  const options: {
    key: string;
    name: MessageKey;
    note: string;
    upfront: number;
    monthly: number | null;
    total: number;
    interest: number;
    fees: number;
    best: boolean;
  }[] = [
    {
      key: 'cash',
      name: 'calculators.cashPurchase',
      note: t('calculators.cashNote'),
      upfront: 0,
      monthly: null,
      total: calc.cashTotal,
      interest: 0,
      fees: 0,
      best: cheapest === 'cash',
    },
    {
      key: 'developer',
      name: 'calculators.devPlan',
      note: `${calc.devDown}% ${t('calculators.downOver')} ${calc.devTerm} ${t('calculators.zeroInterest')}`,
      upfront: calc.devDownAmount,
      monthly: calc.devMonthly,
      total: calc.devTotal,
      interest: 0,
      fees: 0,
      best: cheapest === 'developer',
    },
    {
      key: 'bank',
      name: 'calculators.bankMortgage',
      note: `${calc.down}% ${t('calculators.downWord')} · ${calc.annual}% · ${calc.term} ${t('calculators.yearsWord')}`,
      upfront: calc.downAmount + calc.fees,
      monthly: calc.monthly,
      total: calc.bankTotal,
      interest: calc.totalInterest,
      fees: calc.fees,
      best: cheapest === 'bank',
    },
  ];

  const money = (valueInEgp: number) => formatMoney(valueInEgp, currency, rates);
  // The balance column runs to the far edge in both directions.
  const endEdge = { textAlign: (isRtl ? 'left' : 'right') as 'left' | 'right' };

  return (
    <Screen>
      <SectionTitle>{t('calculators.bankMortgage')}</SectionTitle>
      <Text style={[styles.intro, align]}>{t('calculators.mortgageIntro')}</Text>

      <Card>
        <Field
          label={`${t('calculators.propertyPrice')} (${currency})`}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder={t('calculators.pricePlaceholder')}
        />
        <Text style={[styles.hint, align]}>{t('calculators.hintPrice')}</Text>
        <Field label={t('calculators.downPaymentPct')} value={downPct} onChangeText={setDownPct} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintDown')}</Text>
        <View style={[styles.chips, row]}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.years}
              label={t(preset.label)}
              selected={years === String(preset.years)}
              onPress={() => setYears(String(preset.years))}
            />
          ))}
        </View>
        <Field label={t('calculators.termYears')} value={years} onChangeText={(v) => { setYears(v); setCbe('free'); }} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintTerm')}</Text>
        <View style={[styles.chips, row]}>
          {CBE_PRESETS.map((preset) => (
            <Chip
              key={preset.key}
              label={t(preset.label)}
              selected={cbe === preset.key}
              onPress={() => {
                setCbe(preset.key);
                if (preset.rate !== null) setRate(preset.rate);
                if (preset.years !== null) setYears(preset.years);
              }}
            />
          ))}
        </View>
        <Text style={[styles.hint, align]}>
          {t(CBE_PRESETS.find((preset) => preset.key === cbe)?.hint ?? 'calculators.cbeHintFree')}
        </Text>
        <Field label={t('calculators.ratePct')} value={rate} onChangeText={(v) => { setRate(v); setCbe('free'); }} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintRate')}</Text>
        <Field label={t('calculators.loanFeesPct')} value={feesPct} onChangeText={setFeesPct} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintFees')}</Text>
      </Card>

      <Card>
        <SectionTitle>{t('calculators.cbeTitle')}</SectionTitle>
        <Text style={[styles.intro, align]}>{t('calculators.cbeLine3')}</Text>
        <Text style={[styles.intro, align]}>{t('calculators.cbeLine8')}</Text>
        <Text style={[styles.hint, align]}>{t('calculators.cbeDisclaimer')}</Text>
      </Card>

      <Card>
        <Text style={[styles.hint, align]}>{t('calculators.resultsHint')}</Text>
        <View style={[styles.metrics, row]}>
          <Metric label={t('calculators.monthlyInstallment')} value={money(calc.monthly)} accent />
          <Metric label={t('calculators.totalInterest')} value={money(calc.totalInterest)} />
          <Metric label={t('calculators.ltv')} value={`${calc.ltv.toFixed(0)}%`} />
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('calculators.yourLoan')}</SectionTitle>
        <Text style={[styles.hint, align]}>{t('calculators.loanHint')}</Text>
        <Row title={money(calc.loan)} subtitle={t('calculators.amountFinanced')} />
        <Divider />
        <Row title={money(calc.totalPaid)} subtitle={t('calculators.totalRepaid')} />
        <Divider />
        <Row title={money(calc.fees)} subtitle={t('calculators.loanFees')} />
      </Card>

      <SectionTitle>{t('calculators.compareOptions')}</SectionTitle>
      <Text style={[styles.intro, align]}>{t('calculators.compareHint')}</Text>
      <Text style={[styles.hint, align]}>{t('calculators.cheapestNote')}</Text>
      <Card style={styles.compare}>
        {options.map((option, index) => (
          <View key={option.key}>
            {index > 0 ? <Divider /> : null}
            <View style={[styles.option, option.best && styles.optionBest]}>
              <View style={[styles.optionHead, row]}>
                <Text style={[styles.optionName, align]}>{t(option.name)}</Text>
                {option.best ? <Badge tone="gold">{t('calculators.cheapest')}</Badge> : null}
              </View>
              <Text style={[styles.optionNote, align]}>{option.note}</Text>
              <View style={[styles.metrics, row]}>
                <Metric label={t('calculators.upfront')} value={money(option.upfront)} />
                <Metric
                  label={t('calculators.monthly')}
                  value={option.monthly === null ? '—' : money(option.monthly)}
                />
                <Metric label={t('calculators.totalCost')} value={money(option.total)} />
                <Metric label={t('calculators.totalInterest')} value={money(option.interest)} />
                <Metric label={t('calculators.totalFees')} value={money(option.fees)} />
              </View>
            </View>
          </View>
        ))}
      </Card>

      <SectionTitle>{t('calculators.devPlan')}</SectionTitle>
      <Text style={[styles.intro, align]}>{t('calculators.devPlanHint')}</Text>
      <Card>
        <Field label={t('calculators.devDownPct')} value={devDownPct} onChangeText={setDevDownPct} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintDevDown')}</Text>
        <Field label={t('calculators.planTerm')} value={devYears} onChangeText={setDevYears} keyboardType="numeric" />
        <Text style={[styles.hint, align]}>{t('calculators.hintDevTerm')}</Text>
        <Divider />
        <Row title={money(calc.devMonthly)} subtitle={t('calculators.monthlyInstallment')} />
        <Divider />
        <Row title={money(calc.devTotal)} subtitle={t('calculators.planTotal')} />
      </Card>

      <Text style={[styles.disclaimer, align]}>{t('calculators.mortgageDisclaimer')}</Text>

      <View>
        <Pressable onPress={() => setShowSchedule((value) => !value)} hitSlop={8}>
          <Text style={[styles.scheduleToggle, align]}>
            {showSchedule ? t('calculators.hideSchedule') : t('calculators.showSchedule')}
          </Text>
        </Pressable>
        <Text style={[styles.hint, align]}>{t('calculators.scheduleHint')}</Text>

        {showSchedule ? (
          <View style={styles.scheduleBox}>
            <ScrollView style={styles.scheduleScroll} nestedScrollEnabled contentContainerStyle={styles.scheduleInner}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={[styles.schedRow, styles.schedHead, row]}>
                    <Text style={[styles.schedNum, styles.schedHeadText, align]}>#</Text>
                    <Text style={[styles.schedCell, styles.schedHeadText, align]}>{t('calculators.schedPayment')}</Text>
                    <Text style={[styles.schedCell, styles.schedHeadText, align]}>{t('calculators.schedInterest')}</Text>
                    <Text style={[styles.schedCell, styles.schedHeadText, align]}>{t('calculators.schedPrincipal')}</Text>
                    <Text style={[styles.schedCell, styles.schedHeadText, endEdge]}>{t('calculators.schedBalance')}</Text>
                  </View>
                  {calc.schedule.map((entry) => (
                    <View key={entry.period} style={[styles.schedRow, row]}>
                      <Text style={[styles.schedNum, styles.schedMuted, align]}>{entry.period}</Text>
                      <Text style={[styles.schedCell, align]}>{money(entry.payment)}</Text>
                      <Text style={[styles.schedCell, styles.schedInterest, align]}>{money(entry.interest)}</Text>
                      <Text style={[styles.schedCell, styles.schedPrincipal, align]}>{money(entry.principal)}</Text>
                      <Text style={[styles.schedCell, endEdge]}>{money(entry.balance)}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/** Label over value, the website's `Stat` card restated for a phone row. */
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  const styles = useStyles();
  const { align } = useI18n();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, align]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.metricValue, align, accent && styles.metricAccent]}>{value}</Text>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },

    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    metric: { flexGrow: 0, flexBasis: '30%', minWidth: 104, gap: 2 },
    metricLabel: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
    metricValue: { color: t.foreground, fontSize: 16, lineHeight: 22, fontWeight: '700' },
    metricAccent: { color: t.primary },

    compare: { gap: Spacing.sm },
    option: { gap: 4, borderRadius: Radius.md, paddingHorizontal: 6, paddingVertical: 4 },
    // The winning column carries the same gold tint as the website's row
    optionBest: { backgroundColor: t.goldBg },
    optionHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    optionName: { color: t.foreground, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    optionNote: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },

    scheduleToggle: { color: t.primary, fontSize: 14, fontWeight: '600', paddingVertical: Spacing.sm },
    scheduleBox: {
      maxHeight: 384,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      overflow: 'hidden',
      marginTop: Spacing.xs,
    },
    scheduleScroll: { flexGrow: 0 },
    scheduleInner: { paddingVertical: 4 },
    schedRow: { alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, gap: 6 },
    schedHead: { backgroundColor: t.muted },
    schedHeadText: { color: t.mutedForeground, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    schedNum: { width: 34, fontSize: 12 },
    schedCell: { width: 104, fontSize: 12, color: t.foreground },
    schedMuted: { color: t.mutedForeground },
    schedInterest: { color: t.goldFg },
    schedPrincipal: { color: t.successFg },

    disclaimer: { color: t.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: Spacing.sm },
    intro: { color: t.mutedForeground, fontSize: 13, lineHeight: 19 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
  }),
);
