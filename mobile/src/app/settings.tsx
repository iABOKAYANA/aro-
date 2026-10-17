import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { API_URL } from '@/api/config';
import { useAuth } from '@/auth/auth-context';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SectionTitle,
  Segmented,
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { useAppLock } from '@/lib/app-lock';
import { useCurrency } from '@/lib/currency';
import { CURRENCY_OPTIONS, initials } from '@/lib/format';
import { createStyles, useTheme, type ThemePreference } from '@/lib/theme';

/* ── Notification preferences ──────────────────────────────────────────── */

/**
 * The exact booleans `PATCH /api/preferences` accepts — the server's `ALLOWED`
 * array in src/app/api/preferences/route.ts. Anything else is dropped there,
 * so nothing else is offered here.
 */
type PrefKey =
  | 'emailInquiries'
  | 'emailLeads'
  | 'emailPayments'
  | 'emailViewings'
  | 'emailMarketing'
  | 'pushInquiries'
  | 'pushLeads'
  | 'pushPayments'
  | 'pushViewings'
  | 'smsNotifications'
  | 'whatsappNotifications'
  | 'watchAlerts';

type NotificationPreferences = Record<PrefKey, boolean>;

type PreferencesResponse = {
  /** `null` until the first save — the route upserts, so we render the
   *  Prisma defaults below instead of an empty form when `exists` is false. */
  preferences: Partial<NotificationPreferences> | null;
  exists: boolean;
};

/** The `@default` values of Prisma's NotificationPreference model. */
const PREF_DEFAULTS: NotificationPreferences = {
  emailInquiries: true,
  emailLeads: true,
  emailPayments: true,
  emailViewings: true,
  emailMarketing: false,
  pushInquiries: true,
  pushLeads: true,
  pushPayments: true,
  pushViewings: true,
  smsNotifications: false,
  whatsappNotifications: false,
  watchAlerts: true,
};

const PREF_LABELS: Record<PrefKey, MessageKey> = {
  pushLeads: 'settings.pushLeads',
  pushInquiries: 'settings.pushInquiries',
  pushViewings: 'settings.pushViewings',
  pushPayments: 'settings.pushPayments',
  watchAlerts: 'settings.pushWatch',
  emailInquiries: 'settings.emailInquiries',
  emailLeads: 'settings.emailLeads',
  emailPayments: 'settings.emailPayments',
  emailViewings: 'settings.emailViewings',
  emailMarketing: 'settings.emailMarketing',
  smsNotifications: 'settings.smsNotifications',
  whatsappNotifications: 'settings.whatsappNotifications',
};

/** Twelve toggles in one card would read as a wall — group them instead. */
const PREF_GROUPS: { label: MessageKey; keys: PrefKey[] }[] = [
  {
    label: 'settings.groupPush',
    keys: ['pushLeads', 'pushInquiries', 'pushViewings', 'pushPayments', 'watchAlerts'],
  },
  {
    label: 'settings.groupEmail',
    keys: ['emailInquiries', 'emailLeads', 'emailPayments', 'emailViewings', 'emailMarketing'],
  },
  { label: 'settings.groupMessaging', keys: ['smsNotifications', 'whatsappNotifications'] },
];

/* ── Property preferences (Client DNA) ─────────────────────────────────── */

/** The slice of `ClientDna` this screen lets the owner edit — the route's
 *  `EDITABLE` keys, restricted to the fields surfaced here. */
type EditableDna = {
  budget?: { min?: number; max?: number; currency?: string };
  locations?: string[];
  bedrooms?: number | null;
  intent?: 'LIVING' | 'INVESTMENT';
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
};

type DnaResponse = {
  /** The `dnaEnabled` system setting — turned off server-side, the whole
   *  feature disappears behind a note rather than an error. */
  enabled: boolean;
  dna?: EditableDna;
  confidence?: number;
  updatedAt?: string | null;
};

