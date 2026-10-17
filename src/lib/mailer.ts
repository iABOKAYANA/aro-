/**
 * Outbound email.
 *
 * Three drivers, picked automatically (override with EMAIL_DRIVER):
 *
 *   resend  — HTTP API, needs RESEND_API_KEY           (no SMTP involved)
 *   smtp    — nodemailer over SMTP, needs SMTP_HOST / SMTP_URL
 *   outbox  — nothing configured → writes the message to
 *             data/outbox/*.json (NOT under public/ — queued mail holds real
 *             recipient addresses and must never be web-served) and logs it, so
 *             development and demos still "send" and you can inspect what would have gone out.
 *
 * Every helper is fail-soft: mail must never break the business operation that
 * triggered it. Callers get `{ ok, driver, error }` instead of exceptions.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type MailInput = {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  replyTo?: string
  from?: string
  /** e.g. `{ jobId: '...' }` — persisted with the outbox record for tracing. */
  meta?: Record<string, unknown>
}

export type MailResult = {
  ok: boolean
  driver: 'resend' | 'smtp' | 'outbox'
  id?: string
  error?: string
}

const DEFAULT_FROM = process.env.EMAIL_FROM || 'GHAYA REAL ESTATE <no-reply@estateai.eg>'

function driver(): MailResult['driver'] {
  const forced = (process.env.EMAIL_DRIVER || '').toLowerCase()
  if (forced === 'resend' || forced === 'smtp' || forced === 'outbox') return forced
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.SMTP_HOST || process.env.SMTP_URL) return 'smtp'
  return 'outbox'
}

function recipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .flatMap((t) => String(t).split(','))
    .map((t) => t.trim())
    .filter(Boolean)
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const to = recipients(input.to)
  if (to.length === 0) return { ok: false, driver: driver(), error: 'No recipients' }

  const d = driver()
  try {
    if (d === 'resend') return await sendViaResend(input, to)
    if (d === 'smtp') return await sendViaSmtp(input, to)
    return await sendViaOutbox(input, to)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error(`[mailer:${d}] failed:`, error)
    // A failed SMTP/API send still deserves a traceable record.
    if (d !== 'outbox') await sendViaOutbox(input, to).catch(() => {})
    return { ok: false, driver: d, error }
  }
}

/* ─── Driver: Resend ───────────────────────────────────── */

async function sendViaResend(input: MailInput, to: string[]): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY!
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from || DEFAULT_FROM,
      to,
      subject: input.subject,
      text: input.text || '',
      html: input.html || input.text || '',
      reply_to: input.replyTo || undefined,
      tags: input.meta ? Object.entries(input.meta).slice(0, 4).map(([k, v]) => ({ name: k, value: String(v).slice(0, 200) })) : undefined,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string }
  return { ok: true, driver: 'resend', id: data.id }
}

/* ─── Driver: SMTP via nodemailer ──────────────────────── */

async function sendViaSmtp(input: MailInput, to: string[]): Promise<MailResult> {
  const mod = await import('nodemailer')
  const nodemailer = mod.default ?? mod

  const url = process.env.SMTP_URL
  const transport = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      })

  const info = await transport.sendMail({
    from: input.from || DEFAULT_FROM,
    to: to.join(', '),
    subject: input.subject,
    text: input.text || '',
    html: input.html || input.text || '',
    replyTo: input.replyTo,
  })

  return { ok: true, driver: 'smtp', id: info.messageId }
}

/* ─── Driver: outbox (dev / unconfigured) ──────────────── */

async function sendViaOutbox(input: MailInput, to: string[]): Promise<MailResult> {
  const id = randomUUID()
  const dir = path.join(process.cwd(), 'data', 'outbox')
  await mkdir(dir, { recursive: true })

  const record = {
    id,
    at: new Date().toISOString(),
    from: input.from || DEFAULT_FROM,
    to,
    subject: input.subject,
    text: input.text || null,
    html: input.html || null,
    replyTo: input.replyTo || null,
    meta: input.meta || null,
  }

  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2))
  // No recipient log here: outbox records hold real addresses and server logs
  // are broadly retained — subject/recipient lines must never land in them.
  return { ok: true, driver: 'outbox', id }
}

/* ─── Preference-aware send ────────────────────────────── */

export type EmailPref =
  | 'emailInquiries'
  | 'emailLeads'
  | 'emailPayments'
  | 'emailViewings'
  | 'emailMarketing'

/**
 * Send to a registered user, honouring their NotificationPreference toggle
 * (and MarketingConsent for marketing mail). Users without a preference row
 * get mail — defaults are opt-out.
 */
export async function sendMailToUser(
  userId: string,
  pref: EmailPref,
  input: Omit<MailInput, 'to'>
): Promise<MailResult | null> {
  try {
    const { db } = await import('@/lib/db')
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, notificationsPref: { select: { [pref]: true } } },
    })
    if (!user?.email) return null

    const row = user.notificationsPref as Record<string, boolean> | null
    if (row && row[pref] === false) return { ok: false, driver: driver(), error: 'opted-out' }

    if (pref === 'emailMarketing') {
      const consent = await db.marketingConsent.findFirst({
        where: { userId, channel: 'EMAIL', purpose: 'MARKETING', isActive: true },
        select: { id: true },
      })
      if (!consent) return { ok: false, driver: driver(), error: 'no-consent' }
    }

    return await sendMail({ ...input, to: user.email })
  } catch (e) {
    return { ok: false, driver: driver(), error: e instanceof Error ? e.message : String(e) }
  }
}

/* ─── Template helper ──────────────────────────────────── */

/** Minimal branded HTML wrapper — plain text is always sent alongside. */
export function mailHtml(opts: { heading: string; body: string; cta?: { label: string; href: string } }) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://estateai.eg').replace(/\/$/, '')
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#0b1020;color:#f8fafc;border-radius:16px 16px 0 0;padding:24px 28px">
      <div style="font-size:13px;letter-spacing:4px;color:#94a3b8">GHAYA REAL ESTATE</div>
      <div style="font-size:20px;font-weight:700;margin-top:8px">${escapeHtml(opts.heading)}</div>
    </div>
    <div style="background:#ffffff;padding:28px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:none;color:#334155;font-size:15px;line-height:1.65">
      ${opts.body}
      ${opts.cta ? `<p style="margin:26px 0 0"><a href="${escapeHtml(opts.cta.href.startsWith('http') ? opts.cta.href : site + opts.cta.href)}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${escapeHtml(opts.cta.label)}</a></p>` : ''}
      <p style="margin:26px 0 0;color:#94a3b8;font-size:12px">You're receiving this because you have an account on ${escapeHtml(site)}.</p>
    </div>
  </div></body></html>`
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
