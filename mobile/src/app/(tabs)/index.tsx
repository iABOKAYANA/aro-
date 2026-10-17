import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Radius } from '@/constants/brand';

import { useAuth } from '@/auth/auth-context';
import { Avatar, Badge, Btn, Card, DisplayTitle, Divider, ErrorBar, Kicker, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { useAppFonts } from '@/lib/fonts';
import { formatMoney, humanise, initials } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { useCompare } from '@/lib/compare';
import { useCurrency } from '@/lib/currency';
import { getRecentViews, type RecentView } from '@/lib/recent-views';
import { FALLBACK_CITIES, LANDMARK_IMAGES, landmarkForCity } from '@/lib/landmarks';
import { createStyles, useTheme } from '@/lib/theme';

type Stats = {
  totalUsers?: number;
  totalBrokers?: number;
  totalDevelopers?: number;
  totalProjects?: number;
  totalLeads?: number;
  newLeadsThisWeek?: number;
  activeProjects?: number;
};

type Lead = {
  id: string;
  leadCode?: string;
  name: string;
  status: string;
  createdAt: string;
  project?: { name: string } | null;
};

type LeadStats = {
  stats?: Record<string, number>;
};

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  coverImage?: string | null;
  startPrice?: number | null;
  createdAt?: string | null;
  city?: { name?: string | null; nameArabic?: string | null; nameSlug?: string | null } | null;
  district?: { name?: string | null; nameArabic?: string | null } | null;
  developer?: { companyName?: string | null } | null;
};

// Same marquee the website prints under its locations section.
const DEVELOPER_NAMES = [
  'SODIC',
  'Mountain View',
  'Emaar',
  'Palm Hills',
  'Talaat Moustafa Group',
  'Dar Al-Mimar',
  'Coldwell Banker',
  'Reef Development',
];

