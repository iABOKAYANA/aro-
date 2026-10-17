import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Btn,
  Card,
  Chip,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Screen,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, formatMoney, humanise } from '@/lib/format';
import { useImageUpload } from '@/lib/image-upload';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

type Milestone = { id?: string; label?: string | null; percentage?: number | null; amount?: number | null };

type Plan = {
  id: string;
  name: string;
  downPaymentPct?: number | null;
  installmentYears?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
  milestones?: Milestone[];
};

type Project = {
  id: string;
  name: string;
  nameArabic?: string | null;
  slug?: string;
  developerId?: string | null;
  tagline?: string | null;
  taglineArabic?: string | null;
  description?: string | null;
  descriptionArabic?: string | null;
  coverImage?: string | null;
  videoUrl?: string | null;
  virtualTourUrl?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string | null;
  governorateId?: string | null;
  cityId?: string | null;
  districtId?: string | null;
  status?: string;
  approvalStatus?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  isVerified?: boolean;
  featuredRank?: number | null;
  completionPercent?: number | null;
  totalUnits?: number | null;
  totalArea?: number | null;
  compoundArea?: number | null;
  deliveryDate?: string | null;
  deliveryTerms?: string | null;
  startPrice?: number | null;
  endPrice?: number | null;
  pricePerSqm?: number | null;
  downPaymentMin?: number | null;
  installmentYears?: number | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string | null;
  gallery?: string | null;
  panoramaImages?: string | null;
  rejectionReason?: string | null;
  viewCount?: number;
  favoriteCount?: number;
  inquiryCount?: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  developer?: {
    companyName?: string;
    user?: { name?: string | null; email?: string | null } | null;
  } | null;
  governorate?: { name?: string; nameArabic?: string | null } | null;
  city?: { name?: string; nameArabic?: string | null } | null;
  district?: { name?: string; nameArabic?: string | null } | null;
  amenities?: { amenity?: { id?: string; name?: string; nameArabic?: string | null } }[];
  paymentPlans?: Plan[];
  masterPlanImages?: { id?: string; url: string; caption?: string | null }[];
  phases?: { id: string; name: string; status?: string }[];
};

type DetailResponse = { project: Project; availableUnits?: number };

type AuditLog = {
  id: string;
  action?: string | null;
  description?: string | null;
  changes?: unknown;
  createdAt?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
};

type Tab = 'overview' | 'pricing' | 'content' | 'media' | 'location' | 'seo' | 'settings' | 'audit';
type Section = 'pricing' | 'content' | 'media' | 'location' | 'seo' | 'settings';

const TABS: Tab[] = ['overview', 'pricing', 'content', 'media', 'location', 'seo', 'settings', 'audit'];

const TAB_LABEL: Record<Tab, MessageKey> = {
  overview: 'ceo.overview',
  pricing: 'ceo.pricing',
  content: 'ceoPr.tabContent',
  media: 'ceoPr.tabMedia',
  location: 'ceoPr.groupLocation',
  seo: 'ceoPr.tabSeo',
  settings: 'ceoPr.tabSettings',
  audit: 'ceoPr.tabAudit',
};

/**
 * Exactly the field groups the website's detail page PATCHes per section —
 * `SECTION_FIELDS` in src/app/ceo/projects/[id]/page.tsx. Two differences,
 * both deliberate: `keywords` is added to `seo` (the website renders the input
 * but forgets it in this map, so the CEO's typing silently vanished), and
 * `masterPlanImages` is edited as a URL + caption list instead of an upload
 * widget the app cannot host — the route accepts plain `{ url, caption }`
 * entries, so nothing is lost.
 */
const SECTION_FIELDS: Record<Section, string[]> = {
  pricing: ['startPrice', 'endPrice', 'pricePerSqm', 'downPaymentMin', 'installmentYears', 'compoundArea'],
  content: ['tagline', 'taglineArabic', 'description', 'descriptionArabic'],
  media: ['coverImage', 'videoUrl', 'virtualTourUrl', 'gallery'],
  location: ['address', 'latitude', 'longitude', 'googleMapsUrl', 'governorateId', 'cityId', 'districtId'],
  seo: ['metaTitle', 'metaDescription', 'keywords'],
  settings: ['totalUnits', 'totalArea', 'completionPercent', 'deliveryDate', 'deliveryTerms', 'featuredRank', 'developerId', 'isFeatured', 'isVerified', 'isActive'],
};

