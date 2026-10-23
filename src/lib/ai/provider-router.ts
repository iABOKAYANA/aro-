import { AI_CONFIG } from '@/lib/ai/config'
import { generateContent, streamGenerateContent, isGeminiFallbackError } from '@/lib/ai/gemini'
import { llamacppChat, llamacppChatStream } from '@/lib/ai/llamacpp'
import { ollamaChat, type OllamaMessage, type OllamaTool, type OllamaResponse } from '@/lib/ai/ollama'

// ─── Provider dispatch with automatic local fallback ─────────
// AI_PROVIDER=gemini → Gemini first; on 429/5xx/network/exception that SAME
// turn transparently retries against the local llama.cpp stack and reports
// `provider: 'local'`. Any other AI_PROVIDER value keeps the legacy direct
// path (ollama untouched, llamacpp direct). Single-shot fallback per call —
// the local backend never re-triggers Gemini, so no retry loops.
export type ServedProvider = 'gemini' | 'local' | 'ollama' | 'llamacpp' | 'grounded'

interface ChatOpts {
  signal?: AbortSignal
  timeoutMs?: number
}

function directChatFn() {
  return AI_CONFIG.provider === 'llamacpp' ? llamacppChat : ollamaChat
}

// llama.cpp local stack runs an 8192-token context — oversized consult
// prompts (long history + learned context + tool results) overflow it with a
// hard 400 and the visitor sees a dead chat. Cheap fit: keep the first
// message (system contract) + the TAIL of the conversation, each message
// capped, until an approximate char budget is met.
const LOCAL_MAX_CHARS = 11_000
const LOCAL_MSG_CAP = 1_400

function fitLocalContext(messages: OllamaMessage[]): OllamaMessage[] {
  if (!messages.length) return messages
  const head = messages[0]
  const tail = messages.slice(1)
  let used = head.content.length
  const kept: OllamaMessage[] = []
  for (let i = tail.length - 1; i >= 0; i--) {
    const m = tail[i]
    const content = m.content.length > LOCAL_MSG_CAP ? `${m.content.slice(0, LOCAL_MSG_CAP)}…` : m.content
    used += content.length
    if (used > LOCAL_MAX_CHARS) break
    kept.unshift({ ...m, content })
  }
  used = head.content.length + kept.reduce((n, m) => n + m.content.length, 0)
  if (used > LOCAL_MAX_CHARS) return [{ ...head, content: head.content.slice(0, LOCAL_MAX_CHARS) }, ...kept]
  return [head, ...kept]
}

export async function chatOnce(
  messages: OllamaMessage[],
  tools?: OllamaTool[],
  opts?: ChatOpts,
): Promise<{ response: OllamaResponse; provider: ServedProvider }> {
  if (AI_CONFIG.provider !== 'gemini') {
    const provider: ServedProvider = AI_CONFIG.provider === 'llamacpp' ? 'llamacpp' : 'ollama'
    return { response: await directChatFn()(messages, tools, opts), provider }
  }
  try {
    return { response: await generateContent(messages, tools, opts), provider: 'gemini' }
  } catch (err) {
    if (!opts?.signal?.aborted && isGeminiFallbackError(err)) {
      return { response: await llamacppChat(fitLocalContext(messages), tools, opts), provider: 'local' }
    }
    throw err
  }
}

// Final-prose streaming only (tools never stream — same contract as
// llamacppChatStream). Falls back to the local SSE stream on the same
// retryable Gemini failures.
export async function streamOnce(
  messages: OllamaMessage[],
  onToken: (text: string) => void,
  opts?: ChatOpts,
): Promise<{ text: string; provider: ServedProvider }> {
  if (AI_CONFIG.provider !== 'gemini') {
    if (AI_CONFIG.provider === 'llamacpp') {
      return {
        text: await llamacppChatStream(messages, onToken, { signal: opts?.signal, timeoutMs: opts?.timeoutMs }),
        provider: 'llamacpp',
      }
    }
    const response = await ollamaChat(messages, undefined, { signal: opts?.signal })
    const text = response.message.content || ''
    if (text) onToken(text)
    return { text, provider: 'ollama' }
  }
  try {
    return { text: await streamGenerateContent(messages, onToken, opts), provider: 'gemini' }
  } catch (err) {
    if (!opts?.signal?.aborted && isGeminiFallbackError(err)) {
      return {
        text: await llamacppChatStream(fitLocalContext(messages), onToken, { signal: opts?.signal, timeoutMs: opts?.timeoutMs }),
        provider: 'local',
      }
    }
    throw err
  }
}
