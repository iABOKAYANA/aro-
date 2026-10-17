import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card, Divider, Empty, ErrorBar, Field, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/**
 * "What can I afford?" — works backwards from the monthly installment a bank
 * would allow to the most expensive home that installment can finance.
 *
 * Math (identical on the website's `ai-tools/affordability` page):
 * - affordInstallment = 40% × (income − commitments), floored at 0
 * - maxLoan = present value of that installment as an annuity at the mortgage
 *   calculator's defaults (rate 19%, 15 years): PMT × (1 − (1+r)^−n) / r
 * - maxPrice = down payment + maxLoan
 *
 * Inputs are entered in the *display* currency and converted to the EGP the
 * maths is denominated in, then presented back in the display currency — the
 * same rule `mobile/src/app/mortgage.tsx` follows.
 */

/** Mortgage defaults — read from `mobile/src/app/mortgage.tsx` + website `mortgage-calculator.tsx`. */
const DEFAULT_RATE = 19;
const DEFAULT_YEARS = 15;

function parseNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Inverse of the mortgage annuity formula: the loan a monthly payment supports. */
function maxLoanForInstallment(installment: number, annualRatePct: number, years: number): number {
  if (installment <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  if (r === 0) return installment * n;
  return (installment * (1 - Math.pow(1 + r, -n))) / r;
}

type MatchProject = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  startPrice?: number | null;
};