const NUMERIC = new Set([
  'startPrice', 'endPrice', 'pricePerSqm', 'downPaymentMin', 'installmentYears', 'compoundArea',
  'latitude', 'longitude', 'totalUnits', 'totalArea', 'completionPercent', 'featuredRank',
]);
const BOOLEAN = new Set(['isFeatured', 'isVerified', 'isActive']);
const MULTILINE = new Set(['description', 'descriptionArabic', 'deliveryTerms', 'metaDescription', 'gallery']);

/**
 * The moves `POST /api/ceo/projects/[id]/status` actually accepts from each
 * approval state — the website's status bar, restated in the endpoint's own
 * lowercase vocabulary (the site sends `SUBMIT`, the route matches `submit`).
 */
const ACTIONS: Record<string, { action: string; labelKey: MessageKey; variant: 'primary' | 'danger' }[]> = {
  DRAFT: [{ action: 'submit', labelKey: 'ceo.submitReview', variant: 'primary' }],
  PENDING: [
    { action: 'approve', labelKey: 'ceo.approve', variant: 'primary' },
    { action: 'reject', labelKey: 'ceo.reject', variant: 'danger' },
  ],
  APPROVED: [
    { action: 'publish', labelKey: 'ceo.publish', variant: 'primary' },
    { action: 'reject', labelKey: 'ceo.reject', variant: 'danger' },
  ],
  REJECTED: [{ action: 'submit', labelKey: 'ceo.submitReview', variant: 'primary' }],
  PUBLISHED: [{ action: 'unpublish', labelKey: 'ceo.unpublish', variant: 'primary' }],
  HIDDEN: [{ action: 'publish', labelKey: 'ceo.publish', variant: 'primary' }],
  ARCHIVED: [{ action: 'restore', labelKey: 'ceo.restoreDraft', variant: 'primary' }],
};

