import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
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
  SearchBar,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatMoney, humanise, initials } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

type Project = {
  id: string;
  name: string;
  nameArabic?: string | null;
  coverImage?: string | null;
  status?: string;
  approvalStatus?: string;
  address?: string | null;
  startPrice?: number | null;
  isActive?: boolean;
  developer?: { id?: string; companyName?: string; user?: { name?: string } } | null;
  governorate?: { name?: string } | null;
  city?: { name?: string } | null;
  _count?: { units?: number };
};

type ProjectsPage = {
  projects?: Project[];
  total?: number;
  page?: number;
  totalPages?: number;
  statusCounts?: Record<string, number>;
};

type Developer = { id: string; companyName?: string; name?: string };

type Approval = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'HIDDEN' | 'ARCHIVED';

type StatusAction = {
  action: string;
  labelKey: MessageKey;
  variant: 'primary' | 'ghost' | 'danger';
  needsReason?: boolean;
};

const APPROVALS: Approval[] = [
  'ALL',
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'HIDDEN',
  'ARCHIVED',
];

/**
 * The moves `POST /api/ceo/projects/[id]/status` actually accepts from each
 * approval state — the website's list-page menu, in the endpoint's lowercase
 * vocabulary. `reject` always asks for a reason first: the route 400s without
 * one, and the website's modal says the same.
 */
