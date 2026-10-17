import { NextResponse } from 'next/server'
import { readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// Reads the file-backed outbox written by src/lib/mailer.ts (`outbox`
// driver). CEO/ADMIN only. Deleting a file = "mark resolved".
const OUTBOX_DIR = path.join(process.cwd(), 'data', 'outbox')
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function emailLive(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST || process.env.SMTP_URL)
}

type OutboxItem = {
  id: string
  at: string | null
  from: string | null
  to: string[]
  subject: string
  text: string | null
  hasHtml: boolean
  replyTo: string | null
  meta: Record<string, unknown> | null
}

async function readItems(): Promise<{ file: string; item: OutboxItem }[]> {
  let files: string[]
  try {
    files = (await readdir(OUTBOX_DIR)).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const out: { file: string; item: OutboxItem }[] = []
  await Promise.all(
    files.map(async (file) => {
      try {
        const rec = JSON.parse(await readFile(path.join(OUTBOX_DIR, file), 'utf8')) as Record<string, unknown>
        const to = Array.isArray(rec.to) ? rec.to.map(String) : rec.to != null ? [String(rec.to)] : []
        out.push({
          file,
          item: {
            id: typeof rec.id === 'string' ? rec.id : file.replace(/\.json$/, ''),
            at: typeof rec.at === 'string' ? rec.at : null,
            from: typeof rec.from === 'string' ? rec.from : null,
            to,
            subject: typeof rec.subject === 'string' ? rec.subject : '(no subject)',
            text: typeof rec.text === 'string' ? rec.text : null,
            hasHtml: typeof rec.html === 'string' && rec.html.length > 0,
            replyTo: typeof rec.replyTo === 'string' ? rec.replyTo : null,
            meta:
              rec.meta && typeof rec.meta === 'object'
                ? (rec.meta as Record<string, unknown>)
                : null,
          },
        })
      } catch {
        // Corrupt file — skip, don't fail the whole listing.
      }
    })
  )
  out.sort((a, b) => String(b.item.at ?? '').localeCompare(String(a.item.at ?? '')))
  return out
}

export async function GET() {
  const { error } = await requireCEOApi()
  if (error) return error
  const items = (await readItems()).map((r) => r.item)
  return NextResponse.json({ items, emailLive: emailLive() })
}

export async function DELETE(req: Request) {
  const { error } = await requireCEOApi()
  if (error) return error
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') ?? ''
  if (!SAFE_ID.test(id) || id.includes('..')) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const entries = await readItems()
  const match = entries.find((e) => e.item.id === id || e.file === `${id}.json`)
  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    await unlink(path.join(OUTBOX_DIR, match.file))
  } catch {
    return NextResponse.json({ error: 'Failed to resolve message' }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: match.item.id })
}
