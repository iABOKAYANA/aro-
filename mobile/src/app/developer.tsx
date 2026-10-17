import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Clipboard, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system';

import { ApiError, apiFetch } from '@/api/client';
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
  SearchBar,
  SectionTitle,
  Segmented,
  toneForStatus,
} from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useRoleDenied } from '@/components/role-gate';
import { useI18n } from '@/i18n';
import { formatDate, formatMoney, humanise, timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { uploadImageAsset } from '@/lib/image-upload';
import { deleteItemAsync, getItemAsync, setItemAsync } from '@/lib/storage';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type PortalResponse = {
  profile?: Profile | null;
  partnership?: Partnership | null;
  /** Caller's own permission mode: DIRECT writes allowed vs REQUEST-only. */
  editMode?: string;
  stats?: Stats;
  projects?: PortalProject[];
  leads?: PortalLead[];
  deals?: PortalDeal[];
  commissions?: PortalCommission[];
};

type Profile = {
  companyName?: string;
  companyNameArabic?: string | null;
  logo?: string | null;
  isVerified?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  foundedYear?: number | null;
  headquarters?: string | null;
  website?: string | null;
  totalProjects?: number | null;
  accountStatus?: string;
  isActive?: boolean;
};

type Partnership = {
  status: string;
  allProjectsApproved?: boolean;
  approvedCount?: number;
  leadProtectionDays?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  terms?: string | null;
  reviewNote?: string | null;
  isActive?: boolean;
  updatedAt?: string;
};

type Stats = {
  projects: number;
  published: number;
  leads: number;
  statusCounts: Record<string, number>;
  deals: number;
  totalValue: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionPending: number;
  views: number;
  inquiries: number;
};

type PortalProject = {
  id: string;
  name: string;
  slug: string;
  coverImage?: string | null;
  approvalStatus?: string;
  startPrice?: number | null;
  totalUnits?: number | null;
  completionPercent?: number;
  deliveryDate?: string | null;
  isActive?: boolean;
  viewCount?: number;
  inquiryCount?: number;
  location?: string | null;
  units?: number;
  leads?: number;
  deals?: number;
};

type PortalLead = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  createdAt: string;
  protectionExpiresAt?: string | null;
  brokerName?: string;
  projectName?: string | null;
  projectSlug?: string | null;
};

type PortalDeal = {
  id: string;
  status: string;
  dealValue?: number | null;
  createdAt: string;
  projectName: string;
  unitName?: string | null;
  brokerName?: string;
  commissionStatus?: string | null;
};

type PortalCommission = {
  id: string;
  status: string;
  totalAmount: number;
  estateaiAmount?: number | null;
  dueDate?: string | null;
  createdAt: string;
  projectName: string;
};

type Milestone = {
  id: string;
  title: string;
  status?: string;
  approvalStatus?: string;
  date?: string | null;
  progressPercent?: number | null;
};

type Tab = 'overview' | 'projects' | 'leads' | 'deals' | 'partnership' | 'submit' | 'manage';

const MAX_ROWS = 60;

const DRAFT_KEY = 'ghaya.developer.draft.v1';
const REQ_LOG_KEY = 'ghaya.developer.edit-requests.v1';

/** One field change a REQUEST-mode developer asks the CEO to apply. */
export type EditTarget = {
  entity: 'PROJECT' | 'UNIT' | 'PLAN';
  entityId: string;
  field: string;
  label: string;
  value?: string;
};

/** Device log of submitted edit requests (fallback when the server list fails). */
type LoggedRequest = {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  newValue: string;
  message: string | null;
  createdAt: string;
};

/** One row of `GET /api/developer/edit-requests` (the caller's own requests). */
type ServerEditRequest = {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  newValue: string;
  message?: string | null;
  status: string;
  reason?: string | null;
  createdAt: string;
  project?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
  plan?: { id: string; name: string } | null;
};

async function readReqLog(): Promise<LoggedRequest[]> {
  try {
    const raw = await getItemAsync(REQ_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is LoggedRequest =>
        Boolean(x) && typeof (x as LoggedRequest).id === 'string',
    );
  } catch {
    return [];
  }
}

async function appendReqLog(entry: LoggedRequest): Promise<void> {
  const current = await readReqLog().catch(() => [] as LoggedRequest[]);
  await setItemAsync(REQ_LOG_KEY, JSON.stringify([entry, ...current].slice(0, 60))).catch(
    () => {},
  );
}

/**
 * REQUEST-mode writes answer 403 `{ requestOnly: true }` — but `ApiError`
 * only carries the message, so any 403 from these PATCH/DELETE routes routes
 * into the request flow; the POST result is authoritative.
 */
function isRequestOnly(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}

/** Commonly-requested whitelisted fields per entity for the request sheet. */
const REQ_FIELDS: Record<EditTarget['entity'], string[]> = {
  PROJECT: ['description', 'descriptionArabic', 'coverImage', 'gallery'],
  UNIT: ['name', 'price', 'area', 'bedrooms', 'bathrooms', 'deliveryTerms'],
  PLAN: ['name', 'downPaymentPct', 'installmentYears', 'description'],
};

/** Vocabularies the developer unit/plan routes accept (mirrors the CEO forms). */
const UNIT_TYPES = ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'DUPLEX', 'PENTHOUSE', 'STUDIO'];
const LISTING_TYPES = ['SALE', 'RENT'];
const PROJECT_STATUSES = ['COMING_SOON', 'UNDER_CONSTRUCTION', 'READY'];
const UNIT_STATUSES = ['AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN'];

/** `GET /api/geo` — the governorate → city → district picklists. */
type GeoGovernorate = { id: string; name: string; nameArabic?: string | null };
type GeoCity = {
  id: string;
  name: string;
  nameArabic?: string | null;
  nameSlug?: string | null;
  governorateId: string;
};
type GeoDistrict = { id: string; name: string; nameArabic?: string | null; cityId: string };
type GeoResponse = {
  governorates: GeoGovernorate[];
  cities: GeoCity[];
  districts: GeoDistrict[];
};

/**
 * The developer's corner of the platform: everything the website's
 * `/developer` page shows, in one screen.
 *
 * The web page runs five Prisma queries inside a server component, so there
 * was no endpoint to call; `GET /api/developer/portal` is that page's query
 * set exposed as JSON, and this screen is its read-mostly port. The Submit tab
 * is the exception: it writes through the developer contract —
 * `POST /api/developer/projects`, the per-project `units` / `plans` routes and
 * `POST …/submit` — with the session riding automatically. Like the web
 * portal, partnerships stay read-only here; they are approved by the CEO.
 */
