import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';

import {
  Btn,
  Card,
  Chip,
  ErrorBar,
  Field,
  Loading,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Estate, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { createStyles, useTheme } from '@/lib/theme';

type Settings = {
  company?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  platform?: {
    currency?: string;
    language?: string;
    maintenanceMode?: boolean;
    registrationEnabled?: boolean;
  };
  ai?: {
    searchEnabled?: boolean;
    recommendationsEnabled?: boolean;
    priceEstimation?: boolean;
    dnaEnabled?: boolean;
    anomalyDetectionEnabled?: boolean;
    anomalyThresholdPct?: number;
    journeyTrackingEnabled?: boolean;
    watchAlertsEnabled?: boolean;
    dataFreshnessDays?: number;
  };
  notifications?: {
    email?: boolean;
    sms?: boolean;
    newLead?: boolean;
    newInquiry?: boolean;
    weeklyReport?: boolean;
  };
  cta?: {
    enabled?: boolean;
    whatsappNumber?: string;
    messageEn?: string;
    messageAr?: string;
    labelEn?: string;
    labelAr?: string;
  };
};

type Section = 'company' | 'platform' | 'ai' | 'notifications' | 'cta';

type ToggleRow = { key: string; labelKey: MessageKey; hintKey?: MessageKey };

/**
 * The switches the route's `DEFAULTS` carries, in the same five groups the
 * website's settings page uses. Nothing outside this list is rendered, and
 * nothing outside `section` + `data` is ever posted — `/api/settings` writes
 * one `SystemSetting` row per key it is given, so an unknown key would simply
 * sit in the database unread.
 */
const PLATFORM_TOGGLES: ToggleRow[] = [
  { key: 'maintenanceMode', labelKey: 'ceo.settings.maintenance', hintKey: 'ceo.settings.maintenanceHint' },
  { key: 'registrationEnabled', labelKey: 'ceo.settings.registration', hintKey: 'ceo.settings.registrationHint' },
];

const AI_TOGGLES: ToggleRow[] = [
  { key: 'searchEnabled', labelKey: 'ceo.settings.aiSearch', hintKey: 'ceo.settings.aiSearchHint' },
  {
    key: 'recommendationsEnabled',
    labelKey: 'ceo.settings.aiRecommendations',
    hintKey: 'ceo.settings.aiRecommendationsHint',
  },
  {
    key: 'priceEstimation',
    labelKey: 'ceo.settings.priceEstimation',
    hintKey: 'ceo.settings.priceEstimationHint',
  },
  { key: 'dnaEnabled', labelKey: 'ceo.settings.dna', hintKey: 'ceo.settings.dnaHint' },
  {
    key: 'anomalyDetectionEnabled',
    labelKey: 'ceo.settings.anomalyDetection',
    hintKey: 'ceo.settings.anomalyDetectionHint',
  },
  {
    key: 'journeyTrackingEnabled',
    labelKey: 'ceo.settings.journeyTracking',
    hintKey: 'ceo.settings.journeyTrackingHint',
  },
  {
    key: 'watchAlertsEnabled',
    labelKey: 'ceo.settings.watchAlerts',
    hintKey: 'ceo.settings.watchAlertsHint',
  },
];

const NOTIFICATION_TOGGLES: ToggleRow[] = [
  { key: 'email', labelKey: 'ceo.settings.emailNotifs' },
  { key: 'sms', labelKey: 'ceo.settings.smsNotifs' },
  { key: 'newLead', labelKey: 'ceo.settings.newLeadNotifs' },
  { key: 'newInquiry', labelKey: 'ceo.settings.newInquiryNotifs' },
  { key: 'weeklyReport', labelKey: 'ceo.settings.weeklyReport' },
];

const CURRENCIES = ['EGP', 'USD'];
const LANGUAGES = ['English', 'Arabic'];

/**
 * Platform settings, one card per section the `POST /api/settings` route
 * accepts (`company`, `platform`, `ai`, `notifications`, `cta`). Every card saves on
 * its own with its own busy state, so a slow write on the company card never
 * hides the AI card, and a failure comes back as an `ErrorBar` instead of a
 * silent no-op.
 */
export default function CeoSettingsScreen() {
  const styles = useStyles();
  const { t, align, row } = useI18n();
  const [company, setCompany] = useState<Settings['company']>({});
  const [platform, setPlatform] = useState<Record<string, unknown>>({});
  const [ai, setAi] = useState<Record<string, unknown>>({});
  const [notifications, setNotifications] = useState<Record<string, unknown>>({});
  const [cta, setCta] = useState<Record<string, unknown>>({});
  const [system, setSystem] = useState({ threshold: '', freshness: '' });
  const [saving, setSaving] = useState<Section | 'system' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refresh } = useApi<Settings>('/api/settings');
  const mutation = useMutation();

  // Re-seed the editors every time a fresh payload arrives (mount and pull to
  // refresh). A *failed* load never replaces `data`, so the fields a user is
  // halfway through typing survive a flaky connection.
  useEffect(() => {
    if (!data) return;
    setCompany(data.company ?? {});
    setPlatform(data.platform ?? {});
    setAi(data.ai ?? {});
    setNotifications(data.notifications ?? {});
    setCta(data.cta ?? {});
    setSystem({
      threshold: String(data.ai?.anomalyThresholdPct ?? ''),
      freshness: String(data.ai?.dataFreshnessDays ?? ''),
    });
  }, [data]);

  async function save(section: Section, payload: Record<string, unknown>) {
    setSaving(section);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/settings', 'POST', { section, data: payload });
      setNotice(t('ceo.settings.saved'));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  /** The numeric knobs ride under `ai` — the route has no `system` section. */
  async function saveSystem() {
    const threshold = Number(system.threshold);
    const freshness = Number(system.freshness);
    if (!Number.isFinite(threshold) || !Number.isFinite(freshness)) {
      setProblem(t('ceo.settings.numberRequired'));
      return;
    }
    await save('ai', { anomalyThresholdPct: threshold, dataFreshnessDays: freshness });
  }

  /**
   * Global WhatsApp CTA — the same `cta` section the website's settings page
   * posts (`POST /api/settings { section: 'cta', data }`). The number is
   * digits-only (same sanitise the public-config route applies); empty hides
   * the button everywhere, so it is saved as-is rather than refused.
   */
  async function saveWhatsapp() {
    const digits = String(cta.whatsappNumber ?? '').replace(/\D/g, '').slice(0, 15);
    setCta((prev) => ({ ...prev, whatsappNumber: digits }));
    await save('cta', {
      enabled: cta.enabled === true,
      whatsappNumber: digits,
      messageEn: String(cta.messageEn ?? ''),
      messageAr: String(cta.messageAr ?? ''),
      labelEn: String(cta.labelEn ?? ''),
      labelAr: String(cta.labelAr ?? ''),
    });
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const ready = data !== null;

  return (
    <Screen refreshing={false} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.settings') }} />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!ready ? null : (
        <>
          <Card>
            <SectionTitle>{t('ceo.settings.company')}</SectionTitle>
            <Field
              label={t('ceo.settings.companyName')}
              value={company?.name ?? ''}
              onChangeText={(next) => setCompany((prev) => ({ ...prev, name: next }))}
            />
            <Field
              label={t('common.email')}
              value={company?.email ?? ''}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(next) => setCompany((prev) => ({ ...prev, email: next }))}
            />
            <Field
              label={t('common.phone')}
              value={company?.phone ?? ''}
              keyboardType="phone-pad"
              onChangeText={(next) => setCompany((prev) => ({ ...prev, phone: next }))}
            />
            <Field
              label={t('ceo.settings.website')}
              value={company?.website ?? ''}
              autoCapitalize="none"
              onChangeText={(next) => setCompany((prev) => ({ ...prev, website: next }))}
            />
            <Field
              label={t('ceo.settings.address')}
              value={company?.address ?? ''}
              onChangeText={(next) => setCompany((prev) => ({ ...prev, address: next }))}
            />
            <Btn
              title={t('ceo.settings.save')}
              busy={saving === 'company'}
              onPress={() => void save('company', company ?? {})}
            />
          </Card>

          <Card>
            <SectionTitle>{t('ceo.settings.platform')}</SectionTitle>

            <Text style={[styles.label, align]}>{t('ceo.settings.currency')}</Text>
            <View style={[styles.chips, row]}>
              {CURRENCIES.map((code) => (
                <Chip
                  key={code}
                  label={code}
                  selected={platform?.currency === code}
                  onPress={() => setPlatform((prev) => ({ ...prev, currency: code }))}
                />
              ))}
            </View>

            <Text style={[styles.label, align]}>{t('ceo.settings.language')}</Text>
            <View style={[styles.chips, row]}>
              {LANGUAGES.map((language) => (
                <Chip
                  key={language}
                  label={language}
                  selected={platform?.language === language}
                  onPress={() => setPlatform((prev) => ({ ...prev, language }))}
                />
              ))}
            </View>

            {PLATFORM_TOGGLES.map((item) => (
              <SettingToggle
                key={item.key}
                labelKey={item.labelKey}
                hintKey={item.hintKey}
                value={platform[item.key] === true}
                onValueChange={(next) => setPlatform((prev) => ({ ...prev, [item.key]: next }))}
              />
            ))}

            <Btn
              title={t('ceo.settings.save')}
              busy={saving === 'platform'}
              onPress={() => void save('platform', platform ?? {})}
            />
          </Card>

          <Card>
            <SectionTitle>{t('ceo.settings.ai')}</SectionTitle>
            {AI_TOGGLES.map((item) => (
              <SettingToggle
                key={item.key}
                labelKey={item.labelKey}
                hintKey={item.hintKey}
                value={ai[item.key] === true}
                onValueChange={(next) => setAi((prev) => ({ ...prev, [item.key]: next }))}
              />
            ))}
            <Btn
              title={t('ceo.settings.save')}
              busy={saving === 'ai'}
              onPress={() => void save('ai', ai ?? {})}
            />
          </Card>

          <Card>
            <SectionTitle>{t('ceo.settings.notifications')}</SectionTitle>
            {NOTIFICATION_TOGGLES.map((item) => (
              <SettingToggle
                key={item.key}
                labelKey={item.labelKey}
                value={notifications[item.key] === true}
                onValueChange={(next) => setNotifications((prev) => ({ ...prev, [item.key]: next }))}
              />
            ))}
            <Btn
              title={t('ceo.settings.save')}
              busy={saving === 'notifications'}
              onPress={() => void save('notifications', notifications ?? {})}
            />
          </Card>

          <Card>
            <SectionTitle>{t('ceo.settings.whatsapp')}</SectionTitle>
            <Text style={[styles.toggleHint, align]}>{t('ceo.settings.whatsappHint')}</Text>
            <SettingToggle
              labelKey="ceo.settings.whatsappEnabled"
              hintKey="ceo.settings.whatsappEnabledHint"
              value={cta.enabled === true}
              onValueChange={(next) => setCta((prev) => ({ ...prev, enabled: next }))}
            />
            <Field
              label={t('ceo.settings.whatsappNumber')}
              value={String(cta.whatsappNumber ?? '')}
              keyboardType="phone-pad"
              autoCapitalize="none"
              placeholder="2010…"
              onChangeText={(next) =>
                setCta((prev) => ({ ...prev, whatsappNumber: next.replace(/\D/g, '').slice(0, 15) }))
              }
            />
            <Text style={[styles.toggleHint, align]}>{t('ceo.settings.whatsappNumberHint')}</Text>
            <Field
              label={t('ceo.settings.whatsappMessageEn')}
              value={String(cta.messageEn ?? '')}
              multiline
              numberOfLines={2}
              onChangeText={(next) => setCta((prev) => ({ ...prev, messageEn: next }))}
            />
            <Field
              label={t('ceo.settings.whatsappMessageAr')}
              value={String(cta.messageAr ?? '')}
              multiline
              numberOfLines={2}
              onChangeText={(next) => setCta((prev) => ({ ...prev, messageAr: next }))}
            />
            <Field
              label={t('ceo.settings.whatsappLabelEn')}
              value={String(cta.labelEn ?? '')}
              onChangeText={(next) => setCta((prev) => ({ ...prev, labelEn: next }))}
            />
            <Field
              label={t('ceo.settings.whatsappLabelAr')}
              value={String(cta.labelAr ?? '')}
              onChangeText={(next) => setCta((prev) => ({ ...prev, labelAr: next }))}
            />
            <Btn
              title={t('ceo.settings.save')}
              busy={saving === 'cta'}
              onPress={() => void saveWhatsapp()}
            />
          </Card>

          <Card>
            <SectionTitle>{t('ceo.settings.system')}</SectionTitle>
            <Field
              label={t('ceo.settings.anomalyThreshold')}
              value={system.threshold}
              keyboardType="numeric"
              onChangeText={(next) => setSystem((prev) => ({ ...prev, threshold: next }))}
            />
            <Field
              label={t('ceo.settings.dataFreshness')}
              value={system.freshness}
              keyboardType="numeric"
              onChangeText={(next) => setSystem((prev) => ({ ...prev, freshness: next }))}
            />
            <Btn title={t('ceo.settings.save')} busy={saving === 'system'} onPress={() => void saveSystem()} />
          </Card>
        </>
      )}
    </Screen>
  );
}

/** One labelled switch — the website's Toggle, in the app's control style. */
function SettingToggle({
  labelKey,
  hintKey,
  value,
  onValueChange,
}: {
  labelKey: MessageKey;
  hintKey?: MessageKey;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, align, row } = useI18n();

  return (
    <View style={[styles.toggleRow, row]}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, align]}>{t(labelKey)}</Text>
        {hintKey ? <Text style={[styles.toggleHint, align]}>{t(hintKey)}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: Estate.gold, false: theme.muted }}
        thumbColor={value ? Estate.navy : theme.card}
      />
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    label: { color: t.mutedForeground, fontSize: 14, fontWeight: '500', marginBottom: 4 },
    chips: { flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
    toggleRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      paddingVertical: 6,
    },
    toggleText: { flex: 1, gap: 2 },
    toggleLabel: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    toggleHint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
  }),
);
