import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { Chip, ErrorBar } from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { humanise } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * "Ayn" for the CEO console — `POST /api/ceo/ai`, the rule-based analytics
 * reader the website's control centre talks to. Same contract as the app's
 * Ollama assistant (a thread of bubbles plus a composer), but every answer
 * here is computed from the database on the server: the screen renders the
 * `answer` string and the `data` rows exactly as they come back and never
 * writes a figure of its own. An empty `data` simply means the server had
 * nothing to attach, and the text still stands on its own.
 *
 * The suggestion chips are phrased for the reader (translated), while the
 * question posted is the server's own keyword form — `/api/ceo/ai` matches on
 * English keywords, so sending the Arabic label would land on its fallback
 * reply instead of the numbers the chip promises.
 */

type Message = {
  id: string;
  role: 'user' | 'server';
  content: string;
  rows?: { id: string; title: string; meta?: string }[];
};

type AiResponse = { answer?: string; data?: unknown };

type Suggestion = { labelKey: MessageKey; question: string };

const SUGGESTIONS: Suggestion[] = [
  { labelKey: 'ceo.ai.suggestProjects', question: 'Which projects have the most inquiries?' },
  { labelKey: 'ceo.ai.suggestLeads', question: 'How many leads are unassigned?' },
  { labelKey: 'ceo.ai.suggestConversion', question: 'What is the lead conversion rate?' },
  { labelKey: 'ceo.ai.suggestBrokers', question: 'Which brokers are performing best?' },
  { labelKey: 'ceo.ai.suggestUnits', question: 'How many units are available?' },
  { labelKey: 'ceo.ai.suggestViewings', question: 'How many viewings are booked?' },
];

/** Fields worth showing first when the server hands back an object row. */
const TITLE_KEYS = ['name', 'companyName', 'leadCode', 'status', 'role', 'type', 'month', 'unitType'];

/** Flatten whatever shape the route answered with into displayable rows. */
function toRows(data: unknown): { id: string; title: string; meta?: string }[] {
  const scalars = (source: Record<string, unknown>) =>
    Object.entries(source).filter(
      ([, value]) => value !== null && value !== undefined && typeof value !== 'object',
    );

  const titleOf = (item: Record<string, unknown>, index: number) => {
    const entries = scalars(item);
    const preferred = entries.find(([key]) => TITLE_KEYS.includes(key));
    if (preferred) return String(preferred[1]);
    // Nested `{ user: { name } }` shapes — the broker performance list.
    const nested = Object.values(item).find(
      (value) => value && typeof value === 'object' && !Array.isArray(value),
    ) as Record<string, unknown> | undefined;
    const nestedName = nested?.name ?? nested?.companyName ?? nested?.email;
    if (nestedName) return String(nestedName);
    return entries.length > 0 ? String(entries[0][1]) : String(index + 1);
  };

  if (Array.isArray(data)) {
    return data.slice(0, 20).map((item, index) => {
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const title = titleOf(record, index);
        const meta = scalars(record)
          .filter(([, value]) => String(value) !== title)
          .map(([key, value]) => `${humanise(key)} ${String(value)}`)
          .join(' · ');
        return { id: String(index), title, ...(meta ? { meta } : {}) };
      }
      return { id: String(index), title: String(item) };
    });
  }

  if (data && typeof data === 'object') {
    const entries = scalars(data as Record<string, unknown>);
    if (entries.length === 0) return [];
    return [
      {
        id: '0',
        title: entries.map(([key, value]) => `${humanise(key)} ${String(value)}`).join(' · '),
      },
    ];
  }

  if (typeof data === 'string' || typeof data === 'number') {
    return [{ id: '0', title: String(data) }];
  }

  return [];
}