function jsonArr(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Maps the upload helper's stable error codes onto failure-strip strings. */
const UPLOAD_ERROR_KEY = {
  'too-large': 'ceoPr.uploadTooLarge',
  'bad-type': 'ceoPr.uploadBadType',
  failed: 'ceoPr.uploadFailed',
} as const;

/** Render a stored field the way the edit input wants to see it. */
function textOf(project: Project, field: string): string {
  const raw = (project as Record<string, unknown>)[field];
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  if (field === 'deliveryDate') return String(raw).split('T')[0];
  if (field === 'gallery') return jsonArr(String(raw)).join('\n');
  if (field === 'keywords') return jsonArr(String(raw)).join(', ');
  return String(raw);
}

/**
 * The website's /ceo/projects/[id]: one project with its status bar, its eight
 * tabs and the per-section edit/save form — reading `GET /api/ceo/projects/[id]`
 * (project + availableUnits) and, on the Audit tab only, `GET /api/ceo/activity`.
 */
export default function CeoProjectDetailScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState<Section | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [mpDraft, setMpDraft] = useState<{ url: string; caption: string | null }[]>([]);
  const [mpUrl, setMpUrl] = useState('');
  const [panoDraft, setPanoDraft] = useState<string[]>([]);
  const [panoUrl, setPanoUrl] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useApi<DetailResponse>(
    id ? `/api/ceo/projects/${id}` : null,
  );
  const audit = useApi<{ logs?: AuditLog[] }>(
    tab === 'audit' ? `/api/ceo/activity?entity=Project&entityId=${id}` : null,
  );
  const mutation = useMutation();

  // Phone uploads for the media tab — the mobile twin of the website's
  // ImageInput (cover) + the two "Upload & add" buttons (gallery, master
  // plans). Each fills its field with the stored path; URL paste keeps
  // working everywhere.
  const coverUpload = useImageUpload((url) =>
    setDraft((prev) => ({ ...prev, coverImage: url })),
  );
  const galleryUpload = useImageUpload((url) =>
    setDraft((prev) => ({
      ...prev,
      gallery: [...(prev.gallery ?? '').split('\n').map((line) => line.trim()).filter(Boolean), url].join('\n'),
    })),
  );
  const mpUpload = useImageUpload((url) =>
    setMpDraft((prev) => [...prev, { url, caption: null }]),
  );

  const project = data?.project ?? null;
  const availableUnits = data?.availableUnits ?? 0;

  /** Keep the failure text on screen until the next attempt clears it. */
  function failed(e: unknown) {
    setProblem(e instanceof Error ? e.message : t('common.error'));
  }

  async function statusAction(action: string, reason?: string) {
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/ceo/projects/${id}/status`, 'POST', {
        action,
        ...(reason ? { reason } : {}),
      });
      setRejecting(false);
      setRejectReason('');
      setNotice(t('ceo.statusUpdated'));
      refresh();
    } catch (e) {
      failed(e);
    }
  }

  function startEdit(section: Section) {
    const next: Record<string, string> = {};
    for (const field of SECTION_FIELDS[section]) next[field] = textOf(project!, field);
    setDraft(next);
    if (section === 'media') {
      setMpDraft((project!.masterPlanImages ?? []).map((image) => ({ url: image.url, caption: image.caption ?? null })));
      setMpUrl('');
      setPanoDraft(jsonArr(project!.panoramaImages));
      setPanoUrl('');
    }
    setEditing(section);
    setProblem(null);
    setNotice(null);
  }

  async function save(section: Section) {
    const payload: Record<string, unknown> = {};
    for (const field of SECTION_FIELDS[section]) {
      const raw = (draft[field] ?? '').trim();
      if (BOOLEAN.has(field)) {
        payload[field] = raw === 'true';
      } else if (NUMERIC.has(field)) {
        const parsed = Number(raw.replace(/[^\d.-]/g, ''));
        payload[field] = raw && Number.isFinite(parsed) ? parsed : null;
      } else if (field === 'gallery') {
        payload[field] = raw.split('\n').map((line) => line.trim()).filter(Boolean);
      } else if (field === 'keywords') {
        payload[field] = raw.split(',').map((word) => word.trim()).filter(Boolean);
      } else if (field === 'deliveryDate') {
        payload[field] = raw ? raw : null;
      } else {
        payload[field] = draft[field] ?? '';
      }
    }
    payload.reason = `${t('ceoPr.updatedReason')} ${t(TAB_LABEL[section])}`;
    // Master plans ride outside the text fields: the route replaces the whole
    // set, so the full surviving list — with captions intact — goes along.
    // Panorama URLs ride the same way: the route's `panoramaImages` branch
    // accepts a plain string array and stores it as JSON, like `gallery`.
    if (section === 'media') payload.masterPlanImages = mpDraft;
    if (section === 'media') payload.panoramaImages = panoDraft;

    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/ceo/projects/${id}`, 'PATCH', payload);
      setEditing(null);
      setNotice(t('ceoPr.saved'));
      refresh();
    } catch (e) {
      failed(e);
    }
  }

  function confirmRemove() {
    Alert.alert(t('ceo.deleteProjectTitle'), t('ceo.deleteProjectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setProblem(null);
            try {
              await mutation.run(`/api/ceo/projects/${id}`, 'DELETE');
              router.replace('/ceo/projects');
            } catch (e) {
              failed(e);
            }
          })();
        },
      },
    ]);
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('ceoPr.detailTitle') }} />
        <Loading label={t('ceoPr.loading')} />
      </>
    );
  }

  if (!project) {
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Stack.Screen options={{ title: t('ceoPr.detailTitle') }} />
        {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
        <Empty
          title={t('ceoPr.notFound')}
          action={<Btn title={t('ceoPr.backToProjects')} onPress={() => router.replace('/ceo/projects')} />}
        />
      </Screen>
    );
  }

  const approval = project.approvalStatus || 'DRAFT';
  const moves = ACTIONS[approval] ?? [];
  const money = (value: number | null | undefined) => formatMoney(value ?? null, currency, rates);

  const input = (section: Section, field: string, label: string) => (
    <Field
      label={label}
      value={editing === section ? (draft[field] ?? '') : textOf(project!, field)}
      editable={editing === section}
      multiline={MULTILINE.has(field)}
      numberOfLines={MULTILINE.has(field) ? 4 : undefined}
      keyboardType={NUMERIC.has(field) ? 'numeric' : undefined}
      onChangeText={(next) => setDraft((prev) => ({ ...prev, [field]: next }))}
    />
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: project.name }} />

      {/* Header */}
      <Card style={styles.head}>
        <Text style={[styles.name, align]}>{localized(project.name, project.nameArabic)}</Text>
        {project.nameArabic && project.nameArabic !== project.name ? (
          <Text style={[styles.nameAr, align]}>{project.nameArabic}</Text>
        ) : null}
        <View style={[styles.badges, row]}>
          <Badge tone={toneForApproval(approval)}>{humanise(approval)}</Badge>
          <Badge tone="muted">{humanise(project.status ?? 'PLANNING')}</Badge>
        </View>
      </Card>

      {/* Status action bar */}
      <Card style={styles.statusBar}>
        <View style={[styles.actions, row]}>
          {moves.map((move) => (
            <Btn
              key={move.action}
              title={t(move.labelKey)}
              variant={move.variant}
              style={styles.action}
              busy={mutation.busy}
              onPress={() => {
                if (move.action === 'reject') {
                  setRejecting(true);
                  setProblem(null);
                } else {
                  void statusAction(move.action);
                }
              }}
            />
          ))}
          <Btn
            title={t('common.delete')}
            variant="ghost"
            style={styles.action}
            disabled={mutation.busy}
            onPress={confirmRemove}
          />
        </View>

        {rejecting ? (
          <View style={styles.rejectBox}>
            <Text style={[styles.rejectTitle, align]}>{t('ceoPr.rejectProject')}</Text>
            <Text style={[styles.rejectHint, align]}>{t('ceoPr.rejectHint')}</Text>
            <Field
              label={t('ceoPr.rejectionReason')}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={[styles.actions, row]}>
              <Btn
                title={t('ceo.reject')}
                variant="danger"
                style={styles.action}
                disabled={!rejectReason.trim() || mutation.busy}
                busy={mutation.busy && rejecting}
                onPress={() => void statusAction('reject', rejectReason.trim())}
              />
              <Btn
                title={t('common.cancel')}
                variant="ghost"
                style={styles.action}
                disabled={mutation.busy}
                onPress={() => {
                  setRejecting(false);
                  setRejectReason('');
                }}
              />
            </View>
          </View>
        ) : null}
      </Card>

      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {/* Tabs */}
      <View style={[styles.tabs, row]}>
        {TABS.map((value) => (
          <Chip
            key={value}
            label={t(TAB_LABEL[value])}
            selected={tab === value}
            onPress={() => {
              setTab(value);
              setEditing(null);
              setProblem(null);
              setNotice(null);
            }}
          />
        ))}
      </View>

      {/* ── Overview ── */}
      {tab === 'overview' ? (
        <View style={styles.stack}>
          <Card style={[styles.stats, row]}>
            <Stat value={project.viewCount ?? 0} label={t('developer.stat.views')} />
            <Stat value={project.favoriteCount ?? 0} label={t('ceo.favorites')} />
            <Stat value={project.inquiryCount ?? 0} label={t('ceo.inquiriesCount')} />
            <Stat value={project.totalUnits ?? 0} label={t('ceoPr.totalUnits')} />
            <Stat value={availableUnits} label={t('ceoPr.available')} />
            <Stat value={`${project.completionPercent ?? 0}%`} label={t('ceoPr.completion')} />
          </Card>

          {project.tagline || project.taglineArabic ? (
            <Card style={styles.card}>
              <Text style={[styles.cardLabel, align]}>{t('ceoPr.tagline')}</Text>
              {project.tagline ? <Text style={[styles.body, align]}>{project.tagline}</Text> : null}
              {project.taglineArabic ? (
                <Text style={[styles.body, styles.rtl, align]}>{project.taglineArabic}</Text>
              ) : null}
            </Card>
          ) : null}

          <View style={[styles.grid, row]}>
            <Card style={styles.cell}>
              <Text style={[styles.cardLabel, align]}>{t('common.developer')}</Text>
              <Text style={[styles.body, align]}>{project.developer?.companyName || '—'}</Text>
              {project.developer?.user ? (
                <Text style={[styles.muted, align]}>
                  {project.developer.user.name || project.developer.user.email || ''}
                </Text>
              ) : null}
            </Card>

            <Card style={styles.cell}>
              <Text style={[styles.cardLabel, align]}>{t('ceoPr.groupLocation')}</Text>
              <Text style={[styles.body, align]}>
                {[
                  project.address,
                  project.district?.name,
                  project.city?.name,
                  project.governorate?.name,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </Text>
            </Card>

            <Card style={styles.cell}>
              <Text style={[styles.cardLabel, align]}>{t('ceoPr.dates')}</Text>
              <Text style={[styles.muted, align]}>
                {`${t('ceoPr.created')}: `}
                <Text style={styles.strong}>{formatDate(project.createdAt)}</Text>
              </Text>
              <Text style={[styles.muted, align]}>
                {`${t('common.updated')}: `}
                <Text style={styles.strong}>{formatDate(project.updatedAt)}</Text>
              </Text>
              {project.publishedAt ? (
                <Text style={[styles.muted, align]}>
                  {`${t('ceoPr.published')}: `}
                  <Text style={styles.strong}>{formatDate(project.publishedAt)}</Text>
                </Text>
              ) : null}
            </Card>

            <Card style={styles.cell}>
              <Text style={[styles.cardLabel, align]}>{t('ceoPr.pricingUnits')}</Text>
              <Text style={[styles.muted, align]}>
                {`${t('ceoPr.range')}: `}
                <Text style={styles.strong}>{`${money(project.startPrice)} - ${money(project.endPrice)}`}</Text>
              </Text>
              <Text style={[styles.muted, align]}>
                {`${t('ceoPr.perSqm')}: `}
                <Text style={styles.strong}>{money(project.pricePerSqm)}</Text>
              </Text>
              <Text style={[styles.muted, align]}>
                {`${t('ceoPr.downPayment')}: `}
                <Text style={styles.strong}>{project.downPaymentMin != null ? `${project.downPaymentMin}%` : '—'}</Text>
              </Text>
              <Text style={[styles.muted, align]}>
                {`${t('ceoPr.installments')}: `}
                <Text style={styles.strong}>
                  {project.installmentYears ? `${project.installmentYears} ${t('ceoPr.years')}` : '—'}
                </Text>
              </Text>
            </Card>
          </View>

          {project.amenities?.length ? (
            <Card style={styles.card}>
              <Text style={[styles.cardLabel, align]}>
                {`${t('ceoPr.amenities')} (${project.amenities.length})`}
              </Text>
              <View style={[styles.tags, row]}>
                {project.amenities.map((entry, index) => (
                  <Badge key={entry.amenity?.id ?? index} tone="gold">
                    {localized(entry.amenity?.name, entry.amenity?.nameArabic)}
                  </Badge>
                ))}
              </View>
            </Card>
          ) : null}

          {project.paymentPlans?.length ? (
            <Card style={styles.card}>
              <Text style={[styles.cardLabel, align]}>
                {`${t('ceoPr.paymentPlans')} (${project.paymentPlans.length})`}
              </Text>
              {project.paymentPlans.map((plan) => (
                <View key={plan.id} style={styles.plan}>
                  <Text style={[styles.body, align]}>{plan.name}</Text>
                  {(plan.milestones ?? []).map((milestone, index) => (
                    <Text key={milestone.id ?? index} style={[styles.muted, align]}>
                      {`${milestone.label || `${t('ceoPr.milestone')} ${index + 1}`}: ${
                        milestone.percentage ?? milestone.amount ?? 0
                      }%`}
                    </Text>
                  ))}
                </View>
              ))}
            </Card>
          ) : null}

          {project.rejectionReason ? (
            <Card style={styles.danger}>
              <Text style={[styles.dangerTitle, align]}>{t('ceoPr.rejectionReason')}</Text>
              <Text style={[styles.dangerBody, align]}>{project.rejectionReason}</Text>
            </Card>
          ) : null}
        </View>
      ) : null}

      {/* ── Editable sections ── */}
      {tab !== 'overview' && tab !== 'audit' ? (
        <Panel
          title={t(TAB_LABEL[tab])}
          editing={editing === tab}
          saving={mutation.busy}
          onEdit={() => startEdit(tab as Section)}
          onSave={() => void save(tab as Section)}
          onCancel={() => setEditing(null)}
        >
          {tab === 'pricing' ? (
            <View style={styles.fields}>
              {input('pricing', 'startPrice', `${t('ceoPr.startPrice')} (EGP)`)}
              {input('pricing', 'endPrice', `${t('ceoPr.endPrice')} (EGP)`)}
              {input('pricing', 'pricePerSqm', `${t('ceoPr.pricePerSqm')} (EGP)`)}
              {input('pricing', 'downPaymentMin', `${t('ceoPr.downPaymentMin')} %`)}
              {input('pricing', 'installmentYears', t('ceoPr.installmentYears'))}
              {input('pricing', 'compoundArea', t('ceoPr.compoundAreaSqm'))}
            </View>
          ) : null}

          {tab === 'content' ? (
            <View style={styles.fields}>
              {input('content', 'tagline', t('ceoPr.tagline'))}
              {input('content', 'taglineArabic', t('ceoPr.taglineArabic'))}
              {input('content', 'description', t('ceoPr.description'))}
              {input('content', 'descriptionArabic', t('ceoPr.descriptionArabic'))}
            </View>
          ) : null}

          {tab === 'media' ? (
            <View style={styles.fields}>
              {input('media', 'coverImage', t('ceoPr.coverImage'))}
              {editing === 'media' ? (
                <MediaUploadRow upload={coverUpload} title={t('ceoPr.uploadImage')} />
              ) : null}
              {input('media', 'videoUrl', t('ceoPr.videoUrl'))}
              {input('media', 'virtualTourUrl', t('ceoPr.tourUrl'))}
              {input('media', 'gallery', t('ceoPr.galleryUrls'))}
              {editing === 'media' ? (
                <MediaUploadRow upload={galleryUpload} title={t('ceoPr.uploadAdd')} />
              ) : null}

              <Text style={[styles.cardLabel, align]}>
                {`${t('ceoPr.panoUrls')} (${editing === 'media' ? panoDraft.length : jsonArr(project.panoramaImages).length})`}
              </Text>
              {editing === 'media' ? (
                <View style={styles.list}>
                  <Field
                    label={t('ceoPr.panoUrlPlaceholder')}
                    value={panoUrl}
                    onChangeText={setPanoUrl}
                    autoCapitalize="none"
                  />
                  <Btn
                    title={t('ceoPr.addPanoUrl')}
                    variant="ghost"
                    disabled={!panoUrl.trim()}
                    onPress={() => {
                      setPanoDraft((prev) => [...prev, panoUrl.trim()]);
                      setPanoUrl('');
                    }}
                  />
                  {panoDraft.length === 0 ? (
                    <Text style={[styles.muted, align]}>{t('ceoPr.noPanos')}</Text>
                  ) : null}
                  {panoDraft.map((pano, index) => (
                    <View key={`${pano}-${index}`} style={styles.mpRow}>
                      <Text style={[styles.muted, align]} numberOfLines={2}>
                        {pano}
                      </Text>
                      <Btn
                        title={t('ceoPr.removePano')}
                        variant="ghost"
                        style={styles.panelBtn}
                        onPress={() => setPanoDraft((prev) => prev.filter((_, i) => i !== index))}
                      />
                    </View>
                  ))}
                </View>
              ) : jsonArr(project.panoramaImages).length ? (
                <View style={styles.list}>
                  {jsonArr(project.panoramaImages).map((pano, index) => (
                    <Text key={`${pano}-${index}`} style={[styles.muted, align]} numberOfLines={2}>
                      {pano}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={[styles.muted, align]}>{t('ceoPr.noPanos')}</Text>
              )}

              <Text style={[styles.cardLabel, align]}>
                {`${t('ceoPr.masterPlans')} (${editing === 'media' ? mpDraft.length : (project.masterPlanImages?.length ?? 0)})`}
              </Text>
              {editing === 'media' ? (
                <View style={styles.list}>
                  <Field
                    label={t('ceoPr.mpUrlPlaceholder')}
                    value={mpUrl}
                    onChangeText={setMpUrl}
                    autoCapitalize="none"
                  />
                  <Btn
                    title={t('ceoPr.addMpUrl')}
                    variant="ghost"
                    disabled={!mpUrl.trim()}
                    onPress={() => {
                      setMpDraft((prev) => [...prev, { url: mpUrl.trim(), caption: null }]);
                      setMpUrl('');
                    }}
                  />
                  <MediaUploadRow upload={mpUpload} title={t('ceoPr.uploadAdd')} />
                  {mpDraft.length === 0 ? (
                    <Text style={[styles.muted, align]}>{t('ceoPr.noMasterPlans')}</Text>
                  ) : null}
                  {mpDraft.map((image, index) => (
                    <View key={`${image.url}-${index}`} style={styles.mpRow}>
                      <Text style={[styles.muted, align]} numberOfLines={2}>
                        {image.url}
                      </Text>
                      <Field
                        label={t('ceoPr.mpCaption')}
                        value={image.caption ?? ''}
                        onChangeText={(next) =>
                          setMpDraft((prev) =>
                            prev.map((entry, i) => (i === index ? { ...entry, caption: next } : entry)),
                          )
                        }
                      />
                      <Btn
                        title={t('ceoPr.removeMp')}
                        variant="ghost"
                        style={styles.panelBtn}
                        onPress={() => setMpDraft((prev) => prev.filter((_, i) => i !== index))}
                      />
                    </View>
                  ))}
                </View>
              ) : (project.masterPlanImages ?? []).length ? (
                <View style={styles.list}>
                  {(project.masterPlanImages ?? []).map((image, index) => (
                    <Text key={image.id ?? index} style={[styles.muted, align]} numberOfLines={2}>
                      {image.caption ? `${image.caption} — ${image.url}` : image.url}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={[styles.muted, align]}>{t('ceoPr.noMasterPlans')}</Text>
              )}
            </View>
          ) : null}

          {tab === 'location' ? (
            <View style={styles.fields}>
              {input('location', 'address', t('ceo.settings.address'))}
              {input('location', 'latitude', t('ceoPr.latitude'))}
              {input('location', 'longitude', t('ceoPr.longitude'))}
              {input('location', 'googleMapsUrl', t('ceoPr.mapsUrl'))}
              {input('location', 'governorateId', t('ceoPr.govId'))}
              {input('location', 'cityId', t('ceoPr.cityId'))}
              {input('location', 'districtId', t('ceoPr.districtId'))}
            </View>
          ) : null}

          {tab === 'seo' ? (
            <View style={styles.fields}>
              {input('seo', 'metaTitle', t('ceoPr.metaTitle'))}
              {input('seo', 'metaDescription', t('ceoPr.metaDescription'))}
              {input('seo', 'keywords', t('ceoPr.keywordsHint'))}
            </View>
          ) : null}

          {tab === 'settings' ? (
            <View style={styles.fields}>
              {input('settings', 'totalUnits', t('ceoPr.totalUnits'))}
              {input('settings', 'totalArea', t('ceoPr.totalAreaSqm'))}
              {input('settings', 'completionPercent', t('ceoPr.completionPct'))}
              {input('settings', 'deliveryDate', t('ceoPr.deliveryDate'))}
              {input('settings', 'deliveryTerms', t('ceoPr.deliveryTerms'))}
              {input('settings', 'featuredRank', t('ceoPr.featuredRank'))}
              {input('settings', 'developerId', t('ceoPr.developerId'))}

              <View style={[styles.tags, row]}>
                {(
                  [
                    { field: 'isFeatured', labelKey: 'ceoPr.featured' as MessageKey },
                    { field: 'isVerified', labelKey: 'ceo.verified' as MessageKey },
                    { field: 'isActive', labelKey: 'ceoPr.active' as MessageKey },
                  ]
                ).map((toggle) => {
                  const on =
                    editing === 'settings'
                      ? draft[toggle.field] === 'true'
                      : Boolean((project as Record<string, unknown>)[toggle.field]);
                  return (
                    <Chip
                      key={toggle.field}
                      label={t(toggle.labelKey)}
                      selected={on}
                      disabled={editing !== 'settings'}
                      onPress={() =>
                        setDraft((prev) => ({ ...prev, [toggle.field]: on ? 'false' : 'true' }))
                      }
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </Panel>
      ) : null}

      {/* ── Audit log ── */}
      {tab === 'audit' ? (
        <Card style={styles.card}>
          <Text style={[styles.cardLabel, align]}>{t('ceoPr.tabAudit')}</Text>

          {audit.data === null && !audit.error ? (
            <Loading label={t('common.loading')} />
          ) : audit.error ? (
            <ErrorBar message={audit.error} onRetry={audit.refresh} />
          ) : (audit.data?.logs ?? []).length === 0 ? (
            <Text style={[styles.muted, align]}>{t('ceoPr.noAudit')}</Text>
          ) : (
            <View style={styles.list}>
              {(audit.data?.logs ?? []).map((log) => (
                <View key={log.id} style={styles.log}>
                  <View style={[styles.logHead, row]}>
                    <Text style={[styles.strong, align]}>{humanise(log.action ?? '')}</Text>
                    <Text style={[styles.muted, align]}>{formatDate(log.createdAt, true)}</Text>
                  </View>
                  {log.description ? (
                    <Text style={[styles.muted, align]}>{log.description}</Text>
                  ) : null}
                  {log.user ? (
                    <Text style={[styles.muted, align]}>
                      {`${t('ceoPr.auditBy')} ${log.user.name || log.user.email || ''}`}
                    </Text>
                  ) : null}
                  {log.changes != null ? (
                    <Text style={[styles.changes, align]} numberOfLines={6}>
                      {typeof log.changes === 'string' ? log.changes : JSON.stringify(log.changes)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

/** Upload button + failure strip for one media field (cover, gallery, plans). */
function MediaUploadRow({
  upload,
  title,
}: {
  upload: ReturnType<typeof useImageUpload>;
  title: string;
}) {
  const styles = useStyles();
  const { t, align } = useI18n();
  return (
    <View style={styles.uploadRow}>
      <Btn
        title={upload.uploading ? t('ceoPr.uploading') : title}
        variant="ghost"
        busy={upload.uploading}
        onPress={() => void upload.pick()}
      />
      {upload.errorCode ? (
        <Text style={[styles.uploadError, align]}>{t(UPLOAD_ERROR_KEY[upload.errorCode])}</Text>
      ) : null}
    </View>
  );
}

/** The website's `SectionCard`: a title with Edit / Save / Cancel in the corner. */
function Panel({
  title,
  editing,
  saving,
  onEdit,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  return (
    <Card style={styles.card}>
      <View style={[styles.panelHead, row]}>
        <Text style={[styles.panelTitle, align]}>{title}</Text>
        {editing ? (
          <View style={[styles.panelBtns, row]}>
            <Btn title={t('common.save')} style={styles.panelBtn} busy={saving} onPress={onSave} />
            <Btn
              title={t('common.cancel')}
              variant="ghost"
              style={styles.panelBtn}
              disabled={saving}
              onPress={onCancel}
            />
          </View>
        ) : (
          <Btn title={t('ceoPr.edit')} variant="ghost" style={styles.panelBtn} onPress={onEdit} />
        )}
      </View>
      {children}
    </Card>
  );
}

function toneForApproval(status: string | null | undefined): 'green' | 'red' | 'gold' | 'muted' {
  const s = (status ?? '').toUpperCase();
  if (s === 'PUBLISHED' || s === 'APPROVED') return 'green';
  if (s === 'REJECTED' || s === 'ARCHIVED') return 'red';
  if (s === 'PENDING' || s === 'DRAFT' || s === 'HIDDEN') return 'gold';
  return 'muted';
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    head: { gap: 6 },
    name: { color: t.foreground, fontSize: 20, fontWeight: '800' },
    nameAr: { color: t.mutedForeground, fontSize: 15 },
    badges: { gap: 6, flexWrap: 'wrap' },
    statusBar: { gap: 8 },
    actions: { gap: 8, flexWrap: 'wrap' },
    action: { flexGrow: 1, minWidth: 120 },
    rejectBox: { gap: 8, paddingTop: 4 },
    rejectTitle: { color: t.foreground, fontSize: 15, fontWeight: '700' },
    rejectHint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    tabs: { flexWrap: 'wrap', gap: 8 },
    stack: { gap: Spacing.sm },
    stats: { justifyContent: 'space-around', flexWrap: 'wrap', gap: 12, paddingVertical: Spacing.md },
    card: { gap: 8 },
    grid: { flexWrap: 'wrap', gap: Spacing.sm },
    cell: { flexGrow: 1, minWidth: 150, gap: 4 },
    cardLabel: {
      color: t.primary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    body: { color: t.foreground, fontSize: 14, lineHeight: 20 },
    muted: { color: t.mutedForeground, fontSize: 13, lineHeight: 19 },
    strong: { color: t.foreground, fontSize: 13, fontWeight: '700' },
    rtl: { writingDirection: 'rtl', textAlign: 'right' },
    tags: { flexWrap: 'wrap', gap: 6 },
    list: { gap: 6 },
    plan: {
      gap: 2,
      padding: Spacing.sm,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    danger: { gap: 6, backgroundColor: t.dangerBg, borderColor: t.destructive, borderWidth: 1 },
    dangerTitle: { color: t.dangerFg, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    dangerBody: { color: t.dangerFg, fontSize: 14, lineHeight: 20 },
    fields: { gap: 4 },
    uploadRow: { gap: 6 },
    uploadError: { color: t.dangerFg, fontSize: 13, lineHeight: 18 },
    panelHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    panelTitle: { color: t.foreground, fontSize: 16, fontWeight: '700', flexShrink: 1 },
    panelBtns: { gap: 8 },
    panelBtn: { minHeight: 34, paddingHorizontal: 12 },
    log: { gap: 2, padding: Spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: t.border },
    logHead: { justifyContent: 'space-between', gap: 8 },
    mpRow: {
      gap: 2,
      padding: Spacing.sm,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    changes: { color: t.mutedForeground, fontSize: 11, lineHeight: 16 },
  }),
);
