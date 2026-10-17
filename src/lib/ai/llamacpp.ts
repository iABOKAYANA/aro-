import { AI_CONFIG } from '@/lib/ai/config'
import type {
  OllamaMessage,
  OllamaResponse,
  OllamaStatus,
  OllamaTool,
  OllamaToolCall,
} from '@/lib/ai/ollama'

// ─── llama.cpp client (OpenAI /v1/chat/completions format) ─────
// llama-server speaks the OpenAI chat-completions dialect, including
// `tools` / `tool_calls`. This module translates to/from the Ollama
// shapes used by src/lib/ai-llm.ts so the provider switch is one env var.

const BASE_URL = AI_CONFIG.llamacpp.baseUrl
const MODEL = AI_CONFIG.llamacpp.model

interface OpenAIToolCallMsg {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

function toOpenAIMessages(messages: OllamaMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  // llama-server needs stable ids linking assistant tool_calls to the
  // following tool results. Our stored tool_call_id values are Ollama-side
  // labels, so assign sequential ids per request and consume them in order
  // (ai-llm always pushes assistant(tool_calls) then its tool results).
  let tcCounter = 0
  let pendingIds: string[] = []
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'user') {
      out.push({ role: m.role, content: m.content })
      pendingIds = []
    } else if (m.role === 'assistant') {
      const msg: Record<string, unknown> = { role: 'assistant', content: m.content || '' }
      if (m.tool_calls && m.tool_calls.length > 0) {
        pendingIds = m.tool_calls.map(() => `tc_${tcCounter++}`)
        msg.tool_calls = m.tool_calls.map((tc, i) => ({
          id: pendingIds[i],
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }))
      } else {
        pendingIds = []
      }
      out.push(msg)
    } else if (m.role === 'tool') {
      const id = pendingIds.shift() || m.tool_call_id || `tc_orphan_${tcCounter++}`
      out.push({ role: 'tool', tool_call_id: id, content: m.content })
    }
  }
  return out
}

// Qwen3 emits <think>…</think> when thinking is enabled. llama-server is
// started with thinking off, but strip defensively so reasoning never leaks.
function stripThink(text: string): string {
  return (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

async function llamacppFetch<T>(path: string, body?: unknown, timeoutMs = 300_000, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`llama-server ${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return res.json()
}

// ─── Chat Completion ─────────────────────────────────────

export async function llamacppChat(
  messages: OllamaMessage[],
  tools?: OllamaTool[],
  opts?: { signal?: AbortSignal },
): Promise<OllamaResponse> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: toOpenAIMessages(messages),
    stream: false,
    temperature: 0.7,
    // Token budget per round: 300 caps worst-case decode (~70s at ~4 tok/s
    // CPU) so a full tool loop can finish inside the 60s proxy timeout.
    // Listing data rides in tool-result blocks, not model prose.
    max_tokens: 300,
    // Qwen3 thinks by default and burns the whole token budget on
    // reasoning_content (measured: empty reply). Both keys: the server
    // build honors chat_template_kwargs, older ones enable_thinking.
    enable_thinking: false,
    chat_template_kwargs: { enable_thinking: false },
  }
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }))
    body.tool_choice = 'auto'
  }

  const res = await llamacppFetch<{
    choices?: Array<{
      message?: {
        role?: string
        content?: string | null
        tool_calls?: OpenAIToolCallMsg[]
      }
      finish_reason?: string
    }>
  }>('/v1/chat/completions', body, 300_000, opts?.signal)

  const msg = res.choices?.[0]?.message || {}
  const toolCalls: OllamaToolCall[] | undefined = msg.tool_calls?.length
    ? msg.tool_calls.map((tc) => ({
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments || {}),
        },
      }))
    : undefined

  return {
    message: {
      role: msg.role || 'assistant',
      content: stripThink(msg.content || ''),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    },
    done: true,
  }
}

// ─── Streaming Chat Completion (SSE) ────────────────────
// Used by the streaming chat route: forwards llama-server's OpenAI-style SSE
// (`data: {...}` lines, terminal `data: [DONE]`) as incremental `onToken`
// deltas and resolves with the full stripped text. Tool calls are NOT
// streamed — the route runs the tool loop with `llamacppChat` first and
// streams only the FINAL prose answer, so `tools` is intentionally absent.
export async function llamacppChatStream(
  messages: OllamaMessage[],
  onToken: (text: string) => void,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 300_000
  const timeout = AbortSignal.timeout(timeoutMs)
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: toOpenAIMessages(messages),
      stream: true,
      temperature: 0.7,
      max_tokens: 300,
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  })
  if (!res.ok || !res.body) {
    const text = !res.ok ? await res.text().catch(() => '') : 'empty body'
    throw new Error(`llama-server /v1/chat/completions stream failed (${res.status}): ${String(text).slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // SSE frames are newline-delimited; keep the trailing partial line.
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>
        }
        const piece = json.choices?.[0]?.delta?.content
        // Only prose deltas — reasoning/tool fragments never reach the UI.
        if (typeof piece === 'string' && piece) {
          full += piece
          onToken(piece)
        }
      } catch { /* keep-alive comment or partial frame — ignore */ }
    }
  }
  return stripThink(full)
}

// ─── Connection Check ────────────────────────────────────

export async function checkLlamacppStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${BASE_URL}/v1/models`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) {
      return { available: false, model: MODEL, modelInstalled: false, error: 'llama-server responded with error' }
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> }
    const ids = (data.data || []).map((m) => m.id || '')
    const modelInstalled = ids.length === 0 ? true : ids.some((id) => id === MODEL || id.includes('Qwen3'))
    return { available: true, model: MODEL, modelInstalled }
  } catch (err: any) {
    return {
      available: false,
      model: MODEL,
      modelInstalled: false,
      error:
        err?.cause && String((err.cause as any)?.code) === 'ECONNREFUSED'
          ? 'llama-server is not running'
          : err?.name === 'TimeoutError'
            ? 'llama-server connection timed out'
            : `llama-server error: ${err?.message || 'unknown'}`,
    }
  }
}
