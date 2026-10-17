import { Stack } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { API_URL } from '@/api/config';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SectionTitle,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, humanise, initials } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  message: string | null;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  sender: { name: string; email: string };
  invitedUser: { name: string; email: string } | null;
};

/** The four roles the website's invite form offers (no admin on this page). */
const ROLES = ['BUYER', 'BROKER', 'DEVELOPER', 'SELLER'] as const;

const ROLE_LABELS: Record<string, MessageKey> = {
  BUYER: 'ceoPpl.role.buyer',
  BROKER: 'ceoPpl.role.broker',
  DEVELOPER: 'ceoPpl.role.developer',
  SELLER: 'ceoPpl.role.seller',
  ADMIN: 'ceoPpl.role.admin',
};

const MAX_RENDER = 60;

function roleLabel(role: string, t: (key: MessageKey) => string): string {
  const key = ROLE_LABELS[role];
  return key ? t(key) : humanise(role);
}

function toneForInvitation(status: string): 'green' | 'gold' | 'red' | 'muted' {
  const s = status.toUpperCase();
  if (s === 'ACCEPTED') return 'green';
  if (s === 'PENDING') return 'gold';
  if (s === 'REVOKED') return 'red';
  return 'muted';
}

/**
 * Invitations — the website's /ceo/invitations page.
 *
 * `GET /api/auth/invite` lists every invitation with its sender and, once
 * registered, the invited user. `POST /api/auth/invite` takes
 * `{ email, role, message }`, expires the link after 7 days and answers with
 * the ready-made `registrationLink` the site shows in its green panel — the
 * same link the row action rebuilds for a still-PENDING invitation.
 */
