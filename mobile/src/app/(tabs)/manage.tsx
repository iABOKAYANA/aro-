import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useRequireAuth } from '@/components/auth-gate';
import { Badge, Btn, Card, Chip, Divider, Empty, ErrorBar, Loading, Row, Screen, SearchBar, SectionTitle, Segmented } from '@/components/ui';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { createStyles, useTheme } from '@/lib/theme';

type Tab = 'brokers' | 'developers' | 'users';

type Person = {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  status?: string;
  isActive?: boolean;
  isVerified?: boolean;
  agencyName?: string;
  companyName?: string;
  user?: { name?: string; email?: string; status?: string; isActive?: boolean } | null;
};

const MAX_RENDER = 60;

/**
 * CEO/ADMIN console — the three directories behind one search box.
 *
 * Every action is the same two calls the website makes
 * (`PATCH /api/ceo/brokers|[developers]/[id]` and `PATCH /api/ceo/users`), so
 * verify/suspend here lands in the web UI on the next refresh.
 */
export default function ManageScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('brokers');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const endpoint = `/api/ceo/${tab}`;
  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    const qs = params.toString();
    return qs ? `${endpoint}?${qs}` : endpoint;
  }, [endpoint, query]);

  const { data, error, loading, refreshing, refresh } = useApi<Record<string, Person[]>>(path);
  const mutation = useMutation();

  const rows = (data?.[tab] ?? []).slice(0, MAX_RENDER);
  const total = data?.[tab]?.length ?? 0;

  async function act(person: Person, body: Record<string, unknown>) {
    const key = person.userId ?? person.id;
    setBusyId(key);
    setProblem(null);
    try {
      // `PATCH /api/ceo/users` addresses the user by `userId`; the two profile
      // endpoints address their own row by profile id.
      if (tab === 'users') {
        await mutation.run('/api/ceo/users', 'PATCH', { userId: person.userId ?? person.id, ...body });
      } else {
        await mutation.run(`/api/ceo/${tab}/${person.id}`, 'PATCH', body);
      }
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  const authGate = useRequireAuth();
  if (authGate) return authGate;

  if (loading) return <Loading label={t('common.loading')} />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <SectionTitle>{t('ceo.title')}</SectionTitle>
      <Card style={styles.consoles}>
        <Row
          title={t('ceo.overview')}
          subtitle={t('ceo.subtitle')}
          onPress={() => router.push('/ceo/overview')}
        />
        <Divider />
        <Row title={t('ceo.viewings')} subtitle={t('ceo.viewings.noneHint')} onPress={() => router.push('/ceo/viewings')} />
        <Divider />
        <Row title={t('ceo.inquiries')} subtitle={t('ceo.inquiries.noneHint')} onPress={() => router.push('/ceo/inquiries')} />
        <Divider />
        <Row title={t('ceo.approvals')} subtitle={t('ceo.approvals.noneHint')} onPress={() => router.push('/ceo/approvals')} />
        <Divider />
        <Row title={t('ceo.content')} subtitle={t('ceo.content.autoSaveHint')} onPress={() => router.push('/ceo/content')} />
        <Divider />
        <Row title={t('ceo.pricing')} subtitle={t('ceo.pricing.hint')} onPress={() => router.push('/ceo/pricing')} />
        <Divider />
        <Row title={t('ceo.analytics')} subtitle={t('ceo.analytics.hint')} onPress={() => router.push('/ceo/analytics')} />
      </Card>

      <SectionTitle>{t('ceo.moreConsoles')}</SectionTitle>
      <Card style={styles.consoles}>
        <Row
          title={t('ceo.usersScreen')}
          subtitle={t('ceo.usersScreen.hint')}
          onPress={() => router.push('/ceo/users')}
        />
        <Divider />
        <Row
          title={t('ceo.projectsScreen')}
          subtitle={t('ceo.projectsScreen.hint')}
          onPress={() => router.push('/ceo/projects')}
        />
        <Divider />
        <Row
          title={t('ceo.unitsScreen')}
          subtitle={t('ceo.unitsScreen.hint')}
          onPress={() => router.push('/ceo/units')}
        />
        <Divider />
        <Row
          title={t('ceo.dealsScreen')}
          subtitle={t('ceo.dealsScreen.hint')}
          onPress={() => router.push('/ceo/deals')}
        />
        <Divider />
        <Row
          title={t('ceo.brokersScreen')}
          subtitle={t('ceo.brokersScreen.hint')}
          onPress={() => router.push('/ceo/brokers')}
        />
        <Divider />
        <Row
          title={t('ceo.settings')}
          subtitle={t('ceo.settings.hint')}
          onPress={() => router.push('/ceo/settings')}
        />
        <Divider />
        <Row title={t('ceo.ai')} subtitle={t('ceo.ai.hint')} onPress={() => router.push('/ceo/ai')} />
      </Card>

      {/* Catalog — the project pipeline and everything hanging off it. */}
      <SectionTitle>{t('ceo.projectsScreen')}</SectionTitle>
      <Card>
        <Row
          title={t('ceoPr.allTitle')}
          subtitle={t('ceoPr.allHint')}
          onPress={() => router.push('/ceo/all-projects')}
        />
        <Divider />
        <Row
          title={t('ceoCat.developersTitle')}
          subtitle={t('ceoCat.developersHint')}
          onPress={() => router.push('/ceo/developers')}
        />
        <Divider />
        <Row
          title={t('ceoCat.newLaunchesTitle')}
          subtitle={t('ceoCat.newLaunchesHint')}
          onPress={() => router.push('/ceo/new-launches')}
        />
        <Divider />
        <Row
          title={t('ceoCat.paymentPlansTitle')}
          subtitle={t('ceoCat.paymentPlansHint')}
          onPress={() => router.push('/ceo/payment-plans')}
        />
        <Divider />
        <Row
          title={t('ceoSt.stagingTitle')}
          subtitle={t('ceoSt.navHint')}
          // The route file exists (mobile/src/app/ceo/staging.tsx) and resolves
          // at runtime — typed routes are compile-time only. The generated
          // union (mobile/.expo/types/router.d.ts) is stale and omits
          // '/ceo/staging'; cast instead of touching generated output.
          onPress={() => router.push('/ceo/staging' as any)}
        />
      </Card>

      {/* People — leads, the people behind them, and who gets a seat. */}
      <SectionTitle>{t('ceoPpl.sectionTitle')}</SectionTitle>
      <Card>
        <Row
          title={t('ceoPpl.leadsTitle')}
          subtitle={t('ceoPpl.leadsHint')}
          onPress={() => router.push('/ceo/leads')}
        />
        <Divider />
        <Row
          title={t('ceoPpl.contactsTitle')}
          subtitle={t('ceoPpl.contactsHint')}
          onPress={() => router.push('/ceo/contacts')}
        />
        <Divider />
        <Row
          title={t('ceoPpl.createUserTitle')}
          subtitle={t('ceoPpl.createUserHint')}
          onPress={() => router.push('/ceo/create-user')}
        />
        <Divider />
        <Row
          title={t('ceoPpl.invitationsTitle')}
          subtitle={t('ceoPpl.invitationsHint')}
          onPress={() => router.push('/ceo/invitations')}
        />
        <Divider />
        <Row
          title={t('ceoPpl.accessTitle')}
          subtitle={t('ceoPpl.accessHint')}
          onPress={() => router.push('/ceo/access-requests')}
        />
      </Card>

      {/* Content & ops — everything the public site reads, plus the importer. */}
      <SectionTitle>{t('ceoOps.blogTitle')}</SectionTitle>
      <Card>
        <Row
          title={t('ceoOps.blogTitle')}
          subtitle={t('ceoOps.blogHint')}
          onPress={() => router.push('/ceo/blog')}
        />
        <Divider />
        <Row
          title={t('ceoOps.pressTitle')}
          subtitle={t('ceoOps.pressHint')}
          onPress={() => router.push('/ceo/press')}
        />
        <Divider />
        <Row
          title={t('ceoOps.jobsTitle')}
          subtitle={t('ceoOps.jobsHint')}
          onPress={() => router.push('/ceo/jobs')}
        />
        <Divider />
        <Row
          title={t('ceoOps.importTitle')}
          subtitle={t('ceoOps.importHint')}
          onPress={() => router.push('/ceo/import/nawy')}
        />
      </Card>

      <Segmented<Tab>
        options={[
          { value: 'brokers', label: t('ceo.brokers') },
          { value: 'developers', label: t('ceo.developers') },
          { value: 'users', label: t('ceo.users') },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setExpanded(null);
          setProblem(null);
        }}
      />

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.searchDirectory')} />

      <Text style={styles.count}>
        {total ? `${total}` : ''}
        {total > MAX_RENDER ? ` · ${t('common.showingFirst')} ${MAX_RENDER}` : ''}
      </Text>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      {!error && rows.length === 0 ? (
        <Empty title={t('ceo.emptyDirectory')} message={t('common.noResults')} />
      ) : null}

      {rows.map((person) => {
        const key = person.userId ?? person.id;
        const isOpen = expanded === key;
        const busy = busyId === key;

        const displayName =
          person.name ?? person.user?.name ?? person.agencyName ?? person.companyName ?? '—';
        const displayEmail = person.email ?? person.user?.email;
        const isActive = person.isActive ?? person.user?.isActive ?? true;
        const isVerified = person.isVerified ?? false;

        return (
          <Card key={key} style={styles.card}>
            <Row
              title={displayName}
              subtitle={[displayEmail, tab === 'users' ? person.role : person.agencyName ?? person.companyName]
                .filter(Boolean)
                .join(' · ')}
              badge={
                <View style={styles.badges}>
                  <Badge tone={isVerified ? 'green' : 'muted'}>
                    {isVerified ? t('ceo.verified') : t('common.none')}
                  </Badge>
                  <Badge tone={isActive ? 'blue' : 'red'}>
                    {isActive ? t('developer.inEffect') : t('developer.inactive')}
                  </Badge>
                </View>
              }
              onPress={() => setExpanded(isOpen ? null : key)}
            />

            {isOpen ? (
              <View style={styles.actions}>
                <Divider />
                {busy ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 8 }} /> : null}

                <Btn
                  title={isVerified ? t('ceo.removeVerification') : t('ceo.verify')}
                  variant="ghost"
                  disabled={busy}
                  onPress={() => act(person, { isVerified: !isVerified })}
                />
                <Btn
                  title={isActive ? t('ceo.suspend') : t('ceo.activate')}
                  variant={isActive ? 'danger' : 'primary'}
                  disabled={busy}
                  onPress={() =>
                    act(
                      person,
                      tab === 'users' ? { isActive: !isActive, status: isActive ? 'SUSPENDED' : 'ACTIVE' } : { isActive: !isActive }
                    )
                  }
                />
                {tab === 'users' ? (
                  <View style={styles.roleRow}>
                    {['CEO', 'ADMIN', 'BROKER', 'DEVELOPER', 'SELLER', 'BUYER'].map((role) => (
                      <Chip
                        key={role}
                        label={role}
                        selected={(person.role ?? '').toUpperCase() === role}
                        onPress={() => (person.role ?? '').toUpperCase() !== role && act(person, { role })}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    count: { color: t.mutedForeground, fontSize: 14 },
    consoles: { gap: 0, marginBottom: 4 },
    card: { gap: 0 },
    badges: { flexDirection: 'row', gap: 6 },
    actions: { gap: 8, marginTop: 8 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  })
);
