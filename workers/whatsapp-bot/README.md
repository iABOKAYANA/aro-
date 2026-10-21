# WhatsApp worker (owner-feed gateway)

Read-only Baileys listener. Forwards incoming messages (groups + direct chats)
with TEXT, IMAGES **and DOCUMENTS** (xlsx/xls/csv/pdf/doc(x)/vcf) to the backend
ingest API → StagingItem inbox (CEO console → /ceo/projects → WhatsApp staging).
Does NOT reply/send. NOT part of the Next.js build (plain `.mjs`, excluded from
root `tsc`).

## Ingest contract (backend implements it; this worker calls it exactly)

- `POST {API_BASE}/api/whatsapp/ingest`, header `x-ingest-secret: <secret>`
- multipart: `payload` = JSON `{groupJid, groupName?, senderName?, senderPhone?,
  messageIds[], text, source: WHATSAPP_GROUP|WHATSAPP_DM, mediaMeta?[]}`
  + files `media0..n` (images ≤10MB, documents ≤16MB, cap 10). `201 {item}`.
- Retry 3× with backoff on network/5xx; log + skip otherwise (never crash).

## Setup (VPS: /opt/ghaya/workers/whatsapp-bot)

`.env` (chmod 600, loaded by the worker itself):
```
API_BASE=http://127.0.0.1:3001
WHATSAPP_INGEST_SECRET=<same as /opt/ghaya/.env>
MONITOR_ALL_GROUPS=true     # ingest EVERY group the bot is in
MONITORED_GROUPS=           # optional explicit JID list (else empty=onboarding)
ALLOWED_SENDERS=            # empty => ALL DMs ingested; set digits to lock down
PAIR_PHONE=201XXXXXXXXX     # optional: pairing-code instead of QR scan
```

Run: `pm2 restart wa-bot` (process file: deploy/ecosystem.config.js).

## Pairing (dedicated number only)

1. First run: QR prints to `/var/log/ghaya/wa-bot-out.log` (`QR_RAW:` line for
   remote rendering) — WhatsApp → Linked devices → Link a device
2. If `PAIR_PHONE` is set, a **pairing code** is logged instead —
   WhatsApp → Linked devices → Link with phone number, type the code.
3. Session persists in `auth/` (gitignored). Logged out → delete `auth/`, re-run.

## Behavior

- `MONITOR_ALL_GROUPS=true`: any group message is ingested (add bot to a
  developer group and it just works).
- DMs: status@broadcast / newsletter / broadcast are skipped; allowlist optional.
- Documents: only allowed extensions downloaded; unknown types are logged+skipped.
- Dedupe by message id (in-memory Set, cap 1000 FIFO).
- Media stored to `media/` temp, deleted after a 2xx ingest, KEPT on failure.
- Per-message try/catch; worker never crashes on bad input.
