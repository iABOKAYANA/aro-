import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { ApiError } from '@/api/client';
import { ErrorBar } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * Invitation-only registration — the app's counterpart of the website's
 * /auth/register.
 *
 * The platform has no open sign-up: an administrator issues a token, and
 * `POST /api/auth/register` accepts the form only when that token is PENDING,
 * unexpired, and belongs to the same email. The server does that whole check
 * (and the `registerSchema` validation), so this screen's job is purely to
 * collect the fields and surface whatever `error` string comes back.
 *
 * Registration mints no session — on success we say so and send the user to
 * sign in, exactly like the website does.
 */
export default function RegisterScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { t, align, text } = useI18n();
  const mutation = useMutation();

  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const busy = mutation.busy;

  // Hold the confirmation on screen for a beat so the user reads it, then
  // land on sign-in. Registration deliberately does not sign anyone in.
  // The `?registered=true` flag mirrors the website's
  // `/auth/login?registered=true` redirect so login shows its banner.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => router.replace('/login?registered=true'), 1500);
    return () => clearTimeout(id);
  }, [done, router]);

  async function onSubmit() {
    if (busy || done) return;
    setError(null);

    const trimmedEmail = email.trim();
    if (!token.trim()) {
      setError(t('register.tokenRequired'));
      return;
    }
    if (!name.trim()) {
      setError(t('register.nameRequired'));
      return;
    }
    if (!trimmedEmail || !password) {
      setError(t('register.emailRequired'));
      return;
    }
    // The server's floor is 10 (registerSchema) — same rule as everywhere
    // else in the app, so we never promise stricter than the API enforces.
    if (password.length < 10) {
      setError(t('settings.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('settings.passwordMismatch'));
      return;
    }

    try {
      await mutation.run('/api/auth/register', 'POST', {
        token: token.trim(),
        name: name.trim(),
        email: trimmedEmail,
        phone: phone.trim() || undefined,
        password,
        confirmPassword: confirm,
        role: 'USER',
      });
      setDone(true);
    } catch (e) {
      // Invitation problems (403 invalid / used / expired / wrong email) and
      // schema messages all arrive as the route's `error` string — show it as-is.
      setError(e instanceof ApiError ? e.message : t('register.failed'));
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
            <Text style={styles.brandName}>{t('common.appName')}</Text>
            <Text style={[styles.brandTag, text]}>{t('account.brandTag')}</Text>
          </View>

          <Text style={[styles.subtitle, align]}>{t('register.subtitle')}</Text>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('register.token')}</Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholderTextColor={theme.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="oneTimeCode"
              style={[styles.input, align]}
              editable={!busy && !done}
            />
            <Text style={[styles.hint, align]}>{t('register.tokenHint')}</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('register.name')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholderTextColor={theme.mutedForeground}
              autoComplete="name"
              textContentType="name"
              style={[styles.input, align]}
              editable={!busy && !done}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('register.email')}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('register.emailPlaceholder')}
              placeholderTextColor={theme.mutedForeground}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              style={[styles.input, align]}
              editable={!busy && !done}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('register.phone')}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholderTextColor={theme.mutedForeground}
              autoComplete="tel"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              style={[styles.input, align]}
              editable={!busy && !done}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('register.password')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('register.passwordPlaceholder')}
              placeholderTextColor={theme.mutedForeground}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              style={[styles.input, align]}
              editable={!busy && !done}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('register.confirmPassword')}</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder={t('register.confirmPlaceholder')}
              placeholderTextColor={theme.mutedForeground}
              secureTextEntry
              autoComplete="new-password"
              style={[styles.input, align]}
              editable={!busy && !done}
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />
          </View>

          {error ? <ErrorBar message={error} /> : null}

          {done ? (
            <View style={styles.doneBox}>
              <Text style={[styles.doneText, align]}>{t('register.done')}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={busy || done}
            style={({ pressed }) => [
              styles.button,
              (busy || done) && styles.buttonDisabled,
              pressed && !busy && !done && styles.buttonPressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, text]}>{t('register.submit')}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.push('/login')} hitSlop={8}>
            <Text style={[styles.link, text]}>{t('register.haveAccount')}</Text>
          </Pressable>
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
    brandBlock: { alignItems: 'center', marginBottom: Spacing.lg },
    brandName: {
      color: t.primary,
      fontSize: 34,
      fontWeight: '800',
      letterSpacing: 6,
    },
    brandTag: {
      color: t.mutedForeground,
      fontSize: 12,
      letterSpacing: 5,
      marginTop: 4,
    },
    subtitle: { color: t.mutedForeground, fontSize: 16, marginBottom: Spacing.sm },
    field: { marginBottom: Spacing.sm },
    label: {
      color: t.mutedForeground,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 6,
    },
    hint: { color: t.mutedForeground, fontSize: 12, marginTop: 6, lineHeight: 16 },
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
    doneBox: {
      backgroundColor: t.successBg,
      borderWidth: 1,
      borderColor: t.successFg,
      borderRadius: Radius.sm,
      padding: Spacing.sm + 2,
      marginBottom: Spacing.sm,
    },
    doneText: { color: t.successFg, fontSize: 14, lineHeight: 20, fontWeight: '600' },
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
    link: {
      color: t.primary,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: Spacing.md,
    },
  }),
);
