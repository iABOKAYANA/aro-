import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

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
} from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useAuth } from '@/auth/auth-context';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { useAppFonts } from '@/lib/fonts';
import { formatArea, formatMoney, humanise } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { recordRecentView } from '@/lib/recent-views';
import { API_URL } from '@/api/config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Amenity = { name: string; icon?: string | null; category?: string | null };

type Unit = {
  id: string;
  slug?: string | null;
  name: string;
  nameArabic?: string | null;
  unitNumber?: string | null;
  floor?: number | null;
  unitType: string;
  listingType: string;
  status: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  netArea?: number | null;
  roofArea?: number | null;
  gardenArea?: number | null;
  price?: number | null;
  pricePerSqm?: number | null;
  downPayment?: number | null;
  monthlyInstallment?: number | null;
  installmentYears?: number | null;
  finishingType?: string | null;
  deliveryTerms?: string | null;
  view?: string | null;
  isCorner?: boolean;
  hasBalcony?: boolean;
  hasParking?: boolean;
  parkingNumber?: string | null;
  gallery?: string[];
  floorPlan?: string | null;
  brochureUrl?: string | null;
  isSample?: boolean | null;
  project?: {
    id: string;
    name: string;
    nameArabic?: string | null;
    slug: string;
    tagline?: string | null;
    coverImage?: string | null;
    address?: string | null;
    developer?: {
      id: string;
      companyName?: string | null;
      companyNameArabic?: string | null;
      logo?: string | null;
      isVerified?: boolean;
      contactPhone?: string | null;
      contactEmail?: string | null;
    } | null;
    governorate?: { name: string; nameArabic?: string | null } | null;
    city?: { name: string; nameArabic?: string | null } | null;
    district?: { name: string; nameArabic?: string | null } | null;
    amenities?: Amenity[];
  };
};

type FavoriteRow = { id: string; unitId?: string | null };
type WatchRow = { id: string; targetType: string; targetId: string };

/**
 * One unit — the detail page the website renders straight from Prisma.
 *
 * Reached through the same record from three directions: the units list, a
 * project's unit rows, and a notification/push link. Save and Watch are wired
 * to the *server* lists (`/api/favorites`, `/api/watch`), so a unit favourited
 * here shows up in the website's saved list on the next refresh — the local
 * saved-projects store stays for project bookmarks, which have no API.
 */
