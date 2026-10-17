// ─── SSE reader for the streaming chat route ─────────────
// POST /api/ai/chat with `"stream": true` answers `text/event-stream`:
// `meta` (ids handshake, first) → `status`* → `token`* → `done`
// (authoritative full payload) — or `error` mid-stream. `: ping` comment
// heartbeats keep the proxy alive and are ignored here.

export type ChatStreamEventHandler = (event: string, data: any) => void

export async function readSSEStream(res: Response, onEvent: ChatStreamEventHandler): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Streaming not supported by this browser')
  const decoder = new TextDecoder()
  let buf = ''
  let event = 'message'
  let dataBuf = ''
  const dispatch = () => {
    if (!dataBuf) {
      event = 'message'
      return
    }
    const raw = dataBuf
    const ev = event
    dataBuf = ''
    event = 'message'
    try {
      onEvent(ev, JSON.parse(raw))
    } catch {
      // Malformed frame — drop it, the `done` payload is authoritative.
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') {
        dispatch()
      } else if (trimmed.startsWith(':')) {
        // Server heartbeat comment — ignore.
      } else if (trimmed.startsWith('event:')) {
        event = trimmed.slice(6).trim() || 'message'
      } else if (trimmed.startsWith('data:')) {
        dataBuf += (dataBuf ? '\n' : '') + trimmed.slice(5).trim()
      }
    }
  }
  if (buf.trim().startsWith('data:')) {
    dataBuf += (dataBuf ? '\n' : '') + buf.trim().slice(5).trim()
  }
  dispatch()
}

export function isSSEResponse(res: Response): boolean {
  return (res.headers.get('content-type') || '').includes('text/event-stream')
}
