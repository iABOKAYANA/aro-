import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/auth/auth-context';
import { API_URL, IS_DEV } from '@/api/config';
import { GoldDivider, Kicker } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useI18n, type MessageKey } from '@/i18n';
import { useAppFonts } from '@/lib/fonts';
import { createStyles, useTheme } from '@/lib/theme';

/** Seed logins from the website's demo section — tap-to-fill, nothing else. */
const DEMO_ACCOUNTS: { labelKey: MessageKey; email: string }[] = [
  { labelKey: 'account.demoAdmin', email: 'admin@estateai.eg' },
  { labelKey: 'account.demoBroker', email: 'broker@estateai.eg' },
  { labelKey: 'account.demoDeveloper', email: 'developer@estateai.eg' },
  { labelKey: 'account.demoUser', email: 'user@estateai.eg' },
];
const DEMO_PASSWORD = 'password123';

export default function LoginScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const { t, align, text, row, isRtl } = useI18n();
  const fonts = useAppFonts();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  // The register screen lands here with `?registered=true` — the app's
  // version of the website's `/auth/login?registered=true` confirmation.
  const rawRegistered = Array.isArray(params.registered) ? params.registered[0] : params.registered;
  const justRegistered = !!rawRegistered && rawRegistered !== 'false';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError(t('account.required'));
      return;
    }

    setBusy(true);
    try {
      // On success the auth context flips to signedIn and AuthGate routes away.
      await signIn(trimmed, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('account.signInFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bounces={false}>
          <View style={styles.brandBlock}>
            <Text style={[styles.brandName, fonts.displayBold]}>GHAYA</Text>
            <Kicker centered>{t('account.brandTag')}</Kicker>
          </View>
          <GoldDivider />

          <Text style={[styles.title, align, fonts.displayBold]}>{t('account.welcomeBack')}</Text>
          <Text style={[styles.subtitle, align]}>{t('account.signInSubtitle')}</Text>

          {justRegistered ? (
            <View style={styles.registeredBox}>
              <Text style={[styles.registeredText, align]}>{t('account.registered')}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('common.email')}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('account.emailPlaceholder')}
              placeholderTextColor={theme.mutedForeground}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              style={[styles.input, align]}
              editable={!busy}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('account.password')}</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t('account.passwordPlaceholder')}
                placeholderTextColor={theme.mutedForeground}
                secureTextEntry={!showPassword}
                textContentType="password"
                style={[styles.input, styles.passwordInput, align]}
                editable={!busy}
                onSubmitEditing={onSubmit}
                returnKeyType="go"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t(showPassword ? 'account.hidePassword' : 'account.showPassword')}
                style={[styles.eye, isRtl ? styles.eyeRtl : styles.eyeLtr]}>
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={theme.mutedForeground}
                />
              </Pressable>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={[styles.errorText, align]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              busy && styles.buttonDisabled,
              pressed && !busy && styles.buttonPressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, text]}>{t('account.signIn')}</Text>
            )}
          </Pressable>

          {/* Invitation-only sign-up — the only door besides signing in. */}
          <Pressable onPress={() => router.push('/register')} hitSlop={8}>
            <Text style={[styles.registerLink, text]}>{t('register.title')}</Text>
          </Pressable>

          {/* No public sign-up — accounts are by invitation. Contact the team. */}
          <Text style={[styles.noAccount, text]}>
            {t('account.noAccount')}{' '}
            <Text onPress={() => router.push('/contact')} style={styles.inlineLink}>
              {t('account.contactUs')}
            </Text>
          </Text>

          {/* The website's demo section, restated as tap-to-fill. */}
          <Text style={[styles.demoTitle, align]}>{t('account.demoAccounts')}</Text>
          <View style={[styles.demoGrid, row]}>
            {DEMO_ACCOUNTS.map((account) => (
              <Pressable
                key={account.email}
                onPress={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                }}
                disabled={busy}
                style={({ pressed }) => [
                  styles.demoCard,
                  pressed && !busy && styles.demoCardPressed,
                ]}>
                <Text style={[styles.demoRole, align]}>{t(account.labelKey)}</Text>
                <Text style={[styles.demoEmail, align]} numberOfLines={1}>
                  {account.email}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.demoNote, text]}>{t('account.demoPasswordNote')}</Text>

          {/* The escape hatch. Browsing never requires an account, so this
              screen is reached by choice, not by ambush — and it has to offer
              a way back out. `replace` rather than `push`, so Back doesn't
              return to the form. */}
          <Pressable onPress={() => router.replace('/')} hitSlop={8}>
            <Text style={[styles.browseLink, text]}>{t('account.browseWithout')}</Text>
          </Pressable>

          {IS_DEV ? (
            <Text style={styles.devHint}>API: {API_URL}</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.background },
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xl,
      gap: Spacing.sm,
    },
    brandBlock: { alignItems: 'center', marginBottom: Spacing.xl },
    brandName: {
      color: t.primary,
      fontSize: 36,
      lineHeight: 44,
      fontWeight: '800',
      letterSpacing: 6,
    },
    title: { color: t.foreground, fontSize: 28, lineHeight: 36, fontWeight: '700' },
    subtitle: { color: t.mutedForeground, fontSize: 16, marginBottom: Spacing.md },
    field: { marginBottom: Spacing.md },
    label: {
      color: t.mutedForeground,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 6,
    },
    input: {
      backgroundColor: t.background,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 14,
      color: t.foreground,
      fontSize: 16,
    },
    passwordWrap: { position: 'relative', justifyContent: 'center' },
    passwordInput: { paddingEnd: 44 },
    eye: { position: 'absolute', padding: 4 },
    eyeLtr: { right: 12 },
    eyeRtl: { left: 12 },
    errorBox: {
      backgroundColor: t.dangerBg,
      borderColor: t.destructive,
      borderWidth: 1,
      borderRadius: Radius.sm,
      padding: Spacing.sm + 2,
      marginBottom: Spacing.sm,
    },
    errorText: { color: t.dangerFg, fontSize: 14, lineHeight: 20 },
    registeredBox: {
      backgroundColor: t.successBg,
      borderColor: t.successFg,
      borderWidth: 1,
      borderRadius: Radius.sm,
      padding: Spacing.sm + 2,
      marginBottom: Spacing.sm,
    },
    registeredText: { color: t.successFg, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    button: {
      backgroundColor: t.primary,
      borderRadius: Radius.md,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    buttonDisabled: { opacity: 0.7 },
    buttonPressed: { opacity: 0.85 },
    buttonText: {
      color: t.primaryForeground,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    registerLink: {
      color: t.primary,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: Spacing.md,
    },
    noAccount: {
      color: t.mutedForeground,
      fontSize: 14,
      textAlign: 'center',
      marginTop: Spacing.md,
    },
    inlineLink: { color: t.primary, fontWeight: '600' },
    demoTitle: {
      color: t.mutedForeground,
      fontSize: 14,
      marginTop: Spacing.md,
    },
    demoGrid: { flexWrap: 'wrap', gap: 8, marginTop: 8 },
    demoCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: t.background,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.sm,
      padding: Spacing.sm,
    },
    demoCardPressed: { opacity: 0.7 },
    demoRole: { color: t.foreground, fontSize: 13, fontWeight: '700' },
    demoEmail: { color: t.mutedForeground, fontSize: 12, marginTop: 2 },
    demoNote: {
      color: t.mutedForeground,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 8,
    },
    browseLink: {
      color: t.mutedForeground,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: Spacing.lg,
    },
    devHint: {
      color: t.mutedForeground,
      fontSize: 12,
      textAlign: 'center',
      marginTop: Spacing.lg,
    },
  }),
);
