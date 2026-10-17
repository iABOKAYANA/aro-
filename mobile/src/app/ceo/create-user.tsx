import { Stack } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  Btn,
  Card,
  Chip,
  ErrorBar,
  Field,
  Screen,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { useImageUpload } from '@/lib/image-upload';
import { createStyles } from '@/lib/theme';

/** The exact list the website's role <select> offers (no CEO). */
const ROLES = ['BUYER', 'BROKER', 'DEVELOPER', 'SELLER', 'ADMIN'] as const;

const ROLE_LABELS: Record<string, MessageKey> = {
  BUYER: 'ceoPpl.role.buyer',
  BROKER: 'ceoPpl.role.broker',
  DEVELOPER: 'ceoPpl.role.developer',
  SELLER: 'ceoPpl.role.seller',
  ADMIN: 'ceoPpl.role.admin',
};

type Success = { email: string; password: string };

/** Maps the upload helper's stable error codes onto failure-strip strings. */
const UPLOAD_ERROR_KEY = {
  'too-large': 'ceoPpl.user.uploadTooLarge',
  'bad-type': 'ceoPpl.user.uploadBadType',
  failed: 'ceoPpl.user.uploadFailed',
} as const;

/**
 * Direct account creation — the website's /ceo/create-user form.
 *
 * `POST /api/ceo/create-user` takes `{ email, name, password, role, avatar }`
 * and answers 400 when a required field is missing and 409 when the email is
 * taken; both strings surface in the error strip exactly as the site shows
 * them. The server never returns the password, so — like the website — the
 * success panel repeats the credentials the CEO typed in, ready to hand over.
 */
export default function CeoCreateUserScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const mutation = useMutation();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('BUYER');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  const busy = mutation.busy;
  // Phone upload for the avatar field — fills it with the stored path exactly
  // like the website's ImageInput does; URL paste below keeps working.
  const avatarUpload = useImageUpload(setAvatar);

  async function onSubmit() {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError(t('ceoPpl.user.required'));
      return;
    }
    try {
      await mutation.run('/api/ceo/create-user', 'POST', {
        email: email.trim(),
        name: name.trim(),
        password,
        role,
        avatar: avatar.trim(),
      });
      setSuccess({ email: email.trim(), password });
      setEmail('');
      setName('');
      setAvatar('');
      setPassword('');
      setRole('BUYER');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  }

  /** The site's clipboard copy; a phone shares the same text instead. */
  async function shareCredentials() {
    if (!success) return;
    try {
      await Share.share({ message: `Email: ${success.email}\nPassword: ${success.password}` });
    } catch {
      // The share sheet was dismissed — nothing to report.
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('ceoPpl.createUserTitle') }} />

      <Text style={[styles.intro, align]}>{t('ceoPpl.user.intro')}</Text>

      <Card style={styles.form}>
        <Text style={[styles.title, align]}>{t('ceoPpl.user.newAccount')}</Text>
        <Text style={[styles.hint, align]}>{t('ceoPpl.user.newAccountHint')}</Text>

        {error ? <ErrorBar message={error} /> : null}

        {success ? (
          <View style={styles.successBox}>
            <Text style={[styles.successTitle, align]}>{`✓ ${t('ceoPpl.user.created')}`}</Text>
            <View style={styles.credentials}>
              <Text style={[styles.credential, align]}>
                {`${t('common.email')}: ${success.email}`}
              </Text>
              <Text style={[styles.credential, align]}>
                {`${t('register.password')}: ${success.password}`}
              </Text>
            </View>
            <View style={[styles.actions, row]}>
              <Btn title={t('ceoPpl.user.shareCredentials')} variant="ghost" onPress={() => void shareCredentials()} />
              <Btn title={t('ceoPpl.user.dismiss')} variant="ghost" onPress={() => setSuccess(null)} />
            </View>
          </View>
        ) : null}

        <Field
          label={t('common.email')}
          value={email}
          onChangeText={setEmail}
          placeholder="user@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!busy}
        />
        <Field
          label={t('common.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('common.name')}
          editable={!busy}
        />
        <Field
          label={t('ceoPpl.user.avatarUrl')}
          value={avatar}
          onChangeText={setAvatar}
          placeholder="https://example.com/image.jpg"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
        />
        <Btn
          title={avatarUpload.uploading ? t('ceoPpl.user.uploading') : t('ceoPpl.user.uploadImage')}
          variant="ghost"
          busy={avatarUpload.uploading}
          disabled={busy}
          onPress={() => void avatarUpload.pick()}
        />
        {avatarUpload.errorCode ? (
          <Text style={[styles.uploadError, align]}>{t(UPLOAD_ERROR_KEY[avatarUpload.errorCode])}</Text>
        ) : null}
        <Field
          label={t('register.password')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('ceoPpl.user.passwordHint')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />

        <Text style={[styles.label, align]}>{t('ceoPpl.roleLabel')}</Text>
        <View style={[styles.chips, row]}>
          {ROLES.map((value) => (
            <Chip
              key={value}
              label={t(ROLE_LABELS[value])}
              disabled={busy}
              selected={role === value}
              onPress={() => setRole(value)}
            />
          ))}
        </View>

        <Btn
          title={t('ceoPpl.user.create')}
          busy={busy}
          disabled={!email.trim() || !password}
          onPress={() => void onSubmit()}
        />
      </Card>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    form: { gap: 4 },
    title: { color: t.foreground, fontSize: 18, fontWeight: '600' },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    label: { color: t.mutedForeground, fontSize: 14, fontWeight: '500', marginTop: Spacing.xs },
    chips: { flexWrap: 'wrap', gap: 8, marginTop: 2, marginBottom: Spacing.sm },
    uploadError: { color: t.dangerFg, fontSize: 13, lineHeight: 18 },
    actions: { flexWrap: 'wrap', gap: 8 },
    successBox: {
      backgroundColor: t.successBg,
      borderWidth: 1,
      borderColor: t.successFg,
      borderRadius: Radius.md,
      padding: Spacing.sm + 2,
      gap: 8,
      marginTop: Spacing.xs,
    },
    successTitle: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    credentials: {
      backgroundColor: t.card,
      borderRadius: Radius.sm,
      padding: Spacing.sm,
      gap: 2,
    },
    credential: { color: t.foreground, fontSize: 14 },
  }),
);