export default function DeveloperScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const [leadStatus, setLeadStatus] = useState('ALL');
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [toolsProject, setToolsProject] = useState<string | null>(null);
  // REQUEST-mode edit flow — a 403 on any PATCH/DELETE below lands here.
  const [reqTarget, setReqTarget] = useState<EditTarget | null>(null);
  // Dead remote images hide/fall back — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});

  const { data, error, loading, refresh } = useApi<PortalResponse>('/api/developer/portal');

  const denied = useRoleDenied('developer.forbiddenHint', ['DEVELOPER']);
  if (denied) return denied;

  if (loading) return <Loading label={t('developer.loading')} />;

  const profile = data?.profile;

  if (error) {
    const forbidden = error.includes('Forbidden');
    return (
      <Screen>
        <Stack.Screen options={{ title: t('developer.title') }} />
        <ErrorBar message={forbidden ? t('developer.forbiddenHint') : error} onRetry={refresh} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('developer.title') }} />
        <Empty title={t('developer.noProfile')} message={t('developer.noProfileHint')} />
      </Screen>
    );
  }

  const stats = data?.stats;
  const projects = data?.projects ?? [];
  const leads = data?.leads ?? [];
  const deals = data?.deals ?? [];
  const commissions = data?.commissions ?? [];
  const partnership = data?.partnership ?? null;
  // REQUEST-mode detection prefers the portal's own `editMode` flag; the
  // 403 `{ requestOnly: true }` catch below stays as the fallback for a
  // mode that flips mid-session or an unknown flag.
  const requestMode = data?.editMode === 'REQUEST';

  const needle = query.trim().toLowerCase();
  // The website's Leads-tab filter: a status dropdown over the statuses the
  // rows actually carry, then one search box over lead / broker / project.
  const leadStatuses = Array.from(new Set(leads.map((l) => l.status))).sort();
  const filteredLeads = leads.filter((l) => {
    if (leadStatus !== 'ALL' && l.status !== leadStatus) return false;
    if (!needle) return true;
    return [l.name, l.phone, l.email, l.projectName, l.brokerName].some((v) =>
      (v ?? '').toLowerCase().includes(needle),
    );
  });

  const suspended = profile.accountStatus !== 'ACTIVE' || profile.isActive === false;
  const company = localized(profile.companyName, profile.companyNameArabic);
  const logoSrc = imageUrl(profile.logo);

  return (
    <Screen refreshing={false} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('developer.title') }} />

      <Card>
        <View style={[styles.company, row]}>
          {logoSrc && !deadImgs[logoSrc] ? (
            <Image
              source={{ uri: logoSrc }}
              style={styles.logo}
              onError={() =>
                setDeadImgs((prev) => (prev[logoSrc] ? prev : { ...prev, [logoSrc]: true }))
              }
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoText}>{(company ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.companyMain}>
            <View style={[styles.companyTitle, row]}>
              <Text style={[styles.companyName, align]} numberOfLines={1}>
                {company}
              </Text>
              {profile.isVerified ? (
                <Ionicons name="checkmark-circle" size={16} color={theme.successFg} />
              ) : null}
            </View>
            <Text style={styles.companyMeta}>
              {[profile.headquarters, profile.website].filter(Boolean).join(' · ')}
            </Text>
            {profile.rating != null ? (
              <Text style={styles.companyMeta}>
                ★ {profile.rating.toFixed(1)} · {profile.reviewCount ?? 0} {t('developer.rating')}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.chipRow, row]}>
          <Badge tone={partnership ? 'gold' : 'muted'}>
            {partnership ? humanise(partnership.status) : t('developer.partnershipNone')}
          </Badge>
          <Badge tone="blue">
            {stats?.published ?? 0}/{stats?.projects ?? 0} {t('developer.liveCounter')}
          </Badge>
          {profile.foundedYear ? (
            <Badge tone="muted">{`${t('developer.founded')} ${profile.foundedYear}`}</Badge>
          ) : null}
        </View>

        {suspended ? <ErrorBar message={t('developer.suspendedHint')} /> : null}
      </Card>

      <Segmented<Tab>
        options={[
          { value: 'overview', label: t('developer.tab.overview') },
          { value: 'projects', label: t('developer.tab.projects') },
          { value: 'leads', label: t('developer.tab.leads') },
          { value: 'deals', label: t('developer.tab.deals') },
          { value: 'partnership', label: t('developer.tab.partnership') },
          { value: 'submit', label: t('developer.tab.submit') },
          { value: 'manage', label: t('developer.tab.manage') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
        <>
          <Card style={styles.statGrid}>
            <Tile value={stats?.published ?? 0} label={t('developer.stat.live')} />
            <Tile value={stats?.leads ?? 0} label={t('developer.stat.leads')} />
            <Tile
              value={formatMoney(stats?.totalValue ?? 0, currency, rates, { compact: true })}
              label={t('developer.stat.dealsValue')}
            />
            <Tile
              value={formatMoney(stats?.commissionPaid ?? 0, currency, rates, { compact: true })}
              label={t('developer.paid')}
            />
            <Tile value={stats?.views ?? 0} label={t('developer.stat.views')} />
            <Tile value={stats?.inquiries ?? 0} label={t('developer.stat.inquiries')} />
          </Card>

          <Card>
            <SectionTitle>{t('developer.leadFunnel')}</SectionTitle>
            {Object.entries(stats?.statusCounts ?? {}).length === 0 ? (
              <Text style={styles.muted}>{t('common.none')}</Text>
            ) : (
              Object.entries(stats?.statusCounts ?? {}).map(([status, count]) => (
                <View key={status} style={styles.funnelRow}>
                  <Text style={[styles.funnelLabel, align]} numberOfLines={1}>
                    {humanise(status)}
                  </Text>
                  <View style={styles.funnelTrack}>
                    <View
                      style={[
                        styles.funnelFill,
                        {
                          width: `${Math.min(
                            100,
                            (count / Math.max(1, stats?.leads ?? 1)) * 100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.funnelValue}>{count}</Text>
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{t('developer.topProjects')}</SectionTitle>
            {[...projects]
              .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
              .slice(0, 6)
              .map((project, index) => (
                <View key={project.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={project.name}
                    subtitle={[
                      project.location,
                      `${project.leads ?? 0} ${t('developer.stat.leads')}`,
                      `${project.deals ?? 0} ${t('developer.tab.deals')}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={<Text style={styles.count}>{project.viewCount ?? 0} 👁</Text>}
                    onPress={() => router.push(`/project/${project.slug}`)}
                  />
                </View>
              ))}
          </Card>

          {/* The website's side column: engagement rollups, then the company
              facts (projects on record, HQ, website, account status). */}
          <Card>
            <SectionTitle>{t('developer.engagement')}</SectionTitle>
            <Row
              title={t('developer.stat.views')}
              right={
                <Text style={[styles.count, align]}>{(stats?.views ?? 0).toLocaleString()}</Text>
              }
            />
            <Row
              title={t('developer.stat.inquiries')}
              right={
                <Text style={[styles.count, align]}>
                  {(stats?.inquiries ?? 0).toLocaleString()}
                </Text>
              }
            />
            <Row
              title={t('developer.stat.leads')}
              right={<Text style={[styles.count, align]}>{stats?.leads ?? 0}</Text>}
            />
            <Row
              title={t('developer.tab.deals')}
              right={<Text style={[styles.count, align]}>{stats?.deals ?? 0}</Text>}
            />
          </Card>

          <Card>
            <SectionTitle>{t('developer.company')}</SectionTitle>
            <Row
              title={t('developer.projectsOnRecord')}
              right={
                <Text style={[styles.count, align]}>
                  {profile.totalProjects ?? stats?.projects ?? 0}
                </Text>
              }
            />
            <Row
              title={t('developer.headquarters')}
              right={<Text style={[styles.count, align]}>{profile.headquarters || '—'}</Text>}
            />
            <Row
              title={t('developer.website')}
              right={
                <Text style={[styles.count, align]} numberOfLines={1}>
                  {profile.website ? profile.website.replace(/^https?:\/\//, '') : '—'}
                </Text>
              }
            />
            <Row
              title={t('developer.status')}
              right={
                <Text style={[styles.count, align]}>
                  {suspended ? t('developer.suspended') : humanise(profile.accountStatus ?? 'ACTIVE')}
                </Text>
              }
            />
          </Card>
        </>
      ) : null}

      {tab === 'projects' ? (
        <>
          <Text style={styles.hint}>{t('developer.projectsHint')}</Text>
          {projects.length === 0 ? (
            <Empty title={t('developer.tab.projects')} message={t('developer.projectsHint')} />
          ) : (
            projects.slice(0, MAX_ROWS).map((project) => {
              const src = imageUrl(project.coverImage);
              return (
              <Card key={project.id} style={styles.card}>
                <Row
                  title={project.name}
                  subtitle={[
                    project.location,
                    project.startPrice
                      ? `from ${formatMoney(project.startPrice, currency, rates, { compact: true })}`
                      : null,
                    `${project.units ?? 0} ${t('developer.units')} · ${project.leads ?? 0} ${t(
                      'developer.stat.leads',
                    )}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={
                    <View style={styles.chipRowTight}>
                      <Badge tone={project.approvalStatus === 'PUBLISHED' || project.approvalStatus === 'APPROVED' ? 'green' : 'gold'}>
                        {humanise(project.approvalStatus ?? 'DRAFT')}
                      </Badge>
                      {!project.isActive ? <Badge tone="red">{t('developer.hidden')}</Badge> : null}
                    </View>
                  }
                  right={
                    src && !deadImgs[src] ? (
                      <Image
                        source={{ uri: src }}
                        style={styles.thumb}
                        onError={() =>
                          setDeadImgs((prev) => (prev[src] ? prev : { ...prev, [src]: true }))
                        }
                      />
                    ) : undefined
                  }
                  onPress={() => router.push(`/project/${project.slug}`)}
                />
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${project.completionPercent ?? 0}%` }]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {t('developer.completion')} {project.completionPercent ?? 0}%
                  {project.deliveryDate
                    ? ` · ${t('developer.delivery')} ${new Date(project.deliveryDate).getFullYear()}`
                    : ''}
                </Text>
                {/* The row itself navigates to the project now (like the
                    website cards); milestones stay one tap away underneath. */}
                <View style={[styles.chipRow, row]}>
                  <Chip
                    label={
                      openProject === project.id
                        ? t('developer.hideMilestones')
                        : t('developer.showMilestones')
                    }
                    selected={openProject === project.id}
                    onPress={() => setOpenProject(openProject === project.id ? null : project.id)}
                  />
                  <Chip
                    label={
                      toolsProject === project.id
                        ? t('developer.hideTools')
                        : t('developer.showTools')
                    }
                    selected={toolsProject === project.id}
                    onPress={() =>
                      setToolsProject(toolsProject === project.id ? null : project.id)
                    }
                  />
                </View>

                {openProject === project.id ? (
                  <View style={styles.expand}>
                    <Divider />
                    <Milestones projectId={project.id} />
                  </View>
                ) : null}

                {toolsProject === project.id ? (
                  <View style={styles.expand}>
                    <Divider />
                    <ProjectTools
                      project={project}
                      onChanged={refresh}
                      onRequestEdit={setReqTarget}
                      requestMode={requestMode}
                    />
                  </View>
                ) : null}
              </Card>
              );
            })
          )}
        </>
      ) : null}

      {tab === 'leads' ? (
        <>
          <SearchBar value={query} onChangeText={setQuery} placeholder={t('common.search')} />
          <View style={[styles.chipRow, row]}>
            <Chip
              label={t('developer.allStatuses')}
              selected={leadStatus === 'ALL'}
              onPress={() => setLeadStatus('ALL')}
            />
            {leadStatuses.map((status) => (
              <Chip
                key={status}
                label={humanise(status)}
                selected={leadStatus === status}
                onPress={() => setLeadStatus(leadStatus === status ? 'ALL' : status)}
              />
            ))}
          </View>
          <Text style={styles.hint}>{t('developer.leadsHint')}</Text>
          {filteredLeads.length === 0 ? (
            <Empty title={t('developer.tab.leads')} message={t('common.noResults')} />
          ) : (
            filteredLeads.slice(0, MAX_ROWS).map((lead, index) => (
              <View key={lead.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={lead.name}
                  subtitle={[
                    lead.phone,
                    lead.projectName,
                    lead.brokerName || t('developer.unassigned'),
                    formatDate(lead.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={
                    <View style={styles.chipRowTight}>
                      <Badge tone="gold">{humanise(lead.status)}</Badge>
                      {lead.protectionExpiresAt ? (
                        <Badge tone="blue">
                          {t('developer.protectionUntil')}{' '}
                          {new Date(lead.protectionExpiresAt).toLocaleDateString()}
                        </Badge>
                      ) : null}
                    </View>
                  }
                />
              </View>
            ))
          )}
        </>
      ) : null}

      {tab === 'deals' ? (
        <>
          <Card style={styles.statGrid}>
            <Tile
              value={formatMoney(stats?.commissionTotal ?? 0, currency, rates, { compact: true })}
              label={t('developer.total')}
            />
            <Tile
              value={formatMoney(stats?.commissionPaid ?? 0, currency, rates, { compact: true })}
              label={t('developer.paid')}
            />
            <Tile
              value={formatMoney(stats?.commissionPending ?? 0, currency, rates, { compact: true })}
              label={t('developer.pending')}
            />
          </Card>

          <Card>
            <SectionTitle>{t('developer.commissions')}</SectionTitle>
            {commissions.length === 0 ? (
              <Text style={styles.muted}>{t('common.none')}</Text>
            ) : (
              commissions.slice(0, 20).map((c, index) => (
                <View key={c.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={c.projectName}
                    subtitle={timeAgo(c.createdAt)}
                    badge={<Badge tone={c.status === 'PAID' ? 'green' : 'gold'}>{humanise(c.status)}</Badge>}
                    right={
                      <Text style={styles.count}>
                        {formatMoney(c.totalAmount, currency, rates, { compact: true })}
                      </Text>
                    }
                  />
                </View>
              ))
            )}
          </Card>

          <Card>
            <SectionTitle>{t('developer.tab.deals')}</SectionTitle>
            {deals.length === 0 ? (
              <Text style={styles.muted}>{t('common.none')}</Text>
            ) : (
              deals.slice(0, 40).map((deal, index) => (
                <View key={deal.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={deal.projectName}
                    subtitle={[deal.unitName, deal.brokerName].filter(Boolean).join(' · ')}
                    badge={<Badge tone={deal.status === 'SOLD' ? 'green' : 'gold'}>{humanise(deal.status)}</Badge>}
                    right={
                      <Text style={styles.count}>
                        {formatMoney(deal.dealValue ?? 0, currency, rates, { compact: true })}
                      </Text>
                    }
                  />
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}

      {tab === 'partnership' ? (
        partnership ? (
          <>
            <Card>
              <SectionTitle>{t('developer.tab.partnership')}</SectionTitle>
              <View style={[styles.chipRow, row]}>
                <Badge tone={partnership.isActive ? 'green' : 'red'}>
                  {partnership.isActive ? t('developer.inEffect') : t('developer.inactive')}
                </Badge>
                <Badge tone="gold">{humanise(partnership.status)}</Badge>
              </View>
              <Divider />
              <Row
                title={t('developer.allProjects')}
                subtitle={
                  partnership.allProjectsApproved
                    ? t('developer.allProjects')
                    : `${partnership.approvedCount ?? 0} ${t('developer.approvedProjects')}`
                }
              />
              {partnership.startDate ? (
                <Row title={t('developer.startDate')} subtitle={partnership.startDate.slice(0, 10)} />
              ) : null}
              {partnership.endDate ? (
                <Row title={t('developer.endDate')} subtitle={partnership.endDate.slice(0, 10)} />
              ) : null}
              <Row
                title={t('developer.protectionDays')}
                subtitle={
                  partnership.leadProtectionDays != null
                    ? `${partnership.leadProtectionDays} ${t('developer.days')}`
                    : t('developer.defaultValue')
                }
              />
              {partnership.updatedAt ? (
                <Row
                  title={t('developer.updatedAt')}
                  subtitle={formatDate(partnership.updatedAt)}
                />
              ) : null}
            </Card>

            {partnership.terms ? (
              <Card>
                <SectionTitle>{t('developer.terms')}</SectionTitle>
                <Text style={styles.paragraph}>{partnership.terms}</Text>
              </Card>
            ) : null}

            {partnership.reviewNote ? (
              <Card style={styles.noteCard}>
                <SectionTitle>{t('developer.reviewNote')}</SectionTitle>
                <Text style={styles.paragraph}>{partnership.reviewNote}</Text>
              </Card>
            ) : null}
          </>
        ) : (
          <Empty title={t('developer.partnershipNone')} message={t('developer.partnershipNoneHint')} />
        )
      ) : null}

      {tab === 'submit' ? (
        <SubmitTab projects={projects} onChanged={refresh} onRequestEdit={setReqTarget} requestMode={requestMode} />
      ) : null}

      {tab === 'manage' ? <ManageTab projects={projects} /> : null}

      {reqTarget ? (
        <EditRequestSheet
          key={`${reqTarget.entity}:${reqTarget.entityId}:${reqTarget.field}`}
          target={reqTarget}
          onClose={() => setReqTarget(null)}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Submit tab: the developer self-publishing surface on the exact backend
 * contract. `POST /api/developer/projects` takes the project fields and
 * forces `approvalStatus: 'PENDING'` server-side (never send `developerId` —
 * the server resolves it from the session); a taken name comes back 409.
 *
 * Submissions below are the portal's own projects with approval badges; a
 * REJECTED row pulls its `rejectionReason` through the owner preview
 * (`GET /api/projects/[slug]` lets the owning developer read a non-public
 * project — the portal list itself carries no reason), and DRAFT/REJECTED
 * rows resubmit via `POST …/submit`. Each row expands into the per-project
 * units/plans manager. Visibility follows the project: pending work stays
 * invisible on the public site until the CEO approves it.
 */
function SubmitTab({
  projects,
  onChanged,
  onRequestEdit,
  requestMode,
}: {
  projects: PortalProject[];
  onChanged: () => void;
  onRequestEdit: (target: EditTarget) => void;
  requestMode?: boolean;
}) {
  const styles = useStyles();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const mutation = useMutation();
  // Area picklists — one `GET /api/geo`, cascading below. On failure the
  // location section falls back to the old free-text ID inputs.
  const geo = useApi<GeoResponse>('/api/geo');

  // ── Essentials ──
  const [fName, setFName] = useState('');
  const [fNameAr, setFNameAr] = useState('');
  const [fTagline, setFTagline] = useState('');
  const [fTaglineAr, setFTaglineAr] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fDescAr, setFDescAr] = useState('');
  const [fStatus, setFStatus] = useState(PROJECT_STATUSES[0]);
  // ── Location ── raw IDs on the wire (`governorateId` / `cityId` /
  // `districtId`), picked through cascading `GET /api/geo` chips below —
  // governorate → city → district, parent change clears children.
  const [fGov, setFGov] = useState('');
  const [fCity, setFCity] = useState('');
  const [fDistrict, setFDistrict] = useState('');
  const [fAddress, setFAddress] = useState('');
  // ── Types & numbers ──
  const [fPropTypes, setFPropTypes] = useState<string[]>([]);
  const [fListingTypes, setFListingTypes] = useState<string[]>([]);
  const [fUnits, setFUnits] = useState('');
  const [fTotalArea, setFTotalArea] = useState('');
  const [fCompoundArea, setFCompoundArea] = useState('');
  const [fCompletion, setFCompletion] = useState('');
  const [fDeliveryDate, setFDeliveryDate] = useState('');
  const [fDeliveryTerms, setFDeliveryTerms] = useState('');
  // ── Prices ──
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fPerSqm, setFPerSqm] = useState('');
  const [fDown, setFDown] = useState('');
  const [fYears, setFYears] = useState('');
  // ── Media & SEO ──
  const [fCover, setFCover] = useState('');
  const [fGallery, setFGallery] = useState('');
  const [fVideo, setFVideo] = useState('');
  const [fTour, setFTour] = useState('');
  const [fMapsUrl, setFMapsUrl] = useState('');
  const [fLat, setFLat] = useState('');
  const [fLng, setFLng] = useState('');
  const [fMetaTitle, setFMetaTitle] = useState('');
  const [fMetaDesc, setFMetaDesc] = useState('');
  const [fKeywords, setFKeywords] = useState('');

  // Cascading picklists from `/api/geo` — parent change clears children, so
  // a city can never outlive its governorate. IDs stay the form state; names
  // below are display-only and the POST still sends the same ID mapping.
  const governorates = geo.data?.governorates ?? [];
  const allCities = geo.data?.cities ?? [];
  const allDistricts = geo.data?.districts ?? [];
  const geoFailed = geo.error !== null;
  const citiesForGov = fGov ? allCities.filter((c) => c.governorateId === fGov) : [];
  const districtsForCity = fCity ? allDistricts.filter((d) => d.cityId === fCity) : [];
  function pickGov(id: string) {
    setFGov(id);
    setFCity('');
    setFDistrict('');
  }
  function pickCity(id: string) {
    setFCity(id);
    setFDistrict('');
  }
  const govDisplay = fGov
    ? (governorates.find((g) => g.id === fGov)
        ? localized(
            governorates.find((g) => g.id === fGov)?.name,
            governorates.find((g) => g.id === fGov)?.nameArabic,
          )
        : fGov.trim())
    : '';
  const cityDisplay = fCity
    ? (allCities.find((c) => c.id === fCity)
        ? localized(
            allCities.find((c) => c.id === fCity)?.name,
            allCities.find((c) => c.id === fCity)?.nameArabic,
          )
        : fCity.trim())
    : '';
  const districtDisplay = fDistrict
    ? (allDistricts.find((d) => d.id === fDistrict)
        ? localized(
            allDistricts.find((d) => d.id === fDistrict)?.name,
            allDistricts.find((d) => d.id === fDistrict)?.nameArabic,
          )
        : fDistrict.trim())
    : '';

  // Collapsible sections — all open by default for a spacious read; the user
  // can still collapse any of them via its header toggle.
  const [open, setOpen] = useState({
    essentials: true,
    location: true,
    types: true,
    prices: true,
    media: true,
    review: true,
  });
  const toggleSection = (key: keyof typeof open) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  // Live preview — pinned above the form, collapsible via its own toggle.
  const [showPreview, setShowPreview] = useState(true);
  const [previewDead, setPreviewDead] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  // Draft autosave — the whole form as JSON under one device-storage key.
  const [draftReady, setDraftReady] = useState(false);
  const [draftInfo, setDraftInfo] = useState<string | null>(null);

  const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');
  const asStrList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  function snapshotDraft(): Record<string, unknown> {
    return {
      name: fName, nameAr: fNameAr, tagline: fTagline, taglineAr: fTaglineAr,
      desc: fDesc, descAr: fDescAr, status: fStatus, gov: fGov, city: fCity,
      district: fDistrict, address: fAddress, propTypes: fPropTypes,
      listingTypes: fListingTypes, units: fUnits, totalArea: fTotalArea,
      compoundArea: fCompoundArea, completion: fCompletion, deliveryDate: fDeliveryDate,
      deliveryTerms: fDeliveryTerms, start: fStart, end: fEnd, perSqm: fPerSqm,
      down: fDown, years: fYears, cover: fCover, gallery: fGallery, video: fVideo,
      tour: fTour, mapsUrl: fMapsUrl, lat: fLat, lng: fLng, metaTitle: fMetaTitle,
      metaDesc: fMetaDesc, keywords: fKeywords,
    };
  }

  function applyDraft(d: Record<string, unknown>) {
    setFName(asStr(d.name));
    setFNameAr(asStr(d.nameAr));
    setFTagline(asStr(d.tagline));
    setFTaglineAr(asStr(d.taglineAr));
    setFDesc(asStr(d.desc));
    setFDescAr(asStr(d.descAr));
    if (typeof d.status === 'string' && PROJECT_STATUSES.includes(d.status)) setFStatus(d.status);
    setFGov(asStr(d.gov));
    setFCity(asStr(d.city));
    setFDistrict(asStr(d.district));
    setFAddress(asStr(d.address));
    setFPropTypes(asStrList(d.propTypes));
    setFListingTypes(asStrList(d.listingTypes));
    setFUnits(asStr(d.units));
    setFTotalArea(asStr(d.totalArea));
    setFCompoundArea(asStr(d.compoundArea));
    setFCompletion(asStr(d.completion));
    setFDeliveryDate(asStr(d.deliveryDate));
    setFDeliveryTerms(asStr(d.deliveryTerms));
    setFStart(asStr(d.start));
    setFEnd(asStr(d.end));
    setFPerSqm(asStr(d.perSqm));
    setFDown(asStr(d.down));
    setFYears(asStr(d.years));
    setFCover(asStr(d.cover));
    setFGallery(asStr(d.gallery));
    setFVideo(asStr(d.video));
    setFTour(asStr(d.tour));
    setFMapsUrl(asStr(d.mapsUrl));
    setFLat(asStr(d.lat));
    setFLng(asStr(d.lng));
    setFMetaTitle(asStr(d.metaTitle));
    setFMetaDesc(asStr(d.metaDesc));
    setFKeywords(asStr(d.keywords));
  }

  // Restore once on mount — guarded by `draftReady` so the saver below never
  // overwrites a stored draft with the empty form.
  useEffect(() => {
    getItemAsync(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            applyDraft(parsed as Record<string, unknown>);
            setDraftInfo(t('developer.draftRestored'));
          }
        } catch {
          // Corrupt draft — the saver rewrites it on the next keystroke.
        }
      })
      .catch(() => {})
      .finally(() => setDraftReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced saver — every keystroke restarts the 800ms timer.
  useEffect(() => {
    if (!draftReady) return;
    const timer = setTimeout(() => {
      setItemAsync(DRAFT_KEY, JSON.stringify(snapshotDraft()))
        .then(() => setDraftInfo(t('developer.draftSaved')))
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftReady, fName, fNameAr, fTagline, fTaglineAr, fDesc, fDescAr, fStatus,
    fGov, fCity, fDistrict, fAddress, fPropTypes, fListingTypes, fUnits,
    fTotalArea, fCompoundArea, fCompletion, fDeliveryDate, fDeliveryTerms,
    fStart, fEnd, fPerSqm, fDown, fYears, fCover, fGallery, fVideo, fTour,
    fMapsUrl, fLat, fLng, fMetaTitle, fMetaDesc, fKeywords,
  ]);

  async function restoreDraft() {
    setDraftInfo(null);
    const raw = await getItemAsync(DRAFT_KEY).catch(() => null);
    if (!raw) {
      setDraftInfo(t('developer.draftEmpty'));
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        applyDraft(parsed as Record<string, unknown>);
        setDraftInfo(t('developer.draftRestored'));
      } else {
        setDraftInfo(t('developer.draftEmpty'));
      }
    } catch {
      setDraftInfo(t('developer.draftEmpty'));
    }
  }

  async function clearDraft() {
    await deleteItemAsync(DRAFT_KEY).catch(() => {});
    setDraftInfo(t('developer.draftCleared'));
  }

  function clearForm() {
    setFName('');
    setFNameAr('');
    setFTagline('');
    setFTaglineAr('');
    setFDesc('');
    setFDescAr('');
    setFStatus(PROJECT_STATUSES[0]);
    setFGov('');
    setFCity('');
    setFDistrict('');
    setFAddress('');
    setFPropTypes([]);
    setFListingTypes([]);
    setFUnits('');
    setFTotalArea('');
    setFCompoundArea('');
    setFCompletion('');
    setFDeliveryDate('');
    setFDeliveryTerms('');
    setFStart('');
    setFEnd('');
    setFPerSqm('');
    setFDown('');
    setFYears('');
    setFCover('');
    setFGallery('');
    setFVideo('');
    setFTour('');
    setFMapsUrl('');
    setFLat('');
    setFLng('');
    setFMetaTitle('');
    setFMetaDesc('');
    setFKeywords('');
    setPreviewDead(false);
  }

  const parseNum = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = Number(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const toggleMulti = (list: string[], value: string, set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const galleryUrls = fGallery
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const keywordList = fKeywords
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  // Live-preview derivations — recomputed per keystroke, no fetch involved.
  const previewCover = imageUrl(fCover.trim() || null);
  const previewPrice = parseNum(fStart);
  const previewPlace =
    cityDisplay || govDisplay || districtDisplay || fAddress.trim();

  type Issue = { field: string; message: string };
  /** Client mirror of the server ranges, so the review step can flag rows. */
  function collectIssues(): Issue[] {
    const issues: Issue[] = [];
    if (!fName.trim()) {
      issues.push({ field: t('developer.submitName'), message: t('developer.submitNameRequired') });
    }
    const nums: { label: string; raw: string; min: number; max: number }[] = [
      { label: t('developer.submitTotalUnits'), raw: fUnits, min: 0, max: 1_000_000_000_000 },
      { label: t('developer.submitTotalArea'), raw: fTotalArea, min: 0, max: 1_000_000_000_000 },
      {
        label: t('developer.submitCompoundArea'),
        raw: fCompoundArea,
        min: 0,
        max: 1_000_000_000_000,
      },
      { label: t('developer.submitStartPrice'), raw: fStart, min: 0, max: 1_000_000_000_000 },
      { label: t('developer.submitEndPrice'), raw: fEnd, min: 0, max: 1_000_000_000_000 },
      { label: t('developer.submitPerSqm'), raw: fPerSqm, min: 0, max: 1_000_000_000_000 },
      { label: t('developer.submitDownPayment'), raw: fDown, min: 0, max: 100 },
      { label: t('developer.submitYears'), raw: fYears, min: 0, max: 30 },
      { label: t('developer.submitCompletion'), raw: fCompletion, min: 0, max: 100 },
    ];
    for (const item of nums) {
      if (!item.raw.trim()) continue;
      const value = parseNum(item.raw) ?? NaN;
      if (Number.isNaN(value)) {
        issues.push({ field: item.label, message: t('developer.reviewBadNumber') });
      } else if (value < item.min || value > item.max) {
        issues.push({ field: item.label, message: t('developer.reviewBadRange') });
      }
    }
    if (fDeliveryDate.trim() && Number.isNaN(Date.parse(fDeliveryDate.trim()))) {
      issues.push({
        field: t('developer.submitDeliveryDate'),
        message: t('developer.reviewBadDate'),
      });
    }
    return issues;
  }

  // Review-step rollups — one descriptor list drives the section badges, the
  // filled summary and the missing-optionals note, so they can never drift.
  const galleryRaw = galleryUrls.length > 0 ? fGallery.trim() : '';
  const keywordsRaw = keywordList.length > 0 ? fKeywords.trim() : '';
  const textRows: [string, string][] = [
    [t('developer.submitName'), fName.trim()],
    [t('developer.submitNameAr'), fNameAr.trim()],
    [t('developer.submitTagline'), fTagline.trim()],
    [t('developer.submitTaglineAr'), fTaglineAr.trim()],
    [t('developer.submitDescription'), fDesc.trim()],
    [t('developer.submitDescAr'), fDescAr.trim()],
    [t('developer.submitGovernorate'), govDisplay || fGov.trim()],
    [t('developer.submitCity'), cityDisplay || fCity.trim()],
    [t('developer.submitDistrict'), districtDisplay || fDistrict.trim()],
    [t('developer.submitAddress'), fAddress.trim()],
    [t('developer.submitTotalUnits'), fUnits.trim()],
    [t('developer.submitTotalArea'), fTotalArea.trim()],
    [t('developer.submitCompoundArea'), fCompoundArea.trim()],
    [t('developer.submitCompletion'), fCompletion.trim()],
    [t('developer.submitDeliveryDate'), fDeliveryDate.trim()],
    [t('developer.submitDeliveryTerms'), fDeliveryTerms.trim()],
    [t('developer.submitStartPrice'), fStart.trim()],
    [t('developer.submitEndPrice'), fEnd.trim()],
    [t('developer.submitPerSqm'), fPerSqm.trim()],
    [t('developer.submitDownPayment'), fDown.trim()],
    [t('developer.submitYears'), fYears.trim()],
    [t('developer.submitCover'), fCover.trim()],
    [t('developer.submitGallery'), galleryRaw],
    [t('developer.submitVideo'), fVideo.trim()],
    [t('developer.submitTour'), fTour.trim()],
    [t('developer.submitMapsUrl'), fMapsUrl.trim()],
    [t('developer.submitLat'), fLat.trim()],
    [t('developer.submitLng'), fLng.trim()],
    [t('developer.submitMetaTitle'), fMetaTitle.trim()],
    [t('developer.submitMetaDesc'), fMetaDesc.trim()],
    [t('developer.submitKeywords'), keywordsRaw],
  ];
  const chipRows: [string, string][] = [
    [t('developer.submitPropertyTypes'), fPropTypes.map((v) => humanise(v)).join(', ')],
    [t('developer.submitListingTypes'), fListingTypes.map((v) => humanise(v)).join(', ')],
  ];
  const statusRow: [string, string] = [t('developer.submitStatus'), humanise(fStatus)];
  const filledRows: [string, string][] = [statusRow, ...textRows, ...chipRows].filter(
    ([, value]) => value !== '',
  );
  const missingOptionals: string[] = [...textRows, ...chipRows]
    .filter(([label, value]) => value === '' && label !== t('developer.submitName'))
    .map(([label]) => label);
  const issues = collectIssues();

  const nonEmpty = (...raws: string[]) => raws.filter((raw) => raw.trim() !== '').length;
  const essCount = nonEmpty(fName, fNameAr, fTagline, fTaglineAr, fDesc, fDescAr);
  const locCount = nonEmpty(fGov, fCity, fDistrict, fAddress);
  const typesCount =
    nonEmpty(fUnits, fTotalArea, fCompoundArea, fCompletion, fDeliveryDate, fDeliveryTerms) +
    (fPropTypes.length > 0 ? 1 : 0) +
    (fListingTypes.length > 0 ? 1 : 0);
  const pricesCount = nonEmpty(fStart, fEnd, fPerSqm, fDown, fYears);
  const mediaCount =
    nonEmpty(fCover, fVideo, fTour, fMapsUrl, fLat, fLng, fMetaTitle, fMetaDesc) +
    (galleryUrls.length > 0 ? 1 : 0) +
    (keywordList.length > 0 ? 1 : 0);

  async function submitProject() {
    const sendIssues = collectIssues();
    if (sendIssues.length > 0) {
      setProblem(t('developer.reviewFixFirst'));
      setOpen((prev) => ({ ...prev, review: true }));
      return;
    }
    setProblem(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = { name: fName.trim(), status: fStatus };
      const text: Record<string, string> = {
        nameArabic: fNameAr,
        tagline: fTagline,
        taglineArabic: fTaglineAr,
        description: fDesc,
        descriptionArabic: fDescAr,
        governorateId: fGov,
        cityId: fCity,
        districtId: fDistrict,
        address: fAddress,
        deliveryDate: fDeliveryDate,
        deliveryTerms: fDeliveryTerms,
        coverImage: fCover,
        videoUrl: fVideo,
        virtualTourUrl: fTour,
        latitude: fLat,
        longitude: fLng,
        googleMapsUrl: fMapsUrl,
        metaTitle: fMetaTitle,
        metaDescription: fMetaDesc,
      };
      for (const [key, raw] of Object.entries(text)) {
        if (raw.trim()) body[key] = raw.trim();
      }
      if (fPropTypes.length > 0) body.propertyTypes = fPropTypes;
      if (fListingTypes.length > 0) body.listingTypes = fListingTypes;
      if (galleryUrls.length > 0) body.gallery = galleryUrls;
      if (keywordList.length > 0) body.keywords = keywordList;
      const nums: Record<string, string> = {
        totalUnits: fUnits,
        totalArea: fTotalArea,
        startPrice: fStart,
        endPrice: fEnd,
        pricePerSqm: fPerSqm,
        downPaymentMin: fDown,
        installmentYears: fYears,
        compoundArea: fCompoundArea,
        completionPercent: fCompletion,
      };
      for (const [key, raw] of Object.entries(nums)) {
        if (!raw.trim()) continue;
        const n = Number(raw.replace(/[^\d.]/g, ''));
        if (!Number.isFinite(n)) {
          setProblem(t('developer.numberRequired'));
          return;
        }
        body[key] = n;
      }
      await mutation.run('/api/developer/projects', 'POST', body);
      clearForm();
      setNotice(t('developer.submitCreated'));
      onChanged();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function resubmit(project: PortalProject) {
    setSubmittingId(project.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/developer/projects/${project.id}/submit`, 'POST', {});
      setNotice(t('developer.resubmitted'));
      onChanged();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <View style={styles.submitStack}>
      <Text style={[styles.hint, align]}>{t('developer.pendingInvisible')}</Text>

      <Card style={styles.submitIntroCard}>
        <SectionTitle>{t('developer.draftTitle')}</SectionTitle>
        <Text style={[styles.hint, align]}>{t('developer.draftHint')}</Text>
        {draftInfo ? <Text style={styles.muted}>{draftInfo}</Text> : null}
        <View style={[styles.actions, row]}>
          <Btn title={t('developer.draftRestore')} variant="ghost" onPress={() => void restoreDraft()} />
          <Btn title={t('developer.draftClear')} variant="ghost" onPress={() => void clearDraft()} />
        </View>
      </Card>

      {/* Live preview — prominent near the top, re-renders per keystroke. */}
      <Card style={styles.previewCard}>
        <SectionTitle
          action={
            <Btn
              title={showPreview ? t('developer.previewHide') : t('developer.previewShow')}
              variant="ghost"
              onPress={() => setShowPreview((prev) => !prev)}
            />
          }>
          {t('developer.previewTitle')}
        </SectionTitle>
        {showPreview ? (
          <View style={styles.previewBody}>
            {previewCover && !previewDead ? (
              <Image
                source={{ uri: previewCover }}
                style={styles.previewCover}
                onError={() => setPreviewDead(true)}
              />
            ) : (
              <View style={styles.previewCoverFallback}>
                <Text style={styles.previewFallbackText}>
                  {(fName.trim() || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.previewInfo}>
              <Text style={[styles.previewName, align]} numberOfLines={2}>
                {fName.trim() || t('developer.previewUntitled')}
              </Text>
              {fNameAr.trim() ? (
                <Text style={[styles.previewAr, align]} numberOfLines={1}>
                  {fNameAr.trim()}
                </Text>
              ) : null}
              <View style={[styles.previewMetaRow, row]}>
                <Badge tone={toneForStatus(fStatus)}>{humanise(fStatus)}</Badge>
                {previewPrice !== null && !Number.isNaN(previewPrice) ? (
                  <Text style={[styles.previewPrice, align]}>
                    {formatMoney(previewPrice, currency, rates)}
                  </Text>
                ) : null}
              </View>
              {previewPlace ? (
                <Text style={[styles.previewPlace, align]} numberOfLines={2}>
                  {previewPlace}
                </Text>
              ) : null}
              <Text style={[styles.hint, align]}>{t('developer.previewHint')}</Text>
            </View>
          </View>
        ) : null}
      </Card>

      <SubmitSection
        title={t('developer.sec.essentials')}
        filled={essCount}
        total={6}
        open={open.essentials}
        onToggle={() => toggleSection('essentials')}>
        <Field label={t('developer.submitName')} value={fName} onChangeText={setFName} />
        <Field label={t('developer.submitNameAr')} value={fNameAr} onChangeText={setFNameAr} />
        <Text style={[styles.formLabel, align]}>{t('developer.submitStatus')}</Text>
        <View style={[styles.chipRow, row]}>
          {PROJECT_STATUSES.map((value) => (
            <Chip
              key={value}
              label={humanise(value)}
              selected={fStatus === value}
              onPress={() => setFStatus(value)}
            />
          ))}
        </View>
        <Field label={t('developer.submitTagline')} value={fTagline} onChangeText={setFTagline} />
        <Field
          label={t('developer.submitTaglineAr')}
          value={fTaglineAr}
          onChangeText={setFTaglineAr}
        />
        <Field
          label={t('developer.submitDescription')}
          value={fDesc}
          onChangeText={setFDesc}
          multiline
          numberOfLines={3}
        />
        <Field
          label={t('developer.submitDescAr')}
          value={fDescAr}
          onChangeText={setFDescAr}
          multiline
          numberOfLines={3}
        />
      </SubmitSection>

      <SubmitSection
        title={t('developer.sec.location')}
        filled={locCount}
        total={4}
        open={open.location}
        onToggle={() => toggleSection('location')}>
        <Text style={styles.hint}>{t('developer.submitLocationHint')}</Text>
        {geo.loading ? (
          <Loading label={t('developer.geoLoading')} />
        ) : geoFailed || governorates.length === 0 ? (
          <>
            {geoFailed ? <ErrorBar message={t('developer.geoFailed')} onRetry={geo.refresh} /> : null}
            <Field label={t('developer.submitGovernorate')} value={fGov} onChangeText={setFGov} />
            <Field label={t('developer.submitCity')} value={fCity} onChangeText={setFCity} />
            <Field
              label={t('developer.submitDistrict')}
              value={fDistrict}
              onChangeText={setFDistrict}
            />
          </>
        ) : (
          <>
            <Text style={[styles.formLabel, align]}>{t('developer.submitGovernorate')}</Text>
            <View style={[styles.chipRow, row]}>
              {governorates.map((g) => (
                <Chip
                  key={g.id}
                  label={localized(g.name, g.nameArabic)}
                  selected={fGov === g.id}
                  onPress={() => pickGov(g.id)}
                />
              ))}
            </View>
            <Text style={[styles.formLabel, align]}>{t('developer.submitCity')}</Text>
            {!fGov ? (
              <Text style={styles.hint}>{t('developer.submitPickCityFirst')}</Text>
            ) : citiesForGov.length === 0 ? (
              <Text style={styles.hint}>{t('developer.submitNoCities')}</Text>
            ) : (
              <View style={[styles.chipRow, row]}>
                {citiesForGov.map((c) => (
                  <Chip
                    key={c.id}
                    label={localized(c.name, c.nameArabic)}
                    selected={fCity === c.id}
                    onPress={() => pickCity(c.id)}
                  />
                ))}
              </View>
            )}
            <Text style={[styles.formLabel, align]}>{t('developer.submitDistrict')}</Text>
            {!fCity ? (
              <Text style={styles.hint}>{t('developer.submitPickDistrictFirst')}</Text>
            ) : districtsForCity.length === 0 ? (
              <Text style={styles.hint}>{t('developer.submitNoDistricts')}</Text>
            ) : (
              <View style={[styles.chipRow, row]}>
                {districtsForCity.map((d) => (
                  <Chip
                    key={d.id}
                    label={localized(d.name, d.nameArabic)}
                    selected={fDistrict === d.id}
                    onPress={() => setFDistrict(d.id)}
                  />
                ))}
              </View>
            )}
          </>
        )}
        <Field label={t('developer.submitAddress')} value={fAddress} onChangeText={setFAddress} />
      </SubmitSection>

      <SubmitSection
        title={t('developer.sec.types')}
        filled={typesCount}
        total={8}
        open={open.types}
        onToggle={() => toggleSection('types')}>
        <Text style={[styles.formLabel, align]}>{t('developer.submitPropertyTypes')}</Text>
        <View style={[styles.chipRow, row]}>
          {UNIT_TYPES.map((value) => (
            <Chip
              key={value}
              label={humanise(value)}
              selected={fPropTypes.includes(value)}
              onPress={() => toggleMulti(fPropTypes, value, setFPropTypes)}
            />
          ))}
        </View>
        <Text style={[styles.formLabel, align]}>{t('developer.submitListingTypes')}</Text>
        <View style={[styles.chipRow, row]}>
          {LISTING_TYPES.map((value) => (
            <Chip
              key={value}
              label={humanise(value)}
              selected={fListingTypes.includes(value)}
              onPress={() => toggleMulti(fListingTypes, value, setFListingTypes)}
            />
          ))}
        </View>
        <Field
          label={t('developer.submitTotalUnits')}
          value={fUnits}
          onChangeText={setFUnits}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitTotalArea')}
          value={fTotalArea}
          onChangeText={setFTotalArea}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitCompoundArea')}
          value={fCompoundArea}
          onChangeText={setFCompoundArea}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitCompletion')}
          value={fCompletion}
          onChangeText={setFCompletion}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitDeliveryDate')}
          value={fDeliveryDate}
          onChangeText={setFDeliveryDate}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label={t('developer.submitDeliveryTerms')}
          value={fDeliveryTerms}
          onChangeText={setFDeliveryTerms}
          multiline
          numberOfLines={2}
        />
      </SubmitSection>

      <SubmitSection
        title={t('developer.sec.prices')}
        filled={pricesCount}
        total={5}
        open={open.prices}
        onToggle={() => toggleSection('prices')}>
        <PlanTemplates
          onPick={(down, years) => {
            setFDown(down);
            setFYears(years);
          }}
        />
        <Field
          label={t('developer.submitStartPrice')}
          value={fStart}
          onChangeText={setFStart}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitEndPrice')}
          value={fEnd}
          onChangeText={setFEnd}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitPerSqm')}
          value={fPerSqm}
          onChangeText={setFPerSqm}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitDownPayment')}
          value={fDown}
          onChangeText={setFDown}
          keyboardType="numeric"
        />
        <Field
          label={t('developer.submitYears')}
          value={fYears}
          onChangeText={setFYears}
          keyboardType="numeric"
        />
      </SubmitSection>

      <SubmitSection
        title={t('developer.sec.media')}
        filled={mediaCount}
        total={10}
        open={open.media}
        onToggle={() => toggleSection('media')}>
        <Field
          label={t('developer.submitCover')}
          value={fCover}
          onChangeText={(value) => {
            setFCover(value);
            setPreviewDead(false);
          }}
          autoCapitalize="none"
        />
        {previewCover && !previewDead ? (
          <Image
            source={{ uri: previewCover }}
            style={styles.mediaCover}
            onError={() => setPreviewDead(true)}
          />
        ) : null}
        <Field
          label={t('developer.submitGallery')}
          value={fGallery}
          onChangeText={setFGallery}
          multiline
          numberOfLines={3}
          autoCapitalize="none"
        />
        <Field
          label={t('developer.submitVideo')}
          value={fVideo}
          onChangeText={setFVideo}
          autoCapitalize="none"
        />
        <Field
          label={t('developer.submitTour')}
          value={fTour}
          onChangeText={setFTour}
          autoCapitalize="none"
        />
        <Field
          label={t('developer.submitMapsUrl')}
          value={fMapsUrl}
          onChangeText={setFMapsUrl}
          autoCapitalize="none"
        />
        <Field label={t('developer.submitLat')} value={fLat} onChangeText={setFLat} />
        <Field label={t('developer.submitLng')} value={fLng} onChangeText={setFLng} />
        <Field
          label={t('developer.submitMetaTitle')}
          value={fMetaTitle}
          onChangeText={setFMetaTitle}
        />
        <Field
          label={t('developer.submitMetaDesc')}
          value={fMetaDesc}
          onChangeText={setFMetaDesc}
          multiline
          numberOfLines={2}
        />
        <Field
          label={t('developer.submitKeywords')}
          value={fKeywords}
          onChangeText={setFKeywords}
          multiline
          numberOfLines={2}
        />
      </SubmitSection>

      <SubmitSection
        title={t('developer.sec.review')}
        filled={filledRows.length}
        total={34}
        open={open.review}
        onToggle={() => toggleSection('review')}>
        {issues.length > 0 ? (
          <View style={styles.reviewIssues}>
            <Text style={[styles.issueHead, align]}>{t('developer.reviewFixFirst')}</Text>
            {issues.map((issue, index) => (
              <Text key={`${issue.field}-${index}`} style={[styles.issueText, align]}>
                {`${issue.field}: ${issue.message}`}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={[styles.hint, align]}>{t('developer.reviewReady')}</Text>
        )}
        <SectionTitle>{t('developer.reviewSummary')}</SectionTitle>
        {filledRows.length === 0 ? (
          <Text style={[styles.hint, align]}>{t('developer.reviewEmpty')}</Text>
        ) : (
          <View style={styles.reviewList}>
            {filledRows.map(([label, value], index) => (
              <View key={label} style={styles.reviewRowWrap}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.reviewRow}>
                  <Row title={label} subtitle={value} />
                </View>
              </View>
            ))}
          </View>
        )}
        <Text style={[styles.hint, align]}>
          {missingOptionals.length > 0
            ? `${t('developer.reviewOptionalMissing')} (${missingOptionals.length}): ${missingOptionals.slice(0, 8).join(' · ')}${missingOptionals.length > 8 ? ' …' : ''}`
            : t('developer.reviewAllFilled')}
        </Text>
        <Text style={[styles.hint, align]}>{t('developer.pendingInvisible')}</Text>
        <Btn
          title={t('developer.reviewSend')}
          busy={mutation.busy}
          onPress={() => void submitProject()}
          style={styles.reviewConfirm}
        />
      </SubmitSection>

      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      <Card style={styles.submitIntroCard}>
        <SectionTitle>{t('developer.submissionsTitle')}</SectionTitle>
        <Text style={[styles.hint, align]}>{t('developer.submissionsHint')}</Text>
        {projects.length === 0 ? (
          <Empty title={t('developer.submissionsNone')} message={t('developer.submissionsNoneHint')} />
        ) : (
          projects.slice(0, MAX_ROWS).map((project, index) => {
            const resubmittable =
              project.approvalStatus === 'DRAFT' || project.approvalStatus === 'REJECTED';
            const managing = manageId === project.id;
            return (
              <View key={project.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={project.name}
                  subtitle={[project.location].filter(Boolean).join(' · ')}
                  badge={
                    <Badge tone={toneForStatus(project.approvalStatus)}>
                      {humanise(project.approvalStatus ?? 'DRAFT')}
                    </Badge>
                  }
                />
                {project.approvalStatus === 'REJECTED' ? (
                  <RejectionNote slug={project.slug} />
                ) : null}
                <View style={[styles.actions, row]}>
                  {resubmittable ? (
                    <Btn
                      title={t('developer.resubmit')}
                      busy={submittingId === project.id}
                      disabled={submittingId !== null}
                      onPress={() => void resubmit(project)}
                    />
                  ) : null}
                  <Btn
                    title={managing ? t('developer.hideManage') : t('developer.showManage')}
                    variant="ghost"
                    onPress={() => setManageId(managing ? null : project.id)}
                  />
                </View>
                {managing ? (
                  <View style={styles.expand}>
                    <Divider />
                    <ProjectInventory
                      projectId={project.id}
                      slug={project.slug}
                      onRequestEdit={onRequestEdit}
                      requestMode={requestMode}
                    />
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

/**
 * One collapsible block of the submit form. All open by default for a
 * spacious read — the badge shows how many of the section's fields are
 * filled, and the header toggle still lets the user collapse any section.
 */
function SubmitSection({
  title,
  filled,
  total,
  open,
  onToggle,
  children,
}: {
  title: string;
  filled: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { row, align } = useI18n();
  return (
    <Card style={styles.submitCard}>
      <Pressable onPress={onToggle} accessibilityRole="button" hitSlop={8}>
        <View style={[styles.secHead, row]}>
          <Text style={[styles.secTitle, align]}>{title}</Text>
          <Badge tone={filled > 0 ? 'blue' : 'muted'}>{`${filled}/${total}`}</Badge>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.mutedForeground}
          />
        </View>
      </Pressable>
      {open ? <View style={styles.submitForm}>{children}</View> : null}
    </Card>
  );
}

/**
 * The CEO's rejection reason for one own project. The portal list carries no
 * reason, so it is read through the owner preview — `GET
 * /api/projects/[slug]` returns the full row (reason included) to the owning
 * developer even while the project is invisible to the public.
 */
function RejectionNote({ slug }: { slug: string }) {
  const styles = useStyles();
  const { t, align } = useI18n();
  const { data, error, loading } = useApi<{ project?: { rejectionReason?: string | null } }>(
    `/api/projects/${encodeURIComponent(slug)}`,
  );

  if (loading) return <Loading label={t('common.loading')} />;
  if (error) return <Text style={styles.muted}>{error}</Text>;

  const reason = data?.project?.rejectionReason;
  if (!reason) return null;
  return (
    <View style={styles.reasonBox}>
      <Text style={[styles.reasonLabel, align]}>{t('developer.rejectionReason')}</Text>
      <Text style={[styles.reasonText, align]}>{reason}</Text>
    </View>
  );
}

type InventoryUnit = {
  id: string;
  name: string;
  unitType?: string;
  listingType?: string;
  area?: number | null;
  price: number;
  status?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
};

type PlanMilestone = {
  id: string;
  name: string;
  nameArabic?: string | null;
  percentage: number;
  monthNumber?: number | null;
  description?: string | null;
};

type InventoryPlan = {
  id: string;
  name: string;
  description?: string | null;
  downPaymentPct: number;
  installmentYears: number;
  milestones?: PlanMilestone[];
};

type DetailProject = {
  id: string;
  units?: InventoryUnit[];
  paymentPlans?: InventoryPlan[];
};

/** Milestone seed shape the plans route accepts (no client-side ids). */
type MilestoneSeed = {
  name: string;
  nameArabic?: string;
  percentage: number;
  monthNumber?: number;
  description?: string;
};

function seedOf(m: PlanMilestone): MilestoneSeed {
  return {
    name: m.name,
    ...(m.nameArabic ? { nameArabic: m.nameArabic } : {}),
    percentage: m.percentage,
    ...(m.monthNumber != null ? { monthNumber: m.monthNumber } : {}),
    ...(m.description ? { description: m.description } : {}),
  };
}

/**
 * Per-project units/plans manager on the developer contract:
 * `POST|PATCH|DELETE /api/developer/projects/[id]/units` and `/plans`
 * (DELETE takes `?id=`). Reads come from the same owner preview as the
 * rejection note — the full row with `units` and `paymentPlans`. Never sends
 * `projectId`/`developerId`: the path project wins server-side, and foreign
 * projects answer 403.
 */
function ProjectInventory({
  projectId,
  slug,
  onRequestEdit,
  requestMode,
}: {
  projectId: string;
  slug: string;
  onRequestEdit: (target: EditTarget) => void;
  requestMode?: boolean;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const mutation = useMutation();

  const [addingUnit, setAddingUnit] = useState(false);
  const [uName, setUName] = useState('');
  const [uType, setUType] = useState(UNIT_TYPES[0]);
  const [uListing, setUListing] = useState(LISTING_TYPES[0]);
  const [uArea, setUArea] = useState('');
  const [uPrice, setUPrice] = useState('');
  const [uBed, setUBed] = useState('');
  const [uBath, setUBath] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [eUName, setEUName] = useState('');
  const [eUPrice, setEUPrice] = useState('');
  const [addingPlan, setAddingPlan] = useState(false);
  const [pName, setPName] = useState('');
  const [pDown, setPDown] = useState('');
  const [pYears, setPYears] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [ePName, setEPName] = useState('');
  const [ePDown, setEPDown] = useState('');
  const [ePYears, setEPYears] = useState('');
  const [addingMsPlanId, setAddingMsPlanId] = useState<string | null>(null);
  const [msName, setMsName] = useState('');
  const [msPct, setMsPct] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refresh } = useApi<{ project?: DetailProject }>(
    `/api/projects/${encodeURIComponent(slug)}`,
  );

  async function write(
    key: string,
    run: () => Promise<void>,
    success?: string,
    onDenied?: () => void,
  ): Promise<boolean> {
    // REQUEST mode (portal `editMode`): direct PATCH/DELETE always answers
    // 403, so skip the round trip and go straight to the request flow when
    // the change is expressible. Unknown mode still falls through to the
    // 403 catch below.
    if (requestMode && onDenied) {
      onDenied();
      return false;
    }
    setBusyId(key);
    setProblem(null);
    setNotice(null);
    try {
      await run();
      if (success) setNotice(success);
      refresh();
      return true;
    } catch (e) {
      // REQUEST-mode 403: route into the edit-request flow (or its notice)
      // instead of printing a dead-end error.
      if (isRequestOnly(e) && onDenied) {
        onDenied();
        return false;
      }
      setProblem(e instanceof Error ? e.message : t('common.error'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  /** 403 on a change the request flow cannot express (status/hide/delete). */
  function blockedNotice() {
    setProblem(`${t('developer.reqOnly')} — ${t('developer.reqOnlyHint')}`);
  }

  const toNum = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = Number(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const toInt = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = Number(raw.replace(/\D/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  async function createUnit() {
    const area = toNum(uArea);
    const price = toNum(uPrice);
    if (!uName.trim() || area === null || area <= 0 || price === null || price <= 0) {
      setProblem(t('developer.unitRequired'));
      return;
    }
    const ok = await write(
      'create-unit',
      async () => {
        await mutation.run(`/api/developer/projects/${projectId}/units`, 'POST', {
          name: uName.trim(),
          unitType: uType,
          listingType: uListing,
          area,
          price,
          ...(toInt(uBed) != null ? { bedrooms: toInt(uBed) } : {}),
          ...(toInt(uBath) != null ? { bathrooms: toInt(uBath) } : {}),
        });
      },
      t('developer.unitCreated'),
    );
    if (ok) {
      setAddingUnit(false);
      setUName('');
      setUType(UNIT_TYPES[0]);
      setUListing(LISTING_TYPES[0]);
      setUArea('');
      setUPrice('');
      setUBed('');
      setUBath('');
    }
  }

  function openUnitEdit(unit: InventoryUnit) {
    setEditingUnitId(unit.id);
    setEUName(unit.name);
    setEUPrice(String(unit.price ?? ''));
    setProblem(null);
    setNotice(null);
  }

  async function saveUnit(unit: InventoryUnit) {
    const price = toNum(eUPrice);
    if (!eUName.trim() || price === null || price <= 0) {
      setProblem(t('developer.unitRequired'));
      return;
    }
    const ok = await write(
      unit.id,
      async () => {
        await mutation.run(`/api/developer/projects/${projectId}/units`, 'PATCH', {
          id: unit.id,
          name: eUName.trim(),
          price,
        });
      },
      t('developer.unitUpdated'),
      () =>
        onRequestEdit({
          entity: 'UNIT',
          entityId: unit.id,
          field: price !== unit.price ? 'price' : 'name',
          label: unit.name,
          value: price !== unit.price ? eUPrice : eUName,
        }),
    );
    if (ok) setEditingUnitId(null);
  }

  async function removeUnit(unit: InventoryUnit) {
    await write(
      unit.id,
      async () => {
        await mutation.run(
          `/api/developer/projects/${projectId}/units?id=${encodeURIComponent(unit.id)}`,
          'DELETE',
        );
        setEditingUnitId(null);
      },
      t('developer.unitDeleted'),
      blockedNotice,
    );
  }

  function confirmRemoveUnit(unit: InventoryUnit) {
    Alert.alert(t('developer.deleteUnitTitle'), t('developer.deleteUnitBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void removeUnit(unit) },
    ]);
  }

  async function createPlan() {
    const down = toNum(pDown);
    const years = toInt(pYears);
    if (!pName.trim() || down === null || years === null) {
      setProblem(t('developer.planRequired'));
      return;
    }
    const ok = await write(
      'create-plan',
      async () => {
        await mutation.run(`/api/developer/projects/${projectId}/plans`, 'POST', {
          name: pName.trim(),
          downPaymentPct: down,
          installmentYears: years,
          ...(pDesc.trim() ? { description: pDesc.trim() } : {}),
        });
      },
      t('developer.planCreated'),
    );
    if (ok) {
      setAddingPlan(false);
      setPName('');
      setPDown('');
      setPYears('');
      setPDesc('');
    }
  }

  function openPlanEdit(plan: InventoryPlan) {
    setEditingPlanId(plan.id);
    setAddingMsPlanId(null);
    setEPName(plan.name);
    setEPDown(String(plan.downPaymentPct));
    setEPYears(String(plan.installmentYears));
    setProblem(null);
    setNotice(null);
  }

  async function savePlan(plan: InventoryPlan) {
    const down = toNum(ePDown);
    const years = toInt(ePYears);
    if (!ePName.trim() || down === null || years === null) {
      setProblem(t('developer.planRequired'));
      return;
    }
    const ok = await write(
      plan.id,
      async () => {
        await mutation.run(`/api/developer/projects/${projectId}/plans`, 'PATCH', {
          id: plan.id,
          name: ePName.trim(),
          downPaymentPct: down,
          installmentYears: years,
        });
      },
      t('developer.planUpdated'),
      () => {
        const downChanged = down !== plan.downPaymentPct;
        const yearsChanged = years !== plan.installmentYears;
        onRequestEdit({
          entity: 'PLAN',
          entityId: plan.id,
          field: downChanged ? 'downPaymentPct' : yearsChanged ? 'installmentYears' : 'name',
          label: plan.name,
          value: downChanged ? ePDown : yearsChanged ? ePYears : ePName,
        });
      },
    );
    if (ok) setEditingPlanId(null);
  }

  /** `PATCH` replaces the whole milestone set — send it back plus the new one. */
  async function addMilestone(plan: InventoryPlan) {
    const percent = toNum(msPct);
    if (!msName.trim() || percent === null) {
      setProblem(t('developer.planRequired'));
      return;
    }
    const existing: MilestoneSeed[] = (plan.milestones ?? []).map(seedOf);
    const ok = await write(
      plan.id,
      async () => {
        await mutation.run(`/api/developer/projects/${projectId}/plans`, 'PATCH', {
          id: plan.id,
          milestones: [...existing, { name: msName.trim(), percentage: percent }],
        });
      },
      t('developer.planUpdated'),
      blockedNotice,
    );
    if (ok) {
      setAddingMsPlanId(null);
      setMsName('');
      setMsPct('');
    }
  }

  async function removePlan(plan: InventoryPlan) {
    await write(
      plan.id,
      async () => {
        await mutation.run(
          `/api/developer/projects/${projectId}/plans?id=${encodeURIComponent(plan.id)}`,
          'DELETE',
        );
        setEditingPlanId(null);
      },
      t('developer.planDeleted'),
      blockedNotice,
    );
  }

  function confirmRemovePlan(plan: InventoryPlan) {
    Alert.alert(t('developer.deletePlanTitle'), t('developer.deletePlanBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void removePlan(plan) },
    ]);
  }

  if (loading) return <Loading label={t('common.loading')} />;
  if (error) return <ErrorBar message={error} onRetry={refresh} />;

  const units = data?.project?.units ?? [];
  const plans = data?.project?.paymentPlans ?? [];

  return (
    <View style={styles.inventory}>
      <Text style={styles.hint}>{t('developer.manageHint')}</Text>
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      <SectionTitle>{t('developer.unitsTitle')}</SectionTitle>
      <Btn
        title={addingUnit ? t('common.close') : t('developer.addUnit')}
        variant={addingUnit ? 'ghost' : 'primary'}
        onPress={() => {
          setAddingUnit((prev) => !prev);
          setProblem(null);
        }}
      />
      {addingUnit ? (
        <View style={styles.form}>
          <Field label={t('developer.unitName')} value={uName} onChangeText={setUName} />
          <Text style={[styles.formLabel, align]}>{t('developer.unitType')}</Text>
          <View style={[styles.chipRow, row]}>
            {UNIT_TYPES.map((value) => (
              <Chip
                key={value}
                label={humanise(value)}
                selected={uType === value}
                onPress={() => setUType(value)}
              />
            ))}
          </View>
          <Text style={[styles.formLabel, align]}>{t('developer.listingType')}</Text>
          <View style={[styles.chipRow, row]}>
            {LISTING_TYPES.map((value) => (
              <Chip
                key={value}
                label={humanise(value)}
                selected={uListing === value}
                onPress={() => setUListing(value)}
              />
            ))}
          </View>
          <Field
            label={t('developer.unitArea')}
            value={uArea}
            onChangeText={setUArea}
            keyboardType="numeric"
          />
          <Field
            label={t('developer.unitPrice')}
            value={uPrice}
            onChangeText={setUPrice}
            keyboardType="numeric"
          />
          <Field
            label={t('developer.unitBedrooms')}
            value={uBed}
            onChangeText={setUBed}
            keyboardType="numeric"
          />
          <Field
            label={t('developer.unitBathrooms')}
            value={uBath}
            onChangeText={setUBath}
            keyboardType="numeric"
          />
          <Btn title={t('developer.addUnit')} busy={mutation.busy} onPress={() => void createUnit()} />
        </View>
      ) : null}

      {units.length === 0 ? <Text style={styles.muted}>{t('common.none')}</Text> : null}
      {units.slice(0, MAX_ROWS).map((unit, index) => {
        const isOpen = editingUnitId === unit.id;
        const busy = busyId === unit.id;
        return (
          <View key={unit.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={unit.name}
              subtitle={[
                unit.unitType ? humanise(unit.unitType) : null,
                unit.area != null ? `${unit.area} m²` : null,
                formatMoney(unit.price, currency, rates, { compact: true }),
              ]
                .filter(Boolean)
                .join(' · ')}
              badge={
                unit.status ? <Badge tone={toneForStatus(unit.status)}>{humanise(unit.status)}</Badge> : undefined
              }
              onPress={() => {
                if (isOpen) setEditingUnitId(null);
                else openUnitEdit(unit);
              }}
            />
            {isOpen ? (
              <View style={styles.editor}>
                <Field label={t('developer.unitName')} value={eUName} onChangeText={setEUName} />
                <Field
                  label={t('developer.editPrice')}
                  value={eUPrice}
                  onChangeText={setEUPrice}
                  keyboardType="numeric"
                />
                <Text style={[styles.formLabel, align]}>{t('common.status')}</Text>
                <View style={[styles.chipRow, row]}>
                  {UNIT_STATUSES.map((value) => (
                    <Chip
                      key={value}
                      label={humanise(value)}
                      disabled={busy}
                      selected={(unit.status ?? 'AVAILABLE') === value}
                      onPress={() => {
                        if ((unit.status ?? 'AVAILABLE') === value) return;
                        void write(
                          unit.id,
                          async () => {
                            await mutation.run(`/api/developer/projects/${projectId}/units`, 'PATCH', {
                              id: unit.id,
                              status: value,
                            });
                          },
                          t('developer.unitUpdated'),
                          blockedNotice,
                        );
                      }}
                    />
                  ))}
                </View>
                <View style={[styles.actions, row]}>
                  <Btn title={t('common.save')} busy={busy} onPress={() => void saveUnit(unit)} />
                  <Btn
                    title={t('common.delete')}
                    variant="danger"
                    disabled={busy}
                    onPress={() => confirmRemoveUnit(unit)}
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <SectionTitle>{t('developer.plansTitle')}</SectionTitle>
      <Btn
        title={addingPlan ? t('common.close') : t('developer.addPlan')}
        variant={addingPlan ? 'ghost' : 'primary'}
        onPress={() => {
          setAddingPlan((prev) => !prev);
          setProblem(null);
        }}
      />
      {addingPlan ? (
        <View style={styles.form}>
          <PlanTemplates
            onPick={(down, years) => {
              setPDown(down);
              setPYears(years);
            }}
          />
          <Field label={t('developer.planName')} value={pName} onChangeText={setPName} />
          <Field label={t('developer.planDesc')} value={pDesc} onChangeText={setPDesc} />
          <Field
            label={t('developer.planDown')}
            value={pDown}
            onChangeText={setPDown}
            keyboardType="numeric"
          />
          <Field
            label={t('developer.planYears')}
            value={pYears}
            onChangeText={setPYears}
            keyboardType="numeric"
          />
          <Btn title={t('developer.addPlan')} busy={mutation.busy} onPress={() => void createPlan()} />
        </View>
      ) : null}

      {plans.length === 0 ? <Text style={styles.muted}>{t('common.none')}</Text> : null}
      {plans.slice(0, MAX_ROWS).map((plan, index) => {
        const isOpen = editingPlanId === plan.id;
        const busy = busyId === plan.id;
        const milestones = plan.milestones ?? [];
        const isAddingMs = addingMsPlanId === plan.id;
        return (
          <View key={plan.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={plan.name}
              subtitle={`${plan.downPaymentPct}% · ${plan.installmentYears} ${t('developer.yearsShort')} · ${milestones.length}`}
              onPress={() => {
                if (isOpen) setEditingPlanId(null);
                else openPlanEdit(plan);
              }}
            />
            {isOpen ? (
              <View style={styles.editor}>
                <Field label={t('developer.planName')} value={ePName} onChangeText={setEPName} />
                <Field
                  label={t('developer.planDown')}
                  value={ePDown}
                  onChangeText={setEPDown}
                  keyboardType="numeric"
                />
                <Field
                  label={t('developer.planYears')}
                  value={ePYears}
                  onChangeText={setEPYears}
                  keyboardType="numeric"
                />
                <View style={[styles.actions, row]}>
                  <Btn title={t('common.save')} busy={busy} onPress={() => void savePlan(plan)} />
                  <Btn
                    title={t('common.delete')}
                    variant="danger"
                    disabled={busy}
                    onPress={() => confirmRemovePlan(plan)}
                  />
                </View>
                <Text style={[styles.formLabel, align]}>
                  {`${t('developer.milestones')} (${milestones.length})`}
                </Text>
                {milestones.map((m) => (
                  <Row key={m.id} title={m.name} right={<Text style={styles.count}>{`${m.percentage}%`}</Text>} />
                ))}
                <Btn
                  title={isAddingMs ? t('common.close') : t('developer.milestoneAdd')}
                  variant="ghost"
                  onPress={() => {
                    setAddingMsPlanId(isAddingMs ? null : plan.id);
                    setMsName('');
                    setMsPct('');
                  }}
                />
                {isAddingMs ? (
                  <View style={styles.form}>
                    <Field
                      label={t('developer.milestoneName')}
                      value={msName}
                      onChangeText={setMsName}
                    />
                    <Field
                      label={t('developer.milestonePct')}
                      value={msPct}
                      onChangeText={setMsPct}
                      keyboardType="numeric"
                    />
                    <Btn
                      title={t('developer.milestoneAdd')}
                      busy={busy}
                      onPress={() => void addMilestone(plan)}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Milestones for one project, fetched only while its row is open.
 *
 * Own-project submissions come back as `PENDING` because a developer cannot
 * approve their own work — the badge says so instead of pretending it is live.
 */
function Milestones({ projectId }: { projectId: string }) {
  const styles = useStyles();
  const { t } = useI18n();
  const { data, error, loading } = useApi<{ milestones?: Milestone[] }>(
    `/api/milestones?projectId=${encodeURIComponent(projectId)}`,
  );

  if (loading) return <Loading label={t('common.loading')} />;
  if (error) return <ErrorBar message={error} />;

  const items = data?.milestones ?? [];
  if (items.length === 0) return <Text style={styles.muted}>{t('developer.noMilestones')}</Text>;

  return (
    <View style={styles.milestoneList}>
      <SectionTitle>{t('developer.milestones')}</SectionTitle>
      {items.map((m, index) => (
        <View key={m.id}>
          {index > 0 ? <Divider /> : null}
          <Row
            title={m.title}
            subtitle={[m.date ? new Date(m.date).toLocaleDateString() : null, m.progressPercent != null ? `${m.progressPercent}%` : null]
              .filter(Boolean)
              .join(' · ')}
            badge={
              <View style={styles.chipRowTight}>
                <Badge tone={m.status === 'COMPLETED' ? 'green' : 'gold'}>{humanise(m.status ?? 'PLANNED')}</Badge>
                {m.approvalStatus && m.approvalStatus !== 'APPROVED' ? (
                  <Badge tone="blue">{t('developer.milestonePending')}</Badge>
                ) : null}
              </View>
            }
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Clipboard without a new dependency — same approach as `src/app/viewings.tsx`:
 * web gets the browser clipboard, native falls back to the core module.
 */
async function writeToClipboard(value: string): Promise<boolean> {
  const globals = globalThis as unknown as {
    navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
  };
  const webClipboard = globals.navigator?.clipboard;
  if (webClipboard?.writeText) {
    try {
      await webClipboard.writeText(value);
      return true;
    } catch {
      // Permission denied or insecure context — try the native path.
    }
  }
  try {
    Clipboard.setString(value);
    return true;
  } catch {
    return false;
  }
}

type ProjectStatsPayload = {
  views: number;
  inquiries: number;
  leads: number;
  unitsTotal: number;
  unitsAvailable: number;
};

type ActivityLog = {
  id: string;
  action: string;
  createdAt: string;
  user?: { name?: string | null } | null;
};

/**
 * Per-project tools on the confirmed developer contracts. Mounted only while
 * its row is expanded, so every `useApi` below fires lazily — one project at
 * a time, never the whole list.
 */
function ProjectTools({
  project,
  onChanged,
  onRequestEdit,
  requestMode,
}: {
  project: PortalProject;
  onChanged: () => void;
  onRequestEdit: (target: EditTarget) => void;
  requestMode?: boolean;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const router = useRouter();
  const { session } = useAuth();
  const mutation = useMutation();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  const hidden = !project.isActive || project.approvalStatus === 'HIDDEN';

  async function duplicate() {
    setBusyKey('duplicate');
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/developer/projects/${project.id}/duplicate`, 'POST', {});
      setNotice(t('developer.duplicated'));
      onChanged();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyKey(null);
    }
  }

  function openOwnerPreview() {
    router.push({ pathname: '/project/[slug]', params: { slug: project.slug, preview: '1' } });
  }

  async function sharePreview() {
    setBusyKey('share');
    setProblem(null);
    try {
      const res = await apiFetch<{ url?: string }>(
        `/api/developer/projects/${project.id}/preview-link`,
        { token: session?.token },
      );
      if (!res?.url) throw new Error(t('common.error'));
      await Share.share({
        message: `${project.name}\n${res.url}\n${t('developer.sharePreviewNote')}`,
        url: res.url,
      });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyKey(null);
    }
  }

  function confirmVisibility() {
    const nextHidden = !hidden;
    Alert.alert(
      t(nextHidden ? 'developer.hideTitle' : 'developer.unhideTitle'),
      t(nextHidden ? 'developer.hideBody' : 'developer.unhideBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: nextHidden ? t('developer.hideProject') : t('developer.unhideProject'),
          style: nextHidden ? 'destructive' : 'default',
          onPress: () => void flipVisibility(nextHidden),
        },
      ],
    );
  }

  async function flipVisibility(nextHidden: boolean) {
    setBusyKey('visibility');
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run(`/api/developer/projects/${project.id}/visibility`, 'POST', {
        hidden: nextHidden,
      });
      setNotice(t('developer.visibilityUpdated'));
      onChanged();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <View style={styles.inventory}>
      <SectionTitle>{t('developer.projectTools')}</SectionTitle>
      <Text style={styles.hint}>{t('developer.ownerPreviewHint')}</Text>
      <View style={[styles.actions, row]}>
        <Btn
          title={busyKey === 'duplicate' ? t('developer.duplicating') : t('developer.duplicate')}
          busy={busyKey === 'duplicate'}
          disabled={busyKey !== null}
          onPress={() => void duplicate()}
        />
        <Btn title={t('developer.ownerPreview')} variant="ghost" onPress={openOwnerPreview} />
      </View>
      <View style={[styles.actions, row]}>
        <Btn
          title={busyKey === 'share' ? t('developer.sharingPreview') : t('developer.sharePreview')}
          variant="ghost"
          busy={busyKey === 'share'}
          disabled={busyKey !== null}
          onPress={() => void sharePreview()}
        />
        <Btn
          title={hidden ? t('developer.unhideProject') : t('developer.hideProject')}
          variant={hidden ? 'ghost' : 'danger'}
          disabled={busyKey !== null}
          busy={busyKey === 'visibility'}
          onPress={confirmVisibility}
        />
      </View>
      <Text style={styles.hint}>{t('developer.visibilityNote')}</Text>
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      <ProjectStats projectId={project.id} />
      <CompletionCheck slug={project.slug} />

      <Btn
        title={activityOpen ? t('developer.activityHide') : t('developer.activityShow')}
        variant="ghost"
        onPress={() => setActivityOpen((prev) => !prev)}
      />
      {activityOpen ? <ActivityList projectId={project.id} /> : null}

      <CsvImport projectId={project.id} onChanged={onChanged} />
      <BulkImages
        projectId={project.id}
        slug={project.slug}
        onChanged={onChanged}
        onRequestEdit={onRequestEdit}
        requestMode={requestMode}
      />
    </View>
  );
}

/** `GET /api/developer/projects/[id]/stats` — counters only, four states. */
function ProjectStats({ projectId }: { projectId: string }) {
  const styles = useStyles();
  const { t, align } = useI18n();
  const { data, error, loading, refresh } = useApi<ProjectStatsPayload>(
    `/api/developer/projects/${projectId}/stats`,
  );

  if (loading) return <Loading label={t('common.loading')} />;
  if (error) return <ErrorBar message={error} onRetry={refresh} />;
  if (!data) return <Text style={styles.muted}>{t('common.none')}</Text>;

  const rows: [string, number][] = [
    [t('developer.stat.views'), data.views ?? 0],
    [t('developer.stat.inquiries'), data.inquiries ?? 0],
    [t('developer.stat.leads'), data.leads ?? 0],
    [t('developer.unitsTotal'), data.unitsTotal ?? 0],
    [t('developer.unitsAvailable'), data.unitsAvailable ?? 0],
  ];
  return (
    <View style={styles.inventory}>
      <SectionTitle>{t('developer.statsTitle')}</SectionTitle>
      {rows.map(([label, value]) => (
        <Row
          key={label}
          title={label}
          right={<Text style={[styles.count, align]}>{value.toLocaleString()}</Text>}
        />
      ))}
    </View>
  );
}

type CompletionProject = {
  coverImage?: string | null;
  descriptionArabic?: string | null;
  gallery?: string | string[] | null;
  startPrice?: number | null;
  totalUnits?: number | null;
  governorate?: { name?: string } | null;
  city?: { name?: string } | null;
  district?: { name?: string } | null;
  address?: string | null;
  units?: { id: string }[];
  paymentPlans?: { id: string }[];
};

function parseGallery(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Listing completeness bar read through the same owner preview as the
 * rejection note (`GET /api/projects/[slug]` shows the owning developer the
 * full row). Missing list: cover / descAr / gallery≥3 / price / plans≥1 /
 * units≥1 / location.
 */
function CompletionCheck({ slug }: { slug: string }) {
  const styles = useStyles();
  const { t, align } = useI18n();
  const { data, error, loading, refresh } = useApi<{ project?: CompletionProject }>(
    `/api/projects/${encodeURIComponent(slug)}`,
  );

  if (loading) return <Loading label={t('common.loading')} />;
  if (error) return <ErrorBar message={error} onRetry={refresh} />;
  const p = data?.project;
  if (!p) return <Text style={styles.muted}>{t('common.none')}</Text>;

  const checks: [string, boolean][] = [
    ['developer.missCover', Boolean(p.coverImage)],
    ['developer.missDescAr', Boolean(p.descriptionArabic?.trim())],
    ['developer.missGallery', parseGallery(p.gallery).length >= 3],
    ['developer.missPrice', p.startPrice != null],
    ['developer.missPlans', (p.paymentPlans?.length ?? 0) >= 1],
    ['developer.missUnits', (p.units?.length ?? 0) >= 1 || (p.totalUnits ?? 0) >= 1],
    [
      'developer.missLocation',
      Boolean(p.governorate || p.city || p.district || p.address?.trim()),
    ],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const pct = Math.round((done / checks.length) * 100);
  const missing = checks.filter(([, ok]) => !ok);

  return (
    <View style={styles.inventory}>
      <SectionTitle>{t('developer.completionTitle')}</SectionTitle>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{`${done}/${checks.length} · ${pct}%`}</Text>
      {missing.length === 0 ? (
        <Text style={[styles.notice, align]}>{t('developer.completionReady')}</Text>
      ) : (
        <>
          <Text style={[styles.formLabel, align]}>{t('developer.completionMissing')}</Text>
          {missing.map(([key]) => (
            <Text key={key} style={[styles.muted, align]}>
              {`• ${t(key as 'developer.missCover')}`}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

/** `GET /api/developer/projects/[id]/activity` — CEO-shaped `{ logs }`, may be `[]`. */
function ActivityList({ projectId }: { projectId: string }) {
  const styles = useStyles();
  const { t, align } = useI18n();
  const { data, error, loading, refresh } = useApi<{ logs?: ActivityLog[] }>(
    `/api/developer/projects/${projectId}/activity`,
  );

  if (loading) return <Loading label={t('common.loading')} />;
  if (error) return <ErrorBar message={error} onRetry={refresh} />;
  const logs = data?.logs ?? [];
  if (logs.length === 0) return <Text style={[styles.muted, align]}>{t('developer.activityEmpty')}</Text>;

  return (
    <View style={styles.inventory}>
      <SectionTitle>{t('developer.activityTitle')}</SectionTitle>
      {logs.slice(0, 50).map((log, index) => (
        <View key={log.id}>
          {index > 0 ? <Divider /> : null}
          <Row
            title={humanise(log.action)}
            subtitle={[log.user?.name, log.createdAt ? timeAgo(log.createdAt) : null]
              .filter(Boolean)
              .join(' · ')}
          />
        </View>
      ))}
    </View>
  );
}

const CSV_HEADER = 'name,unitType,listingType,area,price,bedrooms,bathrooms,unitNumber,floor,finishingType,isSample';

/** Minimal RFC-4180 line splitter — quoted commas stay inside one cell. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function numOr(raw: string): number | string {
  if (raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

function boolOr(raw: string): boolean | string {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return raw;
}

/**
 * CSV import into `POST …/units/bulk` (cap 200). Template header is shown +
 * copyable, parse limits are reported, the bulk POST result reports
 * `{ created, failed }` with every failed row listed.
 */
function CsvImport({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const mutation = useMutation();
  const [fileName, setFileName] = useState<string | null>(null);
  const [units, setUnits] = useState<Record<string, unknown>[]>([]);
  const [capped, setCapped] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [reading, setReading] = useState(false);
  const [headerCopied, setHeaderCopied] = useState(false);
  const [created, setCreated] = useState<number | null>(null);
  const [failed, setFailed] = useState<{ index: number; error: string }[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  async function copyHeader() {
    const ok = await writeToClipboard(CSV_HEADER);
    if (ok) {
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 2000);
    }
  }

  async function pickFile() {
    setReading(true);
    setProblem(null);
    setCreated(null);
    setFailed([]);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '.csv', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      let text: string;
      if (asset.file && typeof asset.file.text === 'function') {
        text = await asset.file.text();
      } else {
        text = await readAsStringAsync(asset.uri);
      }
      parseText(text, asset.name);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setReading(false);
    }
  }

  function parseText(text: string, name: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (lines.length < 2) {
      setProblem(t('developer.csvEmpty'));
      return;
    }
    const header = splitCsvLine(lines[0].toLowerCase());
    const expected = CSV_HEADER.split(',');
    const headerOk =
      header.length === expected.length && expected.every((col, i) => header[i] === col);
    if (!headerOk) {
      setProblem(t('developer.csvEmpty'));
      return;
    }
    const rows: Record<string, unknown>[] = [];
    let skip = 0;
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      if (cells.every((cell) => cell === '')) {
        skip++;
        continue;
      }
      const row: Record<string, unknown> = {};
      expected.forEach((col, i) => {
        const raw = cells[i] ?? '';
        if (raw === '') return;
        if (col === 'area' || col === 'price' || col === 'bedrooms' || col === 'bathrooms' || col === 'floor') {
          const v = numOr(raw);
          if (v !== '') row[col] = v;
        } else if (col === 'isSample') {
          row[col] = boolOr(raw);
        } else {
          row[col] = raw;
        }
      });
      rows.push(row);
    }
    setCapped(rows.length > 200);
    setUnits(rows.slice(0, 200));
    setSkipped(skip);
    setFileName(name);
  }

  async function sendRows() {
    if (units.length === 0) {
      setProblem(t('developer.csvEmpty'));
      return;
    }
    setProblem(null);
    setCreated(null);
    setFailed([]);
    try {
      const res = await mutation.run(
        `/api/developer/projects/${projectId}/units/bulk`,
        'POST',
        { units },
      );
      const body = res as { created?: number; failed?: { index: number; error: string }[] };
      setCreated(body.created ?? 0);
      setFailed(Array.isArray(body.failed) ? body.failed : []);
      onChanged();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  return (
    <View style={styles.inventory}>
      <SectionTitle>{t('developer.csvTitle')}</SectionTitle>
      <Text style={styles.hint}>{t('developer.csvHint')}</Text>
      <Text style={[styles.formLabel, align]}>{t('developer.csvTemplate')}</Text>
      <Text style={styles.csvHeader} selectable>
        {CSV_HEADER}
      </Text>
      <View style={[styles.actions, row]}>
        <Btn
          title={headerCopied ? t('developer.copied') : t('developer.csvCopy')}
          variant="ghost"
          onPress={() => void copyHeader()}
        />
        <Btn
          title={reading ? t('developer.csvReading') : t('developer.csvPick')}
          busy={reading}
          disabled={reading}
          onPress={() => void pickFile()}
        />
      </View>
      {fileName ? (
        <Text style={[styles.muted, align]}>
          {`${fileName} · ${units.length} ${t('developer.csvParsed')}${skipped > 0 ? ` · ${skipped} ∅` : ''}`}
        </Text>
      ) : null}
      {capped ? <ErrorBar message={t('developer.csvCapped')} /> : null}
      {units.length > 0 ? (
        <Btn
          title={`${t('developer.csvSend')} (${units.length})`}
          busy={mutation.busy}
          disabled={mutation.busy}
          onPress={() => void sendRows()}
        />
      ) : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {created !== null ? (
        <Text style={[styles.notice, align]}>
          {`${created} ${t('developer.csvCreated')}${failed.length > 0 ? ` · ${failed.length} ${t('developer.csvFailed')}` : ''}`}
        </Text>
      ) : null}
      {failed.map((f) => (
        <Text key={f.index} style={[styles.issueText, align]}>
          {`#${f.index}: ${f.error}`}
        </Text>
      ))}
    </View>
  );
}

/**
 * Bulk gallery upload: multi-pick via `expo-image-picker`, each asset POSTed
 * to `/api/developer/upload` in the `file` field exactly per
 * `lib/image-upload.ts`. Successful URLs are appended to the project's own
 * gallery (`PATCH /api/developer/projects/[id]` with existing + new URLs),
 * then the portal refreshes — edits to a published project go live
 * immediately. Copy-all stays as a fallback (when the gallery PATCH fails,
 * nothing uploaded is lost); per-file upload failures are counted below.
 */
function BulkImages({
  projectId,
  slug,
  onChanged,
  onRequestEdit,
  requestMode,
}: {
  projectId: string;
  slug: string;
  onChanged: () => void;
  onRequestEdit: (target: EditTarget) => void;
  requestMode?: boolean;
}) {
  const styles = useStyles();
  const { t, align } = useI18n();
  const { session } = useAuth();
  const mutation = useMutation();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function pick() {
    setUploading(true);
    setProblem(null);
    setNotice(null);
    setFailedCount(0);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
      const done: string[] = [];
      let failed = 0;
      let merged: string[] = [];
      for (const asset of res.assets) {
        try {
          done.push(
            await uploadImageAsset(asset, session?.token ?? null, '/api/developer/upload'),
          );
        } catch {
          failed++;
        }
      }
      setUrls((prev) => [...prev, ...done]);
      setFailedCount(failed);
      if (done.length === 0) {
        if (failed > 0) setProblem(t('common.error'));
        return;
      }
      // Append to the project gallery (existing + new), then refresh.
      setSaving(true);
      try {
        const detail = await apiFetch<{ project?: { gallery?: unknown } }>(
          `/api/projects/${encodeURIComponent(slug)}`,
          { token: session?.token },
        );
        merged = [...parseGallery(detail?.project?.gallery), ...done];
        // REQUEST mode (portal `editMode`): the gallery PATCH always answers
        // 403, so ask for it directly instead of burning the round trip.
        if (requestMode) {
          setProblem(`${t('developer.reqOnly')} — ${t('developer.reqOnlyHint')}`);
          onRequestEdit({
            entity: 'PROJECT',
            entityId: projectId,
            field: 'gallery',
            label: t('developer.bulkImagesTitle'),
            value: JSON.stringify(merged),
          });
          return;
        }
        await mutation.run(`/api/developer/projects/${projectId}`, 'PATCH', {
          gallery: merged,
        });
        setNotice(t('developer.bulkImagesAppended'));
        onChanged();
      } catch (e) {
        // REQUEST-mode gallery write → ask for it instead of failing silent.
        if (isRequestOnly(e)) {
          setProblem(`${t('developer.reqOnly')} — ${t('developer.reqOnlyHint')}`);
          onRequestEdit({
            entity: 'PROJECT',
            entityId: projectId,
            field: 'gallery',
            label: t('developer.bulkImagesTitle'),
            value: JSON.stringify(merged),
          });
        } else {
          setProblem(e instanceof Error ? e.message : t('common.error'));
        }
      } finally {
        setSaving(false);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setUploading(false);
    }
  }

  async function copyAll() {
    const ok = await writeToClipboard(urls.join('\n'));
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  }

  const busy = uploading || saving;

  return (
    <View style={styles.inventory}>
      <SectionTitle>{t('developer.bulkImagesTitle')}</SectionTitle>
      <Text style={styles.hint}>{t('developer.bulkImagesHint')}</Text>
      <Btn
        title={uploading ? t('developer.bulkImagesWorking') : t('developer.bulkImagesPick')}
        variant="ghost"
        busy={busy}
        disabled={busy}
        onPress={() => void pick()}
      />
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}
      {urls.length > 0 || failedCount > 0 ? (
        <Text style={[styles.muted, align]}>
          {`${urls.length} ${t('developer.bulkImagesDone')}${failedCount > 0 ? ` · ${failedCount} ✕` : ''}`}
        </Text>
      ) : null}
      {urls.slice(-10).map((url) => (
        <Text key={url} style={[styles.csvHeader, align]} selectable numberOfLines={1}>
          {url}
        </Text>
      ))}
      {urls.length > 0 ? (
        <Btn
          title={copiedAll ? t('developer.copied') : t('developer.bulkImagesCopyAll')}
          variant="ghost"
          onPress={() => void copyAll()}
        />
      ) : null}
    </View>
  );
}

/** Payment-plan presets: `downPct/years` pairs printed on each chip. */
const PLAN_TEMPLATES: { label: string; down: number; years: number }[] = [
  { label: '10/90', down: 10, years: 9 },
  { label: '20/80', down: 20, years: 8 },
  { label: '30/70', down: 30, years: 7 },
];

function PlanTemplates({
  onPick,
}: {
  onPick: (down: string, years: string) => void;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  return (
    <View style={styles.inventory}>
      <Text style={[styles.formLabel, align]}>{t('developer.templatesTitle')}</Text>
      <Text style={styles.hint}>{t('developer.templatesHint')}</Text>
      <View style={[styles.chipRow, row]}>
        {PLAN_TEMPLATES.map((tpl) => (
          <Chip
            key={tpl.label}
            label={`${tpl.label} · ↓${tpl.down}% · ${tpl.years}y`}
            selected={false}
            onPress={() => onPick(String(tpl.down), String(tpl.years))}
          />
        ))}
      </View>
    </View>
  );
}

type DevViewing = {
  id: string;
  scheduledAt: string;
  status: string;
  project?: { name: string } | null;
  unit?: { name?: string; project?: { name: string } | null } | null;
};

/**
 * Send-edit-request sheet — opened wherever a direct PATCH/DELETE answers
 * 403 in REQUEST mode (unit/plan saves, gallery append). One whitelisted
 * field per request: `POST /api/developer/edit-requests
 * { entity, entityId, field, newValue, message? }` → 201 `{ request }`,
 * applied only on CEO approval. The submission is also logged on-device so
 * My requests below can still track it when the server list is unreachable.
 */
function EditRequestSheet({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const mutation = useMutation();
  const [field, setField] = useState(
    REQ_FIELDS[target.entity].includes(target.field)
      ? target.field
      : REQ_FIELDS[target.entity][0],
  );
  const [value, setValue] = useState(target.value ?? '');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!value.trim()) {
      setProblem(t('developer.reqValueRequired'));
      return;
    }
    setProblem(null);
    try {
      const res = await mutation.run('/api/developer/edit-requests', 'POST', {
        entity: target.entity,
        entityId: target.entityId,
        field,
        newValue: value.trim(),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      const request = (res as { request?: { id?: unknown } })?.request;
      await appendReqLog({
        id: typeof request?.id === 'string' ? request.id : `${Date.now()}`,
        entity: target.entity,
        entityId: target.entityId,
        field,
        newValue: value.trim(),
        message: message.trim() || null,
        createdAt: new Date().toISOString(),
      });
      setSent(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  return (
    <Card style={styles.reqSheet}>
      <SectionTitle
        action={<Btn title={t('common.close')} variant="ghost" onPress={onClose} />}>
        {t('developer.reqOpen')}
      </SectionTitle>
      <Text style={[styles.hint, align]}>{t('developer.reqOnlyHint')}</Text>
      <Row title={`${target.entity} · ${target.label}`} subtitle={target.entityId} />
      <View style={[styles.chipRow, row]}>
        {REQ_FIELDS[target.entity].map((name) => (
          <Chip
            key={name}
            label={humanise(name)}
            selected={field === name}
            onPress={() => setField(name)}
          />
        ))}
      </View>
      <Field
        label={t('developer.reqNewValue')}
        value={value}
        onChangeText={setValue}
        multiline
        numberOfLines={3}
        autoCapitalize="none"
      />
      <Field
        label={t('developer.reqMessage')}
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={2}
      />
      {problem ? <ErrorBar message={problem} /> : null}
      {sent ? <Text style={[styles.notice, align]}>{`${t('developer.reqSent')} ✓`}</Text> : null}
      {sent ? (
        <Btn title={t('common.close')} variant="ghost" onPress={onClose} />
      ) : (
        <Btn title={t('developer.reqSend')} busy={mutation.busy} onPress={() => void send()} />
      )}
    </Card>
  );
}

type DecisionNotif = {
  id: string;
  type?: string;
  title: string;
  message: string;
  metadata?: string | null;
  createdAt: string;
};

function parseDecisionMeta(raw: string | null | undefined): { requestId?: string; decision?: string } {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Record<string, unknown>;
      return {
        ...(typeof rec.requestId === 'string' ? { requestId: rec.requestId } : {}),
        ...(typeof rec.decision === 'string' ? { decision: rec.decision } : {}),
      };
    }
  } catch {
    // Corrupt metadata — fall through to message sniffing below.
  }
  return {};
}

/**
 * My requests — the server list `GET /api/developer/edit-requests` (the
 * caller's own rows, newest-first, with the CEO's decision + reason).
 * The on-device log joined against `EDIT_REQUEST_DECISION` notifications is
 * kept as the fallback, used only when the server list fails.
 */
function EditRequestsCard() {
  const styles = useStyles();
  const { t, align } = useI18n();
  const server = useApi<{ requests?: ServerEditRequest[] }>('/api/developer/edit-requests');
  const fallbackToLog = server.error !== null;

  const [log, setLog] = useState<LoggedRequest[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const { data, error, loading, refreshing, refresh } = useApi<{
    notifications?: DecisionNotif[];
  }>(fallbackToLog ? '/api/notifications?limit=100' : null);

  function reloadLog() {
    if (!fallbackToLog) return;
    setLoadingLog(true);
    readReqLog()
      .then(setLog)
      .catch(() => {})
      .finally(() => setLoadingLog(false));
  }

  useEffect(() => {
    reloadLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackToLog]);

  function reloadAll() {
    server.refresh();
    reloadLog();
    refresh();
  }

  // Server path: authoritative status + reason per row.
  if (!fallbackToLog) {
    const requests = server.data?.requests ?? [];
    return (
      <Card>
        <SectionTitle action={<Btn title="↻" variant="ghost" onPress={reloadAll} />}>
          {t('developer.reqMine')}
        </SectionTitle>
        <Text style={[styles.hint, align]}>{t('developer.reqMineHint')}</Text>
        {server.loading ? <Loading label={t('common.loading')} /> : null}
        {!server.loading && requests.length === 0 ? (
          <Empty title={t('developer.reqEmpty')} message={t('developer.reqMineHint')} />
        ) : null}
        {requests.map((req, index) => {
          const status =
            req.status === 'APPROVED' ? 'APPROVED' : req.status === 'REJECTED' ? 'REJECTED' : 'PENDING';
          return (
            <View key={`${req.id}-${index}`}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={`${req.entity} · ${humanise(req.field)}`}
                subtitle={[req.project?.name ?? null, req.newValue].filter(Boolean).join(' · ')}
                badge={
                  <Badge
                    tone={status === 'APPROVED' ? 'green' : status === 'REJECTED' ? 'red' : 'gold'}>
                    {status === 'APPROVED'
                      ? t('developer.reqApproved')
                      : status === 'REJECTED'
                        ? t('developer.reqRejected')
                        : t('developer.reqPending')}
                  </Badge>
                }
                right={<Text style={styles.muted}>{timeAgo(req.createdAt)}</Text>}
              />
              {req.reason ? (
                <Text style={[styles.muted, align]}>
                  {`${t('developer.reqCeoNote')}: ${req.reason}`}
                </Text>
              ) : null}
            </View>
          );
        })}
        {!server.refreshing ? null : <Loading label={t('common.loading')} />}
      </Card>
    );
  }

  const decisions = new Map<string, { decision: string; reason: string | null }>();
  for (const n of data?.notifications ?? []) {
    if (n.type !== 'EDIT_REQUEST_DECISION') continue;
    const meta = parseDecisionMeta(n.metadata);
    if (!meta.requestId) continue;
    const decision =
      meta.decision ?? (n.message.includes('approved') ? 'APPROVED' : 'REJECTED');
    const reason = n.message.includes('Reason:')
      ? (n.message.split('Reason: ')[1]?.trim() || null)
      : null;
    decisions.set(meta.requestId, { decision, reason });
  }

  return (
    <Card>
      <SectionTitle action={<Btn title="↻" variant="ghost" onPress={reloadAll} />}>
        {t('developer.reqMine')}
      </SectionTitle>
      <Text style={[styles.hint, align]}>{t('developer.reqMineHint')}</Text>
      {loading || loadingLog ? <Loading label={t('common.loading')} /> : null}
      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {!loading && !loadingLog && !error && log.length === 0 ? (
        <Empty title={t('developer.reqEmpty')} message={t('developer.reqMineHint')} />
      ) : null}
      {log.map((req, index) => {
        const verdict = decisions.get(req.id);
        const status = verdict?.decision ?? 'PENDING';
        return (
          <View key={`${req.id}-${index}`}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={`${req.entity} · ${req.field}`}
              subtitle={req.newValue}
              badge={
                <Badge
                  tone={status === 'APPROVED' ? 'green' : status === 'REJECTED' ? 'red' : 'gold'}>
                  {status === 'APPROVED'
                    ? t('developer.reqApproved')
                    : status === 'REJECTED'
                      ? t('developer.reqRejected')
                      : t('developer.reqPending')}
                </Badge>
              }
            />
            {verdict?.reason ? (
              <Text style={[styles.muted, align]}>
                {`${t('developer.reqCeoNote')}: ${verdict.reason}`}
              </Text>
            ) : null}
          </View>
        );
      })}
      {!refreshing ? null : <Loading label={t('common.loading')} />}
    </Card>
  );
}

/** Compare + viewings-by-day + quick replies live in the Manage tab. */
function ManageTab({ projects }: { projects: PortalProject[] }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [copiedReply, setCopiedReply] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useApi<{ viewings?: DevViewing[] }>(
    '/api/viewings?limit=100',
  );

  function toggleCompare(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function copyReply(key: 'developer.replySoon' | 'developer.replyVisit' | 'developer.replyDocs' | 'developer.replyThanks') {
    const ok = await writeToClipboard(t(key));
    if (ok) {
      setCopiedReply(key);
      setTimeout(() => setCopiedReply((cur) => (cur === key ? null : cur)), 2000);
    }
  }

  const chosen = selected
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is PortalProject => Boolean(p));

  const viewings = data?.viewings ?? [];
  const groups = new Map<string, DevViewing[]>();
  for (const v of viewings) {
    const day = new Date(v.scheduledAt).toDateString();
    const list = groups.get(day);
    if (list) list.push(v);
    else groups.set(day, [v]);
  }
  const days = [...groups.entries()].sort(
    ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
  );

  const replyKeys = [
    'developer.replySoon',
    'developer.replyVisit',
    'developer.replyDocs',
    'developer.replyThanks',
  ] as const;

  return (
    <>
      <EditRequestsCard />

      <Card>
        <SectionTitle>{t('developer.compareTitle')}</SectionTitle>
        <Text style={styles.hint}>{t('developer.compareHint')}</Text>
        <Text style={[styles.formLabel, align]}>{t('developer.comparePick')}</Text>
        <View style={[styles.chipRow, row]}>
          {projects.slice(0, MAX_ROWS).map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={selected.includes(p.id)}
              disabled={!selected.includes(p.id) && selected.length >= 3}
              onPress={() => toggleCompare(p.id)}
            />
          ))}
        </View>
        {selected.length >= 3 ? (
          <Text style={[styles.muted, align]}>{t('developer.compareFull')}</Text>
        ) : null}
        {chosen.length === 0 ? (
          <Empty title={t('developer.compareTitle')} message={t('developer.comparePick')} />
        ) : (
          <View style={styles.compareTable}>
            <View style={[styles.compareRow, row]}>
              <Text style={styles.compareLabel}>{''}</Text>
              {chosen.map((p) => (
                <Text key={p.id} style={[styles.compareCell, align]} numberOfLines={2}>
                  {p.name}
                </Text>
              ))}
            </View>
            <Divider />
            <View style={[styles.compareRow, row]}>
              <Text style={styles.compareLabel}>{t('developer.stat.views')}</Text>
              {chosen.map((p) => (
                <CompareStat key={p.id} projectId={p.id} field="views" />
              ))}
            </View>
            <View style={[styles.compareRow, row]}>
              <Text style={styles.compareLabel}>{t('developer.stat.inquiries')}</Text>
              {chosen.map((p) => (
                <CompareStat key={p.id} projectId={p.id} field="inquiries" />
              ))}
            </View>
            <View style={[styles.compareRow, row]}>
              <Text style={styles.compareLabel}>{t('developer.stat.leads')}</Text>
              {chosen.map((p) => (
                <CompareStat key={p.id} projectId={p.id} field="leads" />
              ))}
            </View>
            <View style={[styles.compareRow, row]}>
              <Text style={styles.compareLabel}>{t('developer.unitsTotal')}</Text>
              {chosen.map((p) => (
                <CompareStat key={p.id} projectId={p.id} field="unitsTotal" />
              ))}
            </View>
            <View style={[styles.compareRow, row]}>
              <Text style={styles.compareLabel}>{t('developer.unitsAvailable')}</Text>
              {chosen.map((p) => (
                <CompareStat key={p.id} projectId={p.id} field="unitsAvailable" />
              ))}
            </View>
            <View style={[styles.compareRow, row]}>
              <Text style={styles.compareLabel}>{t('developer.completion')}</Text>
              {chosen.map((p) => (
                <Text key={p.id} style={[styles.compareCell, align]}>
                  {`${p.completionPercent ?? 0}%`}
                </Text>
              ))}
            </View>
          </View>
        )}
      </Card>

      <Card>
        <SectionTitle>{t('developer.viewingsTitle')}</SectionTitle>
        <Text style={styles.hint}>{t('developer.viewingsHint')}</Text>
        {loading ? <Loading label={t('common.loading')} /> : null}
        {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
        {!loading && !error && viewings.length === 0 ? (
          <Empty title={t('developer.viewingsTitle')} message={t('developer.viewingsEmpty')} />
        ) : null}
        {!loading && !refreshing
          ? days.map(([day, items]) => (
              <View key={day} style={styles.inventory}>
                <Text style={[styles.dayTitle, align]}>
                  {new Date(day).toLocaleDateString() === new Date().toLocaleDateString()
                    ? day
                    : formatDate(day)}
                </Text>
                {items.map((v, index) => (
                  <View key={v.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      title={v.unit?.project?.name ?? v.project?.name ?? v.unit?.name ?? '—'}
                      subtitle={[formatDate(v.scheduledAt, true), v.status ? humanise(v.status) : null]
                        .filter(Boolean)
                        .join(' · ')}
                      badge={
                        v.status ? (
                          <Badge tone={toneForStatus(v.status)}>{humanise(v.status)}</Badge>
                        ) : undefined
                      }
                    />
                  </View>
                ))}
              </View>
            ))
          : null}
      </Card>

      <Card>
        <SectionTitle>{t('developer.repliesTitle')}</SectionTitle>
        <Text style={styles.hint}>{t('developer.repliesHint')}</Text>
        {replyKeys.map((key) => (
          <View key={key} style={styles.replyBox}>
            <Text style={[styles.replyText, align]}>{t(key)}</Text>
            <Btn
              title={copiedReply === key ? t('developer.copied') : t('developer.copy')}
              variant="ghost"
              onPress={() => void copyReply(key)}
            />
          </View>
        ))}
        {copiedReply ? <Text style={[styles.notice, align]}>{t('developer.replyCopied')}</Text> : null}
      </Card>
    </>
  );
}

/**
 * One lazy stats cell — mounted only for a selected compare column, so each
 * project's `stats` fetch fires exactly when its column appears.
 */
function CompareStat({ projectId, field }: { projectId: string; field: keyof ProjectStatsPayload }) {
  const styles = useStyles();
  const { align } = useI18n();
  const { data, error, loading } = useApi<ProjectStatsPayload>(
    `/api/developer/projects/${projectId}/stats`,
  );
  if (loading) return <Text style={[styles.compareCell, align]}>…</Text>;
  if (error || !data) return <Text style={[styles.compareCell, align]}>—</Text>;
  return <Text style={[styles.compareCell, align]}>{(data[field] ?? 0).toLocaleString()}</Text>;
}

function Tile({ value, label }: { value: string | number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    card: { gap: 6 },
    company: { alignItems: 'center', gap: 12 },
    logo: { width: 52, height: 52, borderRadius: 12 },
    logoFallback: {
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoText: { color: t.primary, fontWeight: '800', fontSize: 24 },
    companyMain: { flex: 1, gap: 3 },
    companyTitle: { alignItems: 'center', gap: 6 },
    companyName: { color: t.foreground, fontSize: 18, fontWeight: '800', flexShrink: 1 },
    companyMeta: { color: t.mutedForeground, fontSize: 12 },
    chipRow: { flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    chipRowTight: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 96,
      alignItems: 'center',
      gap: 2,
      paddingVertical: Spacing.sm,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 12,
    },
    tileValue: { color: t.foreground, fontSize: 16, fontWeight: '800' },
    tileLabel: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    funnelLabel: { color: t.mutedForeground, fontSize: 12, width: 92 },
    funnelTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    funnelFill: { height: 8, borderRadius: 4, backgroundColor: t.primary },
    funnelValue: { color: t.foreground, fontSize: 12, fontWeight: '700', minWidth: 24, textAlign: 'right' },
    thumb: { width: 44, height: 44, borderRadius: 8 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: t.muted, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: t.primary },
    progressLabel: { color: t.mutedForeground, fontSize: 12 },
    expand: { gap: 6, marginTop: 4 },
    milestoneList: { gap: 4 },
    count: { color: t.primary, fontSize: 14, fontWeight: '800' },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    muted: { color: t.mutedForeground, fontSize: 14 },
    paragraph: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    noteCard: { borderColor: 'rgba(212,168,67,0.45)' },
    form: { gap: 16, marginTop: 8 },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    secHead: {
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      paddingVertical: 12,
      minHeight: 48,
    },
    secTitle: { color: t.foreground, fontSize: 18, fontWeight: '800', flex: 1, lineHeight: 24 },
    previewThumb: { width: 112, height: 112, borderRadius: 12, flexShrink: 0 },
    // ── Submit tab — spacious presentation (all sections open by default) ──
    submitStack: { gap: 20 },
    submitCard: { gap: 12, padding: Spacing.md + 4 },
    submitIntroCard: { gap: 12 },
    submitForm: { gap: 16, marginTop: 12, paddingTop: 4 },
    previewCard: { gap: 12, padding: Spacing.md + 4 },
    previewBody: { gap: 16 },
    previewCover: { width: '100%', height: 190, borderRadius: 12, backgroundColor: t.muted },
    previewCoverFallback: {
      width: '100%',
      height: 190,
      borderRadius: 12,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewFallbackText: { color: t.primary, fontWeight: '800', fontSize: 48 },
    previewInfo: { gap: 10 },
    previewName: { color: t.foreground, fontSize: 20, fontWeight: '800', lineHeight: 26 },
    previewAr: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    previewMetaRow: { flexWrap: 'wrap', gap: 10, alignItems: 'center' },
    previewPrice: { color: t.primary, fontSize: 17, fontWeight: '800' },
    previewPlace: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    mediaCover: { width: '100%', height: 160, borderRadius: 12, backgroundColor: t.muted },
    reviewIssues: { gap: 8, marginTop: 8 },
    reviewList: { gap: 4 },
    reviewRowWrap: { gap: 0 },
    reviewRow: { paddingVertical: 10 },
    reviewConfirm: { minHeight: 52, marginTop: 12 },
    issueHead: { color: t.dangerFg, fontSize: 14, fontWeight: '700' },
    issueText: { color: t.dangerFg, fontSize: 13, lineHeight: 18 },
    reasonBox: {
      backgroundColor: t.dangerBg,
      borderWidth: 1,
      borderColor: t.destructive,
      borderRadius: 8,
      padding: Spacing.sm,
      gap: 2,
    },
    reasonLabel: { color: t.dangerFg, fontSize: 12, fontWeight: '700' },
    reasonText: { color: t.dangerFg, fontSize: 14, lineHeight: 20 },
    editor: { gap: 8, marginTop: 8 },
    reqSheet: { gap: 8, borderColor: 'rgba(212,168,67,0.45)' },
    actions: { flexWrap: 'wrap', gap: 8 },
    inventory: { gap: 8 },
    csvHeader: { color: t.mutedForeground, fontSize: 12, lineHeight: 18 },
    compareTable: { gap: 8, marginTop: 4 },
    compareRow: { alignItems: 'flex-start', gap: 8 },
    compareLabel: { color: t.mutedForeground, fontSize: 12, flex: 1.1 },
    compareCell: { color: t.foreground, fontSize: 13, fontWeight: '700', flex: 1 },
    dayTitle: { color: t.foreground, fontSize: 15, fontWeight: '700' },
    replyBox: { gap: 6, borderWidth: 1, borderColor: t.border, borderRadius: 8, padding: Spacing.sm },
    replyText: { color: t.foreground, fontSize: 14, lineHeight: 20 },
  }),
);
