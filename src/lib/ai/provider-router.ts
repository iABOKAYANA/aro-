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
      return { response: await llamacppChat(messages, tools, opts), provider: 'local' }
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
        text: await llamacppChatStream(messages, onToken, { signal: opts?.signal, timeoutMs: opts?.timeoutMs }),
        provider: 'local',
      }
    }
    throw err
  }
}
