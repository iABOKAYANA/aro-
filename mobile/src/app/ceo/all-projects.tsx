import { Stack, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '@/api/config';
import {
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorBar,
  Loading,
  Row,
  Screen,
  SearchBar,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatArea, formatDate, formatMoney, humanise, initials } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles } from '@/lib/theme';

/** Same page size the website's table asks for. */
const PAGE_SIZE = 25;

const BUILDS = ['ALL', 'COMING_SOON', 'UNDER_CONSTRUCTION', 'DELIVERED', 'SOLD_OUT'] as const;
const APPROVALS = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'PUBLISHED', 'REJECTED', 'HIDDEN', 'ARCHIVED'] as const;
const ACTIVES = ['ALL', 'ACTIVE', 'INACTIVE'] as const;

const SORTS: { value: string; labelKey: MessageKey }[] = [
  { value: 'newest', labelKey: 'ceoPr.sortNewest' },
  { value: 'oldest', labelKey: 'ceoPr.sortOldest' },
  { value: 'name', labelKey: 'ceoPr.sortName' },
  { value: 'views', labelKey: 'ceoPr.sortViews' },
  { value: 'price', labelKey: 'ceoPr.sortPrice' },
];

type Named = { name: string; nameArabic?: string | null };

type Counts = {
  units: number;
  amenities: number;
  phases: number;
  paymentPlans: number;
  masterPlanImages: number;
  brochures: number;
  leads: number;
  deals: number;
  viewings: number;
  nearbyPlaces: number;
  brokerAccess: number;
};

/** Row shape of `GET /api/ceo/projects-all`. */
type ProjectRow = {
  id: string;
  name: string;
  nameArabic?: string | null;
  slug: string;
  tagline?: string | null;
  coverImage?: string | null;
  status: string;
  approvalStatus: string;
  isActive: boolean;
  isFeatured: boolean;
  isVerified: boolean;
  featuredRank?: number | null;
  startPrice?: number | null;
  endPrice?: number | null;
  completionPercent?: number | null;
  totalUnits?: number | null;
  totalArea?: number | null;
  deliveryDate?: string | null;
  viewCount: number;
  favoriteCount: number;
  inquiryCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  isNewLaunch: boolean;
  developer?: { id: string; companyName: string; logo?: string | null; isVerified?: boolean } | null;
  governorate?: Named | null;
  city?: Named | null;
  district?: Named | null;
  _count: Counts;
};

type ListResponse = {
  items?: ProjectRow[];
  total?: number;
  page?: number;
  pages?: number;
  stats?: { total: number; active: number; inactive: number; published: number; drafts: number };
};

type DetailUnit = {
  id: string;
  name: string;
  unitNumber?: string | null;
  unitType?: string;
  status: string;
  bedrooms?: number | null;
  area?: number | null;
  price: number;
};

type DetailPhase = {
  id: string;
  name: string;
  status: string;
  deliveryDate?: string | null;
  totalUnits?: number | null;
};

type DetailPlan = {
  id: string;
  name: string;
  downPaymentPct: number;
  installmentYears: number;
  isDefault: boolean;
  isActive: boolean;
};

type DetailAmenity = { amenity: { id: string; name: string } };
type DetailNearby = { id: string; name: string; type: string; distance: number };

