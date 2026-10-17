import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { API_URL } from '@/api/config';
import { useAuth } from '@/auth/auth-context';
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
  SectionTitle,
  GoldDivider,
  type Tone,
} from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { useAppFonts } from '@/lib/fonts';
import { useCompare } from '@/lib/compare';
import { useCurrency } from '@/lib/currency';
import { formatArea, formatDate, formatMoney, formatPercent, humanise } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { landmarkForCity } from '@/lib/landmarks';
import { useSavedProjects } from '@/lib/saved-projects';
import { createStyles, useTheme } from '@/lib/theme';
import { recordRecentView } from '@/lib/recent-views';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* ── Payload shapes — every field below exists in prisma/schema.prisma ──── */

type Unit = {
  id: string;
  name?: string;
  unitNumber?: string | null;
  unitType?: string | null;
  listingType?: string | null;
  status?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  price?: number | null;
  gallery?: string | string[] | null;
  floorPlan?: string | null;
  isSample?: boolean | null;
};

/** PaymentMilestone — `percentage` + `monthNumber`, not `percent`/`dueMonths`. */
type Milestone = {
  id: string;
  name?: string | null;
  nameArabic?: string | null;
  description?: string | null;
  percentage?: number | null;
  monthNumber?: number | null;
};

/** PaymentPlan — `downPaymentPct` / `installmentYears` / `cashDiscount` … */
type PaymentPlan = {
  id: string;
  name?: string | null;
  nameArabic?: string | null;
  description?: string | null;
  downPaymentPct?: number | null;
  installmentYears?: number | null;
  maintenanceFeePct?: number | null;
  cashDiscount?: number | null;
  isDefault?: boolean | null;
  milestones?: Milestone[];
};

/**
 * Per-type buyable-inventory summary — exact keys per the mobile contract on
 * `GET /api/projects/[slug]` (top-level sibling of `project`).
 */
type UnitsByTypeRow = {
  type: string;
  count: number;
  startingPrice: number | null;
  minArea: number | null;
  maxArea: number | null;
};

/**
 * `GET /api/projects/[slug]` — `project` plus the additive mobile-contract
 * aggregates: per-type inventory, overview aliases, headline discount. Every
 * aggregate is optional so an older backend that omits them typechecks and
 * renders today's UI with no crash.
 */
type ProjectDetailPayload = {
  project?: Project;
  unitsByType?: UnitsByTypeRow[];
  overview?: string | null;
  overviewAr?: string | null;
  maxDiscount?: number | null;
};

type Project = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  tagline?: string | null;
  description?: string | null;
  descriptionArabic?: string | null;
  coverImage?: string | null;
  videoUrl?: string | null;
  gallery?: string | string[];
  status?: string | null;
  approvalStatus?: string | null;
  completionPercent?: number | null;
  startPrice?: number | null;
  endPrice?: number | null;
  pricePerSqm?: number | null;
  totalUnits?: number | null;
  totalArea?: number | null;
  compoundArea?: number | null;
  downPaymentMin?: number | null;
  installmentYears?: number | null;
  deliveryDate?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  propertyTypes?: string | string[] | null;
  developer?: {
    id: string;
    companyName?: string | null;
    logo?: string | null;
    isVerified?: boolean;
    rating?: number | null;
    reviewCount?: number | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  } | null;
  governorate?: { name: string } | null;
  city?: { name: string } | null;
  district?: { name: string } | null;
  units?: Unit[];
  phases?: { id: string; name: string; status?: string | null }[];
  paymentPlans?: PaymentPlan[];
  amenities?: { id: string; amenity?: { name: string; nameArabic?: string | null } | null }[];
  nearbyPlaces?: {
    id: string;
    name: string;
    type?: string | null;
    distance?: number | null;
    driveTime?: number | null;
  }[];
  masterPlanImages?: { id: string; url: string; caption?: string | null }[];
  panoramaImages?: string | null;
};

/** `GET /api/trust?projectId=` → `{ freshnessWindowDays, trust, summary, … }` */
type TrustEntry = {
  status?: string;
  label?: string;
  tone?: string;
  ageDays?: number;
  source?: string | null;
};
type TrustPayload = {
  freshnessWindowDays?: number;
  trust?: Record<string, TrustEntry>;
};

/** `GET /api/milestones?projectId=` → approved ProjectMilestone rows. */
type TimelineMilestone = {
  id: string;
  type?: string | null;
  title: string;
  titleArabic?: string | null;
  description?: string | null;
  date?: string | null;
  status?: string | null;
  progressPercent?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type WatchRow = { id: string; targetType: string; targetId: string };

type TabKey = 'overview' | 'units' | 'payment' | 'masterplan' | 'amenities' | 'location' | 'timeline';

/* ── Enum → translation tables (server values, app-owned wording) ───────── */

const TRUST_FIELD_KEYS: Record<string, MessageKey> = {
  price: 'project.fieldPrice',
  paymentPlan: 'project.fieldPaymentPlan',
  delivery: 'project.fieldDelivery',
  location: 'project.fieldLocation',
  amenities: 'project.fieldAmenities',
  area: 'project.fieldArea',
  availability: 'project.fieldAvailability',
};

const TRUST_STATUS_KEYS: Record<string, MessageKey> = {
  VERIFIED: 'project.verified',
  DEVELOPER_PROVIDED: 'project.trustDeveloper',
  ESTATEAI_REVIEWED: 'project.trustReviewed',
  PENDING_REVIEW: 'project.trustPending',
  STALE: 'project.trustStale',
  UNVERIFIED: 'project.notVerified',
};

const TRUST_TONES: Record<string, Tone> = {
  success: 'green',
  info: 'blue',
  warning: 'gold',
  muted: 'muted',
  danger: 'red',
};

const MILESTONE_TYPE_KEYS: Record<string, MessageKey> = {
  LAUNCH: 'project.typeLaunch',
  CONSTRUCTION: 'project.typeConstruction',
  PROGRESS: 'project.typeProgress',
  DELIVERY: 'project.typeDelivery',
  HANDOVER: 'project.typeHandover',
  CUSTOM: 'project.typeCustom',
};

const MILESTONE_TYPE_TONES: Record<string, Tone> = {
  LAUNCH: 'blue',
  CONSTRUCTION: 'gold',
  PROGRESS: 'muted',
  DELIVERY: 'green',
  HANDOVER: 'green',
  CUSTOM: 'muted',
};

const MILESTONE_STATUS_KEYS: Record<string, MessageKey> = {
  PLANNED: 'project.statusPlanned',
  IN_PROGRESS: 'project.statusInProgress',
  COMPLETED: 'project.statusCompleted',
  DELAYED: 'project.statusDelayed',
};

const MILESTONE_STATUS_TONES: Record<string, Tone> = {
  PLANNED: 'muted',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  DELAYED: 'gold',
};

const DP_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50];
const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** `propertyTypes` is a JSON column — the website parses it the same way. */
function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** `20` → `20%`, `7.5` → `7.5%` — the site prints the raw column, unrounded. */
function pct(value: number | null | undefined): string {
  return value != null && Number.isFinite(Number(value)) ? `${value}%` : '—';
}

/**
 * Overview copy arrives as one flat string (newlines only, no HTML) and used
 * to render in a single `<Text>` — every blank line collapsed into one mushed
 * block. Splitting on blank lines recovers the author's paragraphs with the
 * same words in the same order; single newlines inside a paragraph stay as
 * `\n` so inline breaks survive. Runs of dash / bullet / numbered lines become
 * list blocks so they render as spaced rows instead of a wall of text. Pure —
 * no hooks, safe to call during render.
 */
type OverviewBlock =
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: { marker: string; text: string }[] };

/** `- foo` / `• foo` → unordered; `1. foo` / `2) foo` (Latin or Arabic-Indic digits) → ordered. */
function overviewMarker(line: string): { marker: string; text: string } | null {
  const ordered = /^\s*([\d\u0660-\u0669]{1,3}\s*[.)\]:\-–—])\s+(.+)$/u.exec(line);
  if (ordered && (ordered[2] ?? '').trim()) {
    return { marker: (ordered[1] ?? '').trim(), text: (ordered[2] ?? '').trim() };
  }
  const unordered = /^\s*[-–—•*·]\s+(.+)$/u.exec(line);
  if (unordered && (unordered[1] ?? '').trim()) {
    return { marker: '•', text: (unordered[1] ?? '').trim() };
  }
  return null;
}

