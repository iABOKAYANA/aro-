import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { useRoleDenied } from '@/components/role-gate';
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
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { useCurrency } from '@/lib/currency';
import { formatMoney, humanise } from '@/lib/format';
import { createStyles } from '@/lib/theme';

/**
 * Record a deal — the same `POST /api/deals` the website reports deals with,
 * so the commission sync (`src/lib/commission.ts`) and the lead's lifecycle
 * flip happen the moment the app saves, with no second code path.
 *
 * The route is `requireActor(['CEO', 'ADMIN', 'DEVELOPER'])` — a broker *is*
 * attributed on deals but cannot create them — and it refuses a lead that has
 * no project, so the project picker below doubles as the fallback the server
 * error asks for.
 *
 * The lead picker reads `GET /api/leads`, where some roles see masked phones;
 * that is the server's ownership rule and expected here.
 */
type DealStatus = 'RESERVATION' | 'CONTRACT' | 'SOLD' | 'CANCELLED' | 'LOST';
type DealSource = 'PLATFORM' | 'OFF_PLATFORM_REPORT';

type PickLead = {
  id: string;
  leadCode?: string | null;
  name: string;
  phone?: string | null;
  project?: { id: string; name: string; nameArabic?: string | null } | null;
};

type PickUnit = { id: string; name: string; projectId: string };

type Project = { id: string; name: string; nameArabic?: string | null };

type LeadsResponse = { leads?: PickLead[]; total?: number; page?: number; totalPages?: number };

type CreatedDeal = { id: string; status: string; dealValue?: number | null };

/** Server's `dealCreateSchema` enum — anything else is a 400. */
const STATUSES: DealStatus[] = ['RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST'];

/** The two values `dealCreateSchema` accepts for `source`. */
const SOURCES: { value: DealSource; labelKey: MessageKey }[] = [
  { value: 'PLATFORM', labelKey: 'deals.sourcePlatform' },
  { value: 'OFF_PLATFORM_REPORT', labelKey: 'deals.sourceOffPlatform' },
];

