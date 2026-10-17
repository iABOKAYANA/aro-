import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  SectionTitle,
} from '@/components/ui';
import { useApi, useMutation } from '@/hooks/use-api';
import { useRoleDenied } from '@/components/role-gate';
import { useI18n, type MessageKey } from '@/i18n';
import { humanise, timeAgo } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type Project = { id: string; name: string };

type Draft = {
  approvalId: string;
  projectId?: string;
  projectName?: string;
  title?: string;
  kind: string;
  content: string;
  engine?: string;
  status: string;
  createdAt?: string;
};

/** Server's `CONTENT_KINDS`, paired with the label each one gets on screen. */
const KINDS: { value: string; label: MessageKey }[] = [
  { value: 'DESCRIPTION_EN', label: 'ceo.content.describeEn' },
  { value: 'DESCRIPTION_AR', label: 'ceo.content.describeAr' },
  { value: 'SHORT_LISTING', label: 'ceo.content.shortListing' },
  { value: 'SEO_TITLE', label: 'ceo.content.seoTitle' },
  { value: 'SEO_DESC', label: 'ceo.content.seoDesc' },
  { value: 'SOCIAL', label: 'ceo.content.social' },
  { value: 'WHATSAPP', label: 'ceo.content.whatsapp' },
];

type Generated = { content?: string; draft?: Draft; engine?: string };

/**
 * AI Content Studio — the `/api/ceo/content` route with a face.
 *
 * Like the approvals queue, this endpoint exists on the server with no web
 * page calling it. Generation always saves a draft (the endpoint's default),
 * so nothing reaches a live field until a reviewer approves it with
 * `publish: true` — which only CEO/ADMIN may do.
 */
export default function CeoContentScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [kind, setKind] = useState<string>('DESCRIPTION_EN');
  const [result, setResult] = useState<Generated | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const projects = useApi<{ projects?: Project[] }>('/api/projects?limit=100');
  const drafts = useApi<{ drafts?: Draft[] }>(
    projectId ? `/api/ceo/content?projectId=${encodeURIComponent(projectId)}` : null,
    Boolean(projectId),
  );
  const mutation = useMutation();

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  async function generate() {
    if (!projectId) return;
    setProblem(null);
    setResult(null);
    try {
      const data = await mutation.run('/api/ceo/content', 'POST', { projectId, kind, autoSave: true });
      setResult(data as Generated);
      drafts.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function review(draft: Draft, decision: 'approve' | 'reject') {
    setProblem(null);
    try {
      await mutation.run('/api/ceo/content', 'PATCH', {
        approvalId: draft.approvalId,
        decision,
        ...(decision === 'approve' ? { publish: true } : {}),
      });
      drafts.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  if (projects.loading) return <Loading label={t('common.loading')} />;

  const projectList = projects.data?.projects ?? [];
  const draftList = drafts.data?.drafts ?? [];
  const shown = result?.draft?.content ?? result?.content;

  return (
    <Screen refreshing={drafts.refreshing} onRefresh={() => { projects.refresh(); drafts.refresh(); }}>
      <Stack.Screen options={{ title: t('ceo.content') }} />

      {projects.error ? <ErrorBar message={projects.error} onRetry={projects.refresh} /> : null}
      {drafts.error ? <ErrorBar message={drafts.error} onRetry={drafts.refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}

      <SectionTitle>{t('ceo.content.pick')}</SectionTitle>
      <View style={styles.wrap}>
        {projectList.slice(0, 60).map((project) => (
          <Chip
            key={project.id}
            label={project.name}
            selected={projectId === project.id}
            onPress={() => {
              setProjectId(project.id);
              setResult(null);
            }}
          />
        ))}
      </View>

      <SectionTitle>{t('ceo.content.kind')}</SectionTitle>
      <View style={styles.wrap}>
        {KINDS.map((entry) => (
          <Chip
            key={entry.value}
            label={t(entry.label)}
            selected={kind === entry.value}
            onPress={() => setKind(entry.value)}
          />
        ))}
      </View>

      <Btn
        title={mutation.busy ? t('ceo.content.generating') : t('ceo.content.generate')}
        disabled={!projectId}
        busy={mutation.busy}
        onPress={() => void generate()}
      />
      <Text style={styles.hint}>{t('ceo.content.autoSaveHint')}</Text>

      {shown ? (
        <Card>
          <SectionTitle action={result?.engine ? <Badge tone="muted">{result.engine}</Badge> : undefined}>
            {result?.draft?.title ?? humanise(kind)}
          </SectionTitle>
          <Text style={[styles.content, align]} selectable>
            {shown}
          </Text>
          {result?.draft ? (
            <Btn
              title={t('ceo.approve')}
              onPress={() => void review(result.draft!, 'approve')}
            />
          ) : null}
        </Card>
      ) : null}

      <SectionTitle>{t('ceo.content.drafts')}</SectionTitle>
      {drafts.loading ? (
        <Loading label={t('common.loading')} />
      ) : draftList.length === 0 ? (
        <Empty title={t('ceo.content.none')} message={t('ceo.content.noneHint')} />
      ) : (
        draftList.map((draft, index) => (
          <View key={draft.approvalId}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={draft.title ?? humanise(draft.kind)}
                subtitle={[draft.projectName, draft.createdAt ? timeAgo(draft.createdAt) : null]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <Badge tone={draft.status === 'APPROVED' || draft.status === 'PUBLISHED' ? 'green' : 'gold'}>
                    {humanise(draft.status)}
                  </Badge>
                }
              />
              <Text style={[styles.preview, align]} numberOfLines={4}>
                {draft.content}
              </Text>
              <View style={[styles.actions, row]}>
                <Btn
                  title={t('ceo.approve')}
                  style={styles.action}
                  onPress={() => void review(draft, 'approve')}
                />
                <Btn
                  title={t('ceo.content.rejectDraft')}
                  variant="ghost"
                  style={styles.action}
                  onPress={() => void review(draft, 'reject')}
                />
              </View>
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    card: { gap: 6 },
    content: { color: t.foreground, fontSize: 14, lineHeight: 21 },
    preview: { color: t.mutedForeground, fontSize: 14, lineHeight: 19 },
    actions: { gap: 8 },
    action: { flex: 1 },
  }),
);
