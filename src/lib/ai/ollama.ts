import { AI_CONFIG } from '@/lib/ai/config'

// ─── Types ───────────────────────────────────────────────

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: OllamaToolCall[]
}

export interface OllamaToolCall {
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  // Opaque Gemini thought-signature round-trip (Gemini 3.x REQUIRES the
  // model's own signature echoed back with its functionCall part, or the
  // next tool-loop round 400s). Set only by the Gemini client; ignored by
  // the ollama/llamacpp paths, never persisted, never logged.
  thoughtSignature?: string
}

export interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface OllamaResponse {
  message: {
    role: string
    content: string
    tool_calls?: OllamaToolCall[]
  }
  done: boolean
  total_duration?: number
  eval_count?: number
}

export interface OllamaStatus {
  available: boolean
  model: string
  modelInstalled: boolean
  error?: string
}

// ─── Ollama Client ───────────────────────────────────────

const BASE_URL = AI_CONFIG.ollama.baseUrl
const MODEL = AI_CONFIG.ollama.model

async function ollamaFetch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(120_000)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama ${path} failed (${res.status}): ${text}`)
  }

  return res.json()
}

// ─── Chat Completion ─────────────────────────────────────

export async function ollamaChat(
  messages: OllamaMessage[],
  tools?: OllamaTool[],
  opts?: { signal?: AbortSignal },
): Promise<OllamaResponse> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 1500,
      num_ctx: 4096,
    },
  }

  if (tools && tools.length > 0) {
    body.tools = tools
  }

  return ollamaFetch<OllamaResponse>('/api/chat', body, opts?.signal)
}

// ─── Connection Check ────────────────────────────────────

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const versionRes = await fetch(`${BASE_URL}/api/version`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!versionRes.ok) {
      return { available: false, model: MODEL, modelInstalled: false, error: 'Ollama server responded with error' }
    }

    const tagsRes = await fetch(`${BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!tagsRes.ok) {
      return { available: true, model: MODEL, modelInstalled: false, error: 'Could not list models' }
    }

    const tags = await tagsRes.json() as { models?: Array<{ name: string }> }
    const models = (tags.models || []).map(m => m.name)
    const modelInstalled = models.some(n =>
      n === MODEL || n === MODEL.split(':')[0] || n.startsWith(MODEL.split(':')[0])
    )

    return { available: true, model: MODEL, modelInstalled }
  } catch (err: any) {
    return {
      available: false,
      model: MODEL,
      modelInstalled: false,
      error: err?.code === 'ECONNREFUSED'
        ? 'Ollama is not running. Start it with: ollama serve'
        : err?.name === 'TimeoutError'
        ? 'Ollama connection timed out'
        : `Ollama error: ${err?.message || 'unknown'}`,
    }
  }
}

// ─── Pull Model ──────────────────────────────────────────

export async function pullModel(onProgress?: (progress: string) => void): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: MODEL }),
  })

  if (!res.ok) {
    throw new Error(`Failed to pull model: ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        if (data.status) onProgress?.(data.status)
      } catch { /* skip */ }
    }
  }
}