export default function HomeScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { user, signOut, hasRole } = useAuth();
  const { t, row, text, align, localized } = useI18n();
  const fonts = useAppFonts();
  const { currency, rates } = useCurrency();
  const [ask, setAsk] = useState('');
  // Landmark/city photos that failed to load remove themselves (see city card).
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});
  // Home additions: recently-viewed rail + city-follow toggles. All hooks stay
  // top-level and unconditional — these are plain state, never conditional.
  const [recent, setRecent] = useState<RecentView[]>([]);
  const [followedCities, setFollowedCities] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);
  const mutation = useMutation();
  const compare = useCompare();

  useEffect(() => {
    void getRecentViews().then(setRecent).catch(() => {});
  }, []);

  const isSuper = hasRole('CEO', 'ADMIN');
  const isStaff = hasRole('BROKER', 'DEVELOPER', 'CEO', 'ADMIN');

  // One screen, several data sources — each enabled only for the role that
  // can read it, so nobody ever sees a 403 flash on their dashboard.
  const stats = useApi<Stats>(isSuper ? '/api/ceo/stats' : null);
  const leadStats = useApi<LeadStats>(isStaff ? '/api/leads/stats' : null);
  const leads = useApi<{ leads?: Lead[] }>(isStaff ? '/api/leads?limit=5' : null);
  // The website's public home reads the same two endpoints: the featured grid
  // (and its stats bar) from `/api/projects?limit=6`, the navy band from the
  // CEO-configured `/api/new-launches`.
  const overview = useApi<{ projects?: ProjectRow[] }>(!isStaff ? '/api/projects?limit=6' : null);
  const launchesApi = useApi<{ items?: ProjectRow[] }>(!isStaff ? '/api/new-launches' : null);
  // Silent by design: a guest has no inbox, and a stale session must not paint
  // an error strip on the home screen — the badge simply stays hidden.
  const notif = useApi<{ unreadCount?: number }>(user ? '/api/notifications?limit=1' : null);

  const loading = stats.loading || leadStats.loading || leads.loading || overview.loading || launchesApi.loading;
  const error = stats.error ?? leadStats.error ?? leads.error ?? overview.error ?? launchesApi.error;
  const reload = () => {
    stats.refresh();
    leadStats.refresh();
    leads.refresh();
    overview.refresh();
    launchesApi.refresh();
    notif.refresh();
    void getRecentViews().then(setRecent).catch(() => {});
  };

  if (loading) return <Loading label={t('home.loading')} />;

  const greeting = user?.name
    ? t('home.helloName').replace('{name}', user.name.split(' ')[0])
    : t('home.hello');

  const unreadCount = notif.data?.unreadCount ?? 0;
  const projects = overview.data?.projects ?? [];
  const launchItems = launchesApi.data?.items ?? [];
  const cityNames = new Set(
    projects.map((p) => p.city?.name).filter((n): n is string => Boolean(n))
  );
  const devNames = new Set(
    projects.map((p) => p.developer?.companyName).filter((n): n is string => Boolean(n))
  );

  // Same grouping the website's ExploreLocations builds, topped up with the
  // same fallback row so the strip is never empty on a fresh database.
  const cityCards = (() => {
    const grouped = new Map<
      string,
      { name: string; nameArabic?: string | null; slug: string; count: number; image?: string }
    >();
    for (const p of projects) {
      const name = p.city?.name;
      if (!name) continue;
      const slug = p.city?.nameSlug || name.toLowerCase().replace(/\s+/g, '-');
      const cover = imageUrl(p.coverImage);
      const existing = grouped.get(slug);
      if (existing) {
        existing.count += 1;
        if (!existing.image && cover) existing.image = cover;
      } else grouped.set(slug, { name, nameArabic: p.city?.nameArabic, slug, count: 1, image: cover });
    }
    const cards = [...grouped.values()].sort((a, b) => b.count - a.count);
    for (const fallback of FALLBACK_CITIES) {
      if (cards.length >= 3) break;
      if (!cards.some((c) => c.slug === fallback.slug)) cards.push({ ...fallback, count: 0 });
    }
    return cards.slice(0, 3);
  })();

  // The hero "Ask Ayn" box — the website's `/ai-tools/chat?q=…` prefill.
  const goAsk = () => {
    const q = ask.trim();
    if (q) router.push({ pathname: '/assistant', params: { q } });
    else router.push('/assistant');
  };

  // City follow — `POST /api/watch { targetType: 'CITY', targetId: slug }`.
  // Following state is unknown client-side, so this is fire-and-forget: the
  // pill flips to "following" on success and an Egyptian error strip appears
  // on failure. A guest gets the login door, never a 401 flash — the same
  // destination the `useRequireAuth` gate offers on guarded screens.
  async function toggleCityFollow(slug: string) {
    if (!user) {
      router.push('/login');
      return;
    }
    if (followBusy) return;
    setFollowBusy(slug);
    setFollowError(null);
    try {
      await mutation.run('/api/watch', 'POST', { targetType: 'CITY', targetId: slug });
      setFollowedCities((prev) => ({ ...prev, [slug]: !prev[slug] }));
    } catch {
      setFollowError(t('home.followCityFailed'));
    } finally {
      setFollowBusy(null);
    }
  }

  return (
    <Screen refreshing={stats.refreshing} onRefresh={reload}>
      {/* Identity — the same session the website holds. */}
      <Card>
        <View style={[styles.identityRow, row]}>
          <Avatar text={initials(user?.name)} />
          <View style={styles.identityText}>
            <Text style={[styles.hello, align, fonts.displayBold]}>{greeting}</Text>
            <Text style={[styles.email, align]} numberOfLines={1}>
              {user?.email ?? t('home.browseHint')}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={styles.bellWrap}>
            <Ionicons name="notifications-outline" size={22} color={theme.foreground} />
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={[styles.badgeRow, row]}>
          {user?.role ? <Badge tone="gold">{user.role}</Badge> : null}
          <Badge tone="muted">{currency}</Badge>
        </View>
      </Card>

      {error ? <ErrorBar message={error} onRetry={reload} /> : null}

      {/* ── Ask Ayn hero + stats bar — the website's HeroSearch ─── */}
      {!isStaff ? (
        <>
          <Card>
            <Kicker>{t('assistant.title')}</Kicker>
            <DisplayTitle size="md" bold>
              {t('home.askTitle')}
            </DisplayTitle>
            <Text style={[styles.askHint, align]}>{t('home.askHint')}</Text>
            <View style={[styles.askRow, row]}>
              <TextInput
                value={ask}
                onChangeText={setAsk}
                onSubmitEditing={goAsk}
                returnKeyType="search"
                placeholder={t('home.askPlaceholder')}
                placeholderTextColor={theme.mutedForeground}
                style={[styles.askInput, align]}
              />
              <Pressable
                onPress={goAsk}
                style={({ pressed }) => [styles.askBtn, pressed && { opacity: 0.8 }]}>
                <Ionicons name="sparkles" size={16} color={theme.primary} />
                <Text style={styles.askBtnText}>{t('home.askGo')}</Text>
              </Pressable>
            </View>
          </Card>

          <Card>
            <Text style={[styles.sectionHint, align]}>{t('home.statsHint')}</Text>
            <View style={[styles.statBar, row]}>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, text]}>{projects.length}+</Text>
                <Text style={[styles.statLabel, text]}>{t('home.properties')}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, text]}>{devNames.size}+</Text>
                <Text style={[styles.statLabel, text]}>{t('home.developers')}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, text]}>{cityNames.size}+</Text>
                <Text style={[styles.statLabel, text]}>{t('home.cities')}</Text>
              </View>
            </View>
          </Card>
        </>
      ) : null}

      {/* ── CEO / ADMIN ─────────────────────────────────────────── */}
      {isSuper && stats.data ? (
        <Card>
          <SectionTitle>{t('home.platform')}</SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.platformHint')}</Text>
          <View style={[styles.grid, row]}>
            <GridStat label={t('home.users')} value={stats.data.totalUsers} />
            <GridStat label={t('home.brokers')} value={stats.data.totalBrokers} />
            <GridStat label={t('home.developers')} value={stats.data.totalDevelopers} />
            <GridStat label={t('explore.projects')} value={stats.data.totalProjects} />
            <GridStat label={t('tab.leads')} value={stats.data.totalLeads} />
            <GridStat label={t('home.newWeek')} value={stats.data.newLeadsThisWeek} />
          </View>
          <Divider />
          <Btn
            title={t('home.openManagement')}
            variant="ghost"
            onPress={() => router.push('/(tabs)/manage')}
          />
        </Card>
      ) : null}

      {/* ── Staff: pipeline ─────────────────────────────────────── */}
      {isStaff ? (
        <Card>
          <SectionTitle>{t('home.pipeline')}</SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.pipelineHint')}</Text>
          <View style={[styles.grid, row]}>
            {Object.entries(leadStats.data?.stats ?? {}).map(([status, count]) => (
              <GridStat key={status} label={humanise(status)} value={count} />
            ))}
          </View>
          <Divider />
          <Text style={[styles.qaTitle, align]}>{t('home.quickActions')}</Text>
          <Text style={[styles.qaHint, align]}>{t('home.quickActionsHint')}</Text>
          <View style={[styles.qaRow, row]}>
            <Pressable
              onPress={() => router.push('/(tabs)/explore')}
              style={({ pressed }) => [styles.qaBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.qaLabel}>{t('home.browseProjects')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/inquiries')}
              style={({ pressed }) => [styles.qaBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.qaLabel}>{t('home.viewInquiries')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/tools')}
              style={({ pressed }) => [styles.qaBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.qaLabel}>{t('home.aiTools')}</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {isStaff && (leads.data?.leads?.length ?? 0) > 0 ? (
        <>
          <SectionTitle
            action={
              <Pressable onPress={() => router.push('/(tabs)/leads')} hitSlop={8}>
                <Text style={[styles.link, text]}>{t('home.seeAll')}</Text>
              </Pressable>
            }>
            {t('home.recentLeads')}
          </SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.recentLeadsHint')}</Text>
          <Card style={styles.list}>
            {leads.data?.leads?.slice(0, 5).map((lead, i) => (
              <View key={lead.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  title={lead.name}
                  subtitle={`${lead.leadCode ?? t('home.lead')} · ${lead.project?.name ?? '—'}`}
                  badge={<Badge tone={toneForLead(lead.status)}>{humanise(lead.status)}</Badge>}
                  onPress={() => router.push(`/lead/${lead.id}`)}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* ── Buyer: featured on the market ─────────────────────────── */}
      {!isStaff && projects.length > 0 ? (
        <>
          <SectionTitle
            action={
              <Pressable onPress={() => router.push('/(tabs)/explore')} hitSlop={8}>
                <Text style={[styles.link, text]}>{t('home.viewAll')}</Text>
              </Pressable>
            }>
            {t('home.featuredProjects')}
          </SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.featuredSubtitle').replace('{n}', String(projects.length))}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featScroll}>
            {projects.map((project) => {
              const place = project.city
                ? localized(project.city.name, project.city.nameArabic)
                : '';
              // Display chain: cover → city landmark → initials block. A dead
              // (403/blocked) cover removes itself via onError.
              const live = (u?: string | null) => (u && !deadImgs[u] ? u : undefined);
              const imgSrc = live(imageUrl(project.coverImage)) ?? live(landmarkForCity(project.city));
              return (
                <Pressable
                  key={project.id}
                  onPress={() => router.push(`/project/${project.slug}`)}
                  style={({ pressed }) => [styles.featCard, pressed && { opacity: 0.85 }]}>
                  {imgSrc ? (
                    <Image
                      source={{ uri: imgSrc }}
                      style={styles.featImg}
                      onError={() =>
                        setDeadImgs((prev) => (prev[imgSrc] ? prev : { ...prev, [imgSrc]: true }))
                      }
                    />
                  ) : (
                    <View style={[styles.featImg, styles.featImgEmpty]}>
                      <Text style={styles.featImgEmptyText}>GHAYA</Text>
                    </View>
                  )}
                  <View style={styles.featBody}>
                    <Text style={[styles.featName, align]} numberOfLines={1}>
                      {localized(project.name, project.nameArabic)}
                    </Text>
                    {place ? (
                      <Text style={[styles.featPlace, align]} numberOfLines={1}>
                        {place}
                      </Text>
                    ) : null}
                    <Text style={[styles.featPrice, align]}>
                      {formatMoney(project.startPrice, currency, rates, { compact: true })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {/* ── New Launches — the website's navy band ───────────────── */}
      {!isStaff && launchItems.length > 0 ? (
        <>
          <SectionTitle
            action={
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/(tabs)/explore', params: { sortBy: 'newest' } })
                }
                hitSlop={8}>
                <Text style={[styles.link, text]}>{t('home.viewAll')}</Text>
              </Pressable>
            }>
            {t('home.newLaunches')}
          </SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.newLaunchesHint')}</Text>
          {launchItems.map((p) => {
            const place = [
              p.district ? localized(p.district.name, p.district.nameArabic) : '',
              p.city ? localized(p.city.name, p.city.nameArabic) : '',
            ]
              .filter(Boolean)
              .join(', ');
            const src = imageUrl(p.coverImage);
            // Display chain: cover → city landmark → initials block.
            const live = (u?: string | null) => (u && !deadImgs[u] ? u : undefined);
            const imgSrc = live(src) ?? live(landmarkForCity(p.city));
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/project/${p.slug}`)}
                style={({ pressed }) => [styles.launchCard, row, pressed && { opacity: 0.85 }]}>
                {imgSrc ? (
                  <Image
                    source={{ uri: imgSrc }}
                    style={styles.launchImg}
                    onError={() =>
                      setDeadImgs((prev) => (prev[imgSrc] ? prev : { ...prev, [imgSrc]: true }))
                    }
                  />
                ) : (
                  <View style={[styles.launchImg, styles.launchImgEmpty]}>
                    <Text style={styles.launchImgEmptyText}>GHAYA</Text>
                  </View>
                )}
                <View style={styles.launchText}>
                  <Text style={[styles.launchName, align]} numberOfLines={1}>
                    {localized(p.name, p.nameArabic)}
                  </Text>
                  {place ? (
                    <Text style={[styles.launchPlace, align]} numberOfLines={1}>
                      {place}
                    </Text>
                  ) : null}
                  <Text style={[styles.launchPrice, align]}>
                    {t('home.startingAt')}{' '}
                    {formatMoney(p.startPrice, currency, rates, { compact: true })}
                  </Text>
                </View>
                <Badge tone="gold">{t('home.newBadge')}</Badge>
              </Pressable>
            );
          })}
        </>
      ) : null}

      {/* ── Explore locations ────────────────────────────────────── */}
      {!isStaff ? (
        <>
          <SectionTitle
            action={
              <Pressable onPress={() => router.push('/locations')} hitSlop={8}>
                <Text style={[styles.link, text]}>{t('home.viewAll')}</Text>
              </Pressable>
            }>
            {t('home.exploreLocations')}
          </SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.exploreSubtitle')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cityScroll}>
            {cityCards.map((c) => {
              // Famous landmark first, project cover second, neutral block last.
              const landmark = LANDMARK_IMAGES[c.slug];
              const cover = c.image && !deadImgs[c.image] ? c.image : undefined;
              const imgSrc = landmark && !deadImgs[landmark] ? landmark : cover;
              const followed = Boolean(followedCities[c.slug]);
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => router.push({ pathname: '/(tabs)/explore', params: { city: c.slug } })}
                  style={({ pressed }) => [styles.cityCard, pressed && { opacity: 0.85 }]}>
                  <View style={styles.cityCover}>
                    {imgSrc ? (
                      <Image
                        source={{ uri: imgSrc }}
                        style={styles.cityImg}
                        onError={() =>
                          setDeadImgs((prev) => (prev[imgSrc] ? prev : { ...prev, [imgSrc]: true }))
                        }
                      />
                    ) : (
                      <View style={[styles.cityImg, styles.cityImgEmpty]}>
                        <Text style={styles.cityImgEmptyText}>GHAYA</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => void toggleCityFollow(c.slug)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t(followed ? 'home.followingCity' : 'home.followCity')}
                      style={({ pressed }) => [
                        styles.cityFollow,
                        row,
                        followed && styles.cityFollowActive,
                        (pressed || followBusy === c.slug) && { opacity: 0.7 },
                      ]}>
                      <Ionicons
                        name={followed ? 'bookmark' : 'bookmark-outline'}
                        size={13}
                        color={theme.primary}
                      />
                      <Text style={styles.cityFollowText}>
                        {t(followed ? 'home.followingCity' : 'home.followCity')}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.cityBody}>
                    <Text style={[styles.cityName, align]} numberOfLines={1}>
                      {localized(c.name, c.nameArabic)}
                    </Text>
                    <Text style={[styles.cityCount, align]}>
                      {t('home.projectsCount').replace('{n}', String(c.count))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          {followError ? <ErrorBar message={followError} /> : null}
          <Text style={[styles.photoCredit, align]}>{t('home.photoCredit')}</Text>
        </>
      ) : null}

      {/* ── Trusted developers ───────────────────────────────────── */}
      {!isStaff ? (
        <>
          <SectionTitle>{t('home.trustedDevelopers')}</SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.trustedHint')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cityScroll}>
            {DEVELOPER_NAMES.map((name) => (
              <Pressable
                key={name}
                onPress={() => router.push({ pathname: '/(tabs)/explore', params: { q: name } })}
                style={({ pressed }) => [styles.devChip, pressed && { opacity: 0.85 }]}>
                <View style={styles.devInitials}>
                  <Text style={styles.devInitialsText}>{initials(name)}</Text>
                </View>
                <Text style={styles.devName}>{name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* ── Recently viewed — jump back into opened projects ─── */}
      {!isStaff && recent.length > 0 ? (
        <>
          <SectionTitle>{t('home.recentTitle')}</SectionTitle>
          <Text style={[styles.sectionHint, align]}>{t('home.recentHint')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featScroll}>
            {recent.map((item) => {
              // Dead covers remove themselves via onError → initials block.
              const live = (u?: string | null) => (u && !deadImgs[u] ? u : undefined);
              const src = live(imageUrl(item.coverImage));
              const ago = agoLabel(item.savedAt, t);
              const inCompare = compare.has(item.id) || compare.has(item.slug);
              return (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/project/${item.slug}`)}
                style={({ pressed }) => [styles.featCard, pressed && { opacity: 0.85 }]}>
                {src ? (
                  <Image
                    source={{ uri: src }}
                    style={styles.featImg}
                    onError={() =>
                      setDeadImgs((prev) => (prev[src] ? prev : { ...prev, [src]: true }))
                    }
                  />
                ) : (
                  <View style={[styles.featImg, styles.featImgEmpty]}>
                    <Text style={styles.featImgEmptyText}>GHAYA</Text>
                  </View>
                )}
                <View style={styles.featBody}>
                  <Text style={[styles.featName, align]} numberOfLines={1}>
                    {localized(item.name, item.nameArabic)}
                  </Text>
                  {ago ? (
                    <Text style={[styles.recentAgo, align]} numberOfLines={1}>
                      {ago}
                    </Text>
                  ) : null}
                  <Text style={[styles.featPrice, align]}>
                    {formatMoney(item.startPrice, currency, rates, { compact: true })}
                  </Text>
                  {/* Zeigarnik mini-actions — compare / book without reopening. */}
                  <View style={[styles.recentActions, row]}>
                    <Pressable
                      onPress={() => {
                        const problem = compare.toggle({
                          id: item.id,
                          slug: item.slug,
                          name: item.name,
                        });
                        if (problem) alert(problem);
                      }}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityState={{ selected: inCompare }}
                      style={[styles.recentMini, inCompare && styles.recentMiniActive]}>
                      <Text style={[styles.recentMiniText, align]}>
                        {inCompare ? t('explore.added') : t('project.compare')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/viewing/book',
                          params: { projectId: item.id, name: item.name },
                        })
                      }
                      hitSlop={6}
                      accessibilityRole="button"
                      style={styles.recentMini}>
                      <Text style={[styles.recentMiniText, align]}>{t('home.recentBook')}</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {/* ── CTA ──────────────────────────────────────────────────── */}
      {!isStaff ? (
        <Card>
          <DisplayTitle size="md" bold>
            {t('home.readyCTA')}
          </DisplayTitle>
          <Text style={[styles.ctaSub, align]}>{t('home.readySubtitle')}</Text>
          <Btn title={t('home.tryAiTools')} onPress={() => router.push('/(tabs)/tools')} />
          <View style={styles.ctaGap} />
          <Btn
            title={t('home.contactUs')}
            variant="ghost"
            onPress={() => router.push('/contact')}
          />
        </Card>
      ) : null}

      {/* ── Shortcuts everyone gets ─────────────────────────────── */}
      <SectionTitle>{t('home.shortcuts')}</SectionTitle>
      <Text style={[styles.sectionHint, align]}>{t('home.shortcutsHint')}</Text>
      <Card style={styles.shortcuts}>
        <Shortcut icon="git-compare" label={t('tools.compare')} onPress={() => router.push('/compare')} />
        <Shortcut
          icon="calculator"
          label={t('tools.mortgage')}
          onPress={() => router.push('/mortgage')}
        />
        <Shortcut icon="sparkles" label={t('home.askAssistant')} onPress={() => router.push('/assistant')} />
        <Shortcut icon="bookmark" label={t('home.savedSearches')} onPress={() => router.push('/(tabs)/saved')} />
        <Shortcut
          icon="pricetag"
          label={t('offers.title')}
          hint={t('offers.shortHint')}
          onPress={() => router.push('/offers')}
        />
        <Shortcut
          icon="map-outline"
          label={t('areas.title')}
          hint={t('areas.shortHint')}
          onPress={() => router.push('/areas')}
        />
        {user ? (
          <Shortcut
            icon="person-circle"
            label={t('home.signOut')}
            danger
            onPress={() => signOut()}
          />
        ) : (
          /* Browsing is open, so the last slot offers the way in rather than
             the way out — otherwise a guest has no obvious door. */
          <Shortcut
            icon="log-in-outline"
            label={t('account.signIn')}
            onPress={() => router.push('/login')}
          />
        )}
      </Card>
    </Screen>
  );
}

function GridStat({ label, value }: { label: string; value?: number }) {
  const styles = useStyles();
  const { text } = useI18n();
  return (
    <View style={styles.gridCell}>
      <Text style={[styles.gridValue, text]}>{typeof value === 'number' ? value.toLocaleString('en-US') : '—'}</Text>
      <Text style={[styles.gridLabel, text]}>{label}</Text>
    </View>
  );
}

function Shortcut({
  icon,
  label,
  hint,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { row, align } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shortcut, row, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={18} color={danger ? theme.dangerFg : theme.primary} />
      <View style={styles.shortcutText}>
        <Text style={[styles.shortcutLabel, align, danger && { color: theme.dangerFg }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.shortcutHint, align]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/** Relative "seen" label from the stored `savedAt` — null when unknown. */
function agoLabel(
  savedAt: number | null | undefined,
  t: (key: MessageKey) => string
): string | null {
  if (!savedAt) return null;
  const seconds = Math.floor((Date.now() - savedAt) / 1000);
  if (seconds < 60) return t('home.agoNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('home.agoMinutes').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('home.agoHours').replace('{n}', String(hours));
  return t('home.agoDays').replace('{n}', String(Math.floor(hours / 24)));
}

function toneForLead(status: string) {
  const s = status?.toUpperCase();
  if (s === 'WON' || s === 'QUALIFIED') return 'green' as const;
  if (s === 'LOST' || s === 'DISQUALIFIED') return 'red' as const;
  return 'gold' as const;
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    identityText: { flex: 1 },
    hello: { color: t.foreground, fontSize: 22, lineHeight: 30, fontWeight: '700' },
    email: { color: t.mutedForeground, fontSize: 14 },
    badgeRow: { flexDirection: 'row', gap: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridCell: {
      width: '33.33%',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 2,
    },
    gridValue: { color: t.foreground, fontSize: 20, fontWeight: '800' },
    gridLabel: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    list: { gap: 0 },
    link: { color: t.primary, fontSize: 14, fontWeight: '700' },
    shortcuts: { gap: 0 },
    shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
    shortcutText: { flex: 1, gap: 1 },
    shortcutLabel: { color: t.foreground, fontSize: 16 },
    shortcutHint: { color: t.mutedForeground, fontSize: 13 },
    chevron: { color: t.mutedForeground, fontSize: 20, fontWeight: '600' },
    bellWrap: { position: 'relative', padding: 2 },
    bellBadge: {
      position: 'absolute',
      right: -6,
      top: -6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: t.destructive,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    bellBadgeText: { color: t.destructiveForeground, fontSize: 11, fontWeight: '800' },
    askHint: { color: t.mutedForeground, fontSize: 13, marginBottom: 10 },
    askRow: { flexDirection: 'row', gap: 8 },
    askInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: t.foreground,
      fontSize: 14,
    },
    askBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: t.goldBg,
      borderRadius: Radius.lg,
      paddingHorizontal: 14,
    },
    askBtnText: { color: t.primary, fontSize: 14, fontWeight: '800' },
    statBar: { flexDirection: 'row' },
    statCell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
    statValue: { color: t.primary, fontSize: 22, fontWeight: '800' },
    statLabel: { color: t.mutedForeground, fontSize: 12 },
    sectionHint: { color: t.mutedForeground, fontSize: 13, marginBottom: 8 },
    featScroll: { gap: 12, paddingVertical: 2 },
    featCard: {
      width: 220,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.archBorder,
      borderRadius: Radius.xl,
      // Islamic-arch top — the site's `.arch-card` (12rem top radii clamp to a
      // full arch on narrow cards, exactly like the CSS).
      borderTopLeftRadius: 192,
      borderTopRightRadius: 192,
      overflow: 'hidden',
    },
    featImg: { width: '100%', height: 120 },
    featImgEmpty: { backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' },
    featImgEmptyText: { color: t.primary, fontWeight: '800', letterSpacing: 3, fontSize: 12 },
    featBody: { padding: 12, gap: 2 },
    featName: { color: t.foreground, fontSize: 15, fontWeight: '800' },
    featPlace: { color: t.mutedForeground, fontSize: 12 },
    featPrice: { color: t.primary, fontSize: 14, fontWeight: '800' },
    // Zeigarnik mini-actions on the recently-viewed cards.
    recentAgo: { color: t.mutedForeground, fontSize: 11 },
    recentActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    recentMini: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 12,
    },
    recentMiniActive: { backgroundColor: t.goldBg, borderColor: t.primary },
    recentMiniText: { color: t.primary, fontSize: 12, fontWeight: '700' },
    launchCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xl,
      padding: 12,
      marginBottom: 10,
    },
    // Arch-window thumb — domed top (999 clamps to a semicircle on the 64px
    // square), gold frame like the site's `.arch-card`.
    launchImg: {
      width: 64,
      height: 64,
      borderWidth: 1,
      borderColor: t.archBorder,
      borderBottomLeftRadius: Radius.lg,
      borderBottomRightRadius: Radius.lg,
      borderTopLeftRadius: 999,
      borderTopRightRadius: 999,
    },
    launchImgEmpty: { backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' },
    launchImgEmptyText: { color: t.primary, fontWeight: '800', letterSpacing: 1, fontSize: 8 },
    launchText: { flex: 1, gap: 2 },
    launchName: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    launchPlace: { color: t.mutedForeground, fontSize: 13 },
    launchPrice: { color: t.primary, fontSize: 14, fontWeight: '800' },
    cityScroll: { gap: 10, paddingVertical: 2 },
    cityCard: {
      width: 180,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.archBorder,
      borderRadius: Radius.xl,
      // Islamic-arch top, same treatment as the featured cards above.
      borderTopLeftRadius: 192,
      borderTopRightRadius: 192,
      overflow: 'hidden',
    },
    cityImg: { width: '100%', height: 96 },
    cityImgEmpty: { backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' },
    cityImgEmptyText: { color: t.primary, fontWeight: '800', letterSpacing: 3, fontSize: 12 },
    cityCover: { position: 'relative' },
    cityFollow: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    cityFollowActive: { backgroundColor: t.goldBg, borderColor: t.primary },
    cityFollowText: { color: t.primary, fontSize: 11, fontWeight: '800' },
    cityBody: { padding: 12, gap: 2 },
    cityName: { color: t.foreground, fontSize: 16, fontWeight: '800' },
    cityCount: { color: t.mutedForeground, fontSize: 12 },
    photoCredit: { color: t.mutedForeground, fontSize: 11, marginTop: 6 },
    devChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    devInitials: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    devInitialsText: { color: t.primary, fontSize: 11, fontWeight: '800' },
    devName: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    ctaSub: { color: t.mutedForeground, fontSize: 14, marginBottom: 12 },
    ctaGap: { height: 8 },
    qaTitle: { color: t.mutedForeground, fontSize: 12, fontWeight: '700', marginBottom: 2 },
    qaHint: { color: t.mutedForeground, fontSize: 12, marginBottom: 6 },
    qaRow: { flexDirection: 'row', gap: 8 },
    qaBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      paddingVertical: 10,
      alignItems: 'center',
    },
    qaLabel: { color: t.primary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  })
);
