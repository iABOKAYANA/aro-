import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError } from '@/api/client';
import { Btn, Card, Chip, ErrorBar, Field, Screen, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { type ContactMessageKey } from '@/i18n/messages/contact';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * The website's public contact page — src/app/(public)/contact/page.tsx —
 * restated for a phone: the same title/subtitle, the same four office cards,
 * the same form fields, and the same success confirmation.
 *
 * The form posts to `POST /api/inquiries` — byte-for-byte what the website's
 * own submit handler calls (`src/app/(public)/contact/page.tsx`), so a mobile
 * submission lands in the same `Inquiry` table as a website one instead of in
 * the `ContactSubmission` table that `/api/contact` writes to and no page on
 * the website has ever read. The server contract there is `{ name, email,
 * phone, message, type, unitId }` with name and phone mandatory; everything
 * else follows `inquirySchema` (src/lib/validations.ts), which is the exact
 * object the website `JSON.stringify`s, so a value accepted here is accepted
 * everywhere the same schema is applied.
 */
export default function ContactScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t: translate, row, text, align } = useI18n();
  const mutation = useMutation();
  // `MessageKey` in i18n/index.tsx — a file this screen does not own — does not
  // list the `contact` namespace yet, so `t` is widened once, here, to the keys
  // the namespace actually declares. Typos stay compile errors; when the union
  // upstream grows `| keyof typeof contact` this line becomes a no-op.
  const t = translate as (key: ContactMessageKey) => string;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<InquiryType>('GENERAL');
  // Prefilled inquiry context (e.g. a showcase-model card pushes
  // `/contact?message=…` naming the model type) — empty otherwise.
  const params = useLocalSearchParams<{ message?: string | string[] }>();
  const prefill = Array.isArray(params.message) ? params.message[0] : params.message;
  const [message, setMessage] = useState(typeof prefill === 'string' ? prefill : '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const busy = mutation.busy;

  /** `inquirySchema` mirrored by hand — this screen may not import the web zod. */
  function validate(): string | null {
    if (name.trim().length < 2) return t('contact.nameRequired');
    // The schema leaves email optional (`email().optional().or(literal(''))`)
    // and `/api/inquiries` never reads it — only check the shape when typed.
    if (email.trim() && !EMAIL_RE.test(email.trim())) return t('contact.emailInvalid');
    // `phone: z.string().min(10)` — and `/api/inquiries` 400s without it.
    if (phone.trim().length < 10) return t('contact.phoneRequired');
    // Both the schema and the endpoint leave `message` optional, so an empty
    // box is a valid submission exactly as it is on the website.
    return null;
  }

  async function onSubmit() {
    if (busy || done) return;
    setError(null);

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    try {
      await mutation.run('/api/inquiries', 'POST', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: message.trim(),
        type,
      });
      // Same as the website: the form clears the moment it succeeds.
      setName('');
      setPhone('');
      setEmail('');
      setType('GENERAL');
      setMessage('');
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('contact.failed'));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Stack.Screen options={{ title: t('contact.title') }} />

        <View style={styles.head}>
          <Text style={[styles.title, text]}>{t('contact.title')}</Text>
          <Text style={[styles.subtitle, text]}>{t('contact.subtitle')}</Text>
        </View>

        {OFFICES.map((office) => (
          <Card key={office.valueKey}>
            <View style={[styles.info, row]}>
              <View style={styles.infoIcon}>
                <Ionicons name={office.icon} size={18} color={theme.primary} />
              </View>
              <View style={styles.infoText}>
                <Text style={[styles.infoLabel, align]}>{t(office.labelKey)}</Text>
                <Text style={[styles.infoValue, align]}>{t(office.valueKey)}</Text>
              </View>
            </View>
          </Card>
        ))}

        <Card>
          <SectionTitle>{t('contact.formTitle')}</SectionTitle>

          {done ? (
            <View style={styles.doneBox}>
              <Text style={[styles.doneTitle, text]}>{t('contact.sentTitle')}</Text>
              <Text style={[styles.doneBody, text]}>{t('contact.sentBody')}</Text>
              <Btn title={t('contact.sendAnother')} variant="ghost" onPress={() => setDone(false)} />
            </View>
          ) : (
            <>
              <Field
                label={t('contact.name')}
                value={name}
                onChangeText={setName}
                placeholder={t('contact.namePlaceholder')}
                autoComplete="name"
                textContentType="name"
                editable={!busy}
              />
              <Field
                label={t('contact.phone')}
                value={phone}
                onChangeText={setPhone}
                placeholder={t('contact.phonePlaceholder')}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                editable={!busy}
              />
              <Field
                label={t('contact.email')}
                value={email}
                onChangeText={setEmail}
                placeholder={t('contact.emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                editable={!busy}
              />

              <View style={styles.field}>
                <Text style={[styles.label, align]}>{t('contact.inquiryType')}</Text>
                <View style={[styles.chips, row]}>
                  {INQUIRY_TYPES.map((option) => (
                    <Chip
                      key={option.value}
                      label={t(option.labelKey)}
                      selected={type === option.value}
                      disabled={busy}
                      onPress={() => setType(option.value)}
                    />
                  ))}
                </View>
              </View>

              <Field
                label={t('contact.message')}
                value={message}
                onChangeText={setMessage}
                placeholder={t('contact.messagePlaceholder')}
                multiline
                textAlignVertical="top"
                editable={!busy}
              />

              {error ? <ErrorBar message={error} /> : null}

              <Btn title={t('contact.send')} busy={busy} onPress={onSubmit} />
            </>
          )}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** The `<select>` options of the website contact form, in the same order. */
const INQUIRY_TYPES = [
  { value: 'GENERAL', labelKey: 'contact.typeGeneral' },
  { value: 'VISIT_REQUEST', labelKey: 'contact.typeVisit' },
  { value: 'PRICE_INQUIRY', labelKey: 'contact.typePrice' },
  { value: 'AVAILABILITY', labelKey: 'contact.typeAvailability' },
  { value: 'PAYMENT_PLAN', labelKey: 'contact.typePaymentPlan' },
  { value: 'CALLBACK', labelKey: 'contact.typeCallback' },
] as const;

type InquiryType = (typeof INQUIRY_TYPES)[number]['value'];

/** The office cards, in the order the website renders them. */
const OFFICES = [
  { icon: 'call-outline', labelKey: 'contact.phone', valueKey: 'contact.officePhone' },
  { icon: 'mail-outline', labelKey: 'contact.email', valueKey: 'contact.officeEmail' },
  { icon: 'location-outline', labelKey: 'contact.address', valueKey: 'contact.officeAddress' },
  { icon: 'time-outline', labelKey: 'contact.hours', valueKey: 'contact.officeHours' },
] as const;

/** Good enough for `z.string().email()` without dragging zod into the app. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const useStyles = createStyles((t) =>
  StyleSheet.create({
    flex: { flex: 1 },
    head: { alignItems: 'center', gap: 6, marginBottom: Spacing.xs },
    title: { color: t.foreground, fontSize: 28, fontWeight: '800', textAlign: 'center' },
    subtitle: {
      color: t.mutedForeground,
      fontSize: 16,
      lineHeight: 22,
      textAlign: 'center',
    },

    // `flex items-center gap-4 p-4` around the icon chip on the website
    info: { alignItems: 'center', gap: Spacing.sm + 4 },
    infoIcon: {
      width: 40,
      height: 40,
      borderRadius: Radius.md,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoText: { flex: 1, gap: 2 },
    infoLabel: { color: t.mutedForeground, fontSize: 13 },
    infoValue: { color: t.foreground, fontSize: 16, fontWeight: '600' },

    // Labelled control the kit has no shorthand for (the inquiry `<select>`)
    field: { gap: 6, marginBottom: Spacing.sm },
    label: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    // `py-8 text-center` success block
    doneBox: {
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.lg,
    },
    doneTitle: { color: t.successFg, fontSize: 18, fontWeight: '700', textAlign: 'center' },
    doneBody: {
      color: t.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
  })
);
