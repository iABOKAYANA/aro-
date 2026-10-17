/*
 * CEO · Email Outbox — unsent / queued mail while email is unconfigured.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  GOING LIVE WITH EMAIL — paste these into Vercel + local `.env`:
 * ───────────────────────────────────────────────────────────────────
 *  Option A (recommended, HTTP API — no SMTP involved):
 *    RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *    EMAIL_FROM="GHAYA REAL ESTATE <no-reply@estateai.eg>"
 *
 *  Option B (SMTP, e.g. Gmail / Workspace / Postmark):
 *    SMTP_HOST=smtp.example.com
 *    SMTP_PORT=587
 *    SMTP_SECURE=false            # "true" only for port 465
 *    SMTP_USER=you@example.com
 *    SMTP_PASS=xxxxxxxxxxxxxxxx
 *    SMTP_URL=smtps://user:pass@smtp.example.com:465   # alternative: single URL
 *    EMAIL_FROM="GHAYA REAL ESTATE <no-reply@estateai.eg>"
 *
 *  WHERE:
 *    • Vercel → Project → Settings → Environment Variables
 *      (add for Production + Preview, then Redeploy).
 *    • Local  → `.env` / `.env.local` in the project root, then restart `next dev`.
 *
 *  OPTIONAL overrides:
 *    EMAIL_DRIVER=resend|smtp|outbox   # force one driver (default: auto-detect)
 *
 *  The banner below flips to "email live" automatically as soon as
 *  RESEND_API_KEY or SMTP_HOST/SMTP_URL is present — from then on this
 *  page is just history. "Mark resolved" deletes the queued file once
 *  you've followed up manually.
 * ═══════════════════════════════════════════════════════════════════
 */

import OutboxClient from './outbox-client'
import CspReportsSection from './csp-reports-section'

export const metadata = {
  title: 'Email Outbox · CEO',
}

export default function OutboxPage() {
  return (
    <div className="space-y-6">
      <OutboxClient />
      <CspReportsSection />
    </div>
  )
}
