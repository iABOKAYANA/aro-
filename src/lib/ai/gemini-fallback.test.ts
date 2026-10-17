import { describe, expect, it, vi, afterEach } from 'vitest'

// Gemini → local-llamacpp automatic fallback contract:
//  - a simulated Gemini 429 triggers the local stack for that turn and the
//    turn reports provider 'local'
//  - the server key NEVER appears in URLs or thrown error text
//  - only 429/5xx/network failures fall back; other 4xx surface loudly

const FAKE_KEY = 'FAKE-KEY-FOR-TESTS-abc123'

async function loadFresh() {
  vi.resetModules()
  vi.stubEnv('AI_PROVIDER', 'gemini')
  vi.stubEnv('GEMINI_API_KEY', FAKE_KEY)
  vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash-lite')
  const gemini = await import('@/lib/ai/gemini')
  const router = await import('@/lib/ai/provider-router')
  return { gemini, router }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('gemini fallback', () => {
  it('falls back to local llamacpp on a simulated Gemini 429 and reports provider local', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: { headers?: Record<string, string> }) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('generativelanguage.googleapis.com')) {
          // Secret hygiene: key rides the header, never the URL.
          expect(u).not.toContain(FAKE_KEY)
          expect(init?.headers?.['x-goog-api-key']).toBe(FAKE_KEY)
          return new Response(
            JSON.stringify({ error: { code: 429, message: 'quota exhausted', status: 'RESOURCE_EXHAUSTED' } }),
            { status: 429 },
          )
        }
        if (u.includes('/v1/chat/completions')) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: 'أهلا بيك' }, finish_reason: 'stop' }],
            }),
            { status: 200 },
          )
        }
        throw new Error(`unexpected fetch: ${u}`)
      }),
    )

    const { router } = await loadFresh()
    const { response, provider } = await router.chatOnce([{ role: 'user', content: 'hi' }])

    expect(provider).toBe('local')
    expect(response.message.content).toBe('أهلا بيك')
    expect(calls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(true)
    expect(calls.some((u) => u.includes('/v1/chat/completions'))).toBe(true)
  })

  it('falls back on the streaming path too (Gemini 503 → local SSE)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url)
        if (u.includes('generativelanguage.googleapis.com')) {
          return new Response(JSON.stringify({ error: { code: 503, message: 'overloaded' } }), { status: 503 })
        }
        if (u.includes('/v1/chat/completions')) {
          const sse =
            'data: {"choices":[{"delta":{"content":"local says hi"}}]}\n\ndata: [DONE]\n\n'
          return new Response(sse, { status: 200 })
        }
        throw new Error(`unexpected fetch: ${u}`)
      }),
    )

    const { router } = await loadFresh()
    const tokens: string[] = []
    const { text, provider } = await router.streamOnce(
      [{ role: 'user', content: 'hi' }],
      (t) => tokens.push(t),
    )

    expect(provider).toBe('local')
    expect(text).toBe('local says hi')
    expect(tokens.join('')).toBe('local says hi')
  })

  it('never leaks the server key into error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { code: 400, message: `bad request, key=${FAKE_KEY} rejected` } }),
          { status: 400 },
        ),
      ),
    )

    const { gemini } = await loadFresh()
    const err: unknown = await gemini
      .generateContent([{ role: 'user', content: 'hi' }])
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(Error)
    expect(String((err as Error).message)).not.toContain(FAKE_KEY)
    // …and a hard 4xx must NOT silently fall back (fail loud on misconfig).
    expect(gemini.isGeminiFallbackError(err)).toBe(false)
  })

  it('round-trips Gemini thought signatures with echoed functionCalls', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        if (init?.body) bodies.push(JSON.parse(init.body as string))
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    {
                      functionCall: { name: 'search_projects', args: { city: 'cairo' } },
                      thoughtSignature: 'SIG-ROUND-TRIP-123',
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        )
      }),
    )

    const { gemini } = await loadFresh()
    const tools = [
      { type: 'function', function: { name: 'search_projects', description: 'd', parameters: { type: 'object', properties: {} } } },
    ] as never
    const first = await gemini.generateContent([{ role: 'user', content: 'hi' }], tools)
    expect(first.message.tool_calls?.[0]?.thoughtSignature).toBe('SIG-ROUND-TRIP-123')

    // Echo the call + a tool result (tool-loop round 2): the outgoing
    // functionCall part must carry the exact signature back.
    await gemini.generateContent([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: first.message.tool_calls },
      { role: 'tool', content: '{"success":true}', tool_call_id: 'call_search_projects_0' },
    ])
    const second = bodies[1] as { contents: Array<{ role: string; parts: Array<{ functionCall?: unknown; thoughtSignature?: string }> }> }
    const echoed = second.contents.flatMap((c) => c.parts).find((p) => p.functionCall)
    expect(echoed?.thoughtSignature).toBe('SIG-ROUND-TRIP-123')
  })

  it('classifies retryable vs config failures', async () => {
    const { gemini } = await loadFresh()
    expect(gemini.isGeminiFallbackError(new gemini.GeminiError(429, 'slow down'))).toBe(true)
    expect(gemini.isGeminiFallbackError(new gemini.GeminiError(500, 'boom'))).toBe(true)
    expect(gemini.isGeminiFallbackError(new gemini.GeminiError(503, 'overloaded'))).toBe(true)
    expect(gemini.isGeminiFallbackError(new TypeError('fetch failed'))).toBe(true)
    expect(gemini.isGeminiFallbackError(new gemini.GeminiError(400, 'bad'))).toBe(false)
    expect(gemini.isGeminiFallbackError(new gemini.GeminiError(401, 'nope'))).toBe(false)
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(gemini.isGeminiFallbackError(abort)).toBe(false)
  })
})
