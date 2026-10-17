import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
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
  Segmented,
  toneForStatus,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, humanise, initials } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  /** The AccessRequest column the PATCH route reads — the website's page
   *  calls it `requestedRole`, but the API only ever returns `role`. */
  role: string;
  status: string;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  message?: string | null;
  sentBy?: string;
  createdAt: string;
  acceptedAt?: string | null;
  expiresAt?: string | null;
  sender?: { id?: string; name?: string; email?: string } | null;
};

type AccessResponse = {
  requests?: AccessRequest[];
  total?: number;
  statusCounts?: Record<string, number>;
};

type Tab = 'requests' | 'invitations';
type Mode = 'idle' | 'approve' | 'reject';
type Status = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

const STATUS_TABS: Status[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

/** Exactly the set `POST /api/ceo/invitations` validates `role` against. */
const INVITATION_ROLES = ['BROKER', 'DEVELOPER', 'SELLER', 'ADMIN', 'BUYER'] as const;

const ROLE_LABELS: Record<string, MessageKey> = {
  BUYER: 'ceoPpl.role.buyer',
  BROKER: 'ceoPpl.role.broker',
  DEVELOPER: 'ceoPpl.role.developer',
  SELLER: 'ceoPpl.role.seller',
  ADMIN: 'ceoPpl.role.admin',
};

function roleLabel(role: string, t: (key: MessageKey) => string): string {
  const key = ROLE_LABELS[role];
  return key ? t(key) : humanise(role);
}

/**
 * Access requests and the invitation list behind the website's single
 * /ceo/access-requests page — its two tabs, kept as one screen.
 *
 * Reads `GET /api/ceo/access-requests` (requests + `statusCounts`) and
 * `GET /api/ceo/invitations`. Writes are the route's own contract:
 * `PATCH /api/ceo/access-requests` with `{ id, action: 'approve' | 'reject',
 * password?, rejectionReason? }` — approving mints the account and answers
 * with the temporary password the site shows in its dialog — and
 * `POST /api/ceo/invitations` / `DELETE /api/ceo/invitations?id=…` for the
 * invitation tab.
 */
export default function CeoAccessRequestsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();

  const [tab, setTab] = useState<Tab>('requests');
  const [statusFilter, setStatusFilter] = useState<Status>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; body: string; hint?: string } | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof INVITATION_ROLES)[number]>('BROKER');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');

  const { data, error, loading, refreshing, refresh } = useApi<AccessResponse>(
    '/api/ceo/access-requests',
  );
  const {
    data: inviteData,
    error: inviteError,
    refresh: refreshInvitations,
  } = useApi<{ invitations?: Invitation[] }>('/api/ceo/invitations');
  const mutation = useMutation();

  const requests = data?.requests ?? [];
  const statusCounts = data?.statusCounts ?? {};
  const invitations = inviteData?.invitations ?? [];

  function refreshAll() {
    refresh();
    refreshInvitations();
  }

  function clearPanels() {
    setExpanded(null);
    setMode('idle');
    setPassword('');
    setReason('');
  }

  async function share(text: string) {
    try {
      await Share.share({ message: text });
    } catch {
      // The share sheet was dismissed — nothing to report.
    }
  }

  /** Approve: creates the account, then surfaces the server's credentials. */
  async function approve(req: AccessRequest) {
    setBusyId(req.id);
    setProblem(null);
    setNotice(null);
    try {
      const res = (await mutation.run('/api/ceo/access-requests', 'PATCH', {
        id: req.id,
        action: 'approve',
        ...(password.trim() ? { password: password.trim() } : {}),
      })) as { password?: string; message?: string } | null;
      setResult({
        title: t('ceoPpl.access.createdTitle'),
        body: res?.message ?? t('ceoPpl.access.created'),
        hint: t('ceoPpl.access.sharePassword'),
      });
      clearPanels();
      refresh();
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmApprove(req: AccessRequest) {
    Alert.alert(t('ceoPpl.access.approveConfirmTitle'), t('ceoPpl.access.approveConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ceo.approve'), onPress: () => void approve(req) },
    ]);
  }

  async function reject(req: AccessRequest) {
    if (!reason.trim()) {
      setProblem(t('ceoPpl.access.rejectReasonRequired'));
      return;
    }
    setBusyId(req.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/access-requests', 'PATCH', {
        id: req.id,
        action: 'reject',
        rejectionReason: reason.trim(),
      });
      setNotice(t('ceoPpl.access.rejected'));
      clearPanels();
      refresh();
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmReject(req: AccessRequest) {
    if (!reason.trim()) {
      setProblem(t('ceoPpl.access.rejectReasonRequired'));
      return;
    }
    Alert.alert(t('ceoPpl.access.rejectConfirmTitle'), t('ceoPpl.access.rejectConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ceo.reject'), style: 'destructive', onPress: () => void reject(req) },
    ]);
  }

  function toggleRequest(req: AccessRequest) {
    if (req.status !== 'PENDING') return;
    if (expanded === req.id) {
      clearPanels();
      return;
    }
    setExpanded(req.id);
    setMode('idle');
    setPassword('');
    setReason('');
    setProblem(null);
    setNotice(null);
  }

  async function revoke(invitation: Invitation) {
    setRevokingId(invitation.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/ceo/invitations?id=${invitation.id}`, 'DELETE');
      setNotice(t('ceoPpl.access.revoked'));
      refreshInvitations();
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setRevokingId(null);
    }
  }

  function confirmRevoke(invitation: Invitation) {
    Alert.alert(t('ceoPpl.access.revokeTitle'), t('ceoPpl.access.revokeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ceoPpl.access.revoke'), style: 'destructive', onPress: () => void revoke(invitation) },
    ]);
  }

  async function sendInvite() {
    if (mutation.busy) return;
    setProblem(null);
    setNotice(null);
    if (!inviteEmail.trim()) {
      setProblem(t('ceoPpl.emailRequired'));
      return;
    }
    try {
      const res = (await mutation.run('/api/ceo/invitations', 'POST', {
        email: inviteEmail.trim(),
        role: inviteRole,
        ...(invitePassword.trim() ? { password: invitePassword.trim() } : {}),
        ...(inviteMessage.trim() ? { message: inviteMessage.trim() } : {}),
      })) as { message?: string } | null;
      setResult({
        title: t('ceoPpl.access.inviteSent'),
        body: res?.message ?? t('ceoPpl.access.inviteSent'),
      });
      setShowInvite(false);
      setInviteEmail('');
      setInvitePassword('');
      setInviteMessage('');
      setInviteRole('BROKER');
      refreshInvitations();
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : t('common.error'));
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const filtered = requests.filter((r) => statusFilter === 'ALL' || r.status === statusFilter);
  const rows = filtered.slice(0, 60);

  return (
    <Screen refreshing={refreshing} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: t('ceoPpl.accessTitle') }} />

      <Text style={[styles.intro, align]}>{t('ceoPpl.access.intro')}</Text>

      <Segmented<Tab>
        options={[
          { value: 'requests', label: `${t('ceoPpl.access.requestsTab')} (${requests.length})` },
          { value: 'invitations', label: `${t('ceoPpl.access.invitationsTab')} (${invitations.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'requests' ? (
        <View style={[styles.filters, row]}>
          {STATUS_TABS.map((value) => (
            <Chip
              key={value}
              label={
                value === 'ALL'
                  ? `${t('common.all')} (${requests.length})`
                  : `${humanise(value)} (${statusCounts[value] ?? 0})`
              }
              selected={statusFilter === value}
              onPress={() => setStatusFilter(value)}
            />
          ))}
        </View>
      ) : (
        <Btn
          title={showInvite ? t('common.close') : t('ceoPpl.access.newInvitation')}
          variant={showInvite ? 'ghost' : 'primary'}
          onPress={() => {
            setShowInvite((prev) => !prev);
            setProblem(null);
          }}
        />
      )}

      {result ? (
        <View style={styles.successBox}>
          <Text style={[styles.successTitle, align]}>{`✓ ${result.title}`}</Text>
          <Text style={[styles.successBody, align]} selectable>
            {result.body}
          </Text>
          {result.hint ? (
            <Text style={[styles.hint, align]}>{result.hint}</Text>
          ) : null}
          <View style={[styles.actions, row]}>
            <Btn title={t('ceoPpl.share')} variant="ghost" onPress={() => void share(result.body)} />
            <Btn title={t('ceoPpl.access.done')} variant="ghost" onPress={() => setResult(null)} />
          </View>
        </View>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refreshAll} /> : null}
      {tab === 'invitations' && inviteError ? (
        <ErrorBar message={inviteError} onRetry={refreshInvitations} />
      ) : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {tab === 'invitations' && showInvite ? (
        <Card style={styles.form}>
          <Text style={[styles.title, align]}>{t('ceoPpl.access.newInvitation')}</Text>
          <Text style={[styles.hint, align]}>{t('ceoPpl.access.inviteHint')}</Text>

          <Field
            label={t('common.email')}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="user@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!mutation.busy}
          />

          <Text style={[styles.label, align]}>{t('ceoPpl.roleLabel')}</Text>
          <View style={[styles.chips, row]}>
            {INVITATION_ROLES.map((value) => (
              <Chip
                key={value}
                label={t(ROLE_LABELS[value])}
                disabled={mutation.busy}
                selected={inviteRole === value}
                onPress={() => setInviteRole(value)}
              />
            ))}
          </View>

          <Field
            label={t('ceoPpl.access.passwordOptional')}
            value={invitePassword}
            onChangeText={setInvitePassword}
            placeholder={t('ceoPpl.access.passwordHint')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!mutation.busy}
          />
          <Field
            label={t('ceoPpl.inv.messageLabel')}
            value={inviteMessage}
            onChangeText={setInviteMessage}
            placeholder={t('ceoPpl.inv.messagePlaceholder')}
            multiline
            editable={!mutation.busy}
          />

          <View style={[styles.actions, row]}>
            <Btn
              title={t('ceoPpl.inv.send')}
              busy={mutation.busy}
              disabled={!inviteEmail.trim()}
              onPress={() => void sendInvite()}
            />
            <Btn
              title={t('common.cancel')}
              variant="ghost"
              disabled={mutation.busy}
              onPress={() => {
                setShowInvite(false);
                setProblem(null);
              }}
            />
          </View>
        </Card>
      ) : null}

      {tab === 'requests' ? (
        !error && rows.length === 0 ? (
          <Empty
            title={t('ceoPpl.access.none')}
            message={statusFilter !== 'ALL' ? t('ceoPpl.access.tryFilter') : t('ceoPpl.access.noneHint')}
          />
        ) : (
          rows.map((req, index) => {
            const isOpen = expanded === req.id;
            const busy = busyId === req.id;
            const pending = req.status === 'PENDING';

            return (
              <View key={req.id}>
                {index > 0 ? <Divider /> : null}
                <Card style={styles.card}>
                  <Row
                    left={<Avatar text={initials(req.name)} />}
                    title={req.name}
                    subtitle={[
                      req.email,
                      req.phone,
                      req.company ? `${t('ceoPpl.access.company')}: ${req.company}` : null,
                      `${t('ceoPpl.access.submitted')} ${formatDate(req.createdAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      <View style={[styles.badges, row]}>
                        <Badge tone="blue">{roleLabel(req.role, t)}</Badge>
                        <Badge tone={toneForStatus(req.status)}>{humanise(req.status)}</Badge>
                      </View>
                    }
                    onPress={() => toggleRequest(req)}
                  />

                  {req.status === 'REJECTED' && req.rejectionReason ? (
                    <Text style={[styles.reason, align]}>{req.rejectionReason}</Text>
                  ) : null}

                  {isOpen && pending ? (
                    <View style={styles.editor}>
                      <Divider />
                      {mode === 'idle' ? (
                        <View style={[styles.actions, row]}>
                          <Btn title={t('ceo.approve')} style={styles.grow} onPress={() => setMode('approve')} />
                          <Btn
                            title={t('ceo.reject')}
                            variant="danger"
                            style={styles.grow}
                            onPress={() => setMode('reject')}
                          />
                        </View>
                      ) : null}

                      {mode === 'approve' ? (
                        <View style={styles.formBlock}>
                          <Text style={[styles.panelTitle, align]}>{t('ceoPpl.access.approveTitle')}</Text>
                          <Text style={[styles.hint, align]}>{t('ceoPpl.access.approveHint')}</Text>
                          <Field
                            label={t('ceoPpl.access.customPassword')}
                            value={password}
                            onChangeText={setPassword}
                            placeholder={t('ceoPpl.access.autoPassword')}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!busy}
                          />
                          <View style={[styles.actions, row]}>
                            <Btn
                              title={t('ceo.approve')}
                              busy={busy}
                              onPress={() => confirmApprove(req)}
                            />
                            <Btn
                              title={t('common.cancel')}
                              variant="ghost"
                              disabled={busy}
                              onPress={() => setMode('idle')}
                            />
                          </View>
                        </View>
                      ) : null}

                      {mode === 'reject' ? (
                        <View style={styles.formBlock}>
                          <Text style={[styles.panelTitle, align]}>{t('ceoPpl.access.rejectTitle')}</Text>
                          <Text style={[styles.hint, align]}>{req.email}</Text>
                          <Field
                            label={t('ceoPpl.access.rejectReason')}
                            value={reason}
                            onChangeText={setReason}
                            placeholder={t('ceoPpl.access.rejectPlaceholder')}
                            multiline
                            editable={!busy}
                          />
                          <View style={[styles.actions, row]}>
                            <Btn
                              title={t('ceo.reject')}
                              variant="danger"
                              busy={busy}
                              disabled={!reason.trim()}
                              onPress={() => confirmReject(req)}
                            />
                            <Btn
                              title={t('common.cancel')}
                              variant="ghost"
                              disabled={busy}
                              onPress={() => setMode('idle')}
                            />
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </Card>
              </View>
            );
          })
        )
      ) : !inviteError && invitations.length === 0 ? (
        <Empty title={t('ceoPpl.inv.none')} message={t('ceoPpl.access.inviteHint')} />
      ) : (
        invitations.slice(0, 60).map((invitation, index) => {
          const revoking = revokingId === invitation.id;
          const sender = invitation.sentBy ?? invitation.sender?.name ?? invitation.sender?.email;

          return (
            <View key={invitation.id}>
              {index > 0 ? <Divider /> : null}
              <Card style={styles.card}>
                <Row
                  left={<Avatar text={initials(invitation.email)} />}
                  title={invitation.email}
                  subtitle={[
                    sender ? `${t('ceoPpl.access.sentBy')} ${sender}` : null,
                    `${t('ceoPpl.inv.sent')} ${formatDate(invitation.createdAt)}`,
                    invitation.acceptedAt
                      ? `${t('ceoPpl.inv.accepted')} ${formatDate(invitation.acceptedAt)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={
                    <View style={[styles.badges, row]}>
                      <Badge tone="blue">{roleLabel(invitation.role, t)}</Badge>
                      <Badge tone={toneForStatus(invitation.status)}>{humanise(invitation.status)}</Badge>
                    </View>
                  }
                  right={
                    invitation.status === 'PENDING' ? (
                      <Btn
                        title={t('ceoPpl.access.revoke')}
                        variant="danger"
                        busy={revoking}
                        onPress={() => confirmRevoke(invitation)}
                      />
                    ) : undefined
                  }
                />
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    filters: { flexWrap: 'wrap', gap: 8 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 4, marginTop: Spacing.xs },
    badges: { flexWrap: 'wrap', gap: 6 },
    reason: { color: t.dangerFg, fontSize: 13, lineHeight: 18 },
    editor: { gap: 8, marginTop: 8 },
    form: { gap: 4 },
    formBlock: { gap: 4 },
    actions: { flexWrap: 'wrap', gap: 8 },
    grow: { flexGrow: 1, minWidth: 110 },
    title: { color: t.foreground, fontSize: 18, fontWeight: '600' },
    panelTitle: { color: t.primary, fontSize: 15, fontWeight: '700' },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    label: { color: t.mutedForeground, fontSize: 14, fontWeight: '500', marginTop: Spacing.xs },
    chips: { flexWrap: 'wrap', gap: 8, marginTop: 2, marginBottom: Spacing.sm },
    successBox: {
      backgroundColor: t.successBg,
      borderWidth: 1,
      borderColor: t.successFg,
      borderRadius: Radius.md,
      padding: Spacing.sm + 2,
      gap: 8,
    },
    successTitle: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    successBody: { color: t.foreground, fontSize: 14, lineHeight: 20 },
  }),
);