export default function CeoInvitationsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('BUYER');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [successLink, setSuccessLink] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useApi<{ invitations?: Invitation[] }>(
    '/api/auth/invite',
  );
  const mutation = useMutation();

  const invitations = data?.invitations ?? [];
  const pendingCount = invitations.filter((i) => i.status === 'PENDING').length;
  const acceptedCount = invitations.filter((i) => i.status === 'ACCEPTED').length;

  /** The site copies `${origin}/auth/register?token=<id>` for pending rows. */
  function linkFor(invitation: Invitation): string {
    return `${API_URL}/auth/register?token=${invitation.id}`;
  }

  async function share(text: string) {
    try {
      await Share.share({ message: text });
    } catch {
      // The share sheet was dismissed — nothing to report.
    }
  }

  async function send() {
    if (mutation.busy) return;
    setProblem(null);
    if (!email.trim()) {
      setProblem(t('ceoPpl.emailRequired'));
      return;
    }
    try {
      const result = (await mutation.run('/api/auth/invite', 'POST', {
        email: email.trim(),
        role,
        ...(message.trim() ? { message: message.trim() } : {}),
      })) as { registrationLink?: string } | null;
      setSuccessLink(result?.registrationLink ?? null);
      setEmail('');
      setMessage('');
      setRole('BUYER');
      refresh();
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : t('common.error'));
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const rows = invitations.slice(0, MAX_RENDER);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoPpl.invitationsTitle') }} />

      <Text style={[styles.intro, align]}>{t('ceoPpl.inv.intro')}</Text>

      <Card style={[styles.kpis, row]}>
        <Stat value={pendingCount} label={t('ceoPpl.inv.pending')} />
        <Stat value={acceptedCount} label={t('ceoPpl.inv.accepted')} />
        <Stat value={invitations.length} label={t('ceoPpl.inv.totalSent')} />
      </Card>

      <Btn
        title={showForm ? t('common.close') : t('ceoPpl.inv.send')}
        variant={showForm ? 'ghost' : 'primary'}
        onPress={() => {
          setShowForm((prev) => !prev);
          setProblem(null);
        }}
      />

      {showForm ? (
        <Card style={styles.form}>
          <Text style={[styles.title, align]}>{t('ceoPpl.inv.newTitle')}</Text>
          <Text style={[styles.hint, align]}>{t('ceoPpl.inv.newHint')}</Text>

          <Field
            label={t('common.email')}
            value={email}
            onChangeText={setEmail}
            placeholder="user@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!mutation.busy}
          />

          <Text style={[styles.label, align]}>{t('ceoPpl.roleLabel')}</Text>
          <View style={[styles.chips, row]}>
            {ROLES.map((value) => (
              <Chip
                key={value}
                label={t(ROLE_LABELS[value])}
                disabled={mutation.busy}
                selected={role === value}
                onPress={() => setRole(value)}
              />
            ))}
          </View>

          <Field
            label={t('ceoPpl.inv.messageLabel')}
            value={message}
            onChangeText={setMessage}
            placeholder={t('ceoPpl.inv.messagePlaceholder')}
            multiline
            editable={!mutation.busy}
          />

          <View style={[styles.actions, row]}>
            <Btn
              title={t('ceoPpl.inv.send')}
              busy={mutation.busy}
              disabled={!email.trim()}
              onPress={() => void send()}
            />
            <Btn
              title={t('common.cancel')}
              variant="ghost"
              disabled={mutation.busy}
              onPress={() => {
                setShowForm(false);
                setProblem(null);
              }}
            />
          </View>
        </Card>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {successLink ? (
        <View style={styles.successBox}>
          <Text style={[styles.successTitle, align]}>{`✓ ${t('ceoPpl.inv.sentOk')}`}</Text>
          <Text style={[styles.successHint, align]}>{t('ceoPpl.inv.linkLabel')}</Text>
          <Text style={[styles.link, align]} selectable>
            {successLink}
          </Text>
          <View style={[styles.actions, row]}>
            <Btn
              title={t('ceoPpl.share')}
              variant="ghost"
              onPress={() => void share(successLink)}
            />
            <Btn title={t('ceoPpl.user.dismiss')} variant="ghost" onPress={() => setSuccessLink(null)} />
          </View>
        </View>
      ) : null}

      <SectionTitle>{t('ceoPpl.inv.all')}</SectionTitle>

      {!error && rows.length === 0 ? (
        <Empty title={t('ceoPpl.inv.none')} message={t('ceoPpl.emptyHint')} />
      ) : null}

      {rows.map((invitation, index) => {
        return (
          <View key={invitation.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={<Avatar text={initials(invitation.invitedUser?.name ?? invitation.email)} />}
                title={invitation.email}
                subtitle={[
                  invitation.invitedUser
                    ? `${t('ceoPpl.inv.registeredAs')} ${invitation.invitedUser.name}`
                    : null,
                  `${t('ceoPpl.inv.sent')} ${formatDate(invitation.createdAt)}`,
                  `${t('ceoPpl.inv.expires')} ${formatDate(invitation.expiresAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone="blue">{roleLabel(invitation.role, t)}</Badge>
                    <Badge tone={toneForInvitation(invitation.status)}>
                      {humanise(invitation.status)}
                    </Badge>
                  </View>
                }
                right={
                  invitation.status === 'PENDING' ? (
                    <Btn
                      title={t('ceoPpl.share')}
                      variant="ghost"
                      onPress={() => void share(linkFor(invitation))}
                    />
                  ) : undefined
                }
              />
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md },
    form: { gap: 4 },
    title: { color: t.foreground, fontSize: 18, fontWeight: '600' },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    label: { color: t.mutedForeground, fontSize: 14, fontWeight: '500', marginTop: Spacing.xs },
    chips: { flexWrap: 'wrap', gap: 8, marginTop: 2, marginBottom: Spacing.sm },
    actions: { flexWrap: 'wrap', gap: 8 },
    card: { gap: 0, marginTop: Spacing.xs },
    badges: { flexWrap: 'wrap', gap: 6 },
    successBox: {
      backgroundColor: t.successBg,
      borderWidth: 1,
      borderColor: t.successFg,
      borderRadius: Radius.md,
      padding: Spacing.sm + 2,
      gap: 6,
    },
    successTitle: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    successHint: { color: t.mutedForeground, fontSize: 12 },
    link: { color: t.foreground, fontSize: 13 },
  }),
);
