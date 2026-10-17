import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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
  SectionTitle,
} from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useAuth } from '@/auth/auth-context';
import { ApiError, apiFetch } from '@/api/client';
import { API_URL } from '@/api/config';
import { getItemAsync, setItemAsync } from '@/lib/storage';
import { useI18n, type MessageKey } from '@/i18n';
import { formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * "Ayn" — the same `POST /api/ai/chat` the website's chat box talks to, so the
 * assistant keeps one conversation history, one set of tool permissions and one
 * model across web and app. No mobile-side model, no second prompt.
 *
 * The server answers with `blocks` (`src/lib/ai-llm.ts`) and the website renders
 * them in `src/components/search/full-page-chat.tsx`: structured answers arrive
 * as a property grid, a comparison table or a payment breakdown, never as prose
 * to be squinted at. Those blocks are rendered here natively instead of being
 * dropped, `**bold**` runs in `text` blocks are turned into real bold `Text`
 * runs (RN has no HTML), and `GET /api/ai/status` is probed before the first
 * message so a downed Ollama announces itself instead of looking like a dead
 * chat box.
 *
 * The conversation id returned by the server is threaded back into the next
 * request; losing it simply starts a fresh thread rather than failing.
 * Anonymous turns also send the persistent `ghaya-anon-session` id and adopt
 * the server-returned `sessionId`, which the server's IDOR guard requires.
 */

/* ── Response shapes, transcribed from src/lib/ai-llm.ts ────────────────── */

type TextBlock = { type: 'text'; content: string };

type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  startPrice?: number | null;
  city?: string | null;
  developerName?: string | null;
  unitCount?: number;
  propertyTypes?: string[];
};

type UnitSummary = {
  id: string;
  slug?: string | null;
  projectName: string;
  unitType: string;
  bedrooms?: number | null;
  area: number;
  price: number;
  pricePerSqm?: number | null;
};

type PropertyGridBlock = {
  type: 'property_grid';
  title: string;
  projects?: ProjectSummary[];
  units?: UnitSummary[];
  total: number;
};

type ComparisonProject = {
  name: string;
  developer: string;
  city?: string | null;
  startPrice?: number | null;
  propertyTypes?: string[];
  unitCount?: number;
  totalUnits?: number | null;
  completionPercent?: number | null;
  downPaymentMin?: number | null;
  installmentYears?: number | null;
};

type ComparisonBlock = { type: 'comparison'; title: string; data: { projects: ComparisonProject[] } };

type PaymentCalculation = {
  unitPrice: number;
  downPaymentPct: number;
  downPaymentAmount: number;
  financedAmount: number;
  installmentYears: number;
  totalInstallments: number;
  semiAnnualPayment: number;
  monthlyPayment: number;
  pricePerSqm: number;
  area: number;
};

type PaymentBlock = { type: 'payment'; title: string; calculation: PaymentCalculation };

type FilterUpdateBlock = {
  type: 'filter_update';
  filters: Record<string, string | number>;
  chips: { label: string; value: string; field: string }[];
};

type ResponseBlock = TextBlock | PropertyGridBlock | ComparisonBlock | PaymentBlock | FilterUpdateBlock;

type Message = { id: string; role: 'user' | 'assistant'; content: string; blocks?: ResponseBlock[] };

type ChatResponse = {
  conversationId?: string | null;
  sessionId?: string | null;
  message?: { content?: string; blocks?: ResponseBlock[]; intent?: string; lang?: string };
};

/** `GET /api/ai/status` — `checkOllamaStatus()` in src/lib/ai/ollama.ts. */
type StatusResponse = {
  available?: boolean;
  model?: string;
  modelInstalled?: boolean;
  error?: string;
};

type AiStatus = 'loading' | 'online' | 'offline';

const QUICK_ACTIONS: { labelKey: MessageKey; queryKey: MessageKey }[] = [
  { labelKey: 'assistant.quickApartments', queryKey: 'assistant.quickApartmentsQ' },
  { labelKey: 'assistant.quickVillas', queryKey: 'assistant.quickVillasQ' },
  { labelKey: 'assistant.quickInvestment', queryKey: 'assistant.quickInvestmentQ' },
  { labelKey: 'assistant.quickLowDp', queryKey: 'assistant.quickLowDpQ' },
  { labelKey: 'assistant.quickReady', queryKey: 'assistant.quickReadyQ' },
  { labelKey: 'assistant.quickCompare', queryKey: 'assistant.quickCompareQ' },
];