/** Full record of `GET /api/ceo/projects-all/[id]` — the fields the website prints. */
type DetailProject = {
  id: string;
  name: string;
  nameArabic?: string | null;
  slug: string;
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
  status: string;
  approvalStatus: string;
  isActive: boolean;
  isFeatured: boolean;
  isVerified: boolean;
  featuredRank?: number | null;
  isNewLaunch: boolean;
  rejectionReason?: string | null;
  startPrice?: number | null;
  endPrice?: number | null;
  pricePerSqm?: number | null;
  downPaymentMin?: number | null;
  installmentYears?: number | null;
  MaintenanceFeePercent?: number | null;
  compoundArea?: number | null;
  totalUnits?: number | null;
  totalArea?: number | null;
  completionPercent?: number | null;
  deliveryDate?: string | null;
  deliveryTerms?: string | null;
  propertyTypes?: string | null;
  listingTypes?: string | null;
  keywords?: string | null;
  gallery?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  viewCount: number;
  favoriteCount: number;
  inquiryCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  developer?: {
    id: string;
    companyName: string;
    isVerified?: boolean;
    user?: { id: string; name?: string | null; email?: string | null } | null;
  } | null;
  governorate?: Named | null;
  city?: Named | null;
  district?: Named | null;
  units?: DetailUnit[];
  phases?: DetailPhase[];
  paymentPlans?: DetailPlan[];
  amenities?: DetailAmenity[];
  nearbyPlaces?: DetailNearby[];
  masterPlanImages?: { id: string; url: string; caption?: string | null }[];
  brochures?: { id: string; name: string; url: string }[];
  _count?: {
    leads?: number;
    deals?: number;
    viewings?: number;
    brokerAccess?: number;
    commissionRules?: number;
    blogs?: number;
  };
};

type DetailResponse = {
  project: DetailProject;
  unitStats: { count: number; minPrice: number | null; maxPrice: number | null; totalArea: number | null };
};

/** JSON columns come back as strings; the website parses the same way. */
function jsonArr(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function or(value: ReactNode): ReactNode {
  return value === null || value === undefined || value === '' ? '—' : value;
}

/**
 * CMS images are stored site-relative on the website and resolved by the
 * browser against the Next.js origin — the app has to do the same against the
 * API host or the cover never loads (same rule as /blog).
 */
function imageUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith('file://')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return `${API_URL}${src.startsWith('/') ? '' : '/'}${src}`;
}

/**
 * The website's /ceo/all-projects: every project in the database — published,
 * draft, hidden or archived — with the five KPI counts, the four filters, and
 * a row that expands into the full detail panel.
 *
 * Reads `GET /api/ceo/projects-all` (list + stats, paged) and, while a row is
 * open, `GET /api/ceo/projects-all/[id]` — the exact two endpoints the page's
 * own `fetch`es hit. Only one row expands at a time, like the table, so a
 * single detail request is enough.
 */