export default function UnitDetailScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { currency, rates } = useCurrency();
  const { t, row, align, localized } = useI18n();
  const fonts = useAppFonts();
  const { status: authStatus } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signedIn = authStatus === 'signedIn';

  const path = slug ? `/api/units/${encodeURIComponent(String(slug))}` : null;
  const { data, error, loading, refresh, refreshing } = useApi<{ unit?: Unit }>(path);

  // Server-side lists, only once signed in — guests get no 401 noise.
  const favorites = useApi<{ favorites?: FavoriteRow[] }>(signedIn ? '/api/favorites' : null, signedIn);
  const watches = useApi<{ watches?: WatchRow[] }>(signedIn ? '/api/watch' : null, signedIn);
  const mutation = useMutation();

  const [problem, setProblem] = useState<string | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [busy, setBusy] = useState<'save' | 'watch' | 'inquiry' | 'share' | null>(null);
  // Dead remote images remove themselves — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});
  const markDead = (uri: string) =>
    setDeadImgs((prev) => (prev[uri] ? prev : { ...prev, [uri]: true }));

  const unit = data?.unit;
  const favorite = unit ? favorites.data?.favorites?.find((f) => f.unitId === unit.id) : undefined;
  const watch = unit
    ? watches.data?.watches?.find((w) => w.targetType === 'UNIT' && w.targetId === unit.id)
    : undefined;

  // #3-record — same local trail as projects; fire-and-forget, never throws.
  useEffect(() => {
    if (!unit) return;
    void recordRecentView({
      id: unit.id,
      slug: unit.slug ?? unit.id,
      name: unit.name,
      nameArabic: unit.nameArabic ?? null,
      coverImage: unit.project?.coverImage ?? null,
      startPrice: unit.price ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id]);

  if (loading) return <Loading label={t('common.loading')} />;

  if (error || !unit) {
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Stack.Screen options={{ title: t('unit.title') }} />
        {error ? (
          <ErrorBar message={error} onRetry={refresh} />
        ) : (
          <Empty title={t('unit.notFound')} message={t('unit.notFoundHint')} />
        )}
      </Screen>
    );
  }

  const gallery = unit.gallery ?? [];
  const floorPlanSrc = imageUrl(unit.floorPlan);
  const devLogoSrc = imageUrl(unit.project?.developer?.logo);
  const location = [unit.project?.district?.name, unit.project?.city?.name, unit.project?.governorate?.name]
    .filter(Boolean)
    .join(', ');

  async function toggleFavorite() {
    if (!signedIn || !unit) return;
    setBusy('save');
    setProblem(null);
    try {
      if (favorite) {
        await mutation.run(`/api/favorites?unitId=${encodeURIComponent(unit.id)}`, 'DELETE');
      } else {
        await mutation.run('/api/favorites', 'POST', { unitId: unit.id });
      }
      await Promise.all([favorites.refresh(), watches.refresh()]);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  async function toggleWatch() {
    if (!signedIn || !unit) return;
    setBusy('watch');
    setProblem(null);
    try {
      if (watch) {
        await mutation.run('/api/watch', 'DELETE', { id: watch.id });
      } else {
        await mutation.run('/api/watch', 'POST', { targetType: 'UNIT', targetId: unit.id });
      }
      await watches.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  function openBooking() {
    if (!unit) return;
    router.push({
      pathname: '/viewing/book',
      params: {
        unitId: unit.id,
        projectId: unit.project?.id,
        name: localized(unit.name, unit.nameArabic),
      },
    });
  }

  async function shareUnit() {
    if (!unit) return;
    const url = `${API_URL}/units/${unit.slug ?? unit.id}`;
    setBusy('share');
    try {
      await Share.share({ message: `${localized(unit.name, unit.nameArabic)}\n${url}`, url });
    } catch {
      // The share sheet was dismissed — nothing worth telling the user.
    } finally {
      setBusy(null);
    }
  }

  function shareUnitWhatsApp() {
    if (!unit) return;
    const url = `${API_URL}/units/${unit.slug ?? unit.id}`;
    const href = `https://wa.me/?text=${encodeURIComponent(`${localized(unit.name, unit.nameArabic)}\n${url}`)}`;
    void Linking.openURL(href).catch(() => {});
  }

  async function sendInquiry() {
    if (!unit) return;
    if (!form.name.trim() || !form.phone.trim()) {
      setProblem(t('unit.loginToSave'));
      return;
    }
    setBusy('inquiry');
    setProblem(null);
    try {
      await mutation.run('/api/inquiries', 'POST', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        message: form.message.trim() || `Interested in ${unit.name}`,
        type: 'GENERAL',
        unitId: unit.id,
      });
      setInquirySent(true);
      setInquiryOpen(false);
      setForm({ name: '', phone: '', message: '' });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  const spec: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
    { icon: 'bed-outline', label: t('unit.bedrooms'), value: unit.bedrooms != null ? String(unit.bedrooms) : '—' },
    { icon: 'water-outline', label: t('unit.bathrooms'), value: unit.bathrooms != null ? String(unit.bathrooms) : '—' },
    { icon: 'resize-outline', label: t('unit.area'), value: unit.area ? formatArea(unit.area) : '—' },
    { icon: 'layers-outline', label: t('unit.floor'), value: unit.floor != null ? String(unit.floor) : '—' },
  ];

  return (
    <View style={styles.page}>
    <Screen padded={false} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: localized(unit.name, unit.nameArabic) }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryStrip}>
        {(gallery.length ? gallery : [unit.project?.coverImage].filter(Boolean) as string[])
          .map((raw) => imageUrl(raw))
          .filter((src): src is string => !!src && !deadImgs[src])
          .map((src, index) => (
            <Image
              key={`${src}-${index}`}
              source={{ uri: src }}
              style={styles.galleryImage}
              onError={() => markDead(src)}
            />
          ))}
      </ScrollView>

      <View style={styles.body}>
        {/* Breadcrumb — Projects / project / unit, exactly the site's trail */}
        <View style={[styles.crumbs, row]}>
          <Pressable onPress={() => router.push('/(tabs)/explore')} hitSlop={6}>
            <Text style={styles.crumbLink}>{t('unit.crumbProjects')}</Text>
          </Pressable>
          <Text style={styles.crumbSep}>/</Text>
          {unit.project ? (
            <>
              <Pressable
                onPress={() => router.push(`/project/${unit.project!.slug}`)}
                hitSlop={6}>
                <Text style={styles.crumbLink} numberOfLines={1}>
                  {localized(unit.project.name, unit.project.nameArabic)}
                </Text>
              </Pressable>
              <Text style={styles.crumbSep}>/</Text>
            </>
          ) : null}
          <Text style={[styles.crumbCurrent, align]} numberOfLines={1}>
            {localized(unit.name, unit.nameArabic)}
          </Text>
        </View>

        <Card>
          <View style={[styles.headline, row]}>
            <View style={styles.headlineMain}>
              <Text style={[styles.name, fonts.displayBold]}>{localized(unit.name, unit.nameArabic)}</Text>
              {location ? (
                <View style={[styles.locationRow, row]}>
                  <Ionicons name="location-outline" size={13} color={theme.mutedForeground} />
                  <Text style={styles.location}>{location}</Text>
                </View>
              ) : null}
            </View>
            <Badge tone={unit.status === 'AVAILABLE' ? 'green' : unit.status === 'SOLD' ? 'red' : 'gold'}>
              {humanise(unit.status)}
            </Badge>
          </View>

          <View style={[styles.tagRow, row]}>
            <Chip label={humanise(unit.unitType)} selected />
            <Chip label={humanise(unit.listingType)} selected={false} />
            {unit.isSample ? <Chip label={t('unit.sample')} selected /> : null}
            {unit.isCorner ? <Chip label={t('unit.corner')} selected={false} /> : null}
            {unit.unitNumber ? (
              <Chip label={`${t('unit.number')} #${unit.unitNumber}`} selected={false} />
            ) : null}
          </View>

          <View style={styles.priceBlock}>
            <Text style={styles.price}>
              {unit.price ? formatMoney(unit.price, currency, rates) : t('unit.priceOnRequest')}
            </Text>
            {unit.pricePerSqm ? (
              <Text style={styles.priceSub}>
                {formatMoney(unit.pricePerSqm, currency, rates, { compact: true })} {t('unit.perSqm')}
              </Text>
            ) : null}
          </View>

          {unit.isSample ? (
            <Text style={[styles.hint, align]}>{t('unit.sampleHint')}</Text>
          ) : null}

          {problem ? <ErrorBar message={problem} /> : null}

          {/* Showcase samples are illustrative — inquiry CTA only, never booking. */}
          {!unit.isSample ? <Btn title={t('unit.book')} onPress={openBooking} /> : null}

          <View style={[styles.actionRow, row]}>
            <Btn
              title={favorite ? t('unit.saved') : t('unit.save')}
              variant={favorite ? 'primary' : 'ghost'}
              busy={busy === 'save'}
              disabled={!signedIn}
              style={styles.actionHalf}
              onPress={() => void toggleFavorite()}
            />
            <Btn
              title={watch ? t('unit.watching') : t('unit.watch')}
              variant={watch ? 'primary' : 'ghost'}
              busy={busy === 'watch'}
              disabled={!signedIn}
              style={styles.actionHalf}
              onPress={() => void toggleWatch()}
            />
          </View>

          <View style={[styles.actionRow, row]}>
            <Btn
              title={t('unit.share')}
              variant="ghost"
              style={styles.actionHalf}
              busy={busy === 'share'}
              onPress={() => void shareUnit()}
            />
            <Btn
              title={t('share.whatsapp')}
              variant="ghost"
              style={styles.actionHalf}
              onPress={shareUnitWhatsApp}
            />
          </View>

          {!signedIn ? <Text style={styles.hint}>{t('unit.loginToSave')}</Text> : null}
        </Card>

        <Card>
          <SectionTitle>{t('unit.specs')}</SectionTitle>
          <View style={[styles.specGrid, row]}>
            {spec.map((item) => (
              <View key={item.label} style={styles.spec}>
                <Ionicons name={item.icon} size={16} color={theme.primary} />
                <Text style={styles.specValue}>{item.value}</Text>
                <Text style={styles.specLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Divider />
          <Row title={t('unit.finishing')} subtitle={unit.finishingType ? humanise(unit.finishingType) : '—'} />
          <Row title={t('unit.view')} subtitle={unit.view ?? '—'} />
          <Row
            title={t('unit.balcony')}
            subtitle={unit.hasBalcony ? t('common.yes') : t('common.no')}
          />
          <Row
            title={t('unit.parking')}
            subtitle={
              unit.hasParking
                ? unit.parkingNumber
                  ? `${t('unit.parking')} ${unit.parkingNumber}`
                  : t('common.yes')
                : t('common.no')
            }
          />
          {unit.netArea ? <Row title={t('unit.netArea')} subtitle={formatArea(unit.netArea)} /> : null}
          {unit.roofArea ? <Row title={t('unit.roof')} subtitle={formatArea(unit.roofArea)} /> : null}
          {unit.gardenArea ? <Row title={t('unit.garden')} subtitle={formatArea(unit.gardenArea)} /> : null}
        </Card>

        {unit.deliveryTerms ? (
          <Card>
            <SectionTitle>{t('unit.deliveryTerms')}</SectionTitle>
            <Text style={[styles.paragraph, align]}>{unit.deliveryTerms}</Text>
          </Card>
        ) : null}

        {floorPlanSrc && !deadImgs[floorPlanSrc] ? (
          <Card>
            <SectionTitle>{t('unit.floorPlan')}</SectionTitle>
            <Image
              source={{ uri: floorPlanSrc }}
              style={styles.floorPlan}
              resizeMode="contain"
              onError={() => markDead(floorPlanSrc)}
            />
          </Card>
        ) : null}

        {unit.downPayment != null || unit.monthlyInstallment != null || unit.installmentYears != null ? (
          <Card>
            <SectionTitle>{t('unit.payment')}</SectionTitle>
            {unit.downPayment != null ? (
              <Row
                title={t('unit.downPayment')}
                right={
                  <Text style={styles.money}>
                    {formatMoney(unit.downPayment, currency, rates, { compact: true })}
                  </Text>
                }
              />
            ) : null}
            {unit.monthlyInstallment != null ? (
              <Row
                title={t('unit.monthly')}
                right={
                  <Text style={styles.money}>
                    {formatMoney(unit.monthlyInstallment, currency, rates, { compact: true })}
                  </Text>
                }
              />
            ) : null}
            {unit.installmentYears != null ? (
              <Row
                title={t('unit.years')}
                subtitle={`${unit.installmentYears} ${t('unit.yearsValue')}`}
              />
            ) : null}
          </Card>
        ) : null}

        {unit.project ? (
          <Card>
            <SectionTitle>{t('unit.inProject')}</SectionTitle>
            <Row
              title={localized(unit.project.name, unit.project.nameArabic)}
              subtitle={[unit.project.tagline, location].filter(Boolean).join(' · ')}
              badge={unit.project.developer?.isVerified ? <Badge tone="green">✓</Badge> : undefined}
              onPress={() => router.push(`/project/${unit.project!.slug}`)}
            />
            {unit.project.developer ? (
              <>
                <Divider />
                <Row
                  title={t('unit.developer')}
                  subtitle={localized(
                    unit.project.developer.companyName,
                    unit.project.developer.companyNameArabic,
                  )}
                  right={
                    devLogoSrc && !deadImgs[devLogoSrc] ? (
                      <Image
                        source={{ uri: devLogoSrc }}
                        style={styles.devLogo}
                        onError={() => markDead(devLogoSrc)}
                      />
                    ) : undefined
                  }
                />
              </>
            ) : null}
          </Card>
        ) : null}

        {unit.project?.amenities?.length ? (
          <Card>
            <SectionTitle>{t('unit.amenities')}</SectionTitle>
            <View style={styles.chips}>
              {unit.project.amenities.map((a) => (
                <Chip key={a.name} label={a.name} selected={false} />
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <SectionTitle>{t('unit.inquire')}</SectionTitle>
          {inquirySent ? (
            <View style={styles.sentBox}>
              <Ionicons name="checkmark-circle" size={22} color={theme.successFg} />
              <View style={styles.sentText}>
                <Text style={[styles.sentTitle, align]}>{t('unit.inquireSent')}</Text>
                <Text style={styles.sentHint}>{t('unit.inquireHint')}</Text>
              </View>
            </View>
          ) : inquiryOpen ? (
            <View style={styles.form}>
              <Field
                label={t('common.name')}
                value={form.name}
                onChangeText={(next) => setForm((f) => ({ ...f, name: next }))}
                autoCapitalize="words"
              />
              <Field
                label={t('common.phone')}
                value={form.phone}
                onChangeText={(next) => setForm((f) => ({ ...f, phone: next }))}
                keyboardType="phone-pad"
              />
              <Field
                label={t('common.notes')}
                value={form.message}
                onChangeText={(next) => setForm((f) => ({ ...f, message: next }))}
                multiline
                numberOfLines={3}
              />
              <Btn title={t('action.send')} busy={busy === 'inquiry'} onPress={() => void sendInquiry()} />
              <Btn title={t('common.cancel')} variant="ghost" onPress={() => setInquiryOpen(false)} />
            </View>
          ) : (
            <Btn title={t('unit.inquire')} variant="ghost" onPress={() => setInquiryOpen(true)} />
          )}
        </Card>
      </View>
      </Screen>
      {/* Sticky booking bar — same /viewing/book navigation as the headline card, always visible. Showcase samples never book: inquiry CTA only. */}
      <View style={[styles.stickyBar, row, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {!unit.isSample ? (
          <Btn title={t('unit.book')} style={styles.stickyPrimary} onPress={openBooking} />
        ) : null}
        <Btn title={t('share.whatsapp')} variant="ghost" onPress={shareUnitWhatsApp} />
      </View>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    galleryStrip: { flexGrow: 0 },
    galleryImage: { width: 320, height: 210, backgroundColor: t.muted, marginRight: 2 },
    body: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },
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
    crumbs: { alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    crumbLink: { color: t.primary, fontSize: 13, fontWeight: '600', maxWidth: 160 },
    crumbSep: { color: t.mutedForeground, fontSize: 13 },
    crumbCurrent: { color: t.foreground, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    paragraph: { color: t.mutedForeground, fontSize: 14, lineHeight: 21 },
    floorPlan: {
      width: '100%',
      height: 240,
      borderRadius: 8,
      backgroundColor: t.muted,
    },
    headline: { alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
    headlineMain: { flex: 1, gap: 3 },
    name: { color: t.foreground, fontSize: 22, lineHeight: 30, fontWeight: '800' },
    locationRow: { alignItems: 'center', gap: 5 },
    location: { color: t.mutedForeground, fontSize: 14 },
    tagRow: { flexWrap: 'wrap', gap: 8 },
    priceBlock: { gap: 2, marginTop: 2 },
    price: { color: t.primary, fontSize: 24, fontWeight: '800' },
    priceSub: { color: t.mutedForeground, fontSize: 14 },
    actionRow: { gap: 8 },
    actionHalf: { flex: 1 },
    hint: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    specGrid: { flexWrap: 'wrap', gap: 8 },
    spec: {
      width: '23%',
      minWidth: 76,
      flexGrow: 1,
      alignItems: 'center',
      gap: 3,
      paddingVertical: Spacing.sm,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 12,
    },
    specValue: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    specLabel: { color: t.mutedForeground, fontSize: 12, textAlign: 'center' },
    money: { color: t.primary, fontSize: 14, fontWeight: '800' },
    devLogo: { width: 36, height: 36, borderRadius: 18 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    form: { gap: 4 },
    sentBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sentText: { flex: 1, gap: 2 },
    sentTitle: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    sentHint: { color: t.mutedForeground, fontSize: 14, lineHeight: 18 },
  }),
);
