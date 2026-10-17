import type {
  OllamaMessage,
  OllamaResponse,
  OllamaStatus,
  OllamaTool,
  OllamaToolCall,
} from '@/lib/ai/ollama'

// ─── Gemini client (Google AI Studio REST, v1beta) ───────────
// Shapes mirror src/lib/ai/llamacpp.ts so the provider switch stays one
// env var (AI_PROVIDER=gemini). Key ONLY from server env GEMINI_API_KEY —
// never NEXT_PUBLIC_, never client-side, never logged.
//
// Wire format: POST /v1beta/models/{model}:generateContent (+header
// `x-goog-api-key`), streaming via :streamGenerateContent?alt=sse (SSE
// `data:` frames). Ollama message/tool shapes translate to Gemini
// contents + functionDeclarations and back.

function geminiModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
}

function geminiKey(): string {
  return process.env.GEMINI_API_KEY || ''
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// ─── Secret hygiene ──────────────────────────────────────────
// The key travels ONLY in the x-goog-api-key header (never the URL). Every
// error surface passes through withoutSecrets so a backend echo can never
// leak it into logs, responses, or test output.
export function withoutSecrets(text: string): string {
  const key = geminiKey()
  if (!text) return ''
  if (key && text.includes(key)) return text.split(key).join('[redacted]')
  return text
}

// ─── Fallback classification ─────────────────────────────────
// Retryable on the LOCAL stack (llama.cpp) for this turn: 429 / 5xx /
// network-level failures. Anything else (400/401/403/404 config errors,
// missing key, client aborts) surfaces instead of masking a misconfig.
export function isGeminiFallbackError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true // unknown throw → fail soft
  const e = err as { status?: number; name?: string; message?: string }
  if (e.name === 'AbortError') return false
  if (typeof e.status === 'number') {
    if (e.status === 429) return true
    if (e.status >= 500) return true
    return false
  }
  // No HTTP status: DNS/TLS/reset/timeout/JSON-shape surprises → fallback.
  return true
}

export class GeminiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

// ─── Ollama shapes → Gemini wire shapes ──────────────────────

interface GeminiPart extends Record<string, unknown> {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

function toolArgsToObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// ai-llm pushes assistant(tool_calls) then that round's tool results in
// order; tool_call_id is `call_<name>_<round>`. Consume names in order like
// llamacpp's tc_N scheme, with the id as a fallback source of truth.
function toolNameFromId(toolCallId: string | undefined, pending: string[]): string {
  if (pending.length > 0) return pending.shift() as string
  const m = toolCallId ? toolCallId.match(/^call_(.+)_\d+$/) : null
  return m ? m[1] : 'unknown_tool'
}

function toGeminiContents(messages: OllamaMessage[]): { systemText: string; contents: GeminiContent[] } {
  const systemParts: string[] = []
  const out: GeminiContent[] = []
  const pendingToolNames: string[] = []

  const push = (role: 'user' | 'model', part: GeminiPart) => {
    const last = out[out.length - 1]
    // Gemini needs strict user/model alternation — merge consecutive
    // same-role parts (multi-tool rounds produce back-to-back results).
    if (last && last.role === role) last.parts.push(part)
    else out.push({ role, parts: [part] })
  }

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) systemParts.push(m.content)
    } else if (m.role === 'user') {
      push('user', { text: m.content || '' })
      pendingToolNames.length = 0
    } else if (m.role === 'assistant') {
      const names = (m.tool_calls || []).map((tc) => tc.function.name)
      pendingToolNames.push(...names)
      const parts: GeminiPart[] = []
      if (m.content) parts.push({ text: m.content })
      for (const tc of m.tool_calls || []) {
        parts.push({
          functionCall: { name: tc.function.name, args: toolArgsToObject(tc.function.arguments) },
          // Gemini 3.x mandates echoing the model's thought signature with
          // its own functionCall — without it the next round fails 400.
          ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
        })
      }
      if (parts.length === 0) parts.push({ text: '' })
      for (const p of parts) push('model', p)
    } else if (m.role === 'tool') {
      const name = toolNameFromId(m.tool_call_id, pendingToolNames)
      let response: Record<string, unknown>
      try {
        const parsed = JSON.parse(m.content || '{}') as unknown
        response = parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)
          : { result: m.content }
      } catch {
        response = { result: m.content }
      }
      push('user', { functionResponse: { name, response } })
    }
  }

  // Gemini rejects a leading model turn — drop it (never happens from
  // ai-llm, which always starts with user, but stay total).
  while (out.length > 0 && out[0].role !== 'user') out.shift()
  return { systemText: systemParts.join('\n\n'), contents: out }
}

function toFunctionDeclarations(tools?: OllamaTool[]): Array<Record<string, unknown>> | undefined {
  if (!tools || tools.length === 0) return undefined
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }))
}

// ─── Gemini wire → Ollama shapes ─────────────────────────────