export default function CeoAllProjectsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();

  const [query, setQuery] = useState('');
  const [build, setBuild] = useState<string>('ALL');
  const [approval, setApproval] = useState<string>('ALL');
  const [active, setActive] = useState<string>('ALL');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Dead remote covers fall back to initials — home city-card pattern.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort });
  if (query.trim()) params.set('q', query.trim());
  if (build !== 'ALL') params.set('status', build);
  if (approval !== 'ALL') params.set('approval', approval);
  if (active !== 'ALL') params.set('active', active === 'ACTIVE' ? 'true' : 'false');

  const { data, error, loading, refreshing, refresh } = useApi<ListResponse>(
    `/api/ceo/projects-all?${params.toString()}`,
  );
  // One detail at a time — the table expands a single row.
  const detail = useApi<DetailResponse>(expanded ? `/api/ceo/projects-all/${expanded}` : null);

  // The hook keeps the previous payload until the new one lands; only trust it
  // once it answers for the row that is actually open.
  const panel =
    detail.data && detail.data.project.id === expanded ? detail.data : null;

  // A new page of results closes the open row — its id may not be in them.
  useEffect(() => {
    setExpanded(null);
  }, [page, query, build, approval, active, sort]);

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('ceoPr.loading')} />;

  const items = data?.items ?? [];
  const stats = data?.stats;
  const total = data?.total ?? 0;
  const pages = Math.max(1, data?.pages ?? 1);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoPr.allTitle') }} />

      <View style={styles.head}>
        <Text style={[styles.subtitle, align]}>{t('ceoPr.allSubtitle')}</Text>
        {total > 0 ? (
          <Text style={[styles.count, align]}>
            {`${t('ceoPr.showing')} ${total} ${t('ceoPr.matching')}`}
          </Text>
        ) : null}
      </View>

      {stats ? (
        <Card style={[styles.kpis, row]}>
          <Stat value={stats.total} label={t('ceoPr.statTotal')} />
          <Stat value={stats.active} label={t('ceoPr.active')} />
          <Stat value={stats.inactive} label={t('ceoPr.inactive')} />
          <Stat value={stats.published} label={t('ceo.publishedProjects')} />
          <Stat value={stats.drafts} label={t('ceo.content.drafts')} />
        </Card>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      <Card style={styles.filters}>
        <SearchBar
          value={query}
          onChangeText={(next) => {
            setQuery(next);
            setPage(1);
          }}
          placeholder={t('ceoPr.searchPlaceholder')}
        />

        <Text style={[styles.formLabel, align]}>{t('ceoPr.filterBuild')}</Text>
        <View style={[styles.chipRow, row]}>
          {BUILDS.map((value) => (
            <Chip
              key={value}
              label={value === 'ALL' ? t('common.all') : humanise(value)}
              selected={build === value}
              onPress={() => {
                setBuild(value);
                setPage(1);
              }}
            />
          ))}
        </View>

        <Text style={[styles.formLabel, align]}>{t('ceoPr.filterApproval')}</Text>
        <View style={[styles.chipRow, row]}>
          {APPROVALS.map((value) => (
            <Chip
              key={value}
              label={value === 'ALL' ? t('common.all') : humanise(value)}
              selected={approval === value}
              onPress={() => {
                setApproval(value);
                setPage(1);
              }}
            />
          ))}
        </View>

        <Text style={[styles.formLabel, align]}>{t('ceoPr.filterActive')}</Text>
        <View style={[styles.chipRow, row]}>
          {ACTIVES.map((value) => (
            <Chip
              key={value}
              label={
                value === 'ALL'
                  ? t('common.all')
                  : value === 'ACTIVE'
                    ? t('ceoPr.active')
                    : t('ceoPr.inactive')
              }
              selected={active === value}
              onPress={() => {
                setActive(value);
                setPage(1);
              }}
            />
          ))}
        </View>

        <Text style={[styles.formLabel, align]}>{t('ceoPr.filterSort')}</Text>
        <View style={[styles.chipRow, row]}>
          {SORTS.map((option) => (
            <Chip
              key={option.value}
              label={t(option.labelKey)}
              selected={sort === option.value}
              onPress={() => {
                setSort(option.value);
                setPage(1);
              }}
            />
          ))}
        </View>
      </Card>

      {!error && items.length === 0 ? (
        <Empty title={t('ceoPr.empty')} message={t('ceoPr.emptyHint')} />
      ) : null}

      {items.map((project, index) => {
        const isOpen = expanded === project.id;
        const location = [project.district?.name, project.city?.name, project.governorate?.name]
          .filter(Boolean)
          .join(', ');

        return (
          <View key={project.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={
                  project.coverImage && !deadImgs[imageUrl(project.coverImage)] ? (
                    <Image
                      source={{ uri: imageUrl(project.coverImage) }}
                      style={styles.cover}
                      onError={() =>
                        setDeadImgs((prev) => {
                          const key = imageUrl(project.coverImage!);
                          return prev[key] ? prev : { ...prev, [key]: true };
                        })
                      }
                    />
                  ) : (
                    <View style={styles.coverFallback}>
                      <Text style={styles.coverInitials}>{initials(project.name)}</Text>
                    </View>
                  )
                }
                title={project.name}
                subtitle={[
                  `/projects/${project.slug}`,
                  location || undefined,
                  project.developer?.companyName || undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone={toneForApproval(project.approvalStatus)}>
                      {humanise(project.approvalStatus)}
                    </Badge>
                    <Badge tone="muted">{humanise(project.status)}</Badge>
                    {!project.isActive ? (
                      <Badge tone="red">{t('ceoPr.inactive')}</Badge>
                    ) : null}
                  </View>
                }
                right={
                  <Text style={styles.price}>
                    {formatMoney(project.startPrice ?? null, currency, rates, { compact: true })}
                  </Text>
                }
                onPress={() => {
                  setExpanded(isOpen ? null : project.id);
                }}
              />

              <Text style={[styles.meta, align]}>
                {[
                  `${project._count.units} ${t('ceo.units')}`,
                  `${project.viewCount} ${t('developer.stat.views')}`,
                  formatDate(project.createdAt),
                ].join(' · ')}
              </Text>

              {isOpen ? (
                <View style={styles.panel}>
                  <Divider />

                  {detail.loading || (!panel && !detail.error) ? (
                    <Text style={[styles.panelLoading, align]}>{t('ceoPr.loadingDetail')}</Text>
                  ) : null}

                  {detail.error ? (
                    <ErrorBar message={detail.error ?? t('ceoPr.failed')} onRetry={detail.refresh} />
                  ) : null}

                  {panel ? <ProjectDetail panel={panel} currency={currency} rates={rates} /> : null}

                  <Btn
                    title={t('ceoPr.viewDetails')}
                    variant="ghost"
                    onPress={() => router.push(`/ceo/projects/${project.id}`)}
                  />
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      {items.length > 0 && pages > 1 ? (
        <View style={[styles.pager, row]}>
          <Pressable onPress={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} hitSlop={8}>
            <Text style={[styles.pagerLink, page <= 1 && styles.pagerOff]}>{t('common.prev')}</Text>
          </Pressable>
          <Text style={styles.pagerCount}>{`${page} ${t('common.of')} ${pages}`}</Text>
          <Pressable
            onPress={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            hitSlop={8}>
            <Text style={[styles.pagerLink, page >= pages && styles.pagerOff]}>
              {t('common.next')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

/** The website's expandable `<ProjectDetail>`, restated group by group. */
function ProjectDetail({
  panel,
  currency,
  rates,
}: {
  panel: DetailResponse;
  currency: Parameters<typeof formatMoney>[1];
  rates: Parameters<typeof formatMoney>[2];
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();

  const p = panel.project;
  const stats = panel.unitStats;
  const gallery = jsonArr(p.gallery);
  const propertyTypes = jsonArr(p.propertyTypes);
  const listingTypes = jsonArr(p.listingTypes);
  const keywords = jsonArr(p.keywords);

  const money = (value: number | null | undefined) => formatMoney(value ?? null, currency, rates);

  const openLink = (url: string) => {
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <>
      <Group title={t('ceo.overview')}>
        <Pair label={t('ceoPr.nameAr')} value={or(p.nameArabic)} />
        <Pair label={t('ceoPr.taglineEn')} value={or(p.tagline)} />
        <Pair label={t('ceoPr.taglineAr')} value={or(p.taglineArabic)} />
        <Pair
          label={t('ceoPr.propertyTypes')}
          value={propertyTypes.length ? propertyTypes.join(', ') : '—'}
        />
        <Pair
          label={t('ceoPr.listingTypes')}
          value={listingTypes.length ? listingTypes.join(', ') : '—'}
        />
        <Pair label={t('ceoPr.slug')} value={`/projects/${p.slug}`} />
        <Pair label={t('ceoPr.approvalStatus')} value={p.approvalStatus} />
        <Pair label={t('ceoPr.active')} value={t(p.isActive ? 'common.yes' : 'common.no')} />
        <Pair
          label={t('ceoPr.featured')}
          value={
            p.isFeatured
              ? `${t('common.yes')} (${t('ceoPr.rank')} ${p.featuredRank ?? '—'})`
              : t('common.no')
          }
        />
        <Pair label={t('ceo.verified')} value={t(p.isVerified ? 'common.yes' : 'common.no')} />
        <Pair
          label={t('ceoPr.newLaunch')}
          value={p.isNewLaunch ? t('ceoPr.newLaunchYes') : t('common.no')}
        />
        <Pair label={t('ceoPr.rejectionReason')} value={or(p.rejectionReason)} />
      </Group>

      {p.description || p.descriptionArabic ? (
        <Card style={styles.group}>
          <Text style={[styles.groupTitle, align]}>{t('ceoPr.description')}</Text>
          <Text style={[styles.paragraph, align]}>{or(p.description)}</Text>
          <Text style={[styles.paragraph, align, styles.paragraphAr]}>{or(p.descriptionArabic)}</Text>
        </Card>
      ) : null}

      <Group title={t('ceoPr.groupLocation')}>
        <Pair label={t('ceo.settings.address')} value={or(p.address)} />
        <Pair
          label={t('ceoPr.governorate')}
          value={
            p.governorate
              ? `${p.governorate.name} / ${p.governorate.nameArabic ?? ''}`
              : '—'
          }
        />
        <Pair
          label={t('ceoPr.city')}
          value={p.city ? `${p.city.name} / ${p.city.nameArabic ?? ''}` : '—'}
        />
        <Pair label={t('ceoPr.district')} value={or(p.district?.name)} />
        <Pair
          label={t('ceoPr.coordinates')}
          value={p.latitude && p.longitude ? `${p.latitude}, ${p.longitude}` : '—'}
        />
        <Pair
          label={t('ceoPr.googleMaps')}
          value={
            p.googleMapsUrl ? (
              <Pressable onPress={() => openLink(p.googleMapsUrl!)} hitSlop={8}>
                <Text style={styles.link}>{t('common.open')}</Text>
              </Pressable>
            ) : (
              '—'
            )
          }
        />
      </Group>

      <Group title={t('ceoPr.groupPricing')}>
        <Pair label={t('ceoPr.startPrice')} value={money(p.startPrice)} />
        <Pair label={t('ceoPr.endPrice')} value={money(p.endPrice)} />
        <Pair label={t('ceoPr.pricePerSqm')} value={money(p.pricePerSqm)} />
        <Pair
          label={t('ceoPr.downPaymentMin')}
          value={typeof p.downPaymentMin === 'number' ? `${p.downPaymentMin}%` : '—'}
        />
        <Pair
          label={t('ceoPr.installments')}
          value={p.installmentYears ? `${p.installmentYears} ${t('ceoPr.years')}` : '—'}
        />
        <Pair
          label={t('ceoPr.maintenanceFee')}
          value={typeof p.MaintenanceFeePercent === 'number' ? `${p.MaintenanceFeePercent}%` : '—'}
        />
        <Pair
          label={t('ceoPr.compoundArea')}
          value={p.compoundArea ? `${p.compoundArea} m²` : '—'}
        />
        <Pair
          label={t('ceoPr.unitPriceRange')}
          value={`${money(stats.minPrice)} – ${money(stats.maxPrice)}`}
        />
        <Pair label={t('ceoPr.paymentPlans')} value={p.paymentPlans?.length ?? 0} />
      </Group>

      {p.paymentPlans?.length ? (
        <Card style={styles.group}>
          <Text style={[styles.groupTitle, align]}>{t('ceoPr.paymentPlans')}</Text>
          <View style={styles.list}>
            {p.paymentPlans.map((plan) => (
              <Text key={plan.id} style={[styles.line, align]}>
                {`${plan.name} — ${plan.downPaymentPct}% ${t('ceoPr.down')}, ${plan.installmentYears} ${t('ceoPr.years')}${
                  plan.isDefault ? ` · ${t('ceoPr.default')}` : ''
                }${!plan.isActive ? ` · ${t('ceoPr.inactive')}` : ''}`}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      <Group title={t('ceoPr.groupDelivery')}>
        <Pair label={t('ceoPr.totalUnitsDeclared')} value={or(p.totalUnits)} />
        <Pair label={t('ceoPr.unitsInDb')} value={stats.count} />
        <Pair label={t('ceoPr.totalArea')} value={p.totalArea ? `${p.totalArea} m²` : '—'} />
        <Pair
          label={t('ceoPr.builtArea')}
          value={stats.totalArea ? `${Math.round(stats.totalArea)} m²` : '—'}
        />
        <Pair label={t('ceoPr.completion')} value={`${p.completionPercent ?? 0}%`} />
        <Pair label={t('ceoPr.deliveryDate')} value={formatDate(p.deliveryDate)} />
        <Pair label={t('ceoPr.deliveryTerms')} value={or(p.deliveryTerms)} />
        <Pair label={t('ceoPr.phases')} value={p.phases?.length ?? 0} />
      </Group>

      {p.phases?.length ? (
        <Card style={styles.group}>
          <Text style={[styles.groupTitle, align]}>{t('ceoPr.phases')}</Text>
          <View style={styles.list}>
            {p.phases.map((phase) => (
              <Text key={phase.id} style={[styles.line, align]}>
                {`${phase.name} — ${humanise(phase.status)} · ${
                  phase.totalUnits ?? '—'
                } ${t('ceo.units')} · ${formatDate(phase.deliveryDate)}`}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      <Group title={t('ceoPr.groupMedia')}>
        <Pair
          label={t('ceoPr.coverImage')}
          value={
            p.coverImage ? (
              <Pressable onPress={() => openLink(imageUrl(p.coverImage!))} hitSlop={8}>
                <Text style={styles.link}>{t('common.open')}</Text>
              </Pressable>
            ) : (
              '—'
            )
          }
        />
        <Pair label={t('ceoPr.galleryImages')} value={gallery.length} />
        <Pair label={t('ceoPr.masterPlans')} value={p.masterPlanImages?.length ?? 0} />
        <Pair label={t('ceoPr.brochures')} value={p.brochures?.length ?? 0} />
        <Pair
          label={t('ceoPr.video')}
          value={
            p.videoUrl ? (
              <Pressable onPress={() => openLink(p.videoUrl!)} hitSlop={8}>
                <Text style={styles.link}>{t('common.open')}</Text>
              </Pressable>
            ) : (
              '—'
            )
          }
        />
        <Pair
          label={t('ceoPr.virtualTour')}
          value={
            p.virtualTourUrl ? (
              <Pressable onPress={() => openLink(p.virtualTourUrl!)} hitSlop={8}>
                <Text style={styles.link}>{t('common.open')}</Text>
              </Pressable>
            ) : (
              '—'
            )
          }
        />
        <Pair label={t('ceoPr.metaTitle')} value={or(p.metaTitle)} />
        <Pair label={t('ceoPr.metaDescription')} value={or(p.metaDescription)} />
        <Pair label={t('ceoPr.keywords')} value={keywords.length ? keywords.join(', ') : '—'} />
      </Group>

      <Group title={t('ceoPr.groupStats')}>
        <Pair label={t('developer.stat.views')} value={p.viewCount} />
        <Pair label={t('ceo.favorites')} value={p.favoriteCount} />
        <Pair label={t('ceo.inquiriesCount')} value={p.inquiryCount} />
        <Pair label={t('ceo.leads')} value={p._count?.leads ?? 0} />
        <Pair label={t('ceo.deals')} value={p._count?.deals ?? 0} />
        <Pair label={t('ceo.viewings')} value={p._count?.viewings ?? 0} />
        <Pair label={t('ceoPr.brokerAccess')} value={p._count?.brokerAccess ?? 0} />
        <Pair label={t('ceoPr.commissionRules')} value={p._count?.commissionRules ?? 0} />
        <Pair label={t('ceoPr.blogPosts')} value={p._count?.blogs ?? 0} />
        <Pair label={t('ceoPr.amenities')} value={p.amenities?.length ?? 0} />
        <Pair label={t('ceoPr.nearbyPlaces')} value={p.nearbyPlaces?.length ?? 0} />
        <Pair label={t('ceoPr.created')} value={formatDate(p.createdAt)} />
        <Pair label={t('common.updated')} value={formatDate(p.updatedAt)} />
        <Pair label={t('ceoPr.published')} value={formatDate(p.publishedAt)} />
      </Group>

      <Group title={t('common.developer')}>
        <Pair label={t('ceoPr.company')} value={or(p.developer?.companyName)} />
        <Pair label={t('ceo.verified')} value={t(p.developer?.isVerified ? 'common.yes' : 'common.no')} />
        <Pair
          label={t('ceoPr.contact')}
          value={
            p.developer?.user
              ? `${p.developer.user.name ?? ''} · ${p.developer.user.email ?? ''}`
              : '—'
          }
        />
      </Group>

      <Card style={styles.group}>
        <Text style={[styles.groupTitle, align]}>
          {`${t('ceoPr.unitsSample')} (${stats.count} ${t('ceoPr.total')}${
            (p.units?.length ?? 0) < stats.count
              ? `, ${t('ceoPr.cheapest')} ${p.units?.length ?? 0}`
              : ''
          })`}
        </Text>
        {p.units?.length ? (
          <View style={styles.list}>
            {p.units.map((unit) => (
              <Text key={unit.id} style={[styles.line, align]}>
                {`${unit.name}${unit.unitNumber ? ` · #${unit.unitNumber}` : ''} · ${
                  unit.unitType ? humanise(unit.unitType) : '—'
                } · ${unit.bedrooms ?? '—'} ${t('ceo.bedrooms')} · ${formatArea(
                  unit.area ?? null,
                )} · ${money(unit.price)} · ${humanise(unit.status)}`}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={[styles.line, align]}>{t('ceo.units.none')}</Text>
        )}
      </Card>

      {p.amenities?.length ? (
        <Card style={styles.group}>
          <Text style={[styles.groupTitle, align]}>
            {`${t('ceoPr.amenities')} (${p.amenities.length})`}
          </Text>
          <View style={[styles.tags, row]}>
            {p.amenities.map((entry) => (
              <Badge key={entry.amenity.id} tone="gold">
                {entry.amenity.name}
              </Badge>
            ))}
          </View>
        </Card>
      ) : null}

      {p.nearbyPlaces?.length ? (
        <Card style={styles.group}>
          <Text style={[styles.groupTitle, align]}>
            {`${t('ceoPr.nearbyPlaces')} (${p.nearbyPlaces.length})`}
          </Text>
          <View style={[styles.tags, row]}>
            {p.nearbyPlaces.map((place) => (
              <Badge key={place.id} tone="muted">
                {`${place.name} · ${humanise(place.type)} · ${place.distance} ${t('ceoPr.km')}`}
              </Badge>
            ))}
          </View>
        </Card>
      ) : null}
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  const { row, align } = useI18n();
  return (
    <Card style={styles.group}>
      <Text style={[styles.groupTitle, align]}>{title}</Text>
      <View style={[styles.grid, row]}>{children}</View>
    </Card>
  );
}

/** The website's label-above-value caption, in a wrapping two-up grid. */
function Pair({ label, value }: { label: string; value: ReactNode }) {
  const styles = useStyles();
  const { align } = useI18n();
  return (
    <View style={styles.pair}>
      <Text style={[styles.pairLabel, align]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.pairValue, align]}>{value ?? '—'}</Text>
    </View>
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
    head: { gap: 4 },
    subtitle: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    count: { color: t.mutedForeground, fontSize: 13 },
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md, flexWrap: 'wrap', gap: 12 },
    filters: { gap: 8 },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    card: { gap: 0, marginTop: Spacing.xs },
    cover: { width: 52, height: 52, borderRadius: 8, backgroundColor: t.muted },
    coverFallback: {
      width: 52,
      height: 52,
      borderRadius: 8,
      backgroundColor: t.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverInitials: { color: t.primary, fontSize: 16, fontWeight: '800' },
    badges: { gap: 6, flexWrap: 'wrap' },
    price: { color: t.primary, fontSize: 14, fontWeight: '800' },
    meta: { color: t.mutedForeground, fontSize: 12, marginTop: 6 },
    panel: { gap: 8, marginTop: 8 },
    panelLoading: { color: t.mutedForeground, fontSize: 13, paddingVertical: Spacing.sm },
    group: { gap: 8, marginTop: Spacing.sm },
    groupTitle: {
      color: t.primary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    grid: { flexWrap: 'wrap', gap: 10 },
    pair: { minWidth: 132, flexGrow: 1, gap: 2 },
    pairLabel: {
      color: t.mutedForeground,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    pairValue: { color: t.foreground, fontSize: 14, lineHeight: 20 },
    paragraph: { color: t.foreground, fontSize: 14, lineHeight: 21 },
    paragraphAr: { writingDirection: 'rtl', textAlign: 'right' },
    list: { gap: 6 },
    line: { color: t.foreground, fontSize: 13, lineHeight: 19 },
    tags: { flexWrap: 'wrap', gap: 6 },
    link: { color: t.primary, fontSize: 14, fontWeight: '700' },
    pager: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
    pagerLink: { color: t.primary, fontSize: 14, fontWeight: '700' },
    pagerOff: { color: t.mutedForeground, opacity: 0.5 },
    pagerCount: { color: t.mutedForeground, fontSize: 13 },
  }),
);