const SUGGESTIONS: MessageKey[] = [
  'assistant.suggestNewCairo',
  'assistant.suggestNorthCoast',
  'assistant.suggestCompare',
  'assistant.suggestDownPayment',
];

// Anonymous chat identity: the server's IDOR guard requires continuations to
// present the conversation's matching sessionId, so one id per install.
// Module-level (not inside the component) so the purity lint stays quiet.
const ANON_SESSION_KEY = 'ghaya-anon-session';

function newAnonSessionId(): string {
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/* ── Voice search (بحث صوتي) ────────────────────────────────────────────
 *
 * Transcription engine per platform: on web builds the browser's Web Speech
 * API does the listening (`lang = 'ar-EG'`); on iOS/Android the
 * `expo-speech-recognition` package (native SFSpeechRecognizer /
 * SpeechRecognizer) does it through its `ExpoWebSpeechRecognition` wrapper,
 * which speaks the same Web Speech surface — so the mic button, listening
 * state machine, stop-on-second-tap and transcript-into-input plumbing below
 * stay engine-agnostic and only `getVoiceRecognizerCtor()` (sync, web) plus
 * `getNativeVoiceRecognizerCtor()` (async, native) know about engines.
 *
 * The native engine resolves behind a dynamic import: if the package is
 * missing or fails to load, the seam returns null and the tap lands on the
 * honest "unavailable" hint instead of crashing. Native taps also request
 * the mic + speech-recognition permissions up front; a denial lands on the
 * existing `voiceDenied` hint.
 *
 * Whatever happens, a tap never crashes and never auto-sends: the transcript
 * lands in the EXISTING composer input for review.
 */

interface VoiceResultAlternative {
  transcript: string;
}

interface VoiceResult extends ArrayLike<VoiceResultAlternative> {
  isFinal: boolean;
}

interface VoiceResultEvent {
  results: ArrayLike<VoiceResult>;
}

interface VoiceRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: VoiceResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type VoiceRecognizerCtor = new () => VoiceRecognizer;

function getVoiceRecognizerCtor(): VoiceRecognizerCtor | null {
  // Web builds keep the browser's Web Speech API — no dependency involved.
  if (Platform.OS !== 'web') return null;
  const scope = globalThis as unknown as {
    SpeechRecognition?: VoiceRecognizerCtor;
    webkitSpeechRecognition?: VoiceRecognizerCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Native engine: `expo-speech-recognition`'s `ExpoWebSpeechRecognition`
 * wrapper implements the same `lang` / `interimResults` / `onresult` /
 * `onerror` / `onend` surface the composer plumbing already speaks, so it
 * slots into `VoiceRecognizerCtor` with a cast. Dynamic import keeps the
 * "no engine" fallback when the package is missing or fails to load.
 */
async function getNativeVoiceRecognizerCtor(): Promise<VoiceRecognizerCtor | null> {
  try {
    const mod = await import('expo-speech-recognition');
    return (
      (mod.ExpoWebSpeechRecognition as unknown as VoiceRecognizerCtor | undefined) ?? null
    );
  } catch {
    return null;
  }
}

/** System mic + speech-recognition prompt; false covers denial and failure. */
async function requestNativeVoicePermission(): Promise<boolean> {
  try {
    const mod = await import('expo-speech-recognition');
    const result = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}

/* ── Streaming chat (SSE over XMLHttpRequest) ─────────────────────────
 *
 * React Native's `fetch` exposes no `ReadableStream` reader, so incremental
 * tokens arrive through XHR `onprogress` slices of `responseText`, parsed as
 * SSE with the same event contract the website shares in
 * `src/lib/chat-stream.ts`: `meta` (ids handshake, first) → `status`* →
 * `token`* → `done` (authoritative payload, already persisted) — or `error`
 * mid-stream. `: ping` comment heartbeats are ignored. A non-SSE 200 (the
 * offline JSON shape, or an older server) resolves with `sawEvents: false`
 * and the raw body so the caller falls back to the legacy JSON handling.
 */

class IncrementalSSEParser {
  private buf = '';
  private event = 'message';
  private dataBuf = '';
  private dispatched = 0;

  get sawEvents(): boolean {
    return this.dispatched > 0;
  }

  private dispatch(onEvent: (event: string, data: unknown) => void): void {
    if (!this.dataBuf) {
      this.event = 'message';
      return;
    }
    const raw = this.dataBuf;
    const ev = this.event;
    this.dataBuf = '';
    this.event = 'message';
    try {
      this.dispatched += 1;
      onEvent(ev, JSON.parse(raw));
    } catch {
      // Malformed frame — drop it, the `done` payload is authoritative.
    }
  }

  feed(text: string, onEvent: (event: string, data: unknown) => void): void {
    if (!text) return;
    this.buf += text;
    const lines = this.buf.split('\n');
    this.buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        this.dispatch(onEvent);
      } else if (trimmed.startsWith(':')) {
        // Server heartbeat comment — ignore.
      } else if (trimmed.startsWith('event:')) {
        this.event = trimmed.slice(6).trim() || 'message';
      } else if (trimmed.startsWith('data:')) {
        this.dataBuf += (this.dataBuf ? '\n' : '') + trimmed.slice(5).trim();
      }
    }
  }

  flush(onEvent: (event: string, data: unknown) => void): void {
    if (this.buf.trim().startsWith('data:')) {
      this.dataBuf += (this.dataBuf ? '\n' : '') + this.buf.trim().slice(5).trim();
      this.buf = '';
    }
    this.dispatch(onEvent);
  }
}

function postChatStream(options: {
  message: string;
  conversationId: string | null;
  sessionId: string | null;
  token: string | null;
  onEvent: (event: string, data: any) => void;
  onCancel: (cancel: () => void) => void;
}): Promise<{ sawEvents: boolean; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const parser = new IncrementalSSEParser();
    let seen = 0;
    let settled = false;
    const finish = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    // Same auth transport as apiFetch: JWT in X-Session-Token, folded back
    // into a session cookie by middleware (src/middleware.ts).
    xhr.open('POST', `${API_URL}/api/ai/chat`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    if (options.token) xhr.setRequestHeader('X-Session-Token', encodeURIComponent(options.token));
    // Server caps the whole stream at the tool-loop budget (280s); give the
    // transport matching headroom before it reports a timeout itself.
    try {
      xhr.timeout = 290_000;
    } catch {
      // Engine without timeout support — the server still caps the stream.
    }
    xhr.onprogress = () => {
      try {
        const full = xhr.responseText || '';
        const slice = full.slice(seen);
        seen = full.length;
        parser.feed(slice, options.onEvent);
      } catch {
        // A progress slice never fails the turn.
      }
    };
    xhr.onload = () => {
      try {
        const full = xhr.responseText || '';
        parser.feed(full.slice(seen), options.onEvent);
        seen = full.length;
        parser.flush(options.onEvent);
      } catch {
        // Fall through to status handling below.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(() => resolve({ sawEvents: parser.sawEvents, text: xhr.responseText || '' }));
      } else {
        let message = `Request failed (${xhr.status})`;
        try {
          const payload = JSON.parse(xhr.responseText || '') as { error?: unknown; message?: unknown };
          const raw = payload?.error ?? payload?.message;
          if (typeof raw === 'string' && raw) message = raw;
        } catch {
          // Keep the status-shaped message.
        }
        finish(() => reject(new ApiError(xhr.status, message)));
      }
    };
    xhr.onerror = () => {
      finish(() => reject(new ApiError(0, 'Cannot reach the server. Check your connection and API address.')));
    };
    xhr.ontimeout = () => {
      finish(() => reject(new ApiError(0, 'The assistant is taking too long. Please try again.')));
    };
    xhr.onabort = () => {
      finish(() => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    };
    options.onCancel(() => {
      try {
        xhr.abort();
      } catch {
        // Already settled — nothing to cancel.
      }
    });
    xhr.send(
      JSON.stringify({
        message: options.message,
        conversationId: options.conversationId,
        sessionId: options.sessionId,
        stream: true,
      }),
    );
  });
}

/**
 * The website prints a reply's blocks when it has them and falls back to the
 * model's prose otherwise — mirrored here so an answer never shows twice. A
 * reply whose blocks are *all* structured still gets its prose, which is the
 * one case where the site would leave an empty bubble behind.
 */
function replyTexts(message: Message): string[] {
  const blocks = message.blocks ?? [];
  const textBlocks = blocks.filter((block): block is TextBlock => block.type === 'text');
  if (textBlocks.length > 0) return textBlocks.map((block) => block.content).filter(Boolean);
  return message.content ? [message.content] : [];
}

export default function AssistantScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { session } = useAuth();
  const { t, row, align } = useI18n();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>('loading');
  const [checking, setChecking] = useState(false);
  const nextId = useRef(0);

  // Voice search: mic button beside the composer input. `listening` drives
  // the pulsing mic + "listening" label; `voiceMsg` carries the plain-words
  // Egyptian hint when the mic is denied or no engine exists in this build.
  const [listening, setListening] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState<MessageKey | null>(null);
  const voiceRef = useRef<VoiceRecognizer | null>(null);
  // Live SSE turn: aborting supersedes the request the same way the website's
  // AbortController does (unmount or an explicit stop).
  const streamCancelRef = useRef<(() => void) | null>(null);
  const [pulse] = useState(() => new Animated.Value(1));

  // The home "Ask Ayn" box pushes `/assistant?q=…` — the website's
  // `/ai-tools/chat?q=…` prefill. Seed the box once; never clobber typing.
  const seeded = useLocalSearchParams<Record<string, string | string[]>>();
  const seedQ = Array.isArray(seeded.q) ? seeded.q[0] : seeded.q;
  useEffect(() => {
    if (typeof seedQ === 'string' && seedQ.trim()) {
      setInput((prev) => (prev ? prev : seedQ));
    }
    // Only the incoming param seeds — re-running on `input` would fight typing.
  }, [seedQ]);

  /** Availability is probed once on mount, and again from the pull-to-refresh
   *  and the offline banner's retry — exactly the website's `available &&
   *  modelInstalled` test. */
  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const data = await apiFetch<StatusResponse>('/api/ai/status');
      setAiStatus(data.available && data.modelInstalled ? 'online' : 'offline');
    } catch {
      setAiStatus('offline');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  // Keep the newest bubble in view whenever the thread grows.
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages, busy]);

  // Hook safety: never leave the recognizer running past unmount.
  useEffect(() => {
    return () => {
      try {
        voiceRef.current?.abort();
      } catch {
        // Already stopped — nothing to clean up.
      }
      voiceRef.current = null;
      try {
        streamCancelRef.current?.();
      } catch {
        // No live stream — nothing to cancel.
      }
      streamCancelRef.current = null;
    };
  }, []);

  // Pulsing mic while the recognizer is active.
  useEffect(() => {
    if (!listening) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const stopVoice = useCallback(() => {
    try {
      voiceRef.current?.stop();
    } catch {
      // Already stopped — onend still resets the state.
    }
  }, []);

  const toggleVoice = useCallback(() => {
    // Second tap stops and keeps whatever already landed in the box.
    if (listening) {
      stopVoice();
      return;
    }
    void (async () => {
      const Ctor =
        Platform.OS === 'web' ? getVoiceRecognizerCtor() : await getNativeVoiceRecognizerCtor();
      if (!Ctor) {
        // Build without an STT engine: honest hint, never a crash.
        setVoiceMsg('assistant.voiceUnavailable');
        return;
      }
      if (Platform.OS !== 'web') {
        // System mic + speech-recognition prompt; a denial (or failure)
        // lands on the existing Egyptian hint instead of a doomed session.
        const granted = await requestNativeVoicePermission();
        if (!granted) {
          setVoiceMsg('assistant.voiceDeniedNative');
          return;
        }
      }
      setVoiceMsg(null);
      const recognition = new Ctor();
      recognition.lang = 'ar-EG';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const parts: string[] = [];
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i]?.[0]?.transcript;
          if (transcript) parts.push(transcript);
        }
        const text = parts.join(' ').trim();
        // Into the EXISTING input for review — never auto-sends.
        if (text) setInput(text);
      };
      recognition.onerror = (event) => {
        if (event.error === 'aborted') return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVoiceMsg('assistant.voiceDenied');
        } else if (event.error === 'no-speech') {
          setVoiceMsg('assistant.voiceNoSpeech');
        } else {
          setVoiceMsg('assistant.voiceUnavailable');
        }
      };
      recognition.onend = () => {
        setListening(false);
        voiceRef.current = null;
      };
      try {
        recognition.start();
        voiceRef.current = recognition;
        setListening(true);
      } catch {
        setVoiceMsg('assistant.voiceUnavailable');
      }
    })();
  }, [listening, stopVoice]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    setError(null);
    setInput('');
    const mine: Message = { id: `u${nextId.current++}`, role: 'user', content: message };
    setMessages((prev) => [...prev, mine]);
    setBusy(true);
    // Tokens patch this bubble in place; `done` replaces it authoritatively.
    let streamId: string | null = null;

    try {
      // Anonymous continuations must present the conversation's matching
      // sessionId (server IDOR guard) — one persistent id per install,
      // through the app's SecureStore/localStorage wrapper.
      let anonSessionId: string | null = null;
      try {
        anonSessionId = await getItemAsync(ANON_SESSION_KEY);
        if (!anonSessionId) {
          anonSessionId = newAnonSessionId();
          await setItemAsync(ANON_SESSION_KEY, anonSessionId);
        }
      } catch {
        anonSessionId = null;
      }
      let acc = '';
      let donePayload: ChatResponse | null = null;
      let errorPayload: { content?: unknown } | null = null;
      const outcome = await postChatStream({
        message,
        conversationId,
        sessionId: anonSessionId,
        token: session?.token ?? null,
        onEvent: (event, data) => {
          if (event === 'meta') {
            if (data?.conversationId) setConversationId(data.conversationId);
            // Self-heal: the server returns the authoritative id — adopt it
            // so a reinstalled store or an older id never 403s the next turn.
            if (data?.sessionId) {
              void setItemAsync(ANON_SESSION_KEY, String(data.sessionId)).catch(() => {
                // Storage blocked — this tab still works in memory.
              });
            }
          } else if (event === 'token') {
            acc += typeof data?.text === 'string' ? data.text : '';
            const snapshot = acc;
            if (!streamId) {
              streamId = `a${nextId.current++}`;
              const id = streamId;
              setMessages((prev) => [...prev, { id, role: 'assistant', content: snapshot }]);
            } else {
              const id = streamId;
              setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: snapshot } : m)));
            }
          } else if (event === 'done') {
            donePayload = (data ?? null) as ChatResponse | null;
          } else if (event === 'error') {
            errorPayload = (data ?? null) as { content?: unknown } | null;
          }
          // `status` events: the thinking indicator already covers the wait.
        },
        onCancel: (cancel) => {
          streamCancelRef.current = cancel;
        },
      });
      streamCancelRef.current = null;

      if (!outcome.sawEvents) {
        // Legacy JSON (offline shape, or an older server) — the pre-stream path.
        const result = JSON.parse(outcome.text || 'null') as ChatResponse;
        if (result?.conversationId) setConversationId(result.conversationId);
        if (result?.sessionId) await setItemAsync(ANON_SESSION_KEY, result.sessionId);
        const reply = result?.message?.content?.trim();
        setMessages((prev) => [
          ...prev,
          {
            id: `a${nextId.current++}`,
            role: 'assistant',
            content: reply || t('assistant.noAnswer'),
            blocks: result?.message?.blocks ?? [],
          },
        ]);
        return;
      }

      if (donePayload) {
        const done = donePayload as ChatResponse;
        if (done.conversationId) setConversationId(done.conversationId);
        // Self-heal: adopt the authoritative id for the next turn.
        if (done.sessionId) await setItemAsync(ANON_SESSION_KEY, done.sessionId);
        const reply = done.message?.content?.trim();
        const finalBubble = {
          role: 'assistant' as const,
          content: reply || t('assistant.noAnswer'),
          blocks: done.message?.blocks ?? [],
        };
        if (streamId) {
          const id = streamId;
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...finalBubble } : m)));
        } else {
          setMessages((prev) => [...prev, { id: `a${nextId.current++}`, ...finalBubble }]);
        }
        return;
      }

      if (errorPayload) {
        const content =
          typeof (errorPayload as { content?: unknown }).content === 'string' &&
          ((errorPayload as { content?: unknown }).content as string)
            ? ((errorPayload as { content?: unknown }).content as string)
            : t('assistant.unavailable');
        throw new Error(content);
      }

      // Stream ended with no `done` and no `error` (aborted): drop an empty
      // bubble, keep partial text so nothing the user saw vanishes.
      if (streamId && !acc) {
        const id = streamId;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      // Roll the failed turn back so a retry does not duplicate the bubble.
      const failedStreamId = streamId;
      setMessages((prev) => prev.filter((m) => m.id !== mine.id && m.id !== failedStreamId));
      setError(e instanceof Error ? e.message : t('assistant.unavailable'));
      setInput(message);
    } finally {
      streamCancelRef.current = null;
      setBusy(false);
    }
  }

  const statusBadge =
    aiStatus === 'loading' ? (
      <Badge tone="muted">{t('assistant.statusChecking')}</Badge>
    ) : aiStatus === 'online' ? (
      <Badge tone="green">{t('assistant.statusOnline')}</Badge>
    ) : (
      <Badge tone="red">{t('assistant.statusOffline')}</Badge>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: t('assistant.title') }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={checking} onRefresh={() => void checkStatus()} tintColor={theme.primary} />
          }>
          {messages.length === 0 ? (
            <Empty
              title={t('assistant.introTitle')}
              message={t('assistant.introBody')}
              action={
                <View style={styles.welcome}>
                  <View style={[styles.statusRow, row]}>{statusBadge}</View>

                  <Text style={[styles.framing, align]}>{t('assistant.quickLabel')}</Text>
                  <View style={[styles.chipRow, row]}>
                    {QUICK_ACTIONS.map((action) => (
                      <Chip
                        key={action.labelKey}
                        label={t(action.labelKey)}
                        selected={false}
                        onPress={() => send(t(action.queryKey))}
                      />
                    ))}
                  </View>

                  <Text style={[styles.framing, align]}>{t('assistant.suggestLabel')}</Text>
                  <View style={[styles.chipRow, row]}>
                    {SUGGESTIONS.map((suggestion) => (
                      <Chip
                        key={suggestion}
                        label={t(suggestion)}
                        selected={false}
                        onPress={() => send(t(suggestion))}
                      />
                    ))}
                  </View>
                </View>
              }
            />
          ) : null}

          {messages.map((message) => {
            const texts = message.role === 'user' ? [message.content] : replyTexts(message);
            return (
              <View key={message.id} style={styles.msg}>
                {texts.map((text, index) => (
                  <View
                    key={index}
                    style={[styles.bubble, message.role === 'user' ? styles.mine : styles.theirs]}>
                    {message.role === 'user' ? (
                      <Text style={[styles.bubbleText, align, styles.bubbleTextMine]}>{text}</Text>
                    ) : (
                      <RichText content={text} style={styles.bubbleText} />
                    )}
                  </View>
                ))}
                {message.role === 'assistant' && message.blocks?.length ? (
                  <Blocks blocks={message.blocks} />
                ) : null}
              </View>
            );
          })}

          {busy ? <Loading label={t('assistant.thinking')} /> : null}
        </ScrollView>

        {error ? <ErrorBar message={error} onRetry={() => send(input)} /> : null}
        {aiStatus === 'offline' ? (
          <>
            <ErrorBar message={t('assistant.statusOffline')} onRetry={() => void checkStatus()} />
            <Text style={[styles.offlineHint, align]}>{t('assistant.offlineHint')}</Text>
          </>
        ) : null}

        {listening ? (
          <Text style={[styles.voiceStatus, align]}>{t('assistant.voiceListening')}</Text>
        ) : null}
        {!listening && voiceMsg ? (
          <Text style={[styles.voiceHint, align]}>{t(voiceMsg)}</Text>
        ) : null}

        <View style={[styles.composer, row]}>
          <Pressable
            onPress={toggleVoice}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('assistant.voiceLabel')}
            accessibilityState={{ selected: listening }}
            style={[styles.mic, listening && styles.micActive]}>
            <Animated.View style={{ opacity: pulse }}>
              <Ionicons
                name={listening ? 'mic' : 'mic-outline'}
                size={22}
                color={listening ? theme.dangerFg : theme.mutedForeground}
              />
            </Animated.View>
          </Pressable>
          <TextInput
            value={input}
            onChangeText={(text) => {
              setInput(text);
              if (voiceMsg) setVoiceMsg(null);
            }}
            placeholder={t('assistant.placeholder')}
            placeholderTextColor={theme.mutedForeground}
            style={[styles.input, align]}
            multiline
            maxLength={2000}
            editable={!busy}
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={busy || !input.trim()}
            style={[styles.send, (busy || !input.trim()) && styles.sendDisabled]}>
            <Text style={styles.sendText}>{busy ? '…' : t('action.send')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

function Blocks({ blocks }: { blocks: ResponseBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'property_grid':
            return <PropertyGrid key={index} block={block} />;
          case 'comparison':
            return <ComparisonTable key={index} block={block} />;
          case 'payment':
            return <PaymentBreakdown key={index} block={block} />;
          case 'filter_update':
            return <FilterChips key={index} block={block} />;
          case 'text':
            // Rendered as the bubble above — never twice.
            return null;
          default:
            return null;
        }
      })}
    </>
  );
}