function toOverviewBlocks(raw: string): OverviewBlock[] {
  const blocks: OverviewBlock[] = [];
  const chunks = raw.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean);
    if (!lines.length) continue;
    let para: string[] = [];
    let list: { marker: string; text: string }[] = [];
    const flushPara = () => {
      if (para.length) {
        blocks.push({ kind: 'para', text: para.join('\n') });
        para = [];
      }
    };
    const flushList = () => {
      if (list.length) {
        blocks.push({ kind: 'list', items: list });
        list = [];
      }
    };
    for (const line of lines) {
      const marker = overviewMarker(line);
      if (marker) {
        flushPara();
        list.push(marker);
      } else {
        flushList();
        para.push(line);
      }
    }
    flushList();
    flushPara();
  }
  return blocks;
}

export default function ProjectDetailScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { slug, review, preview } = useLocalSearchParams<{
    slug: string;
    review?: string | string[];
    preview?: string | string[];
  }>();
  const { t, row, align, localized, lang } = useI18n();
  const fonts = useAppFonts();
  const { currency, rates } = useCurrency();
  const router = useRouter();
  const saved = useSavedProjects();
  const compare = useCompare();
  const { status: authStatus } = useAuth();
  const insets = useSafeAreaInsets();

  const { data, error, loading, refresh, refreshing } = useApi<ProjectDetailPayload>(
    slug ? `/api/projects/${encodeURIComponent(String(slug))}` : null
  );

  const project = data?.project;
  const signedIn = authStatus === 'signedIn';
  const projectId = project?.id ?? null;

  // Same endpoints the website's ProjectTrust / ProjectTimeline components call.
  const trust = useApi<TrustPayload>(
    projectId ? `/api/trust?projectId=${encodeURIComponent(projectId)}` : null,
    Boolean(projectId)
  );
  const timeline = useApi<{ milestones?: TimelineMilestone[] }>(
    projectId ? `/api/milestones?projectId=${encodeURIComponent(projectId)}` : null,
    Boolean(projectId)
  );
  const watches = useApi<{ watches?: WatchRow[] }>(
    signedIn && projectId ? '/api/watch' : null,
    signedIn && Boolean(projectId)
  );
  // Social proof + reviews-section count share one read of the approved
  // ratings — the list section below renders from this instead of its own
  // fetch, so the endpoint is hit once, never twice.
  const reviewsApi = useApi<ReviewsPayload>(
    projectId ? `/api/reviews?projectId=${encodeURIComponent(projectId)}` : null,
    Boolean(projectId)
  );
  const mutation = useMutation();

  const [tab, setTab] = useState<TabKey>('overview');
  const [showContact, setShowContact] = useState(false);
  const [shared, setShared] = useState(false);
  const [planOpen, setPlanOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<'watch' | 'share' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dpChoice, setDpChoice] = useState<number | null>(null);
  const [yearsChoice, setYearsChoice] = useState<number | null>(null);
  const [planChoice, setPlanChoice] = useState<string | null>(null);
  // Dead remote images remove themselves — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});
  const markDead = (uri: string) =>
    setDeadImgs((prev) => (prev[uri] ? prev : { ...prev, [uri]: true }));

  // #3-record — remember this project in the local recent list.
  // Fire-and-forget: `recordRecentView` never throws into the render path.
  useEffect(() => {
    if (!project) return;
    void recordRecentView({
      id: project.id,
      slug: project.slug,
      name: project.name,
      nameArabic: project.nameArabic ?? null,
      coverImage: project.coverImage ?? null,
      startPrice: project.startPrice ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (loading) return <Loading label={t('project.loading')} />;

  if (error || !project) {
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Stack.Screen options={{ title: t('project.title') }} />
        {error ? <ErrorBar message={error} onRetry={refresh} /> : <Empty title={t('project.notFound')} />}
      </Screen>
    );
  }

  const location = [project.district?.name, project.city?.name, project.governorate?.name]
    .filter(Boolean)
    .join(', ');

  // Owner in-app preview — `?preview=1` needs no token: the detail endpoint
  // already lets the owning developer read a non-public project, so this is a
  // banner only, never a second auth gate.
  const isOwnerPreview = Array.isArray(preview) ? preview[0] === '1' : preview === '1';

  const isSaved = saved.has(project.id) || saved.has(project.slug);
  const inCompare = compare.has(project.id) || compare.has(project.slug);
  const watch = watches.data?.watches?.find(
    (w) => w.targetType === 'PROJECT' && w.targetId === project.id
  );

  // Payment-plan-driven estimator — the baseline (down % + years) comes from
  // the selected REAL plan (`downPaymentPct` / `installmentYears`), never
  // from generic inputs. The project's headline terms only fill gaps a plan
  // leaves blank; the chip rows below are a secondary manual override.
  const plans = project.paymentPlans ?? [];
  const defaultPlan = plans.find((p) => p?.isDefault) ?? plans[0] ?? null;
  const activePlan = planChoice
    ? (plans.find((p) => p?.id === planChoice) ?? defaultPlan)
    : defaultPlan;
  // Same clamping the website's `calcDp` / `calcYears` sliders start from.
  const seedDp = Math.min(50, Math.max(10, Math.round((project.downPaymentMin ?? 20) / 5) * 5));
  const seedYears = Math.min(15, Math.max(1, project.installmentYears ?? 5));
  const baseDp = activePlan?.downPaymentPct ?? seedDp;
  const baseYears = activePlan?.installmentYears ?? seedYears;
  const calcDp = dpChoice ?? baseDp;
  const calcYears = yearsChoice ?? baseYears;
  const customized = calcDp !== baseDp || calcYears !== baseYears;

  const basePrice = Number(project.startPrice) || 0;
  const monthlyPayment =
    basePrice > 0 ? Math.round((basePrice * (1 - calcDp / 100)) / (calcYears * 12)) : 0;
  const downAmount = basePrice > 0 ? Math.round(basePrice * (calcDp / 100)) : 0;
  const cashDiscountPct =
    activePlan?.cashDiscount != null && Number.isFinite(Number(activePlan.cashDiscount))
      ? Number(activePlan.cashDiscount)
      : 0;
  const hasCashDeal = basePrice > 0 && cashDiscountPct > 0;
  const cashPrice = hasCashDeal ? Math.round(basePrice * (1 - cashDiscountPct / 100)) : 0;
  const cashSavings = hasCashDeal ? basePrice - cashPrice : 0;
  const activePlanName = activePlan
    ? localized(activePlan.name, activePlan.nameArabic) || t('project.plan')
    : null;

  const propertyTypes = parseStringArray(project.propertyTypes);
  const masterPlans = project.masterPlanImages ?? [];
  // Display chain: gallery[0] (local) → cover → city landmark → GHAYA
  // block. Dead remotes remove themselves via onError — same pattern as home.
  const heroGallery = parseStringArray(project.gallery);
  const heroLive = (u?: string | null) => (u && !deadImgs[u] ? u : undefined);
  const heroSrc =
    heroLive(imageUrl(heroGallery[0] ?? null)) ??
    heroLive(imageUrl(project.coverImage)) ??
    heroLive(landmarkForCity(project.city));
  const devLogoSrc = imageUrl(project.developer?.logo);
  // 360° panoramas are a JSON string column — same parse as `propertyTypes`.
  const panos = parseStringArray(project.panoramaImages);
  const firstPano = panos.length > 0 ? (panos[0] ?? null) : null;
  const amenities = project.amenities ?? [];
  const nearby = project.nearbyPlaces ?? [];
  // Showcase samples (isSample) are illustrative only — the units tab, counts
  // and booking use `listedUnits`; the models section renders `sampleUnits`.
  const allUnits = project.units ?? [];
  const sampleUnits = allUnits.filter((u) => u?.isSample === true);
  const listedUnits = allUnits.filter((u) => u?.isSample !== true);
  const units = listedUnits;
  const milestones = timeline.data?.milestones ?? [];
  const trustEntries = Object.entries(trust.data?.trust ?? []);

  // Mobile-contract aggregates (top-level siblings of `project`). The
  // per-type block renders ONLY when the backend supplies a non-empty
  // `unitsByType` — an older backend omits these keys and the sections
  // below fall back to today's UI with no crash.
  const rawByType = data?.unitsByType;
  const typeRows = Array.isArray(rawByType) && rawByType.length > 0 ? rawByType : null;
  // Overview copy — `overviewAr` when reading Arabic else `overview`,
  // falling back through the legacy description columns. On an old
  // backend this is exactly `localized(description, descriptionArabic)`.
  const overviewText = localized(
    data?.overview ?? project.description,
    data?.overviewAr ?? project.descriptionArabic
  );
  // Paragraph / list split of the flat overview string — same words, same
  // order, presentation only. The fallback above stays the single source of
  // the text; this only shapes how it renders.
  const overviewBlocks = overviewText ? toOverviewBlocks(overviewText) : [];
  // Highest cash-discount percent across the project's payment plans —
  // the headline hides when null (or when an old backend omits it).
  const maxDiscount = data?.maxDiscount ?? null;

  const deliveryLabel = project.deliveryDate
    ? new Date(project.deliveryDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  const tabList: { key: TabKey; label: string; show?: boolean }[] = [
    { key: 'overview', label: t('project.tabOverview') },
    { key: 'units', label: `${t('project.units')}${units.length ? ` (${units.length})` : ''}` },
    {
      key: 'payment',
      label: `${t('project.paymentPlans')}${plans.length ? ` (${plans.length})` : ''}`,
    },
    {
      key: 'masterplan',
      label: `${t('project.tabMasterPlan')} (${masterPlans.length})`,
      show: masterPlans.length > 0,
    },
    { key: 'amenities', label: t('project.amenities') },
    { key: 'location', label: t('project.tabLocation') },
    { key: 'timeline', label: t('project.tabTimeline') },
  ];
  const tabs = tabList.filter((entry) => entry.show !== false);

  const activeTab: TabKey = tabs.some((entry) => entry.key === tab) ? tab : 'overview';

  function reload() {
    void refresh();
    void trust.refresh();
    void timeline.refresh();
    void reviewsApi.refresh();
  }

  function toggleSave() {
    saved.toggle({
      id: project!.id,
      slug: project!.slug,
      name: project!.name,
      nameArabic: project!.nameArabic,
      coverImage: project!.coverImage,
      startPrice: project!.startPrice,
      status: project!.status,
      savedAt: Date.now(),
    });
  }

  function toggleCompare() {
    if (!inCompare && compare.full) return;
    compare.toggle({ id: project!.id, slug: project!.slug, name: project!.name });
  }

  async function toggleWatch() {
    if (!signedIn || !project) return;
    setBusy('watch');
    setProblem(null);
    try {
      if (watch) {
        await mutation.run('/api/watch', 'DELETE', { id: watch.id });
      } else {
        await mutation.run('/api/watch', 'POST', { targetType: 'PROJECT', targetId: project.id });
      }
      await watches.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  async function shareProject() {
    if (!project) return;
    const url = `${API_URL}/projects/${project.slug}`;
    setBusy('share');
    try {
      await Share.share({ message: `${project.name}\n${url}`, url });
      setShared(true);
      setTimeout(() => setShared(false), 1600);
    } catch {
      // The share sheet was dismissed — nothing worth telling the user.
    } finally {
      setBusy(null);
    }
  }

  function openBooking() {
    if (!project) return;
    router.push({
      pathname: '/viewing/book',
      params: { projectId: project.id, name: project.name },
    });
  }

  function shareWhatsApp() {
    if (!project) return;
    const url = `${API_URL}/projects/${project.slug}`;
    const href = `https://wa.me/?text=${encodeURIComponent(`${project.name}\n${url}`)}`;
    void Linking.openURL(href).catch(() => {});
  }

  function openMaps() {
    if (!project?.googleMapsUrl) return;
    void Linking.openURL(project.googleMapsUrl).catch(() => {});
  }

  function trustBadgeLabel(field: string, entry: TrustEntry): string {
    const status = entry.status ?? '';
    const fieldKey = TRUST_FIELD_KEYS[field];
    const statusKey = TRUST_STATUS_KEYS[status];
    const name = fieldKey ? t(fieldKey) : humanise(field);
    const state = statusKey ? t(statusKey) : entry.label ?? humanise(status);
    // The site appends the age of a stale fact to its badge — same signal here.
    const age = status === 'STALE' && entry.ageDays != null ? ` (${entry.ageDays} ${t('project.days')})` : '';
    return `${name}: ${state}${age}`;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'units': {
        // Honest scarcity from the listed (non-sample) units only — no
        // invented urgency, every fragment renders from real fields.
        const availableCount = units.filter(
          (u) => (u.status ?? '').toUpperCase() === 'AVAILABLE'
        ).length;
        const soldOut = units.length > 0 && availableCount === 0;
        const scarcityBits = [
          t('project.unitsAvailable')
            .replace('{a}', String(availableCount))
            .replace('{n}', String(units.length)),
          deliveryLabel
            ? t('project.scarcityDelivery').replace('{d}', deliveryLabel)
            : null,
          project.completionPercent != null
            ? t('project.scarcityCompletion').replace('{p}', formatPercent(project.completionPercent))
            : null,
        ].filter(Boolean);
        return (
          <>
            {/* Per-type buyable-inventory summary: type label, starting
                price, area range, and count — ONLY when the backend
                supplies a non-empty `unitsByType`. The flat list below
                is today's UI and renders unchanged otherwise. */}
            {typeRows ? (
              <>
                <Text style={[styles.planSub, align]}>{t('project.availableByType')}</Text>
                {typeRows.map((entry, typeIndex) => {
                  const countLabel =
                    entry.count === 1
                      ? t('project.oneUnit')
                      : lang === 'ar' && entry.count === 2
                        ? t('project.twoUnits')
                        : t('project.manyUnits').replace('{n}', String(entry.count));
                  const areaLabel =
                    entry.minArea == null || entry.maxArea == null
                      ? null
                      : entry.minArea === entry.maxArea
                        ? formatArea(entry.minArea)
                        : lang === 'ar'
                          ? `من ${formatArea(entry.minArea)} لـ ${formatArea(entry.maxArea)}`
                          : `${formatArea(entry.minArea)} – ${formatArea(entry.maxArea)}`;
                  const typeSubtitle = [
                    entry.startingPrice != null
                      ? t('project.startingFrom').replace(
                          '{p}',
                          formatMoney(entry.startingPrice, currency, rates, { compact: true })
                        )
                      : null,
                    areaLabel ? t('project.areaIs').replace('{a}', areaLabel) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <View key={`${entry.type}-${typeIndex}`}>
                      {typeIndex > 0 ? <Divider /> : null}
                      <Row
                        title={humanise(entry.type)}
                        subtitle={typeSubtitle || undefined}
                        badge={<Badge tone="gold">{countLabel}</Badge>}
                      />
                    </View>
                  );
                })}
              </>
            ) : null}
            {units.length ? (
              <>
                <Text style={[styles.planSub, align]}>
                  {t('project.unitsAvailable')
                    .replace('{a}', String(availableCount))
                    .replace('{n}', String(units.length))}
                </Text>
                {scarcityBits.length > 1 ? (
                  <Text style={[styles.muted, align]}>{scarcityBits.slice(1).join(' · ')}</Text>
                ) : null}
                {soldOut ? (
                  <>
                    <Text style={[styles.muted, align]}>{t('project.soldOutNudge')}</Text>
                    <Btn
                      title={t('project.sendInquiry')}
                      variant="ghost"
                      onPress={() => router.push('/contact')}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {!units.length ? (
              <Text style={[styles.muted, align]}>{t('project.noUnits')}</Text>
            ) : (
              units.slice(0, 40).map((unit, index) => (
                <View key={unit.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={unit.name ?? unit.unitNumber ?? t('common.unit')}
                    subtitle={[
                      unit.unitType ? humanise(unit.unitType) : null,
                      unit.bedrooms ? `${unit.bedrooms} ${t('project.bed')}` : null,
                      unit.area ? formatArea(unit.area) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={
                      unit.status ? (
                        <Badge tone={unit.status === 'AVAILABLE' ? 'green' : 'muted'}>
                          {humanise(unit.status)}
                        </Badge>
                      ) : undefined
                    }
                    right={
                      <Text style={styles.unitPrice}>
                        {formatMoney(unit.price, currency, rates, { compact: true })}
                      </Text>
                    }
                  />
                </View>
              ))
            )}
          </>
        );
      }

      case 'payment':
        if (!plans.length) {
          return project.downPaymentMin != null || project.installmentYears != null ? (
            <Row
              title={`${project.downPaymentMin ?? 20}% ${t('project.downPayment')}`}
              subtitle={`${project.installmentYears ?? 5} ${t('project.installments')}`}
            />
          ) : (
            <Empty title={t('project.noPlans')} />
          );
        }
        return (
          <>
            {/* Headline discount across the plan set ("up to X%") from the
                top-level `maxDiscount` — hidden when null. Per-plan cash
                rows below are untouched. */}
            {maxDiscount != null ? (
              <Text style={[styles.upTo, align]}>
                {t('project.upToDiscount').replace('{p}', String(maxDiscount))}
              </Text>
            ) : null}
            {plans.map((plan, index) => (
              <View key={plan.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.plan}>
                  <View style={[styles.planHead, row]}>
                    <Text style={[styles.planName, align]}>
                      {localized(plan.name, plan.nameArabic) || t('project.plan')}
                    </Text>
                    {plan.isDefault ? <Badge tone="gold">{t('project.defaultBadge')}</Badge> : null}
                  </View>

                  {/* Cash first (anchoring) — the per-m² secondary renders only
                      when the project actually carries a pricePerSqm. */}
                  {plan.cashDiscount != null ? (
                    <Row
                      title={t('project.cashDiscount')}
                      subtitle={
                        project.pricePerSqm
                          ? `~${formatMoney(project.pricePerSqm, currency, rates)} ${t('project.perSqm')}`
                          : undefined
                      }
                      right={<Text style={styles.planValue}>{pct(plan.cashDiscount)}</Text>}
                    />
                  ) : null}
                  <Row
                    title={t('project.downPaymentLabel')}
                    right={<Text style={styles.planValue}>{pct(plan.downPaymentPct)}</Text>}
                  />
                  <Row
                    title={t('project.planInstallments')}
                    right={
                      <Text style={styles.planValue}>
                        {plan.installmentYears != null
                          ? `${plan.installmentYears} ${t('project.years')}`
                          : '—'}
                      </Text>
                    }
                  />
                  {plan.maintenanceFeePct != null ? (
                    <Row
                      title={t('project.maintenance')}
                      right={<Text style={styles.planValue}>{pct(plan.maintenanceFeePct)}</Text>}
                    />
                  ) : null}

                  {plan.milestones?.length ? (
                    <>
                      <Text style={[styles.planSub, align]}>{t('project.paymentMilestones')}</Text>
                      {plan.milestones.map((milestone, mIndex) => (
                        <View key={milestone.id}>
                          {mIndex > 0 ? <Divider /> : null}
                          <Row
                            title={localized(milestone.name, milestone.nameArabic) || '—'}
                            subtitle={[
                              milestone.description,
                              milestone.monthNumber != null
                                ? `${t('project.month')} ${milestone.monthNumber}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                            right={
                              <Badge tone="gold">{pct(milestone.percentage)}</Badge>
                            }
                          />
                        </View>
                      ))}
                    </>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        );

      case 'masterplan':
        return (
          <>
            <Text style={[styles.muted, align]}>{t('project.masterPlanHint')}</Text>
            <View style={styles.masterGrid}>
              {masterPlans.map((image) => {
                const src = imageUrl(image.url);
                // Dead or missing master plans hide instead of a blank hole.
                if (!src || deadImgs[src]) return null;
                return (
                  <Pressable
                    key={image.id}
                    style={styles.masterItem}
                    onPress={() => setPlanOpen(src)}>
                    <Image
                      source={{ uri: src }}
                      style={styles.masterImage}
                      resizeMode="contain"
                      onError={() => markDead(src)}
                    />
                    {image.caption ? (
                      <Text style={[styles.masterCaption, align]} numberOfLines={2}>
                        {image.caption}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        );

      case 'amenities':
        if (!amenities.length) return <Text style={[styles.muted, align]}>{t('project.noAmenities')}</Text>;
        return (
          <View style={[styles.chips, row]}>
            {amenities.map((entry) => (
              <Chip
                key={entry.id}
                label={localized(entry.amenity?.name, entry.amenity?.nameArabic) || '—'}
                selected={false}
              />
            ))}
          </View>
        );

      case 'location':
        return (
          <>
            <View style={styles.locationBox}>
              <View style={[styles.locationHead, row]}>
                <Ionicons name="location-outline" size={16} color={theme.primary} />
                <Text style={[styles.locationText, align]}>{location || project.address || '—'}</Text>
              </View>
              {location && project.address ? (
                <Text style={[styles.muted, align]}>{project.address}</Text>
              ) : null}
              {project.googleMapsUrl ? (
                <Pressable style={[styles.mapLink, row]} onPress={openMaps} hitSlop={8}>
                  <Ionicons name="open-outline" size={14} color={theme.primary} />
                  <Text style={styles.mapLinkText}>{t('project.viewOnMaps')}</Text>
                </Pressable>
              ) : null}
            </View>

            {!nearby.length ? null : (
              <>
                <Text style={[styles.planSub, align]}>{t('project.nearby')}</Text>
                {nearby.slice(0, 12).map((place, index) => (
                  <View key={place.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      title={place.name}
                      subtitle={[
                        place.type ? humanise(place.type) : null,
                        place.distance != null ? `${place.distance} ${t('project.km')}` : null,
                        place.driveTime != null ? `${place.driveTime} ${t('project.drive')}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </View>
                ))}
              </>
            )}
          </>
        );

      case 'timeline':
        if (timeline.loading) return <Loading label={t('common.loading')} />;
        if (timeline.error) return <ErrorBar message={timeline.error} onRetry={timeline.refresh} />;
        if (!milestones.length) return <Text style={[styles.muted, align]}>{t('project.timelineEmpty')}</Text>;
        return (() => {
          const stamps = milestones
            .map((milestone) => Date.parse(milestone.date || milestone.updatedAt || milestone.createdAt || ''))
            .filter((value) => Number.isFinite(value) && value > 0);
          const lastUpdated = stamps.length ? new Date(Math.max(...stamps)) : null;
          return (
            <>
              <Text style={[styles.muted, align]}>{t('project.timelineHint')}</Text>
              {lastUpdated ? (
                <Text style={styles.tlMeta}>
                  {`${t('project.timelineUpdated')}: ${formatDate(lastUpdated)}`}
                </Text>
              ) : null}
              <View style={styles.timeline}>
                {milestones.map((milestone, index) => {
                  const status = milestone.status ?? '';
                  const dotColor =
                    status === 'COMPLETED'
                      ? theme.successFg
                      : status === 'DELAYED'
                        ? theme.warningFg
                        : status === 'IN_PROGRESS'
                          ? theme.infoFg
                          : theme.mutedForeground;
                  return (
                    <View key={milestone.id} style={[styles.tlItem, row]}>
                      <View style={styles.tlRail}>
                        <View style={[styles.tlDot, { backgroundColor: dotColor }]} />
                        {index < milestones.length - 1 ? <View style={styles.tlLine} /> : null}
                      </View>
                      <View style={styles.tlBody}>
                        <View style={[styles.tlTags, row]}>
                          <Badge tone={MILESTONE_TYPE_TONES[milestone.type ?? ''] ?? 'muted'}>
                            {MILESTONE_TYPE_KEYS[milestone.type ?? '']
                              ? t(MILESTONE_TYPE_KEYS[milestone.type ?? ''])
                              : humanise(milestone.type)}
                          </Badge>
                          <Badge tone={MILESTONE_STATUS_TONES[status] ?? 'muted'}>
                            {MILESTONE_STATUS_KEYS[status] ? t(MILESTONE_STATUS_KEYS[status]) : humanise(status)}
                          </Badge>
                          {milestone.progressPercent != null ? (
                            <Text style={styles.tlMeta}>
                              {milestone.progressPercent}% {t('project.progress')}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.tlTitle, align]}>
                          {localized(milestone.title, milestone.titleArabic)}
                        </Text>
                        {milestone.description ? (
                          <Text style={[styles.muted, align]}>{milestone.description}</Text>
                        ) : null}
                        {milestone.date ? (
                          <Text style={styles.tlMeta}>{formatDate(milestone.date)}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          );
        })();

      case 'overview':
      default: {
        // Three labeled cards mirroring the website's overview area — every
        // card reads ONLY from this screen's payload (no new fetch, no new
        // packages). A card hides entirely when its data is empty; the
        // Amenities / Location tabs own the full lists and their empty
        // states, so the overview cards stay silent instead of duplicating
        // them. No hooks added — plain consts, safe inside render.
        const showAbout =
          overviewBlocks.length > 0 || propertyTypes.length > 0 || Boolean(deliveryLabel);
        const showFeatures = amenities.length > 0;
        const showLocation = Boolean(
          location || project.address || project.googleMapsUrl || nearby.length > 0
        );
        if (!showAbout && !showFeatures && !showLocation) return null;
        return (
          <View style={styles.overviewCards}>
            {/* (1) About — the existing overviewBlocks rendering, untouched,
                plus the property-types chips and delivery row that already
                lived in this tab. */}
            {showAbout ? (
              <View style={styles.overviewCard}>
                <SectionTitle>
                  {t('project.overviewAbout').replace('{name}', project.name)}
                </SectionTitle>
                {overviewBlocks.length ? (
                  <View style={styles.overview}>
                    {overviewBlocks.map((block, blockIndex) =>
                      block.kind === 'list' ? (
                        <View key={blockIndex} style={styles.overviewList}>
                          {block.items.map((item, itemIndex) => (
                            <View key={itemIndex} style={[styles.overviewListRow, row]}>
                              <Text style={styles.overviewMarker}>{item.marker}</Text>
                              <Text style={[styles.overviewItem, align]}>{item.text}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text key={blockIndex} style={[styles.overviewPara, align]}>
                          {block.text}
                        </Text>
                      )
                    )}
                  </View>
                ) : null}

                {propertyTypes.length ? (
                  <>
                    <Text style={[styles.planSub, align]}>{t('project.propertyTypes')}</Text>
                    <View style={[styles.chips, row]}>
                      {propertyTypes.map((type) => (
                        <Chip key={type} label={humanise(type)} selected={false} />
                      ))}
                    </View>
                  </>
                ) : null}

                {deliveryLabel ? (
                  <Row
                    title={t('project.expectedDelivery')}
                    subtitle={deliveryLabel}
                    left={<Ionicons name="calendar-outline" size={18} color={theme.primary} />}
                  />
                ) : null}
              </View>
            ) : null}

            {/* (2) Features — same chips as the Amenities tab, hidden when the
                payload carries no amenities. */}
            {showFeatures ? (
              <View style={styles.overviewCard}>
                <SectionTitle>{t('project.overviewFeatures')}</SectionTitle>
                <View style={[styles.chips, row]}>
                  {amenities.map((entry) => (
                    <Chip
                      key={entry.id}
                      label={localized(entry.amenity?.name, entry.amenity?.nameArabic) || '—'}
                      selected={false}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {/* (3) Location — same rows as the Location tab; nearby is a
                3-place preview, the full list lives in the Location tab.
                Hidden when there is no location, address, maps link, or
                nearby place. */}
            {showLocation ? (
              <View style={styles.overviewCard}>
                <SectionTitle>{t('project.overviewLocation')}</SectionTitle>
                {location || project.address ? (
                  <View style={[styles.locationHead, row]}>
                    <Ionicons name="location-outline" size={16} color={theme.primary} />
                    <Text style={[styles.locationText, align]}>{location || project.address}</Text>
                  </View>
                ) : null}
                {location && project.address ? (
                  <Text style={[styles.muted, align]}>{project.address}</Text>
                ) : null}
                {project.googleMapsUrl ? (
                  <Pressable style={[styles.mapLink, row]} onPress={openMaps} hitSlop={8}>
                    <Ionicons name="open-outline" size={14} color={theme.primary} />
                    <Text style={styles.mapLinkText}>{t('project.viewOnMaps')}</Text>
                  </Pressable>
                ) : null}
                {nearby.length ? (
                  <>
                    <Text style={[styles.planSub, align]}>{t('project.nearby')}</Text>
                    {nearby.slice(0, 3).map((place, index) => (
                      <View key={place.id}>
                        {index > 0 ? <Divider /> : null}
                        <Row
                          title={place.name}
                          subtitle={[
                            place.type ? humanise(place.type) : null,
                            place.distance != null ? `${place.distance} ${t('project.km')}` : null,
                            place.driveTime != null ? `${place.driveTime} ${t('project.drive')}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      }
    }
  };

  return (
    <View style={styles.page}>
    <Screen padded={false} refreshing={refreshing} onRefresh={reload}>
      <Stack.Screen options={{ title: project.name }} />

      <View style={styles.hero}>
        {heroSrc && !deadImgs[heroSrc] ? (
          <Image
            source={{ uri: heroSrc }}
            style={styles.heroImage}
            onError={() => markDead(heroSrc)}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback]}>
            <Text style={styles.heroFallbackText}>GHAYA</Text>
          </View>
        )}
        <View style={styles.heroOverlay}>
          <View style={[styles.heroBadges, row]}>
            {project.status ? <Badge tone="gold">{humanise(project.status)}</Badge> : null}
            {project.developer?.isVerified ? (
              <Badge tone="green">{t('project.verifiedDeveloper')}</Badge>
            ) : null}
          </View>
          <Text style={[styles.title, fonts.displayBold]}>{project.name}</Text>
          {project.nameArabic ? (
            <Text style={[styles.titleArabic, fonts.display]}>{project.nameArabic}</Text>
          ) : null}
          {location ? (
            <View style={[styles.locationRow, row]}>
              <Ionicons name="location-outline" size={13} color={theme.mutedForeground} />
              <Text style={[styles.location, align]}>{location}</Text>
            </View>
          ) : null}
          <GoldDivider />
        </View>
      </View>

      <View style={styles.body}>
        {/* Owner preview banner — `?preview=1` only, no other behaviour. */}
        {isOwnerPreview ? (
          <Card>
            <View style={styles.contactBox}>
              <View style={[styles.locationHead, row]}>
                <Ionicons name="eye-outline" size={16} color={theme.primary} />
                <Text style={[styles.locationText, align]}>{t('developer.previewBanner')}</Text>
              </View>
            </View>
          </Card>
        ) : null}
        {/* Headline numbers */}
        <Card style={[styles.stats, row]}>
          <Stat label={t('project.from')} value={formatMoney(project.startPrice, currency, rates, { compact: true })} />
          <Stat label={t('project.unitsListed')} value={String(units.length)} />
          {project.totalUnits != null ? (
            <Stat label={t('project.projectSize')} value={String(project.totalUnits)} />
          ) : null}
          <Stat label={t('common.area')} value={project.totalArea ? formatArea(project.totalArea) : '—'} />
          <Stat
            label={t('project.completion')}
            value={
              project.completionPercent !== null && project.completionPercent !== undefined
                ? formatPercent(project.completionPercent)
                : '—'
            }
          />
        </Card>

        {/* Project video — only when the project has one; no empty state. */}
        {project.videoUrl ? (
          <Card>
            <SectionTitle>{t('project.video')}</SectionTitle>
            <ProjectVideo url={project.videoUrl} title={project.name} />
          </Card>
        ) : null}

        {/* F10 — verification status of the key facts */}
        <Card>
          <SectionTitle>{t('project.trust')}</SectionTitle>
          <Text style={[styles.paragraph, align]}>{t('project.trustHint')}</Text>
          {trust.loading ? null : trust.error ? (
            <ErrorBar message={trust.error} onRetry={trust.refresh} />
          ) : !trustEntries.length ? (
            <Text style={[styles.muted, align]}>{t('project.trustEmpty')}</Text>
          ) : (
            <>
              <View style={[styles.chips, row]}>
                {trustEntries.map(([field, entry]) => (
                  <Badge key={field} tone={TRUST_TONES[entry.tone ?? ''] ?? 'muted'}>
                    {trustBadgeLabel(field, entry)}
                  </Badge>
                ))}
              </View>
              <Text style={styles.tlMeta}>
                {`${t('project.trustFreshness')}: ${trust.data?.freshnessWindowDays ?? 90} ${t('project.days')}`}
              </Text>
            </>
          )}
        </Card>

        {/* Actions — book it, keep it, come back to it. */}
        <Card style={styles.actions}>
          <Btn title={t('project.bookViewing')} onPress={openBooking} />
          {/* 360° virtual tour — only when the project has ≥1 panorama image */}
          {firstPano ? (
            <Row
              title={t('pano.viewTour')}
              subtitle={t('pano.viewTourHint')}
              left={<Ionicons name="globe-outline" size={18} color={theme.primary} />}
              onPress={() =>
                router.push({
                  pathname: '/tour',
                  params: { url: firstPano, title: project.name },
                })
              }
            />
          ) : null}
          <View style={[styles.actionRow, row]}>
            <Btn
              title={isSaved ? t('project.savedRemove') : t('project.save')}
              variant={isSaved ? 'primary' : 'ghost'}
              style={styles.actionHalf}
              onPress={toggleSave}
            />
            <Btn
              title={shared ? t('project.shared') : t('project.share')}
              variant="ghost"
              style={styles.actionHalf}
              busy={busy === 'share'}
              onPress={() => void shareProject()}
            />
          </View>
          <Btn title={t('share.whatsapp')} variant="ghost" onPress={shareWhatsApp} />

          <Btn
            title={watch ? t('project.watching') : t('project.watch')}
            variant={watch ? 'primary' : 'ghost'}
            busy={busy === 'watch'}
            onPress={() => void toggleWatch()}
          />
          {!signedIn ? <Text style={styles.hint}>{t('project.signInWatch')}</Text> : null}
          {problem ? <ErrorBar message={problem} /> : null}

          <View style={[styles.compareRow, row]}>
            <Text style={[styles.compareHint, align]}>{t('project.compareHint')}</Text>
            <Chip
              label={
                inCompare
                  ? t('project.compareAdded')
                  : compare.full
                    ? t('project.compareFull')
                    : t('project.compare')
              }
              selected={inCompare}
              disabled={compare.full && !inCompare}
              onPress={toggleCompare}
            />
          </View>

          <View style={[styles.actionRow, row]}>
            <Btn
              title={t('project.myAppointments')}
              variant="ghost"
              style={styles.actionHalf}
              onPress={() => router.push('/viewings')}
            />
            <Btn
              title={t('project.sendInquiry')}
              variant="ghost"
              style={styles.actionHalf}
              onPress={() => router.push('/contact')}
            />
          </View>
        </Card>

        {/* Contact developer — phone / email revealed in place */}
        <Card style={styles.actions}>
          <Btn
            title={showContact ? t('project.hideContact') : t('project.contactDeveloper')}
            variant="ghost"
            onPress={() => setShowContact((open) => !open)}
          />
          {showContact ? (
            project.developer?.contactPhone || project.developer?.contactEmail ? (
              <View style={styles.contactBox}>
                {project.developer.contactPhone ? (
                  <Row
                    title={t('common.phone')}
                    subtitle={project.developer.contactPhone}
                    left={<Ionicons name="call-outline" size={16} color={theme.primary} />}
                    onPress={() =>
                      void Linking.openURL(
                        `tel:${String(project.developer!.contactPhone).replace(/\s+/g, '')}`
                      ).catch(() => {})
                    }
                  />
                ) : null}
                {project.developer.contactEmail ? (
                  <Row
                    title={t('common.email')}
                    subtitle={project.developer.contactEmail}
                    left={<Ionicons name="mail-outline" size={16} color={theme.primary} />}
                    onPress={() =>
                      void Linking.openURL(`mailto:${project.developer!.contactEmail}`).catch(() => {})
                    }
                  />
                ) : null}
              </View>
            ) : (
              <Text style={[styles.muted, align]}>{t('project.noContact')}</Text>
            )
          ) : null}
        </Card>

        {/* Monthly installment estimator — the site's calcDp / calcYears sliders */}
        {basePrice > 0 || project.pricePerSqm ? (
          <Card>
            <SectionTitle>{t('project.estimator')}</SectionTitle>
            <Text style={styles.estPrice}>{formatMoney(project.startPrice, currency, rates)}</Text>
            {project.pricePerSqm ? (
              <Text style={styles.muted}>
                {`${formatMoney(project.pricePerSqm, currency, rates)} ${t('project.perSqm')}`}
              </Text>
            ) : null}
            {/* Social proof — approved post-viewing ratings only; an honest
                empty line at zero. No saves count exists on the project
                payload, so none is claimed. */}
            {!reviewsApi.loading && !reviewsApi.error ? (
              <Text style={[styles.muted, align]}>
                {reviewsApi.data?.average != null && (reviewsApi.data?.count ?? 0) > 0
                  ? t('project.socialProof')
                      .replace('{avg}', String(reviewsApi.data.average))
                      .replace('{n}', String(reviewsApi.data.count))
                  : t('project.socialProofEmpty')}
              </Text>
            ) : null}

            <View style={styles.estHighlight}>
              <Text style={styles.estMonthly}>{formatMoney(monthlyPayment, currency, rates)}</Text>
              <Text style={styles.estSub}>
                {`${t('project.perMonth')} · ${t('project.over')} ${calcYears} ${t('project.years')}`}
              </Text>
              {activePlanName ? (
                <Text style={styles.estSub}>
                  {customized
                    ? t('project.estimatorCustomized').replace('{plan}', activePlanName)
                    : t('project.estimatorFromPlan').replace('{plan}', activePlanName)}
                </Text>
              ) : null}
            </View>

            {/* Plan selector — the baseline comes from the chosen REAL plan.
                The down/years chips below only override it; tapping a plan
                chip resets any manual tweak. */}
            {plans.length ? (
              <>
                <View style={[styles.estLabelRow, row]}>
                  <Text style={[styles.estLabel, align]}>{t('project.estimatorPlan')}</Text>
                </View>
                <View style={[styles.chips, row]}>
                  {plans.map((plan) => (
                    <Chip
                      key={plan.id}
                      label={localized(plan.name, plan.nameArabic) || t('project.plan')}
                      selected={activePlan?.id === plan.id}
                      onPress={() => {
                        setPlanChoice(plan.id);
                        setDpChoice(null);
                        setYearsChoice(null);
                      }}
                    />
                  ))}
                </View>

                {/* Baseline breakdown — down amount, interest-free total, and
                    the cash-deal row (only when the plan carries a real
                    `cashDiscount`; never invented). */}
                <Row
                  title={t('project.downPaymentLabel')}
                  right={
                    <Text style={styles.planValue}>
                      {`${calcDp}% · ${formatMoney(downAmount, currency, rates, { compact: true })}`}
                    </Text>
                  }
                />
                <Row
                  title={t('project.estimatorTotal')}
                  right={
                    <Text style={styles.planValue}>
                      {formatMoney(basePrice, currency, rates, { compact: true })}
                    </Text>
                  }
                />
                {hasCashDeal ? (
                  <Row
                    title={t('project.cashPrice')}
                    subtitle={t('project.estimatorSave').replace(
                      '{s}',
                      formatMoney(cashSavings, currency, rates, { compact: true })
                    )}
                    right={
                      <Text style={styles.planValue}>
                        {formatMoney(cashPrice, currency, rates, { compact: true })}
                      </Text>
                    }
                  />
                ) : null}

                <View style={[styles.estLabelRow, row]}>
                  <Text style={[styles.estLabel, align]}>{t('project.estimatorTweak')}</Text>
                </View>
              </>
            ) : (
              <Text style={[styles.estNote, align]}>{t('project.estimatorNoPlans')}</Text>
            )}

            <View style={[styles.estLabelRow, row]}>
              <Text style={[styles.estLabel, align]}>{t('project.downPaymentLabel')}</Text>
              <Text style={styles.estValue}>{`${calcDp}%`}</Text>
            </View>
            <View style={[styles.chips, row]}>
              {DP_OPTIONS.map((value) => (
                <Chip
                  key={value}
                  label={`${value}%`}
                  selected={calcDp === value}
                  onPress={() => setDpChoice(value)}
                />
              ))}
            </View>

            <View style={[styles.estLabelRow, row]}>
              <Text style={[styles.estLabel, align]}>{t('project.duration')}</Text>
              <Text style={styles.estValue}>{`${calcYears} ${t('project.years')}`}</Text>
            </View>
            <View style={[styles.chips, row]}>
              {YEAR_OPTIONS.map((value) => (
                <Chip
                  key={value}
                  label={String(value)}
                  selected={calcYears === value}
                  onPress={() => setYearsChoice(value)}
                />
              ))}
            </View>

            <Text style={[styles.estNote, align]}>{t('project.estimatorNote')}</Text>
          </Card>
        ) : null}

        {/* Tabs — the website's TabsList, restated as a chip strip */}
        {/* Visitor reviews sit above the plans tabs so the rating summary is
            read before the payment detail — same section, only reordered. */}
        <ProjectReviewsSection
          projectId={project.id}
          initialViewingId={Array.isArray(review) ? review[0] : review}
          feed={reviewsApi}
        />
        <Card>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabBar, row]}>
            {tabs.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                selected={activeTab === entry.key}
                onPress={() => setTab(entry.key)}
              />
            ))}
          </ScrollView>
          <Divider />
          {renderTabContent()}
        </Card>

        {/* Showcase model units — REAL owner-uploaded photos/floorplan/area
            only (never invented). Illustrative, non-bookable, inquiry CTA
            only. Hidden when zero samples. */}
        {sampleUnits.length ? (
          <Card>
            <SectionTitle>{t('project.models')}</SectionTitle>
            <Text style={[styles.muted, align]}>{t('project.modelsHint')}</Text>
            {sampleUnits.map((unit, index) => {
              const photos = parseStringArray(unit.gallery);
              const photoSrc = imageUrl(photos[0] ?? null);
              const planSrc = imageUrl(unit.floorPlan);
              const inquiryText =
                lang === 'ar'
                  ? `عايز استفسر عن النموذج الاسترشادي (${humanise(unit.unitType ?? '')}) في مشروع ${project.name} — ${unit.name ?? unit.unitNumber ?? ''}`
                  : `I want to ask about the showcase model (${humanise(unit.unitType ?? '')}) in ${project.name} — ${unit.name ?? unit.unitNumber ?? ''}`;
              return (
                <View key={unit.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.plan}>
                    <View style={[styles.planHead, row]}>
                      <Text style={[styles.planName, align]}>
                        {unit.name ?? unit.unitNumber ?? t('common.unit')}
                      </Text>
                      <Badge tone="gold">{t('project.sampleBadge')}</Badge>
                    </View>
                    {unit.unitType ? (
                      <View style={[styles.chips, row]}>
                        <Chip label={humanise(unit.unitType)} selected={false} />
                      </View>
                    ) : null}
                    {photoSrc && !deadImgs[photoSrc] ? (
                      <Image
                        source={{ uri: photoSrc }}
                        style={styles.masterImage}
                        resizeMode="cover"
                        onError={() => markDead(photoSrc)}
                      />
                    ) : null}
                    <Row
                      title={[
                        unit.area ? formatArea(unit.area) : null,
                        unit.bedrooms ? `${unit.bedrooms} ${t('project.bed')}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                      right={
                        unit.price != null ? (
                          <Text style={styles.unitPrice}>
                            {formatMoney(unit.price, currency, rates, { compact: true })}
                          </Text>
                        ) : undefined
                      }
                    />
                    {planSrc && !deadImgs[planSrc] ? (
                      <>
                        <Text style={[styles.planSub, align]}>{t('project.floorPlan')}</Text>
                        <Pressable onPress={() => setPlanOpen(planSrc)}>
                          <Image
                            source={{ uri: planSrc }}
                            style={styles.masterImage}
                            resizeMode="contain"
                            onError={() => markDead(planSrc)}
                          />
                        </Pressable>
                      </>
                    ) : null}
                    {/* Inquiry CTA only — showcase models are never bookable,
                        so no booking navigation is rendered here. */}
                    <Btn
                      title={t('project.sendInquiryModel')}
                      variant="ghost"
                      onPress={() =>
                        router.push({ pathname: '/contact', params: { message: inquiryText } })
                      }
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        ) : null}

        {project.developer ? (
          <Card>
            <SectionTitle>{t('common.developer')}</SectionTitle>
            <Row
              left={
                devLogoSrc && !deadImgs[devLogoSrc] ? (
                  <Image
                    source={{ uri: devLogoSrc }}
                    style={styles.devLogo}
                    onError={() => markDead(devLogoSrc)}
                  />
                ) : (
                  <View style={[styles.devLogo, styles.devLogoFallback]}>
                    <Text style={styles.devLogoText}>
                      {(project.developer.companyName ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )
              }
              title={project.developer.companyName ?? '—'}
              subtitle={project.developer.isVerified ? t('project.verified') : t('project.notVerified')}
            />
          </Card>
        ) : null}

      </View>

      {/* Master plan lightbox — the website's click-to-enlarge */}
      <Modal
        visible={planOpen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPlanOpen(null)}>
        <Pressable style={styles.lightbox} onPress={() => setPlanOpen(null)}>
          <Pressable style={styles.lightboxInner} onPress={() => {}}>
            {planOpen ? (
              <Image
                source={{ uri: planOpen }}
                style={styles.lightboxImage}
                resizeMode="contain"
                onError={() => setPlanOpen(null)}
              />
            ) : null}
            <Pressable style={styles.lightboxClose} hitSlop={10} onPress={() => setPlanOpen(null)}>
              <Ionicons name="close" size={20} color={theme.foreground} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      </Screen>
      {/* Sticky booking bar — same /viewing/book navigation as the Actions card, always visible. */}
      <View style={[styles.stickyBar, row, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Btn title={t('project.bookViewing')} style={styles.stickyPrimary} onPress={openBooking} />
        <Btn title={t('share.whatsapp')} variant="ghost" onPress={shareWhatsApp} />
      </View>
    </View>
  );
}

type ReviewRow = {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: { name?: string | null } | null;
};

type ReviewsPayload = {
  reviews?: ReviewRow[];
  average?: number | null;
  count?: number;
};

type EligibleViewing = {
  id: string;
  scheduledAt: string;
  status: string;
  project?: { id: string } | null;
  unit?: { project?: { id: string } | null } | null;
};

/** YouTube watch / share / embed URL → video id. Direct files return null. */
function youTubeId(url: string): string | null {
  const match = /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(
    url
  );
  return match?.[1] ?? null;
}

/**
 * Project promo video — direct files (mp4/HLS, what the Nawy import writes)
 * play in `expo-video`'s native `VideoView`; YouTube links get a
 * privacy-enhanced embed because native players cannot stream YouTube pages.
 * Each branch is its own component so `useVideoPlayer` is never conditional.
 */
function ProjectVideo({ url, title }: { url: string; title: string }) {
  const id = youTubeId(url);
  if (id) return <YouTubeEmbed id={id} title={title} />;
  return <DirectVideo url={url} />;
}

function DirectVideo({ url }: { url: string }) {
  const styles = useStyles();
  const player = useVideoPlayer(url);
  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture
    />
  );
}

function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const styles = useStyles();
  return (
    <View style={styles.videoFrame} accessibilityLabel={title}>
      <WebView
        source={{ uri: `https://www.youtube-nocookie.com/embed/${id}` }}
        style={styles.video}
        // Navigation gate: the embed may only navigate within YouTube's own
        // origins (player ↔ youtube.com hops). `id` is regex-constrained to
        // [\w-]{6,} by youTubeId above, so the URI cannot be smuggled into
        // another scheme/host. Subresource loads (thumbnails, googlevideo
        // streams) are unaffected — only top-level navigations filter.
        originWhitelist={['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*']}
        allowsFullscreenVideo
        javaScriptEnabled
      />
    </View>
  );
}

/**
 * Visitor reviews — the same `GET /api/reviews?projectId=` payload the
 * website's `ProjectReviews` section renders: average stars + count, the
 * approved list, and an empty state. Signed-in visitors with a COMPLETED
 * viewing on this project get the same minimal submit form; a `review`
 * query param (pushed from `src/app/viewings.tsx`'s Rate button as
 * `/project/<slug>?review=<viewingId>`) opens the form with that viewing
 * pre-selected.
 */
function ProjectReviewsSection({
  projectId,
  initialViewingId,
  feed,
}: {
  projectId: string;
  initialViewingId?: string;
  feed: {
    data: ReviewsPayload | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
  };
}) {
  const styles = useReviewStyles();
  const { t: theme } = useTheme();
  const { t, row, align } = useI18n();
  const { status: authStatus } = useAuth();
  const signedIn = authStatus === 'signedIn';
  const mutation = useMutation();

  const [formOpen, setFormOpen] = useState(Boolean(initialViewingId));
  const [viewingId, setViewingId] = useState(initialViewingId ?? '');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // The approved list + average/count arrive via `feed` from the screen —
  // one shared read also powers the social-proof line under the price.
  const reviews = feed;
  const mine = useApi<{ viewings?: EligibleViewing[] }>(
    signedIn ? '/api/viewings' : null,
    signedIn
  );

  const items = reviews.data?.reviews ?? [];
  const average = reviews.data?.average ?? null;
  const count = reviews.data?.count ?? 0;
  const eligible = (mine.data?.viewings ?? []).filter(
    (v) =>
      (v.status ?? '').toUpperCase() === 'COMPLETED' &&
      (v.project?.id === projectId || v.unit?.project?.id === projectId)
  );

  async function submit() {
    if (!viewingId || rating < 1 || rating > 5 || busy) {
      setSent(false);
      setNotice(t('rev.pickVisitFirst'));
      return;
    }
    setBusy(true);
    setNotice(null);
    setSent(false);
    try {
      await mutation.run('/api/reviews', 'POST', {
        projectId,
        viewingId,
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setSent(true);
      setNotice(t('rev.sent'));
      setRating(0);
      setComment('');
      await reviews.refresh();
    } catch (e) {
      setSent(false);
      setNotice(e instanceof Error ? e.message : t('rev.sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  const summary =
    count > 0 && average != null
      ? `${average} ${t('rev.from5')} · ${count} ${count === 1 ? t('rev.rating') : t('rev.ratings')}`
      : t('rev.emptyHint');

  return (
    <Card>
      <SectionTitle>{`${t('rev.title')}${count > 0 ? ` (${count})` : ''}`}</SectionTitle>

      <View style={[styles.stars, row]}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= Math.round(average ?? 0) ? 'star' : 'star-outline'}
            size={18}
            color={star <= Math.round(average ?? 0) ? theme.primary : theme.mutedForeground}
          />
        ))}
        <Text style={[styles.summary, align]}>{summary}</Text>
      </View>

      {reviews.loading ? <Loading label={t('common.loading')} /> : null}
      {reviews.error ? <ErrorBar message={reviews.error} onRetry={reviews.refresh} /> : null}
      {!reviews.loading && !reviews.error && items.length === 0 ? (
        <Empty title={t('rev.empty')} message={t('rev.emptyHint')} />
      ) : null}

      {items.map((item, index) => (
        <View key={item.id}>
          {index > 0 ? <Divider /> : null}
          <Row
            title={item.user?.name || t('rev.visitor')}
            subtitle={formatDate(item.createdAt)}
            right={
              <View style={[styles.stars, row]}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= item.rating ? 'star' : 'star-outline'}
                    size={13}
                    color={star <= item.rating ? theme.primary : theme.mutedForeground}
                  />
                ))}
              </View>
            }
          />
          {item.comment ? <Text style={[styles.comment, align]}>{item.comment}</Text> : null}
        </View>
      ))}

      {!signedIn ? <Text style={[styles.muted, align]}>{t('rev.signInHint')}</Text> : null}

      {signedIn && eligible.length > 0 ? (
        <Btn
          title={formOpen ? t('rev.closeForm') : t('rev.rateVisit')}
          variant="ghost"
          onPress={() => setFormOpen((open) => !open)}
        />
      ) : null}

      {signedIn && eligible.length > 0 && formOpen ? (
        <View style={styles.form}>
          <Text style={[styles.label, align]}>{t('rev.pickVisit')}</Text>
          <View style={[styles.chips, row]}>
            {eligible.map((viewing) => (
              <Chip
                key={viewing.id}
                label={formatDate(viewing.scheduledAt)}
                selected={viewingId === viewing.id}
                onPress={() => setViewingId(viewing.id)}
              />
            ))}
          </View>

          <View style={[styles.stars, row]}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)} hitSlop={8}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={28}
                  color={star <= rating ? theme.primary : theme.mutedForeground}
                />
              </Pressable>
            ))}
          </View>

          <Field
            value={comment}
            onChangeText={setComment}
            placeholder={t('rev.commentHint')}
            multiline
            numberOfLines={3}
            maxLength={1000}
          />

          <Btn
            title={busy ? t('rev.sending') : t('rev.send')}
            busy={busy}
            onPress={() => void submit()}
          />
          {notice && sent ? <Text style={[styles.muted, align]}>{notice}</Text> : null}
          {notice && !sent ? <ErrorBar message={notice} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const useReviewStyles = createStyles((t) =>
  StyleSheet.create({
    stars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    summary: { color: t.mutedForeground, fontSize: 13, marginStart: 6 },
    comment: { color: t.mutedForeground, fontSize: 14, lineHeight: 19, paddingVertical: 4 },
    muted: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    form: { gap: 8 },
    label: { color: t.mutedForeground, fontSize: 13, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  })
);

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    hero: { position: 'relative' },
    heroImage: { width: '100%', height: 220, backgroundColor: t.muted },
    heroFallback: { alignItems: 'center', justifyContent: 'center' },
    heroFallbackText: { color: t.primary, fontSize: 24, fontWeight: '800', letterSpacing: 6 },
    heroOverlay: { padding: Spacing.md, gap: 6 },
    heroBadges: { flexDirection: 'row', gap: 8 },
    title: { color: t.foreground, fontSize: 26, lineHeight: 34, fontWeight: '800' },
    titleArabic: { color: t.mutedForeground, fontSize: 20, lineHeight: 30 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    location: { color: t.mutedForeground, fontSize: 14 },
    body: { padding: 16, gap: 10, paddingBottom: 32 },
    // Sticky booking bar — pinned under the scroll view, same booking navigation.
    page: { flex: 1, backgroundColor: t.background },
    stickyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    stickyPrimary: { flex: 1 },
    actions: { gap: 8 },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionHalf: { flex: 1 },
    stats: { flexDirection: 'row', justifyContent: 'space-between' },
    stat: { alignItems: 'center', gap: 2, flex: 1 },
    statValue: { color: t.foreground, fontSize: 16, fontWeight: '800' },
    statLabel: { color: t.mutedForeground, fontSize: 12 },
    devLogo: { width: 40, height: 40, borderRadius: 20 },
    devLogoFallback: {
      backgroundColor: t.muted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.border,
    },
    devLogoText: { color: t.primary, fontWeight: '800', fontSize: 18 },
    paragraph: { color: t.mutedForeground, fontSize: 14, lineHeight: 21 },
    // Overview copy — the app's editorial body (same 15/24 as about / terms /
    // help) with press-article paragraph gaps; list rows keep the marker on
    // the reading edge via `row` at the call site. Colours and gaps reuse
    // theme tokens only.
    overview: { gap: Spacing.sm + 4 },
    overviewPara: { color: t.mutedForeground, fontSize: 15, lineHeight: 24 },
    overviewList: { gap: Spacing.xs },
    overviewListRow: { alignItems: 'flex-start', gap: Spacing.sm },
    overviewMarker: {
      color: t.mutedForeground,
      fontSize: 15,
      lineHeight: 24,
      minWidth: 16,
      textAlign: 'center',
    },
    overviewItem: { color: t.mutedForeground, fontSize: 15, lineHeight: 24, flex: 1 },
    // Overview tab cards — the same bordered-box idiom as `plan` /
    // `locationBox` / `contactBox`: theme tokens only, no new colours.
    overviewCards: { gap: Spacing.sm + 4 },
    overviewCard: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm + 4,
      gap: 6,
      backgroundColor: t.background,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    muted: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    unitPrice: { color: t.primary, fontSize: 14, fontWeight: '800' },
    hint: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    video: { width: '100%', height: 220, borderRadius: 8, backgroundColor: t.muted },
    videoFrame: { borderRadius: 8, overflow: 'hidden', backgroundColor: t.muted },

    // Compare-in-place
    compareRow: { justifyContent: 'space-between', gap: 8 },
    compareHint: { color: t.mutedForeground, fontSize: 13, flex: 1 },

    // Contact reveal
    contactBox: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm,
      gap: 4,
      backgroundColor: t.goldBg,
    },

    // Monthly installment estimator
    estPrice: { color: t.primary, fontSize: 26, fontWeight: '800' },
    estSub: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    estHighlight: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      backgroundColor: t.goldBg,
      paddingVertical: Spacing.sm + 4,
      alignItems: 'center',
      gap: 2,
    },
    estMonthly: { color: t.primary, fontSize: 24, fontWeight: '800' },
    estLabelRow: { justifyContent: 'space-between', alignItems: 'center' },
    estLabel: { color: t.mutedForeground, fontSize: 13, fontWeight: '600' },
    estValue: { color: t.foreground, fontSize: 13, fontWeight: '700' },
    estNote: { color: t.mutedForeground, fontSize: 11, lineHeight: 16 },

    // Tab strip
    tabBar: { flexDirection: 'row', gap: 8, paddingVertical: Spacing.xs },

    // Payment plans
    plan: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm + 4,
      gap: 4,
      backgroundColor: t.background,
    },
    planHead: { alignItems: 'center', gap: 8 },
    planName: { color: t.foreground, fontSize: 16, fontWeight: '700', flexShrink: 1 },
    planValue: { color: t.primary, fontSize: 14, fontWeight: '800' },
    planSub: {
      color: t.mutedForeground,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: Spacing.xs,
    },
    // Headline discount across the plan set ("up to X%").
    upTo: { color: t.successFg, fontSize: 14, fontWeight: '700' },

    // Location tab
    locationBox: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm + 4,
      gap: 6,
      backgroundColor: t.background,
    },
    locationHead: { alignItems: 'center', gap: 6 },
    locationText: { color: t.foreground, fontSize: 15, fontWeight: '600', flex: 1 },
    mapLink: { alignItems: 'center', gap: 5 },
    mapLinkText: { color: t.primary, fontSize: 13, fontWeight: '700' },

    // Master plan gallery
    masterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    masterItem: {
      width: '48%',
      flexGrow: 1,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: t.card,
    },
    masterImage: { width: '100%', height: 150, backgroundColor: t.muted },
    masterCaption: { color: t.mutedForeground, fontSize: 12, padding: 8 },
    lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: Spacing.md },
    lightboxInner: { alignItems: 'center', gap: Spacing.sm },
    lightboxImage: { width: '100%', height: 360 },
    lightboxClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.popover,
      borderWidth: 1,
      borderColor: t.border,
    },

    // Timeline
    timeline: { gap: 0 },
    tlItem: { alignItems: 'flex-start', gap: 10 },
    tlRail: { alignItems: 'center', width: 14, paddingTop: 4 },
    tlDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: t.background },
    tlLine: { width: 2, flex: 1, backgroundColor: t.border, marginTop: 2, minHeight: 24 },
    tlBody: { flex: 1, gap: 3, paddingBottom: Spacing.md },
    tlTags: { flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    tlTitle: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    tlMeta: { color: t.mutedForeground, fontSize: 12 },
  }),
);