/** Empty or junk → null, so "typed a real number?" is one comparison. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function NewDealScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const mutation = useMutation();

  const leads = useApi<LeadsResponse>('/api/leads?page=1&limit=50');
  const projects = useApi<{ projects?: Project[] }>('/api/projects?limit=100');

  const [leadId, setLeadId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [status, setStatus] = useState<DealStatus>('RESERVATION');
  const [dealValue, setDealValue] = useState('');
  const [source, setSource] = useState<DealSource>('PLATFORM');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [noProject, setNoProject] = useState(false);
  const [created, setCreated] = useState<CreatedDeal | null>(null);

  const leadList = leads.data?.leads ?? [];
  const selectedLead = leadId ? leadList.find((lead) => lead.id === leadId) ?? null : null;
  // The server resolves `projectId = input.projectId || lead.projectId`, so
  // the picker is only needed for a lead that never got linked to one.
  const resolvedProjectId = selectedLead?.project?.id ?? projectId;
  const showProjectPicker = Boolean(selectedLead && (!selectedLead.project || noProject));

  // Units ride on the *resolved* project and are filtered client-side on the
  // scalar `projectId` each `/api/units` row carries — no guessing, no extra
  // endpoint. Disabled (and never fetched) until a project is known.
  const units = useApi<{ units?: PickUnit[] }>('/api/units', Boolean(resolvedProjectId));

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN', 'DEVELOPER']);
  if (denied) return denied;

  if (created) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('deals.created') }} />
        <Card>
          <SectionTitle>{t('deals.created')}</SectionTitle>
          <Text style={[styles.hint, align]}>{t('deals.createdHint')}</Text>
          <Divider />
          <Row title={humanise(created.status)} subtitle={t('deals.stage')} />
          <Divider />
          <Row
            title={formatMoney(created.dealValue, currency, rates)}
            subtitle={t('deals.dealValue')}
          />
        </Card>
        <Btn title={t('deals.goToDeals')} onPress={() => router.replace('/(tabs)/deals')} />
        <Btn title={t('common.close')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (leads.loading) return <Loading label={t('common.loading')} />;

  const search = query.trim().toLowerCase();
  const filteredLeads = search
    ? leadList.filter((lead) =>
        [lead.name, lead.leadCode, lead.phone].some((field) =>
          (field ?? '').toLowerCase().includes(search)
        )
      )
    : leadList;
  const projectList = projects.data?.projects ?? [];
  const unitList = resolvedProjectId
    ? (units.data?.units ?? []).filter((unit) => unit.projectId === resolvedProjectId)
    : [];
  const amount = parseAmount(dealValue);

  async function submit() {
    setProblem(null);

    if (!leadId) {
      setProblem(t('deals.leadRequired'));
      return;
    }
    const value = parseAmount(dealValue);
    if (value === null) {
      setProblem(t('deals.valueRequired'));
      return;
    }
    if (!resolvedProjectId) {
      // The server answers this exact case with a 400 — catch it before the
      // round trip and open the fallback picker.
      setNoProject(true);
      setProblem(t('deals.projectRequired'));
      return;
    }

    try {
      const result = (await mutation.run('/api/deals', 'POST', {
        leadId,
        status,
        dealValue: value,
        source,
        ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
        ...(unitId ? { unitId } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })) as { deal?: CreatedDeal } | null;

      if (result?.deal) {
        setCreated(result.deal);
      } else {
        Alert.alert(t('deals.created'));
        router.replace('/(tabs)/deals');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : t('deals.createFailed');
      if (/has no project/i.test(message)) {
        // "Lead has no project. Link the lead to a project before recording
        // the deal." — reveal the picker and answer in the user's language.
        setNoProject(true);
        setProblem(t('deals.leadNoProject'));
      } else {
        setProblem(message);
      }
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('deals.new') }} />

      <Text style={[styles.intro, align]}>{t('deals.newHint')}</Text>

      <Card>
        <SectionTitle>{t('deals.pickLead')}</SectionTitle>
        <SearchBar value={query} onChangeText={setQuery} placeholder={t('deals.searchLeads')} />

        {leads.error ? <ErrorBar message={leads.error} onRetry={leads.refresh} /> : null}
        {!leads.error && filteredLeads.length === 0 ? (
          <Empty title={t('deals.noLeads')} />
        ) : null}

        {filteredLeads.map((lead, index) => {
          const selected = lead.id === leadId;
          return (
            <View key={lead.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={lead.name}
                subtitle={[lead.leadCode, lead.project?.name]
                  .filter(Boolean)
                  .join(' · ')}
                badge={selected ? <Badge tone="gold">{t('deals.selected')}</Badge> : undefined}
                onPress={() => {
                  setLeadId(lead.id);
                  // A new lead may sit on another project — never carry the
                  // previous selection (or a stale fallback) across.
                  setProjectId(null);
                  setUnitId(null);
                  setNoProject(false);
                  setProblem(null);
                }}
              />
            </View>
          );
        })}
      </Card>

      {showProjectPicker && selectedLead ? (
        <Card>
          <SectionTitle>{t('deals.pickProject')}</SectionTitle>
          {projects.loading ? <Loading /> : null}
          {projects.error ? <ErrorBar message={projects.error} onRetry={projects.refresh} /> : null}
          {!projects.loading && !projects.error && projectList.length === 0 ? (
            <Text style={[styles.hint, align]}>{t('deals.noProjects')}</Text>
          ) : null}
          <View style={[styles.chips, row]}>
            {projectList.map((project) => (
              <Chip
                key={project.id}
                label={localized(project.name, project.nameArabic)}
                selected={projectId === project.id}
                onPress={() => {
                  setProjectId(projectId === project.id ? null : project.id);
                  setUnitId(null);
                }}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {resolvedProjectId && (unitList.length > 0 || units.error) ? (
        <Card>
          <SectionTitle>{t('deals.unitOptional')}</SectionTitle>
          {units.error ? <ErrorBar message={units.error} onRetry={units.refresh} /> : null}
          <View style={[styles.chips, row]}>
            <Chip
              label={t('common.none')}
              selected={unitId === null}
              onPress={() => setUnitId(null)}
            />
            {unitList.slice(0, 60).map((unit) => (
              <Chip
                key={unit.id}
                label={unit.name}
                selected={unitId === unit.id}
                onPress={() => setUnitId(unitId === unit.id ? null : unit.id)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>{t('deals.terms')}</SectionTitle>

        <Text style={[styles.groupLabel, align]}>{t('deals.stage')}</Text>
        <View style={[styles.chips, row]}>
          {STATUSES.map((value) => (
            <Chip
              key={value}
              label={humanise(value)}
              selected={status === value}
              onPress={() => setStatus(value)}
            />
          ))}
        </View>

        <Field
          label={t('deals.dealValue')}
          value={dealValue}
          onChangeText={setDealValue}
          keyboardType="numeric"
        />
        {amount !== null ? (
          <Text style={[styles.moneyHint, align]}>{formatMoney(amount, currency, rates)}</Text>
        ) : null}

        <Text style={[styles.groupLabel, align]}>{t('deals.source')}</Text>
        <View style={[styles.chips, row]}>
          {SOURCES.map((option) => (
            <Chip
              key={option.value}
              label={t(option.labelKey)}
              selected={source === option.value}
              onPress={() => setSource(option.value)}
            />
          ))}
        </View>

        <Field
          label={t('deals.notesOptional')}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          style={[styles.notes, align]}
        />
      </Card>

      {problem ? <ErrorBar message={problem} /> : null}

      <Btn title={t('deals.create')} busy={mutation.busy} onPress={submit} />
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    groupLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    moneyHint: { color: t.primary, fontSize: 14, fontWeight: '600' },
    // `Field` spreads `style` *after* its own input rule, so a multiline box
    // restates the input chrome instead of inheriting it.
    notes: {
      minHeight: 88,
      textAlignVertical: 'top',
      paddingTop: 10,
      backgroundColor: t.background,
      borderWidth: 1,
      borderColor: t.input,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.sm + 6,
      color: t.foreground,
      fontSize: 16,
    },
  }),
);
