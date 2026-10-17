# WhatsApp worker (isolated scaffold)

Read-only Baileys listener. Forwards new messages from monitored groups to the
backend ingest API. Does NOT reply/send in groups. NOT part of the Next.js
build (plain `.mjs`, own `package.json`, excluded from root `tsc`).

Mandated ingest contract (backend implements it; this worker calls it exactly):

- `POST {API_BASE}/api/whatsapp/ingest`, header `x-ingest-secret: <secret>`
- multipart: `payload` = JSON `{groupJid, groupName?, senderName?, senderPhone?, messageIds[], text}`
  + files `media0..n` (images ≤5MB, cap 10). `201 {item}` on success.
- Retry 3× with backoff on network/5xx; log + skip otherwise (never crash).

## Setup

```sh
cd workers/whatsapp-bot
npm install          # plain npm, INSIDE this dir only — never at repo root
cp /dev/null .env   # or: export the three vars below by hand; no root .env files
export API_BASE="http://localhost:3000"
export WHATSAPP_INGEST_SECRET="<same value as backend env>"
export MONITORED_GROUPS=""   # empty => onboarding mode (see below)
node index.mjs
```

Required env:

| Var | Meaning |
|---|---|
| `API_BASE` | Backend origin, e.g. `http://localhost:3000` (no trailing slash ok) |
| `WHATSAPP_INGEST_SECRET` | Must match backend secret; sent as `x-ingest-secret` header |
| `MONITORED_GROUPS` | Comma-separated group JIDs, e.g. `"120363123@g.us,120363456@g.us"`. Empty => onboarding mode |

Without `API_BASE` / `WHATSAPP_INGEST_SECRET` the worker prints a setup hint
and exits `1` (no QR, no connect).

## Pairing (owner, dedicated number only)

1. `node index.mjs` with env set. A QR prints in the terminal.
2. On the **dedicated** WhatsApp number: Linked devices → Link a device → scan.
3. Session persists to `auth/` (gitignored, never commit). Re-run reuses it.
4. Logged out? Delete `auth/` and re-pair.

`auth/` (session) and `media/` (temp downloads) are gitignored and must never
be committed.

## Onboarding: adding monitored groups

1. Start with `MONITORED_GROUPS=""`. The worker processes NOTHING but logs every
   incoming group message: `onboarding: group message in "<name>" <jid>`.
2. Copy the JID(s) you want, set `MONITORED_GROUPS="<jid1>,<jid2>"`, restart.
3. Only those groups are forwarded; everything else is ignored.

## Behavior notes

- Dedupe by message id (in-memory `Set`, cap 1000 FIFO).
- Images ≤5MB downloaded to `media/` temp, sent as `media0..n`. Deleted after
  2xx; **kept** on ingest failure for retry inspection (delete manually).
- Text-only messages forward with zero media parts.
- Per-message try/catch; worker never crashes on bad input.
- `SIGINT`/`SIGTERM` close the socket and exit cleanly.

## Commands

```sh
node --check index.mjs && node --check config.mjs   # syntax check
node -e "import('./config.mjs').then(m=>console.log(m.loadConfig({})))"  # config smoke (no connect)
npm start   # = node index.mjs
```
