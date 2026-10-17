import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Divider, Row, Screen, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { CURRENCY_OPTIONS } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { registerForPush, type PushRegistration } from '@/lib/push';
import { createStyles, useTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Everything that does not deserve its own tab but is used often: the money
 * tools, language and display settings, the staff consoles, and account
 * actions.
 */
export default function ToolsScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { user, signOut, session, hasRole } = useAuth();
  const { currency, setCurrency, rates } = useCurrency();
  const { t, lang, setLang, row, align } = useI18n();
  const [push, setPush] = useState<PushRegistration | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const isDeveloper = hasRole('DEVELOPER');
  const isBroker = hasRole('BROKER');
  const isCeo = hasRole('CEO', 'ADMIN');
  // `hasRole` already answers true for CEO/ADMIN on every check, so this
  // covers BROKER + DEVELOPER + the two super roles — exactly the audience
  // the website's `/(dashboard)` sidebar serves.
  const isStaff = hasRole('BROKER', 'DEVELOPER');

  async function enablePush() {
    setPushBusy(true);
    try {
      // The endpoint is session-gated — without these credentials the server
      // answers 401 and the button reports a generic failure.
      setPush(
        await registerForPush(
          session ? { token: session.token, cookieName: session.cookieName } : {}
        )
      );
    } finally {
      setPushBusy(false);
    }
  }

  const pushMessage =
    push && !push.ok
      ? push.reason === 'unsupported'
        ? t('tools.pushUnsupported')
        : push.reason === 'no-project-id'
          ? t('tools.pushNoProject')
          : push.reason === 'denied'
            ? t('tools.pushDenied')
            : t('tools.pushFailed')
      : null;

  return (
    <Screen>
      <SectionTitle>{t('tools.calculators')}</SectionTitle>
      <Text style={[styles.sectionHint, align]}>{t('tools.calculatorsHint')}</Text>
      <Card style={styles.list}>
        <Link icon="calculator" label={t('tools.mortgage')} hint={t('tools.mortgageHint')} onPress={() => router.push('/mortgage')} />
        <Divider />
        <Link icon="git-compare" label={t('tools.compare')} hint={t('tools.compareHint')} onPress={() => router.push('/compare')} />
        <Divider />
        <Link icon="search" label={t('tab.explore')} hint={t('tools.exploreHint')} onPress={() => router.push('/(tabs)/explore')} />
        <Divider />
        <Link icon="sparkles" label={t('assistant.title')} hint={t('tools.assistantHint')} onPress={() => router.push('/assistant')} />
        <Divider />
        <Link
          icon="search-circle"
          label={t('aiSearch.title')}
          hint={t('tools.aiSearchHint')}
          onPress={() => router.push('/ai-search')}
        />
        <Divider />
        <Link icon="trending-up" label={t('tools.investment')} hint={t('tools.investmentHint')} onPress={() => router.push('/investment')} />
        <Divider />
        <Link icon="pricetag" label={t('tools.estimator')} hint={t('tools.estimatorHint')} onPress={() => router.push('/price-estimator')} />
        <Divider />
        <Link icon="wallet" label={t('afford.title')} hint={t('afford.rowHint')} onPress={() => router.push('/affordability')} />
        <Divider />
        <Link icon="home" label={t('rentbuy.title')} hint={t('rentbuy.rowHint')} onPress={() => router.push('/rentbuy')} />
        <Divider />
        <Link icon="pricetag" label={t('offers.title')} hint={t('offers.shortHint')} onPress={() => router.push('/offers')} />
      </Card>

      {isStaff || isCeo ? (
        <>
          <SectionTitle>{t('tools.consoles')}</SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('tools.consolesHint')}</Text>
          <Card style={styles.list}>
            {isStaff ? (
              <>
                <Link
                  icon="stats-chart-outline"
                  label={t('tools.dashAnalytics')}
                  hint={t('tools.dashAnalyticsHint')}
                  onPress={() => router.push('/dashboard/analytics')}
                />
                <Divider />
              </>
            ) : null}
            {isDeveloper ? (
              <>
                <Link
                  icon="business-outline"
                  label={t('tools.developerPortal')}
                  hint={t('tools.developerPortalHint')}
                  onPress={() => router.push('/developer')}
                />
                <Divider />
                <Link
                  icon="home-outline"
                  label={t('tools.dashProjects')}
                  hint={t('tools.dashProjectsHint')}
                  onPress={() => router.push('/dashboard/projects')}
                />
                <Divider />
                <Link
                  icon="key-outline"
                  label={t('tools.dashUnits')}
                  hint={t('tools.dashUnitsHint')}
                  onPress={() => router.push('/dashboard/units')}
                />
                <Divider />
              </>
            ) : null}
            {isBroker ? (
              <>
                <Link
                  icon="briefcase-outline"
                  label={t('broker.title')}
                  hint={t('tools.brokerHint')}
                  onPress={() => router.push('/broker')}
                />
                <Divider />
              </>
            ) : null}
            {isCeo ? (
              <Link
                icon="shield-checkmark-outline"
                label={t('tools.ceoConsole')}
                hint={t('tools.ceoConsoleHint')}
                onPress={() => router.push('/ceo/overview')}
              />
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionTitle>{t('tools.language')}</SectionTitle>
      <Card>
        <Text style={styles.help}>{t('tools.languageHelp')}</Text>
        <View style={styles.segmented}>
          <Pressable
            onPress={() => setLang('en')}
            style={[styles.lang, lang === 'en' && styles.langActive]}>
            <Text style={[styles.langText, lang === 'en' && styles.langTextActive]}>
              {t('tools.english')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setLang('ar')}
            style={[styles.lang, lang === 'ar' && styles.langActive]}>
            <Text style={[styles.langText, lang === 'ar' && styles.langTextActive]}>
              {t('tools.arabic')}
            </Text>
          </Pressable>
        </View>
      </Card>

      <SectionTitle>{t('tools.currency')}</SectionTitle>
      <Card>
        <Text style={styles.help}>
          {t('tools.currencyHelp')} (1 EGP = {rates.USD} USD = {rates.SAR} SAR)
        </Text>
        <View style={[styles.currencyRow, row]}>
          {CURRENCY_OPTIONS.map((option) => {
            const active = option.code === currency;
            return (
              <Pressable
                key={option.code}
                onPress={() => setCurrency(option.code)}
                style={[styles.currency, active && styles.currencyActive]}>
                <Text style={[styles.currencySymbol, active && styles.currencySymbolActive]}>
                  {option.symbol}
                </Text>
                <Text style={[styles.currencyCode, active && styles.currencyCodeActive]}>
                  {option.code}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionTitle>{t('tools.push')}</SectionTitle>
      <Text style={[styles.sectionHint, align]}>{t('tools.pushHint')}</Text>
      <Card>
        <Row
          title={t('tools.push')}
          subtitle={push?.ok ? t('tools.pushEnabled') : pushMessage ?? t('tools.pushEnable')}
          badge={push?.ok ? <Badge tone="green">ON</Badge> : push ? <Badge tone="gold">OFF</Badge> : undefined}
        />
        <Pressable
          onPress={() => void enablePush()}
          disabled={pushBusy}
          style={({ pressed }) => [styles.pushBtn, pressed && { opacity: 0.8 }]}>
          <Ionicons name="notifications-outline" size={16} color={theme.primary} />
          <Text style={styles.pushBtnText}>
            {push?.ok ? t('tools.pushEnabled') : t('tools.pushEnable')}
          </Text>
        </Pressable>
      </Card>

      <SectionTitle>{t('tools.account')}</SectionTitle>
      <Text style={[styles.sectionHint, align]}>{t('tools.accountHint')}</Text>
      <Card style={styles.list}>
        <Row title={user?.name ?? '—'} subtitle={user?.email ?? '—'} badge={<Badge tone="gold">{user?.role}</Badge>} />
        <Divider />
        <Row title={t('tools.notifications')} subtitle={t('tools.notificationsHint')} onPress={() => router.push('/notifications')} />
        <Divider />
        <Row title={t('inquiries.title')} subtitle={t('tools.inquiriesHint')} onPress={() => router.push('/inquiries')} />
        <Divider />
        <Row title={t('tools.appointments')} subtitle={t('tools.appointmentsHint')} onPress={() => router.push('/viewings')} />
        <Divider />
        <Row title={t('settings.title')} subtitle={t('tools.settingsHint')} onPress={() => router.push('/settings')} />
        <Divider />
        <Row title={t('tools.dashboard')} subtitle={t('tools.dashboardHint')} onPress={() => router.push('/')} />
      </Card>

      <Pressable onPress={() => signOut()} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.8 }]}>
        <Ionicons name="log-out-outline" size={18} color={theme.dangerFg} />
        <Text style={styles.signOutText}>{t('tools.signOut')}</Text>
      </Pressable>

      {session ? <Text style={styles.footnote}>{t('tools.session')} · {session.cookieName}</Text> : null}
    </Screen>
  );
}

function Link({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
      <View style={styles.linkIcon}>
        <Ionicons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.linkText}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Text style={styles.linkHint}>{hint}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    list: { gap: 0 },
    link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
    linkIcon: {
      width: 36,
      height: 36,
      borderRadius: Radius.lg,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkText: { flex: 1 },
    linkLabel: { color: t.foreground, fontSize: 16, fontWeight: '600' },
    linkHint: { color: t.mutedForeground, fontSize: 12 },
    chevron: { color: t.mutedForeground, fontSize: 20, fontWeight: '600' },
    help: { color: t.mutedForeground, fontSize: 14, lineHeight: 19 },
    sectionHint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    segmented: {
      flexDirection: 'row',
      backgroundColor: t.muted,
      borderRadius: Radius.lg,
      padding: 3,
      gap: 3,
    },
    lang: { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, alignItems: 'center' },
    langActive: { backgroundColor: t.card },
    langText: { color: t.mutedForeground, fontSize: 14, fontWeight: '700' },
    langTextActive: { color: t.primary },
    currencyRow: { flexDirection: 'row', gap: 8 },
    currency: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xl,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 3,
    },
    currencyActive: { borderColor: t.primary, backgroundColor: t.goldBg },
    currencySymbol: { color: t.mutedForeground, fontSize: 18, fontWeight: '800' },
    currencySymbolActive: { color: t.primary },
    currencyCode: { color: t.mutedForeground, fontSize: 12, fontWeight: '600' },
    currencyCodeActive: { color: t.primary },
    pushBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      // Brand accent, identical in both modes — a gold hairline on either
      // palette. Kept literal rather than folded into `t.goldBg` (10% alpha),
      // which would vanish against the light background.
      borderColor: 'rgba(212,168,67,0.45)',
      borderRadius: Radius.xl,
      paddingVertical: 12,
    },
    pushBtnText: { color: t.primary, fontSize: 14, fontWeight: '700' },
    signOut: {
      marginTop: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.destructive,
      borderRadius: Radius.xl,
      paddingVertical: 14,
    },
    signOutText: { color: t.dangerFg, fontSize: 16, fontWeight: '700' },
    footnote: { color: t.mutedForeground, fontSize: 12, textAlign: 'center', marginTop: 10 },
  })
);
