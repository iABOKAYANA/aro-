export const AI_CONFIG = {
  provider: (process.env.AI_PROVIDER || 'ollama') as 'ollama' | 'llamacpp' | 'gemini',

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  },

  llamacpp: {
    baseUrl: process.env.LLAMA_BASE_URL || 'http://127.0.0.1:11435',
    model: process.env.LLAMA_MODEL || 'Qwen3-14B-Q4_K_M',
  },

  gemini: {
    // Key ONLY from server env GEMINI_API_KEY (never NEXT_PUBLIC_, never
    // client-side, never logged). Empty = unconfigured → status unavailable.
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },

  // Optional live-market web search (self-hosted SearXNG). Empty = disabled,
  // chat works fully offline on DB grounding alone.
  searxng: {
    baseUrl: process.env.SEARXNG_URL || '',
  },

  maxToolRounds: 3,
  // Prompt diet: 8 messages (≈4 turns) cap the prefill. Longer context is
  // preserved via the STATE summary + merged query in ai-llm.ts, so slots
  // (budget/place/rooms) survive beyond the window.
  historyLimit: 8,
  maxMessageLength: 2000,
} as const

export type AIProvider = typeof AI_CONFIG.provider