export default function AffordabilityScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { currency, rates } = useCurrency();
  const { t, row, align, localized } = useI18n();

  const [income, setIncome] = useState('');
  const [commitments, setCommitments] = useState('');
  const [down, setDown] = useState('');
  const [years, setYears] = useState(String(DEFAULT_YEARS));
  const [rate, setRate] = useState(String(DEFAULT_RATE));

  const calc = useMemo(() => {
    const toEgp = (display: number) => (currency === 'EGP' ? display : display * rates[currency]);
    const incomeEgp = toEgp(parseNumber(income));
    const commitmentsEgp = toEgp(parseNumber(commitments));
    const downEgp = toEgp(parseNumber(down));
    const term = clamp(parseNumber(years) || DEFAULT_YEARS, 1, 30);
    const annual = clamp(parseNumber(rate) || 0, 0, 35);

    const hasInputs = incomeEgp > 0 || downEgp > 0;
    // 40% of net income (income minus commitments), floored at 0.
    const installment = Math.max(0, 0.4 * (incomeEgp - commitmentsEgp));
    const loan = maxLoanForInstallment(installment, annual, term);
    const maxPrice = downEgp + loan;
    return {
      hasInputs,
      term,
      annual,
      installment,
      loan,
      downEgp,
      maxPrice,
      downPct: maxPrice > 0 ? (downEgp / maxPrice) * 100 : 0,
    };
  }, [income, commitments, down, years, rate, currency, rates]);

  // Matching projects: the existing search endpoint's `maxPrice` param
  // (`src/app/api/search/route.ts`) — startPrice ≤ maxPrice. Cash-only when
  // there is no room for an installment (price is just the down payment).
  const searchPath = useMemo(() => {
    if (!calc.hasInputs || calc.maxPrice <= 0) return null;
    const params = new URLSearchParams({
      type: 'projects',
      maxPrice: String(Math.floor(calc.maxPrice)),
      limit: '6',
      sortBy: 'price_desc',
    });
    return `/api/search?${params.toString()}`;
  }, [calc.hasInputs, calc.maxPrice]);

  const matches = useApi<{ items?: MatchProject[] }>(searchPath, Boolean(searchPath));

  const money = (valueInEgp: number) => formatMoney(valueInEgp, currency, rates);
  const projects = useMemo(() => matches.data?.items ?? [], [matches.data]);

  return (
    <Screen>
      <SectionTitle>{t('afford.title')}</SectionTitle>
      <Text style={[styles.intro, align]}>{t('afford.intro')}</Text>

      <Card>
        <Field
          label={`${t('afford.income')} (${currency})`}
          value={income}
          onChangeText={setIncome}
          keyboardType="numeric"
          placeholder={t('afford.incomePlaceholder')}
        />
        <Text style={[styles.hint, align]}>{t('afford.hintIncome')}</Text>
        <Field
          label={`${t('afford.commitments')} (${currency})`}
          value={commitments}
          onChangeText={setCommitments}
          keyboardType="numeric"
          placeholder={t('afford.commitmentsPlaceholder')}
        />
        <Text style={[styles.hint, align]}>{t('afford.hintCommitments')}</Text>
        <Field
          label={`${t('afford.downPayment')} (${currency})`}
          value={down}
          onChangeText={setDown}
          keyboardType="numeric"
          placeholder={t('afford.downPlaceholder')}
        />
        <Text style={[styles.hint, align]}>{t('afford.hintDown')}</Text>
        <View style={[styles.twoCol, row]}>
          <View style={styles.half}>
            <Field label={t('afford.years')} value={years} onChangeText={setYears} keyboardType="numeric" />
            <Text style={[styles.hint, align]}>{t('afford.hintYears')}</Text>
          </View>
          <View style={styles.half}>
            <Field label={t('afford.rate')} value={rate} onChangeText={setRate} keyboardType="numeric" />
            <Text style={[styles.hint, align]}>{t('afford.hintRate')}</Text>
          </View>
        </View>
        <Text style={[styles.rule, align]}>{t('afford.rule40')}</Text>
      </Card>

      {!calc.hasInputs ? (
        <Card>
          <Empty title={t('afford.enterInputs')} message={t('afford.enterInputsHint')} />
        </Card>
      ) : (
        <>
          <SectionTitle>{t('afford.maxPrice')}</SectionTitle>
          <Text style={[styles.intro, align]}>{t('afford.resultsHint')}</Text>
          <Card>
            <Text style={[styles.big, align]}>{money(calc.maxPrice)}</Text>
            <Text style={[styles.hint, align]}>{t('afford.hintMaxPrice')}</Text>
            <Divider />
            <Row title={money(calc.installment)} subtitle={t('afford.monthly')} />
            <Text style={[styles.hint, align]}>{t('afford.hintMonthly')}</Text>
            <Divider />
            <Row
              title={`${calc.downPct.toFixed(0)}%`}
              subtitle={t('afford.downPct')}
            />
            <Text style={[styles.hint, align]}>{t('afford.hintDownPct')}</Text>
            {calc.installment <= 0 ? (
              <>
                <Divider />
                <Text style={[styles.warning, align]}>{t('afford.noBudget')}</Text>
                <Text style={[styles.hint, align]}>{t('afford.noBudgetHint')}</Text>
              </>
            ) : null}
          </Card>

          <SectionTitle>{t('afford.matches')}</SectionTitle>
          <Text style={[styles.intro, align]}>{t('afford.matchesHint')}</Text>
          {matches.loading ? (
            <Card>
              <Loading label={t('afford.loadingMatches')} />
            </Card>
          ) : matches.error ? (
            <ErrorBar message={t('afford.matchesError')} onRetry={() => matches.refresh()} />
          ) : projects.length > 0 ? (
            <Card>
              {projects.map((project, index) => (
                <View key={project.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={localized(project.name, project.nameArabic)}
                    subtitle={
                      typeof project.startPrice === 'number' ? money(project.startPrice) : undefined
                    }
                    onPress={() => router.push(`/project/${project.slug}`)}
                  />
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <Empty title={t('afford.noMatch')} message={t('afford.noMatchHint')} />
            </Card>
          )}

          <Text style={[styles.disclaimer, align]}>{t('afford.disclaimer')}</Text>
        </>
      )}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 13, lineHeight: 19 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    rule: { color: t.primary, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    big: { color: t.primary, fontSize: 32, fontWeight: '800' },
    warning: { color: t.dangerFg, fontSize: 14, fontWeight: '700' },
    disclaimer: { color: t.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 4 },
    twoCol: { flexDirection: 'row', gap: 12 },
    half: { flex: 1 },
  }),
);
