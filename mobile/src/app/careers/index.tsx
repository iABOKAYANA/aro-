import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Btn, Card, Empty, ErrorBar, Loading, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { humanise } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * The website's /careers reads every published job in one query and has no
 * pager, so the app asks for one generous page instead of inventing one — the
 * same `?page=&limit=` shape /api/blog and /api/press use.
 */
const LIST_PATH = '/api/jobs?page=1&limit=100';

type Translate = (key: MessageKey) => string;

/** One row of `GET /api/jobs` — the Prisma `Job` model, unmodified. */
type Job = {
  id: string;
  title: string;
  titleArabic?: string | null;
  slug: string;
  department: string;
  location: string;
  type?: string | null;
  description: string;
  descriptionArabic?: string | null;
  requirements?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  isPublished?: boolean;
};

/** `src/app/api/jobs/route.ts` response. */
type JobsResponse = {
  items?: Job[];
  total?: number;
  page?: number;
  totalPages?: number;
};

/** The site's `TYPE_LABELS` map, with `humanise` standing in for anything else. */
const TYPE_KEYS: Record<string, MessageKey> = {
  FULL_TIME: 'careers.typeFullTime',
  PART_TIME: 'careers.typePartTime',
  CONTRACT: 'careers.typeContract',
  INTERNSHIP: 'careers.typeInternship',
};

function typeLabel(type: string | null | undefined, t: Translate): string {
  const key = TYPE_KEYS[String(type ?? '')];
  return key ? t(key) : humanise(type);
}

/**
 * The website's /careers: a centred page heading and tagline, then every
 * published job as a card — title (linking to /careers/:slug), a two-line
 * description, the department / location / type pills and an Apply Now
 * shortcut. Apply opens the same form the job page uses, one screen deeper.
 */
export default function CareersScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t: theme } = useTheme();
  const { t, row, text, align, localized } = useI18n();

  const { data, error, loading, refreshing, refresh } = useApi<JobsResponse>(LIST_PATH);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('careers.title') }} />
        <Loading label={t('careers.loading')} />
      </Screen>
    );
  }

  const jobs = data?.items ?? [];

  function openJob(job: Job, apply = false) {
    // The route is addressed by slug, like the website; `id` rides along so
    // the detail screen reads the job straight from /api/jobs/:id, and `apply`
    // lands the reader in the same dialog the site's Apply Now opens.
    router.push({
      pathname: '/careers/[slug]',
      params: { slug: job.slug, id: job.id, ...(apply ? { apply: '1' } : {}) },
    });
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('careers.title') }} />

      <View style={styles.head}>
        <Text style={[styles.title, text]}>{t('careers.title')}</Text>
        <Text style={[styles.subtitle, text]}>{t('careers.subtitle')}</Text>
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && jobs.length === 0 ? (
        <Empty title={t('careers.empty')} message={t('careers.emptyHint')} />
      ) : null}

      {jobs.map((job) => (
        <Card key={job.id} style={styles.card}>
          <Pressable
            onPress={() => openJob(job)}
            style={({ pressed }) => [styles.jobLink, pressed && styles.pressed]}>
            <Text style={[styles.jobTitle, align]}>{localized(job.title, job.titleArabic)}</Text>
            <Text style={[styles.jobDesc, align]} numberOfLines={2}>
              {localized(job.description, job.descriptionArabic)}
            </Text>
          </Pressable>

          <View style={[styles.pills, row]}>
            <Badge tone="gold">{job.department}</Badge>
            {job.location ? (
              <View style={[styles.pill, row]}>
                <Ionicons name="location-outline" size={12} color={theme.secondaryForeground} />
                <Text style={styles.pillText}>{job.location}</Text>
              </View>
            ) : null}
            <Badge tone="muted">{typeLabel(job.type, t)}</Badge>
          </View>

          <Btn title={t('careers.apply')} variant="ghost" onPress={() => openJob(job, true)} />
        </Card>
      ))}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    // `mb-12 text-center` heading block from the site's careers page.
    head: { alignItems: 'center', gap: 6, paddingTop: Spacing.xs, paddingHorizontal: 4 },
    title: { color: t.foreground, fontSize: 28, fontWeight: '800', textAlign: 'center' },
    subtitle: {
      color: t.mutedForeground,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      paddingHorizontal: Spacing.sm,
    },

    card: { gap: 10 },
    jobLink: { gap: 6 },
    pressed: { opacity: 0.85 },
    jobTitle: { color: t.foreground, fontSize: 17, fontWeight: '700', lineHeight: 24 },
    jobDesc: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },

    pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    // Location pill — the site's `bg-white/5 text-gray-400` span with the pin
    // glyph, restated on the Badge-muted palette so light and dark both hold.
    pill: {
      alignItems: 'center',
      gap: 4,
      borderRadius: Radius.full,
      backgroundColor: t.secondary,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    pillText: { color: t.secondaryForeground, fontSize: 12, fontWeight: '500' },
  })
);