/** `**bold**` runs become real bold `Text` runs — RN has no HTML. */
function RichText({ content, style }: { content: string; style?: StyleProp<TextStyle> }) {
  const styles = useStyles();
  const { align } = useI18n();
  const parts = content.split(/(\*\*[^*]+\*\*)/);
  return (
    <Text style={[style, align]}>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <Text key={index} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={index}>{part}</Text>
        )
      )}
    </Text>
  );
}

/** The website's `ChatPropertyGrid` + results panel, folded into one list. */
function PropertyGrid({ block }: { block: PropertyGridBlock }) {
  const styles = useStyles();
  const router = useRouter();
  const { t, align } = useI18n();
  const { currency, rates } = useCurrency();

  const projects = block.projects ?? [];
  const units = block.units ?? [];
  const shown = projects.length + units.length;
  if (shown === 0) return null;

  const money = (value: number) => formatMoney(value, currency, rates, { compact: true });

  return (
    <Card style={styles.block}>
      {block.title ? <SectionTitle>{block.title}</SectionTitle> : null}
      <Text style={[styles.framing, align]}>{t('assistant.gridIntro')}</Text>

      {projects.map((project) => (
        <Row
          key={project.id}
          title={project.name}
          subtitle={[project.developerName, project.city].filter(Boolean).join(' · ')}
          badge={
            project.startPrice != null ? <Badge tone="gold">{money(project.startPrice)}</Badge> : undefined
          }
          onPress={() => router.push(`/project/${project.slug}`)}
        />
      ))}

      {units.map((unit) => (
        <Row
          key={unit.id}
          title={unit.projectName}
          subtitle={[
            humanise(unit.unitType),
            unit.bedrooms != null ? `${unit.bedrooms} ${t('calculators.br')}` : null,
            `${unit.area} m²`,
          ]
            .filter(Boolean)
            .join(' · ')}
          badge={<Badge tone="gold">{money(unit.price)}</Badge>}
          onPress={() => router.push(`/unit/${unit.slug ?? unit.id}`)}
        />
      ))}

      {block.total > shown ? (
        <Btn
          title={`${t('assistant.viewAll')} ${block.total} ${t('assistant.resultsCount')}`}
          variant="ghost"
          onPress={() => router.push('/(tabs)/explore')}
        />
      ) : null}
    </Card>
  );
}