export default function CeoAiScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, align } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  const nextId = useRef(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation();

  // Keep the newest bubble in view whenever the thread grows.
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages, mutation.busy]);

  async function ask(display: string, question: string) {
    if (mutation.busy || !question.trim()) return;

    setProblem(null);
    const mine: Message = { id: `u${nextId.current++}`, role: 'user', content: display };
    setMessages((prev) => [...prev, mine]);
    setInput('');

    try {
      const result = await mutation.run('/api/ceo/ai', 'POST', { question });
      const response = (result ?? {}) as AiResponse;
      const rows = toRows(response.data);
      setMessages((prev) => [
        ...prev,
        {
          id: `s${nextId.current++}`,
          role: 'server',
          content: response.answer?.trim() || t('ceo.aiFailed'),
          ...(rows.length > 0 ? { rows } : {}),
        },
      ]);
    } catch {
      // Roll the failed turn back so a retry does not duplicate the bubble.
      setMessages((prev) => prev.filter((message) => message.id !== mine.id));
      setProblem(t('ceo.aiFailed'));
      setInput(display);
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: t('ceo.ai') }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <View style={styles.intro}>
              <Text style={[styles.introTitle, align]}>{t('ceo.ai.intro')}</Text>
              <Text style={[styles.introBody, align]}>{t('ceo.askAiHint')}</Text>
              <View style={[styles.suggestions, row]}>
                {SUGGESTIONS.map((suggestion) => (
                  <Chip
                    key={suggestion.labelKey}
                    label={t(suggestion.labelKey)}
                    onPress={() => void ask(t(suggestion.labelKey), suggestion.question)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((message) => (
            <View
              key={message.id}
              style={[styles.bubble, message.role === 'user' ? styles.mine : styles.theirs]}>
              <Text
                style={[styles.bubbleText, align, message.role === 'user' && styles.bubbleTextMine]}>
                {message.content}
              </Text>

              {message.role === 'server' && !message.rows?.length ? (
                <Text style={[styles.noData, align]}>{t('ceo.ai.noData')}</Text>
              ) : null}

              {message.rows?.length ? (
                <View style={styles.rows}>
                  {message.rows.map((line) => (
                    <View key={line.id} style={styles.rowLine}>
                      <Text style={[styles.rowTitle, align]}>{line.title}</Text>
                      {line.meta ? <Text style={[styles.rowMeta, align]}>{line.meta}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          {mutation.busy ? (
            <View style={[styles.bubble, styles.theirs, styles.typing, row]}>
              <ActivityIndicator color={theme.primary} size="small" />
              <Text style={styles.typingText}>{t('ceo.ai.thinking')}</Text>
            </View>
          ) : null}
        </ScrollView>

        {problem ? <ErrorBar message={problem} /> : null}

        <View style={[styles.composer, row]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('ceo.askAi')}
            placeholderTextColor={theme.mutedForeground}
            style={[styles.input, align]}
            multiline
            maxLength={2000}
            editable={!mutation.busy}
            onSubmitEditing={() => void ask(input, input)}
          />
          <Pressable
            onPress={() => void ask(input, input)}
            disabled={mutation.busy || !input.trim()}
            style={[styles.send, (mutation.busy || !input.trim()) && styles.sendDisabled]}>
            <Text style={styles.sendText}>{t('action.send')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.background },
    flex: { flex: 1 },
    thread: { padding: Spacing.md, gap: 10, paddingBottom: 20 },
    intro: { gap: 8, paddingVertical: 24 },
    introTitle: { color: t.foreground, fontSize: 20, fontWeight: '800' },
    introBody: { color: t.mutedForeground, fontSize: 14, lineHeight: 21 },
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    bubble: {
      maxWidth: '86%',
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 6,
    },
    mine: {
      alignSelf: 'flex-end',
      backgroundColor: t.goldBg,
      borderColor: t.border,
      borderBottomRightRadius: 4,
    },
    theirs: {
      alignSelf: 'flex-start',
      backgroundColor: t.card,
      borderColor: t.border,
      borderBottomLeftRadius: 4,
    },
    bubbleText: { color: t.foreground, fontSize: 15, lineHeight: 21 },
    bubbleTextMine: { color: t.goldFg },
    rows: { gap: 4, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 6 },
    rowLine: { gap: 1 },
    rowTitle: { color: t.foreground, fontSize: 14, fontWeight: '700' },
    rowMeta: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    noData: { color: t.mutedForeground, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
    typing: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
    typingText: { color: t.mutedForeground, fontSize: 14 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
      backgroundColor: t.card,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: t.foreground,
      fontSize: 16,
    },
    send: {
      backgroundColor: t.primary,
      borderRadius: Radius.md,
      paddingHorizontal: 18,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.5 },
    sendText: { color: t.primaryForeground, fontWeight: '800', fontSize: 15 },
  }),
);