interface GeminiWireResponse {
  candidates?: Array<{
    content?: { role?: string; parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown }; thoughtSignature?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

function toOllamaResponse(wire: GeminiWireResponse): OllamaResponse {
  const parts = wire.candidates?.[0]?.content?.parts || []
  const texts: string[] = []
  const toolCalls: OllamaToolCall[] = []
  for (const p of parts) {
    if (typeof p.text === 'string' && p.text) texts.push(p.text)
    if (p.functionCall?.name) {
      toolCalls.push({
        type: 'function' as const,
        function: {
          name: p.functionCall.name,
          arguments: JSON.stringify(
            p.functionCall.args && typeof p.functionCall.args === 'object' ? p.functionCall.args : {},
          ),
        },
        // Round-trip verbatim: the NEXT request must echo this exact value
        // alongside its functionCall part (Gemini 3.x tool-loop requirement).
        ...(typeof p.thoughtSignature === 'string' && p.thoughtSignature
          ? { thoughtSignature: p.thoughtSignature }
          : {}),
      })
    }
  }
  return {
    message: {
      role: 'assistant',
      content: texts.join(''),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    done: true,
  }
}

// ─── Transport ───────────────────────────────────────────────

async function geminiFetch(
  path: string,
  body: unknown,
  opts?: { signal?: AbortSignal; timeoutMs?: number; stream?: boolean },
): Promise<Response> {
  const key = geminiKey()
  if (!key) throw new GeminiError(401, 'GEMINI_API_KEY is not configured')
  const timeout = AbortSignal.timeout(opts?.timeoutMs ?? 90_000)
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    const detail = withoutSecrets(raw).slice(0, 300)
    throw new GeminiError(res.status, `Gemini ${path} failed (${res.status}): ${detail}`)
  }
  return res
}

function buildBody(messages: OllamaMessage[], tools?: OllamaTool[]): Record<string, unknown> {
  const { systemText, contents } = toGeminiContents(messages)
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  }
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] }
  const decls = toFunctionDeclarations(tools)
  if (decls) body.tools = [{ functionDeclarations: decls }]
  return body
}

// ─── Chat Completion (non-stream) ────────────────────────────
// Same contract as llamacppChat(messages, tools?, opts?).
export async function generateContent(
  messages: OllamaMessage[],
  tools?: OllamaTool[],
  opts?: { signal?: AbortSignal },
): Promise<OllamaResponse> {
  const model = geminiModel()
  const res = await geminiFetch(`/models/${model}:generateContent`, buildBody(messages, tools), {
    signal: opts?.signal,
  })
  const wire = (await res.json()) as GeminiWireResponse
  if (!wire.candidates || wire.candidates.length === 0) {
    const reason = wire.promptFeedback?.blockReason || 'empty candidates'
    throw new GeminiError(502, `Gemini returned no candidates (${withoutSecrets(reason)})`)
  }
  return toOllamaResponse(wire)
}

// ─── Streaming Chat Completion (SSE) ─────────────────────────
// Same contract as llamacppChatStream(messages, onToken, opts?): forwards
// Gemini's SSE text deltas as onToken and resolves with the full text.
// Tools intentionally absent — the route streams only the final prose.
export async function streamGenerateContent(
  messages: OllamaMessage[],
  onToken: (text: string) => void,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<string> {
  const model = geminiModel()
  const res = await geminiFetch(`/models/${model}:streamGenerateContent?alt=sse`, buildBody(messages), {
    signal: opts?.signal,
    timeoutMs: opts?.timeoutMs ?? 120_000,
    stream: true,
  })
  if (!res.body) throw new GeminiError(502, 'Gemini stream returned an empty body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as GeminiWireResponse
        const parts = json.candidates?.[0]?.content?.parts || []
        for (const p of parts) {
          if (typeof p.text === 'string' && p.text) {
            full += p.text
            onToken(p.text)
          }
        }
      } catch { /* keep-alive / partial frame — ignore */ }
    }
  }
  return full
}

// llamacpp-shaped aliases so provider dispatch reads uniformly.
export const geminiChat = generateContent
export const geminiChatStream = streamGenerateContent

// ─── Connection Check ────────────────────────────────────────
// Key presence gates availability; transient network/5xx/429 never blocks
// the chat — the per-turn fallback covers outages. Only a hard 4xx (bad
// key / unknown model) reports unavailable.
export async function checkGeminiStatus(): Promise<OllamaStatus> {
  const model = geminiModel()
  if (!geminiKey()) {
    return { available: false, model, modelInstalled: false, error: 'GEMINI_API_KEY is not configured' }
  }
  try {
    const res = await fetch(`${API_BASE}/models/${model}`, {
      headers: { 'x-goog-api-key': geminiKey() },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (res.ok) return { available: true, model, modelInstalled: true }
    if (res.status === 429 || res.status >= 500) {
      return { available: true, model, modelInstalled: true }
    }
    return { available: false, model, modelInstalled: false, error: `Gemini model check failed (${res.status})` }
  } catch {
    return { available: true, model, modelInstalled: true }
  }
}