type Intent = 'LIVING' | 'INVESTMENT';
type Urgency = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * The app's counterpart of the website's /dashboard/settings: every preference
 * the platform keeps about *this* account — notification push/email switches,
 * the Client DNA the recommender reads, password, and the device-local
 * language / theme / currency controls.
 *
 * Two GETs (`useApi`) + three writes (`useMutation`), all against the same
 * Next.js routes the website uses; nothing here keeps its own copy of state.
 */
export default function SettingsScreen() {
  const styles = useStyles();
  const { t: theme, preference, setPreference } = useTheme();
  const router = useRouter();
  const { user, status, signOut } = useAuth();
  const { t, row, align, text, lang, setLang } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const { enabled: lockEnabled, supported: lockSupported, loading: lockLoading, enable: enableLock, disable: disableLock } = useAppLock();
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const prefs = useApi<PreferencesResponse>('/api/preferences');
  const dna = useApi<DnaResponse>('/api/client-dna');
  const prefMutation = useMutation();
  const dnaMutation = useMutation();
  const pwMutation = useMutation();

  // Per-section feedback: failures go in an ErrorBar, successes in a quiet
  // confirmation line — one pair per card so they never read as each other's.
  const [prefError, setPrefError] = useState<string | null>(null);
  const [prefSaved, setPrefSaved] = useState<string | null>(null);
  const [dnaError, setDnaError] = useState<string | null>(null);
  const [dnaSaved, setDnaSaved] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState<string | null>(null);

  // Editable DNA fields, held as strings so the boxes accept what the user
  // actually types (including a half-typed number).
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [areas, setAreas] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [dnaHydrated, setDnaHydrated] = useState(false);

  // Change-password form.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Seed the form from the first snapshot that arrives. After a save the
  // response and the boxes already agree, so we never re-seed under the
  // user's fingers (pull-to-refresh included).
  useEffect(() => {
    const snapshot = dna.data?.dna;
    if (dnaHydrated || !snapshot) return;
    setBudgetMin(snapshot.budget?.min != null ? String(snapshot.budget.min) : '');
    setBudgetMax(snapshot.budget?.max != null ? String(snapshot.budget.max) : '');
    setBedrooms(snapshot.bedrooms != null ? String(snapshot.bedrooms) : '');
    setAreas((snapshot.locations ?? []).join(', '));
    setIntent(snapshot.intent ?? null);
    setUrgency(snapshot.urgency ?? null);
    setDnaHydrated(true);
  }, [dna.data, dnaHydrated]);

  const prefValue = (key: PrefKey): boolean =>
    prefs.data?.preferences?.[key] ?? PREF_DEFAULTS[key];

  /**
   * Optimistic flip: paint immediately, reconcile with the PATCH response,
   * and roll back if the server refuses. The route *upserts*, so the very
   * first tap of a user with no preference row (`exists: false`) simply
   * creates one — there is no separate "create" flow to handle.
   */
  async function togglePref(key: PrefKey) {
    const before = prefs.data;
    const next = !prefValue(key);

    setPrefError(null);
    setPrefSaved(null);
    prefs.setData(
      before
        ? { ...before, preferences: { ...PREF_DEFAULTS, ...before.preferences, [key]: next } }
        : before
    );

    try {
      const saved = (await prefMutation.run('/api/preferences', 'PATCH', { [key]: next })) as {
        preferences?: Partial<NotificationPreferences>;
      } | null;
      if (saved?.preferences) {
        prefs.setData({ preferences: { ...PREF_DEFAULTS, ...saved.preferences }, exists: true });
      }
      setPrefSaved(t('settings.pushSaved'));
    } catch (e) {
      if (before) prefs.setData(before);
      setPrefError(e instanceof ApiError ? e.message : t('settings.pushFailed'));
    }
  }

  /** Persist the Client DNA edit. The response is a fresh snapshot, so the
   *  card swaps straight to what the server now holds. */
  async function saveDna() {
    setDnaError(null);
    setDnaSaved(null);

    const parse = (raw: string): number | undefined =>
      raw.trim() ? Number(raw.trim()) : undefined;
    const min = parse(budgetMin);
    const max = parse(budgetMax);
    const bed = parse(bedrooms);
    const invalid = (v: number | undefined) => v !== undefined && (!Number.isFinite(v) || v < 0);
    if (invalid(min) || invalid(max) || invalid(bed) || (min !== undefined && max !== undefined && min > max)) {
      setDnaError(t('settings.numbersInvalid'));
      return;
    }

    const body = {
      // `currency` is pinned to EGP: budgets are stored in pounds like every
      // other price, and only *display* converts (see lib/currency).
      budget: { min, max, currency: 'EGP' },
      locations: areas
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
      // `null` clears the field — the route forwards anything non-undefined.
      // `undefined` would vanish in JSON.stringify and silently mean "keep".
      bedrooms: bed ?? null,
      ...(intent ? { intent } : {}),
      ...(urgency ? { urgency } : {}),
    };

    try {
      const patched = (await dnaMutation.run('/api/client-dna', 'PATCH', body)) as Partial<DnaResponse> | null;
      if (patched?.dna) dna.setData({ enabled: dna.data?.enabled ?? true, ...patched });
      setDnaSaved(t('settings.prefsSaved'));
    } catch (e) {
      setDnaError(e instanceof ApiError ? e.message : t('settings.prefsFailed'));
    }
  }

  async function changePassword() {
    setPwError(null);
    setPwSaved(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError(t('settings.passwordRequired'));
      return;
    }
    // 6 is the *server's* floor (src/app/api/auth/change-password) — never
    // reject here what the API would accept. 10 is what we recommend (and
    // what registration enforces for new passwords).
    if (newPassword.length < 6) {
      setPwError(t('settings.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t('settings.passwordMismatch'));
      return;
    }

    try {
      await pwMutation.run('/api/auth/change-password', 'POST', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwSaved(t('settings.passwordChanged'));
    } catch (e) {
      setPwError(e instanceof ApiError ? e.message : t('settings.passwordFailed'));
    }
  }

  if (prefs.loading || dna.loading) return <Loading label={t('settings.loading')} />;

  const refreshing = prefs.refreshing || dna.refreshing;
  const dnaEnabled = dna.data?.enabled ?? true;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        void prefs.refresh();
        void dna.refresh();
      }}>
      {/* 1 — Account ─ name, email, role — session-only, hidden when signed out */}
      {status === 'signedIn' ? (
        <>
          <SectionTitle>{t('settings.account')}</SectionTitle>
          <Card>
            <Row
              left={user ? <Avatar text={initials(user.name)} /> : undefined}
              title={user?.name ?? '—'}
              subtitle={user?.email ?? '—'}
              badge={user?.role ? <Badge tone="gold">{user.role}</Badge> : undefined}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Card>
        <Text style={[styles.help, align]}>{t('settings.languageHelp')}</Text>
        <View style={[styles.pillGroup, row]}>
          <Pill
            label={t('settings.english')}
            active={lang === 'en'}
            onPress={() => setLang('en')}
          />
          <Pill
            label={t('settings.arabic')}
            active={lang === 'ar'}
            onPress={() => setLang('ar')}
          />
        </View>
      </Card>

      <SectionTitle>{t('settings.appearance')}</SectionTitle>
      <Card>
        <Text style={[styles.help, align]}>{t('settings.appearanceHelp')}</Text>
        <Segmented<ThemePreference>
          options={[
            { value: 'light', label: t('common.themeLight') },
            { value: 'dark', label: t('common.themeDark') },
            { value: 'system', label: t('common.themeSystem') },
          ]}
          value={preference}
          onChange={setPreference}
        />
      </Card>

      <SectionTitle>{t('settings.displayCurrency')}</SectionTitle>
      <Card>
        <Text style={[styles.help, align]}>{t('settings.displayCurrencyHelp')}</Text>
        <View style={[styles.pillGroup, row]}>
          {CURRENCY_OPTIONS.map((option) => (
            <Pill
              key={option.code}
              label={`${option.symbol} ${option.code}`}
              active={option.code === currency}
              onPress={() => setCurrency(option.code)}
            />
          ))}
        </View>
      </Card>

      {/* 2 — Notification preferences ─ the server's ALLOWED booleans */}
      {status === 'signedIn' ? (
        <>
          <SectionTitle>{t('settings.notifications')}</SectionTitle>
          <Card>
            {prefs.error ? (
              <ErrorBar message={prefs.error} onRetry={() => void prefs.refresh()} />
            ) : (
              <Text style={[styles.help, align]}>{t('settings.notificationsHelp')}</Text>
            )}
            {PREF_GROUPS.map((group, index) => (
              <View key={group.label}>
                {index > 0 ? <Divider /> : null}
                <Text style={[styles.groupLabel, align]}>{t(group.label)}</Text>
                {group.keys.map((key) => (
                  <PrefToggle
                    key={key}
                    label={t(PREF_LABELS[key])}
                    value={prefValue(key)}
                    disabled={prefMutation.busy}
                    onToggle={() => void togglePref(key)}
                  />
                ))}
              </View>
            ))}
            {prefError ? <ErrorBar message={prefError} /> : null}
            {prefSaved ? <Text style={[styles.saved, align]}>{prefSaved}</Text> : null}
          </Card>
        </>
      ) : null}

      {status === 'signedIn' ? (
        <>
        {/* 3 — Property preferences (Client DNA) */}
        <SectionTitle>{t('settings.preferences')}</SectionTitle>
        <Card>
          <Text style={[styles.help, align]}>{t('settings.preferencesHelp')}</Text>
          {dna.error ? <ErrorBar message={dna.error} onRetry={() => void dna.refresh()} /> : null}
          {!dnaEnabled ? (
            <Text style={[styles.help, align]}>{t('settings.dnaDisabled')}</Text>
          ) : (
            <>
              <Text style={[styles.groupLabel, align]}>{t('settings.budget')}</Text>
              <View style={[styles.fieldRow, row]}>
                <View style={styles.fieldFlex}>
                  <Field
                    label={t('settings.budgetMin')}
                    value={budgetMin}
                    onChangeText={setBudgetMin}
                    keyboardType="number-pad"
                    editable={!dnaMutation.busy}
                  />
                </View>
                <View style={styles.fieldFlex}>
                  <Field
                    label={t('settings.budgetMax')}
                    value={budgetMax}
                    onChangeText={setBudgetMax}
                    keyboardType="number-pad"
                    editable={!dnaMutation.busy}
                  />
                </View>
              </View>

              <Field
                label={t('settings.bedrooms')}
                value={bedrooms}
                onChangeText={setBedrooms}
                keyboardType="number-pad"
                editable={!dnaMutation.busy}
              />

              <Field
                label={t('settings.areas')}
                value={areas}
                onChangeText={setAreas}
                autoCapitalize="words"
                editable={!dnaMutation.busy}
              />
              <Text style={[styles.hint, align]}>{t('settings.areasHint')}</Text>

              <Text style={[styles.groupLabel, align]}>{t('settings.intent')}</Text>
              <View style={[styles.chipRow, row]}>
                <Chip
                  label={t('settings.intentLiving')}
                  selected={intent === 'LIVING'}
                  disabled={dnaMutation.busy}
                  onPress={() => setIntent('LIVING')}
                />
                <Chip
                  label={t('settings.intentInvestment')}
                  selected={intent === 'INVESTMENT'}
                  disabled={dnaMutation.busy}
                  onPress={() => setIntent('INVESTMENT')}
                />
              </View>

              <Text style={[styles.groupLabel, align]}>{t('settings.urgency')}</Text>
              <View style={[styles.chipRow, row]}>
                <Chip
                  label={t('settings.urgencyLow')}
                  selected={urgency === 'LOW'}
                  disabled={dnaMutation.busy}
                  onPress={() => setUrgency('LOW')}
                />
                <Chip
                  label={t('settings.urgencyMedium')}
                  selected={urgency === 'MEDIUM'}
                  disabled={dnaMutation.busy}
                  onPress={() => setUrgency('MEDIUM')}
                />
                <Chip
                  label={t('settings.urgencyHigh')}
                  selected={urgency === 'HIGH'}
                  disabled={dnaMutation.busy}
                  onPress={() => setUrgency('HIGH')}
                />
              </View>

              {dnaError ? <ErrorBar message={dnaError} /> : null}
              {dnaSaved ? <Text style={[styles.saved, align]}>{dnaSaved}</Text> : null}
              <Btn
                title={t('common.save')}
                onPress={() => void saveDna()}
                busy={dnaMutation.busy}
              />
            </>
          )}
        </Card>
        </>
      ) : null}

      {status === 'signedIn' ? (
        <>
        {/* 4 — Security */}
        <SectionTitle>{t('settings.security')}</SectionTitle>
        <Card>
          <Text style={[styles.help, align]}>{t('settings.securityHelp')}</Text>
          {/* Device-local app lock — hidden where the device cannot do device
              auth (no hardware, nothing enrolled, web): a lock you cannot open
              is worse than no lock. */}
          {!lockLoading && lockSupported ? (
            <>
              <Text style={[styles.groupLabel, align]}>{t('settings.appLock')}</Text>
              <Text style={[styles.help, align]}>{t('settings.appLockHelp')}</Text>
              <PrefToggle
                label={t('settings.appLock')}
                value={lockEnabled}
                disabled={lockBusy}
                onToggle={() => {
                  if (lockBusy) return;
                  setLockBusy(true);
                  setLockError(null);
                  const done = () => setLockBusy(false);
                  if (lockEnabled) {
                    void disableLock().then(done, done);
                  } else {
                    void enableLock(t('settings.appLockPrompt')).then((ok) => {
                      if (!ok) setLockError(t('settings.appLockEnableFailed'));
                      done();
                    }, done);
                  }
                }}
              />
              {lockError ? <ErrorBar message={lockError} /> : null}
              <Divider />
            </>
          ) : null}
          <Field
            label={t('settings.currentPassword')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            textContentType="password"
            editable={!pwMutation.busy}
          />
          <Field
            label={t('settings.newPassword')}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            textContentType="newPassword"
            editable={!pwMutation.busy}
          />
          <Field
            label={t('settings.confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!pwMutation.busy}
            onSubmitEditing={() => void changePassword()}
            returnKeyType="go"
          />
          {pwError ? <ErrorBar message={pwError} /> : null}
          {pwSaved ? <Text style={[styles.saved, align]}>{pwSaved}</Text> : null}
          <Btn
            title={t('settings.changePassword')}
            onPress={() => void changePassword()}
            busy={pwMutation.busy}
          />
        </Card>
        </>
      ) : null}

      {/* 5 — Saved searches live in their own tab; this is the doorway */}
      <SectionTitle>{t('settings.savedSearches')}</SectionTitle>
      <Card>
        <Row
          title={t('settings.savedSearches')}
          subtitle={t('settings.savedSearchesHint')}
          onPress={() => router.push('/(tabs)/saved')}
        />
      </Card>

      {/* 6 — About */}
      <SectionTitle>{t('settings.about')}</SectionTitle>
      <Card>
        <Row
          title={t('settings.version')}
          right={
            <Text style={[styles.value, align]}>
              {Constants.expoConfig?.version ?? '—'}
            </Text>
          }
        />
        <Divider />
        <Row
          title={t('settings.apiHost')}
          right={
            <Text style={[styles.value, align]} numberOfLines={1}>
              {API_URL}
            </Text>
          }
        />
      </Card>

      {/* 7 — Company links: the website footer's `company` group, minus
          Compare which already has a doorway above. */}
      <SectionTitle>{t('settings.company')}</SectionTitle>
      <Card>
        <Row title={t('guide.helpTitle')} onPress={() => router.push('/help')} />
        <Divider />
        <Row title={t('content.aboutTitle')} onPress={() => router.push('/about')} />
        <Divider />
        <Row title={t('contact.title')} onPress={() => router.push('/contact')} />
        <Divider />
        <Row title={t('careers.title')} onPress={() => router.push('/careers')} />
        <Divider />
        <Row title={t('blog.title')} onPress={() => router.push('/blog')} />
        <Divider />
        <Row title={t('press.title')} onPress={() => router.push('/press')} />
      </Card>

      {/* 8 — Legal links: the website footer's `legal` group. */}
      <SectionTitle>{t('settings.legal')}</SectionTitle>
      <Card>
        <Row title={t('content.privacyTitle')} onPress={() => router.push('/privacy')} />
        <Divider />
        <Row title={t('content.termsTitle')} onPress={() => router.push('/terms')} />
        <Divider />
        <Row title={t('content.cookiesTitle')} onPress={() => router.push('/cookies')} />
      </Card>

      {/* 9 — Sign in / Sign out */}
      {status === 'signedIn' ? (
        <Pressable
          onPress={() => signOut()}
          style={({ pressed }) => [styles.signOut, row, pressed && { opacity: 0.8 }]}>
          <Ionicons name="log-out-outline" size={18} color={theme.dangerFg} />
          <Text style={[styles.signOutText, text]}>{t('tools.signOut')}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push('/login')}
          style={({ pressed }) => [styles.signOut, row, pressed && { opacity: 0.8 }]}>
          <Ionicons name="log-in-outline" size={18} color={theme.dangerFg} />
          <Text style={[styles.signOutText, text]}>{t('account.signIn')}</Text>
        </Pressable>
      )}
    </Screen>
  );
}

/* ── Small building blocks ─────────────────────────────────────────────── */

/** One notification row: label on the reading edge, On/Off pill opposite. */
function PrefToggle({
  label,
  value,
  disabled,
  onToggle,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <Row
      title={label}
      right={
        <Chip
          label={value ? t('settings.on') : t('settings.off')}
          selected={value}
          disabled={disabled}
          onPress={onToggle}
        />
      }
    />
  );
}

/** Language / currency selector pill — the same active treatment the Tools
 *  tab uses, but as one shared component so both cards paint identically. */
function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        pressed && { opacity: 0.8 },
      ]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    help: { color: t.mutedForeground, fontSize: 14, lineHeight: 19 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
    // Group caption inside a card — `text-xs font-semibold uppercase tracking-wide`
    groupLabel: {
      color: t.mutedForeground,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: Spacing.xs,
    },
    saved: { color: t.successFg, fontSize: 13, fontWeight: '600' },
    value: { color: t.foreground, fontSize: 14, fontWeight: '600', flexShrink: 1 },

    pillGroup: { gap: Spacing.sm },
    pill: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xl,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillActive: { borderColor: t.primary, backgroundColor: t.goldBg },
    pillText: { color: t.mutedForeground, fontSize: 14, fontWeight: '700' },
    pillTextActive: { color: t.primary },

    fieldRow: { gap: Spacing.sm },
    fieldFlex: { flex: 1 },
    chipRow: { gap: Spacing.sm, flexWrap: 'wrap' },

    signOut: {
      marginTop: Spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.destructive,
      borderRadius: Radius.xl,
      paddingVertical: 14,
    },
    signOutText: { color: t.dangerFg, fontSize: 16, fontWeight: '700' },
  }),
);
