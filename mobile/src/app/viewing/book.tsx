import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useRequireAuth } from '@/components/auth-gate';
import {
  Btn,
  Card,
  Chip,
  Divider,
  ErrorBar,
  Field,
  Row,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { useAuth } from '@/auth/auth-context';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { createStyles } from '@/lib/theme';

/**
 * Book a viewing — the same `POST /api/viewings` the website's booking modal
 * calls, so a booking made in the app lands on the Leads page and the CEO
 * meetings page at the same moment, with no mobile-only code path.
 *
 * The endpoint needs **no** login: a guest booking still creates a lead. When
 * we do have a session we send it, and the server prefills what it can.
 */

type Params = {
  projectId?: string;
  unitId?: string;
  name?: string;
};

const TIME_SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

/** Same 15-minute lead time the website enforces before a slot is refused. */
const LEAD_MS = 15 * 60 * 1000;

type Day = { value: string; weekday: string; label: string };

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** The next `count` days in *local* time — `toISOString()` is UTC and would
 *  hand back yesterday's date near midnight in UTC+2 (Egypt). */
function upcomingDays(count: number): Day[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index + 1);
    return {
      value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    };
  });
}

type Created = { id: string; meetingType: string; meetingLink?: string | null; scheduledAt: string };

export default function BookViewingScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { user, session } = useAuth();
  const { t, row, align, text, lang } = useI18n();

  const projectId = params.projectId ? String(params.projectId) : undefined;
  const unitId = params.unitId ? String(params.unitId) : undefined;
  const propertyName = params.name ? String(params.name) : undefined;

  const days = useMemo(() => upcomingDays(14), []);

  const [meetingType, setMeetingType] = useState<'in_person' | 'online'>('in_person');
  const [date, setDate] = useState(days[1]?.value ?? days[0].value);
  const [time, setTime] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  // Progress stepper — three dots straight from real form state. Same tests
  // `submit()` applies, so a lit dot can never promise what validation refuses.
  const phoneDigits = phone.replace(/[\s\-().]/g, '');
  const phoneOk = /^\+?\d{7,15}$/.test(phoneDigits);
  const steps = [
    { label: t('viewings.dotDay'), done: Boolean(date) },
    { label: t('viewings.dotTime'), done: Boolean(time) },
    { label: t('viewings.dotDetails'), done: Boolean(name.trim()) && phoneOk },
  ];

  async function submit() {
    setError(null);

    if (!projectId && !unitId) {
      setError(t('viewings.errNoProperty'));
      return;
    }
    if (!date || !time) {
      setError(t('viewings.errPickTime'));
      return;
    }
    const when = new Date(`${date}T${time}:00`);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + LEAD_MS) {
      setError(t('viewings.errSlotTaken'));
      return;
    }
    if (!name.trim()) {
      setError(t('viewings.errName'));
      return;
    }
    const digits = phone.replace(/[\s\-().]/g, '');
    if (!/^\+?\d{7,15}$/.test(digits)) {
      setError(t('viewings.errPhone'));
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ viewing?: Created }>('/api/viewings', {
        method: 'POST',
        // The session is optional: an anonymous booking still creates a lead.
        token: session?.token ?? null,
        body: JSON.stringify({
          projectId,
          unitId,
          meetingType,
          scheduledAt: when.toISOString(),
          duration: 30,
          notes: notes.trim() || undefined,
          name: name.trim(),
          phone: digits,
        }),
      });
      if (result.viewing) setCreated(result.viewing);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('viewings.errBookFailed'));
    } finally {
      setBusy(false);
    }
  }

  /* ── Confirmation ─────────────────────────────────────────────── */
  if (created) {
    const when = new Date(created.scheduledAt);
    // One-tap WhatsApp confirmation — pure `wa.me` deep link, no API, no
    // auto-send. The phone is the one just typed in the form; the button
    // hides when it cannot address a chat (defensive: submit() already
    // requires 7–15 digits, so this is normally always shown).
    const waDigits = phone.replace(/\D/g, '');
    const hasWaPhone = waDigits.length >= 7;
    const waDate = when.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const waTime =
      time ||
      when.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    const waType =
      created.meetingType === 'online' ? t('viewings.onlineMeeting') : t('viewings.inPerson');
    const waText = t('viewings.waConfirm')
      .replace('{name}', name.trim() || propertyName || '…')
      .replace('{project}', propertyName || t('viewings.property'))
      .replace('{date}', waDate)
      .replace('{time}', waTime)
      .replace('{type}', waType);
    const waHref = hasWaPhone ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}` : null;
    return (
      <Screen>
        <Stack.Screen options={{ title: t('viewings.booked') }} />
        <Card>
          <SectionTitle>{t('viewings.requested')}</SectionTitle>
          <Text style={[styles.success, align]}>
            {t('viewings.successNamed').replace('{name}', name.trim() || propertyName || '…')}
          </Text>
          <Divider />
          <Row title={formatDate(when, true)} subtitle={t('viewings.when')} />
          <Divider />
          <Row
            title={
              created.meetingType === 'online' ? t('viewings.onlineMeeting') : t('viewings.inPerson')
            }
            subtitle={propertyName ?? t('viewings.property')}
          />
          {created.meetingLink ? (
            <>
              <Divider />
              <Row
                title={created.meetingLink}
                subtitle={t('viewings.meetingLink')}
                onPress={() => Linking.openURL(String(created.meetingLink))}
              />
            </>
          ) : null}
        </Card>

        {created.meetingLink ? (
          <Btn
            title={t('viewings.openLink')}
            onPress={() => Linking.openURL(String(created.meetingLink))}
          />
        ) : null}
        {waHref ? (
          <Btn
            title={t('viewings.confirmWhatsApp')}
            onPress={() => Linking.openURL(waHref)}
          />
        ) : null}
        <Btn title={t('viewings.mine')} variant="ghost" onPress={() => router.replace('/viewings')} />
        <Btn title={t('viewings.done')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  /* ── Form ─────────────────────────────────────────────────────── */
  return (
    <Screen>
      <Stack.Screen options={{ title: t('viewings.book') }} />

      {/* Booking progress — day / time / details from the live form state. */}
      <View style={[styles.steps, row]}>
        {steps.map((step) => (
          <View key={step.label} style={[styles.step, row]}>
            <View style={[styles.dot, step.done && styles.dotDone]} />
            <Text style={[styles.stepLabel, align]}>{step.label}</Text>
          </View>
        ))}
      </View>

      <Card>
        <SectionTitle>{t('viewings.stepMeet')}</SectionTitle>
        <View style={[styles.chips, row]}>
          <Chip
            label={t('viewings.inPersonChip')}
            selected={meetingType === 'in_person'}
            onPress={() => setMeetingType('in_person')}
          />
          <Chip label={t('viewings.online')} selected={meetingType === 'online'} onPress={() => setMeetingType('online')} />
        </View>
        <Text style={[styles.hint, align]}>
          {meetingType === 'online' ? t('viewings.hintOnline') : t('viewings.hintInPerson')}
        </Text>
      </Card>

      <Card>
        <SectionTitle>{t('viewings.stepDay')}</SectionTitle>
        <View style={[styles.chips, row]}>
          {days.map((day) => (
            <Chip
              key={day.value}
              label={`${day.weekday} ${day.label}`}
              selected={date === day.value}
              onPress={() => setDate(day.value)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('viewings.stepTime')}</SectionTitle>
        <View style={[styles.chips, row]}>
          {TIME_SLOTS.map((slot) => (
            <Chip key={slot} label={slot} selected={time === slot} onPress={() => setTime(slot)} />
          ))}
        </View>
        <Text style={[styles.hint, align]}>
          {date
            ? `${t('viewings.egyptTime')} ${formatDate(`${date}T12:00:00`)}`
            : t('viewings.chooseDayFirst')}
        </Text>
      </Card>

      <Card>
        <SectionTitle>{t('viewings.stepDetails')}</SectionTitle>
        <Field
          label={t('viewings.fullName')}
          value={name}
          onChangeText={setName}
          placeholder={t('viewings.namePlaceholder')}
          autoCapitalize="words"
        />
        <Field
          label={t('common.phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('viewings.phonePlaceholder')}
          keyboardType="phone-pad"
        />
        <Field
          label={t('viewings.notesLabel')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('viewings.notesPlaceholder')}
          multiline
          numberOfLines={3}
          style={[styles.notes, align]}
        />
      </Card>

      {error ? <ErrorBar message={error} /> : null}

      <Btn title={t('viewings.request')} busy={busy} onPress={submit} />
      <Text style={[styles.footnote, text]}>{t('viewings.footnote')}</Text>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    dotDone: { backgroundColor: t.primary, borderColor: t.primary },
    stepLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    notes: { minHeight: 76, textAlignVertical: 'top', paddingTop: 10 },
    success: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    footnote: { color: t.mutedForeground, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  }),
);