/** The website's `ChatComparisonTable`: one column per project, eight rows. */
function ComparisonTable({ block }: { block: ComparisonBlock }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();

  const projects = block.data?.projects ?? [];
  if (projects.length < 2) return null;

  const na = t('assistant.na');
  const money = (value: number) => formatMoney(value, currency, rates, { compact: true });

  const entries: { label: string; values: string[] }[] = [
    { label: t('common.developer'), values: projects.map((p) => p.developer || na) },
    { label: t('assistant.cmpLocation'), values: projects.map((p) => p.city || na) },
    { label: t('assistant.cmpFrom'), values: projects.map((p) => (p.startPrice ? money(p.startPrice) : na)) },
    {
      label: t('assistant.cmpTypes'),
      values: projects.map((p) => (p.propertyTypes ?? []).slice(0, 2).map(humanise).join(', ') || na),
    },
    { label: t('assistant.cmpUnits'), values: projects.map((p) => String(p.unitCount || p.totalUnits || na)) },
    {
      label: t('assistant.cmpCompletion'),
      values: projects.map((p) => (p.completionPercent != null ? `${p.completionPercent}%` : na)),
    },
    {
      label: t('assistant.cmpDownPayment'),
      values: projects.map((p) => (p.downPaymentMin ? `${p.downPaymentMin}%` : na)),
    },
    {
      label: t('assistant.cmpInstallments'),
      values: projects.map((p) =>
        p.installmentYears ? `${p.installmentYears} ${t('assistant.yearsWord')}` : na
      ),
    },
  ];

  return (
    <Card style={styles.block}>
      {block.title ? <SectionTitle>{block.title}</SectionTitle> : null}
      <Text style={[styles.framing, align]}>{t('assistant.compareIntro')}</Text>
      {projects.map((project, index) => (
        <View key={`${project.name}-${index}`}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.cmpProject}>
            <Text style={[styles.cmpName, align]}>{project.name}</Text>
            {entries.map((entry) => (
              <View key={entry.label} style={[styles.cmpLine, row]}>
                <Text style={[styles.cmpLabel, align]}>{entry.label}</Text>
                <Text style={[styles.cmpValue, align]}>{entry.values[index]}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </Card>
  );
}

/** The website's `ChatPaymentBreakdown`. */
function PaymentBreakdown({ block }: { block: PaymentBlock }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();

  const c = block.calculation;
  if (!c) return null;

  const money = (value: number) => formatMoney(value, currency, rates, { compact: true });
  const lines: { label: string; value: string }[] = [
    { label: t('common.price'), value: money(c.unitPrice) },
    { label: `${t('assistant.payDown')} ${c.downPaymentPct}%`, value: money(c.downPaymentAmount) },
    { label: t('assistant.payFinanced'), value: money(c.financedAmount) },
    {
      label: `${c.installmentYears} ${t('assistant.yearsWord')}`,
      value: `${money(c.semiAnnualPayment)} ${t('assistant.paySemiAnnual')}`,
    },
    { label: t('assistant.payMonthly'), value: `~${money(c.monthlyPayment)}` },
  ];
  if (c.area > 0) lines.push({ label: t('assistant.payPerSqm'), value: money(c.pricePerSqm) });

  return (
    <Card style={styles.block}>
      {block.title ? <SectionTitle>{block.title}</SectionTitle> : null}
      <Text style={[styles.framing, align]}>{t('assistant.paymentIntro')}</Text>
      {lines.map((line) => (
        <View key={line.label} style={[styles.cmpLine, row]}>
          <Text style={[styles.cmpLabel, align]}>{line.label}</Text>
          <Text style={[styles.cmpValue, align]}>{line.value}</Text>
        </View>
      ))}
    </Card>
  );
}

/** `filter_update` — the website applies these to its search bar and shows the
 *  chips; the app has no global filter store, so it shows what was understood. */
function FilterChips({ block }: { block: FilterUpdateBlock }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const chips = block.chips ?? [];
  if (chips.length === 0) return null;

  return (
    <View style={styles.filterWrap}>
      <Text style={[styles.framing, align]}>{t('assistant.filterIntro')}</Text>
      <View style={[styles.chipRow, row]}>
        {chips.map((chip, index) => (
          <Badge key={`${chip.field}-${index}`} tone="gold">
            {`${chip.label}: ${String(chip.value).replace(/-/g, ' ')}`}
          </Badge>
        ))}
      </View>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.background },
    flex: { flex: 1 },
    thread: { padding: 16, gap: 10, paddingBottom: 20 },

    welcome: { gap: 10, alignItems: 'center' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },

    msg: { gap: 10 },
    bubble: {
      maxWidth: '86%',
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    mine: {
      alignSelf: 'flex-end',
      backgroundColor: t.goldBg,
      borderColor: 'rgba(212,168,67,0.45)',
      borderBottomRightRadius: 4,
    },
    theirs: {
      alignSelf: 'flex-start',
      backgroundColor: t.card,
      borderColor: t.border,
      borderBottomLeftRadius: 4,
    },
    bubbleText: { color: t.foreground, fontSize: 16, lineHeight: 21 },
    bubbleTextMine: { color: t.primary },
    bold: { fontWeight: '700' },

    // Structured blocks span the thread instead of hiding in a bubble
    block: { alignSelf: 'stretch' },
    framing: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    filterWrap: { gap: 6, alignSelf: 'stretch' },
    offlineHint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17, paddingHorizontal: 16 },
    cmpProject: { gap: 3 },
    cmpName: { color: t.foreground, fontSize: 14, fontWeight: '700', marginBottom: 2 },
    cmpLine: { justifyContent: 'space-between', gap: 12 },
    cmpLabel: { color: t.mutedForeground, fontSize: 12, flexShrink: 1 },
    cmpValue: { color: t.foreground, fontSize: 12, fontWeight: '600', flexShrink: 1 },

    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
      backgroundColor: t.card,
    },
    mic: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    micActive: {
      backgroundColor: t.dangerBg,
      borderColor: t.dangerFg,
    },
    voiceStatus: {
      color: t.dangerFg,
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 16,
      paddingBottom: 4,
    },
    voiceHint: {
      color: t.mutedForeground,
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 16,
      paddingBottom: 4,
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
    sendText: { color: t.primaryForeground, fontWeight: '800', fontSize: 16 },
  }),
);