const ACTIONS: Record<string, StatusAction[]> = {
  DRAFT: [
    { action: 'submit', labelKey: 'ceo.submitReview', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  PENDING: [
    { action: 'approve', labelKey: 'ceo.approve', variant: 'primary' },
    { action: 'reject', labelKey: 'ceo.reject', variant: 'danger', needsReason: true },
  ],
  APPROVED: [
    { action: 'publish', labelKey: 'ceo.publish', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  REJECTED: [
    { action: 'submit', labelKey: 'ceo.submitReview', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  PUBLISHED: [
    { action: 'unpublish', labelKey: 'ceo.unpublish', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  HIDDEN: [
    { action: 'publish', labelKey: 'ceo.publish', variant: 'primary' },
    { action: 'archive', labelKey: 'ceo.archive', variant: 'ghost' },
  ],
  ARCHIVED: [{ action: 'restore', labelKey: 'ceo.restoreDraft', variant: 'primary' }],
};

/** Same property vocabulary the website's filter panel offers. */
const PROPERTY_TYPES = ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'STUDIO', 'DUPLEX', 'LAND', 'COMMERCIAL'];

type Sort = 'newest' | 'oldest' | 'name' | 'price';

const SORTS: { value: Sort; sort: string; order: string; labelKey: MessageKey }[] = [
  { value: 'newest', sort: 'createdAt', order: 'desc', labelKey: 'ceoPr.sortNewest' },
  { value: 'oldest', sort: 'createdAt', order: 'asc', labelKey: 'ceoPr.sortOldest' },
  { value: 'name', sort: 'name', order: 'asc', labelKey: 'ceoPr.sortName' },
  { value: 'price', sort: 'startPrice', order: 'asc', labelKey: 'ceoPr.sortPrice' },
];

/**
 * The CEO project console: the list/read/update/publish/delete surface of the
 * website's projects page, sized for a phone.
 *
 * Everything writes through `/api/ceo/projects` — status moves go to the
 * `status` endpoint as a lowercase `{ action }` (reject carries a `reason`),
 * deletes are the route's default soft delete (archive + hide) so nothing
 * irreversible happens from a thumb, and a create here is deliberately the
 * minimum the POST route needs: a name and a developer. Richer fields are
 * edited with the website's form.
 */
export default function CeoProjectsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');
  const [approval, setApproval] = useState<Approval>('ALL');
  const [sort, setSort] = useState<Sort>('newest');
  const [developerIdFilter, setDeveloperIdFilter] = useState<string | null>(null);
  const [propertyType, setPropertyType] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Dead remote covers fall back to initials — home city-card pattern.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});

  const activeSort = SORTS.find((s) => s.value === sort) ?? SORTS[0];
  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    sort: activeSort.sort,
    order: activeSort.order,
  });
  if (query.trim()) params.set('search', query.trim());
  if (approval !== 'ALL') params.set('approvalStatus', approval);
  if (developerIdFilter) params.set('developerId', developerIdFilter);
  if (propertyType) params.set('propertyType', propertyType);
  if (minPrice.trim()) params.set('minPrice', minPrice.trim());
  if (maxPrice.trim()) params.set('maxPrice', maxPrice.trim());

  const { data, error, loading, refreshing, refresh } = useApi<ProjectsPage>(
    `/api/ceo/projects?${params.toString()}`,
  );
  const { data: devData } = useApi<{ developers?: Developer[] }>('/api/ceo/developers');
  const mutation = useMutation();

  const developers = devData?.developers ?? [];

  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setDeveloperIdFilter(null);
    setPropertyType(null);
    setMinPrice('');
    setMaxPrice('');
    resetPage();
  }

  async function changeStatus(project: Project, action: string, reason?: string) {
    setBusyId(project.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/ceo/projects/${project.id}/status`, 'POST', {
        action,
        ...(reason ? { reason } : {}),
      });
      setRejectingId(null);
      setRejectReason('');
      setNotice(t('ceo.statusUpdated'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(project: Project) {
    setBusyId(project.id);
    setProblem(null);
    try {
      await mutation.run(`/api/ceo/projects/${project.id}`, 'DELETE');
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(project: Project) {
    Alert.alert(t('ceo.deleteProjectTitle'), t('ceo.deleteProjectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => void remove(project) },
    ]);
  }

  async function create() {
    if (!name.trim()) {
      setProblem(t('ceo.nameRequired'));
      return;
    }
    if (!developerId) {
      setProblem(t('ceo.developerRequired'));
      return;
    }
    setProblem(null);
    try {
      await mutation.run('/api/ceo/projects', 'POST', { developerId, name: name.trim() });
      setCreating(false);
      setName('');
      setDeveloperId(null);
      setNotice(t('ceo.projectCreated'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const items = data?.projects ?? [];
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const counts = data?.statusCounts ?? {};
  const hasFilters = developerIdFilter !== null || propertyType !== null || minPrice.trim() !== '' || maxPrice.trim() !== '';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.projectsScreen') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={data?.total ?? 0} label={t('ceo.projects')} />
        <Stat value={counts.PUBLISHED ?? 0} label={t('ceo.publishedProjects')} />
        <Stat value={counts.PENDING ?? 0} label={t('ceo.pendingApprovals')} />
      </Card>

      <SearchBar value={query} onChangeText={(next) => { setQuery(next); resetPage(); }} placeholder={t('ceo.searchProjects')} />

      <View style={[styles.filters, row]}>
        {APPROVALS.map((value) => {
          const count = value === 'ALL' ? (data?.total ?? 0) : (counts[value] ?? 0);
          return (
            <Chip
              key={value}
              label={value === 'ALL' ? `${t('common.all')} (${count})` : `${humanise(value)} (${count})`}
              selected={approval === value}
              onPress={() => {
                setApproval(value);
                resetPage();
              }}
            />
          );
        })}
      </View>

      <Btn
        title={showFilters ? t('common.close') : t('ceoPr.filters')}
        variant="ghost"
        onPress={() => setShowFilters((prev) => !prev)}
      />

      {showFilters ? (
        <Card style={styles.form}>
          <Text style={[styles.formLabel, align]}>{t('ceoPr.filterDeveloper')}</Text>
          <View style={[styles.chipRow, row]}>
            <Chip
              label={t('ceoPr.allDevelopers')}
              selected={developerIdFilter === null}
              onPress={() => {
                setDeveloperIdFilter(null);
                resetPage();
              }}
            />
            {developers.map((developer) => (
              <Chip
                key={developer.id}
                label={developer.companyName || developer.name || developer.id}
                selected={developerIdFilter === developer.id}
                onPress={() => {
                  setDeveloperIdFilter(developer.id);
                  resetPage();
                }}
              />
            ))}
          </View>

          <Text style={[styles.formLabel, align]}>{t('ceoPr.filterPropertyType')}</Text>
          <View style={[styles.chipRow, row]}>
            <Chip
              label={t('common.all')}
              selected={propertyType === null}
              onPress={() => {
                setPropertyType(null);
                resetPage();
              }}
            />
            {PROPERTY_TYPES.map((type) => (
              <Chip
                key={type}
                label={humanise(type)}
                selected={propertyType === type}
                onPress={() => {
                  setPropertyType(type);
                  resetPage();
                }}
              />
            ))}
          </View>

          <View style={[styles.priceRow, row]}>
            <View style={styles.priceField}>
              <Field
                label={t('ceoPr.minPrice')}
                value={minPrice}
                onChangeText={(next) => { setMinPrice(next); resetPage(); }}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.priceField}>
              <Field
                label={t('ceoPr.maxPrice')}
                value={maxPrice}
                onChangeText={(next) => { setMaxPrice(next); resetPage(); }}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={[styles.formLabel, align]}>{t('ceoPr.sortBy')}</Text>
          <View style={[styles.chipRow, row]}>
            {SORTS.map((option) => (
              <Chip
                key={option.value}
                label={t(option.labelKey)}
                selected={sort === option.value}
                onPress={() => {
                  setSort(option.value);
                  resetPage();
                }}
              />
            ))}
          </View>

          {hasFilters ? (
            <Btn title={t('common.clear')} variant="ghost" onPress={clearFilters} />
          ) : null}
        </Card>
      ) : null}

      {!showFilters ? (
        <View style={[styles.filters, row]}>
          {SORTS.map((option) => (
            <Chip
              key={option.value}
              label={t(option.labelKey)}
              selected={sort === option.value}
              onPress={() => {
                setSort(option.value);
                resetPage();
              }}
            />
          ))}
        </View>
      ) : null}

      <Btn
        title={creating ? t('common.close') : t('ceo.createProject')}
        variant={creating ? 'ghost' : 'primary'}
        onPress={() => {
          setCreating((prev) => !prev);
          setProblem(null);
        }}
      />

      {creating ? (
        <Card style={styles.form}>
          <Field label={t('ceo.projectName')} value={name} onChangeText={setName} />
          <Text style={[styles.formLabel, align]}>{t('ceo.selectDeveloper')}</Text>
          <View style={[styles.chipRow, row]}>
            {developers.map((developer) => (
              <Chip
                key={developer.id}
                label={developer.companyName || developer.name || developer.id}
                selected={developerId === developer.id}
                onPress={() => setDeveloperId(developer.id)}
              />
            ))}
          </View>
          <Text style={[styles.hint, align]}>{t('ceo.createHint')}</Text>
          <Btn title={t('ceo.createProject')} busy={mutation.busy} onPress={() => void create()} />
        </Card>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && items.length === 0 ? (
        <Empty title={t('ceo.projects.none')} message={t('ceo.projects.noneHint')} />
      ) : null}

      {items.map((project, index) => {
        const isOpen = expanded === project.id;
        const busy = busyId === project.id;
        const rejecting = rejectingId === project.id;
        const moves = ACTIONS[project.approvalStatus ?? 'DRAFT'] ?? [];
        const location = [project.governorate?.name, project.city?.name, project.address]
          .filter(Boolean)
          .join(' · ');
        const coverSrc = imageUrl(project.coverImage);

        return (
          <View key={project.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={
                  coverSrc && !deadImgs[coverSrc] ? (
                    <Image
                      source={{ uri: coverSrc }}
                      style={styles.cover}
                      onError={() =>
                        setDeadImgs((prev) => (prev[coverSrc] ? prev : { ...prev, [coverSrc]: true }))
                      }
                    />
                  ) : (
                    <View style={styles.coverFallback}>
                      <Text style={styles.coverInitials}>{initials(project.name)}</Text>
                    </View>
                  )
                }
                title={localized(project.name, project.nameArabic)}
                subtitle={[
                  project.developer?.companyName ?? project.developer?.user?.name,
                  location || undefined,
                  project._count?.units !== undefined
                    ? `${project._count.units} ${t('ceo.units')}`
                    : undefined,
                  project.startPrice
                    ? `${formatMoney(project.startPrice, currency, rates, { compact: true })}+`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone={toneForApproval(project.approvalStatus)}>
                      {humanise(project.approvalStatus ?? 'DRAFT')}
                    </Badge>
                    <Badge tone="muted">{humanise(project.status ?? 'COMING_SOON')}</Badge>
                  </View>
                }
                onPress={() => setExpanded(isOpen ? null : project.id)}
              />

              {isOpen ? (
                <View style={styles.actions}>
                  <Divider />
                  <Btn
                    title={t('ceoPr.viewDetails')}
                    variant="primary"
                    disabled={busy}
                    onPress={() => router.push(`/ceo/projects/${project.id}`)}
                  />
                  {moves.map((move) => (
                    <Btn
                      key={move.action}
                      title={t(move.labelKey)}
                      variant={move.variant}
                      busy={busy && !rejecting}
                      disabled={busy}
                      onPress={() => {
                        if (move.needsReason) {
                          setRejectingId(project.id);
                          setRejectReason('');
                          setProblem(null);
                        } else {
                          void changeStatus(project, move.action);
                        }
                      }}
                    />
                  ))}
                  {rejecting ? (
                    <View style={styles.rejectBox}>
                      <Text style={[styles.rejectTitle, align]}>{t('ceoPr.rejectProject')}</Text>
                      <Text style={[styles.hint, align]}>{t('ceoPr.rejectHint')}</Text>
                      <Field
                        label={t('ceoPr.rejectionReason')}
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        multiline
                        numberOfLines={3}
                      />
                      <View style={[styles.rejectBtns, row]}>
                        <Btn
                          title={t('ceo.reject')}
                          variant="danger"
                          style={styles.rejectBtn}
                          disabled={!rejectReason.trim() || busy}
                          busy={busy}
                          onPress={() => void changeStatus(project, 'reject', rejectReason.trim())}
                        />
                        <Btn
                          title={t('common.cancel')}
                          variant="ghost"
                          style={styles.rejectBtn}
                          disabled={busy}
                          onPress={() => {
                            setRejectingId(null);
                            setRejectReason('');
                          }}
                        />
                      </View>
                    </View>
                  ) : null}
                  <Btn
                    title={t('common.delete')}
                    variant="ghost"
                    disabled={busy}
                    onPress={() => confirmRemove(project)}
                  />
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      {items.length > 0 ? (
        <View style={[styles.pager, row]}>
          <Pressable onPress={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} hitSlop={8}>
            <Text style={[styles.pagerLink, page <= 1 && styles.pagerOff]}>{t('common.prev')}</Text>
          </Pressable>
          <Text style={styles.pagerCount}>{`${page} ${t('common.of')} ${totalPages}`}</Text>
          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            hitSlop={8}>
            <Text style={[styles.pagerLink, page >= totalPages && styles.pagerOff]}>
              {t('common.next')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

/** Approval states get the same colouring the badges use everywhere else. */
function toneForApproval(status: string | null | undefined): 'green' | 'red' | 'gold' | 'muted' {
  const s = (status ?? '').toUpperCase();
  if (s === 'PUBLISHED' || s === 'APPROVED') return 'green';
  if (s === 'REJECTED' || s === 'ARCHIVED') return 'red';
  if (s === 'PENDING' || s === 'DRAFT' || s === 'HIDDEN') return 'gold';
  return 'muted';
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md },
    filters: { flexWrap: 'wrap', gap: 8 },
    form: { gap: 8 },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    priceRow: { gap: 8 },
    priceField: { flex: 1 },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 0, marginTop: Spacing.xs },
    cover: {
      width: 52,
      height: 52,
      borderRadius: Radius.md,
      backgroundColor: t.muted,
    },
    coverFallback: {
      width: 52,
      height: 52,
      borderRadius: Radius.md,
      backgroundColor: t.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverInitials: { color: t.primary, fontSize: 16, fontWeight: '800' },
    badges: { gap: 6, flexWrap: 'wrap' },
    actions: { gap: 8, marginTop: 8 },
    rejectBox: { gap: 8 },
    rejectTitle: { color: t.foreground, fontSize: 15, fontWeight: '700' },
    rejectBtns: { gap: 8 },
    rejectBtn: { flex: 1 },
    pager: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
    pagerLink: { color: t.primary, fontSize: 14, fontWeight: '700' },
    pagerOff: { color: t.mutedForeground, opacity: 0.5 },
    pagerCount: { color: t.mutedForeground, fontSize: 13 },
  }),
);
