// WhatsApp worker SCAFFOLD (read-only listener).
// Boot -> QR in terminal -> persist session to auth/ -> idle.
// Forwards monitored group messages to POST {API_BASE}/api/whatsapp/ingest.
// NEVER replies/sends in groups. NEVER crashes on bad input.

import { mkdir, writeFile, rm, readdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  INGEST_PATH,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_FILES,
  RETRY_ATTEMPTS,
  docExtForMime,
  isImageMime,
} from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, "auth");
const MEDIA_DIR = path.join(__dirname, "media");
const LOG_FILE = path.join(__dirname, "bot.log");

// Dedupe by message id (in-memory, cap 1000, FIFO eviction).
const seenIds = new Set();
function markSeen(id) {
  if (!id) return false; // no id => treat as unseen, don't store
  if (seenIds.has(id)) return true;
  seenIds.add(id);
  if (seenIds.size > 1000) {
    const oldest = seenIds.values().next().value;
    seenIds.delete(oldest);
  }
  return false;
}

function log(...args) {
  const line = new Date().toISOString() + " [wa-bot] " + args.join(" ");
  // Write ONLY to the worker's own file. Under pm2 this umbrella's stdout
  // capture has been dead since day one (0-byte logs) and long-lived console
  // output can BLOCK the event loop if the capture pipe stalls — so we never
  // rely on console for any lifecycle line. Fire-and-forget, never blocks.
  appendFile(LOG_FILE, line + "\n").catch(() => {});
}


function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractText(msg) {
  try {
    const m = msg.message;
    if (!m) return "";
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;
    if (m.documentMessage?.caption) return m.documentMessage.caption;
    // Ephemeral / view-once wrappers
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message;
    if (inner) return extractText({ message: inner });
    return "";
  } catch {
    return "";
  }
}

function isGroupJid(jid) {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

async function resolveGroupName(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta?.subject || "";
  } catch {
    return "";
  }
}

function senderPhoneOf(msg) {
  // Prefer participantPn (real number) over participant (LID in newer Baileys).
  return (
    msg.key?.participantPn || msg.key?.participant || msg.key?.remoteJid || ""
  );
}

// POST multipart per MANDATED contract:
//   POST {API_BASE}/api/whatsapp/ingest, header x-ingest-secret
//   multipart: `payload` = JSON {groupJid, groupName?, senderName?, senderPhone?, messageIds[], text}
//             files `media0..n`
// Retry 3x with backoff on network/5xx; log + skip (never throw) otherwise.
async function postToIngest(cfg, payload, mediaPaths) {
  const url = cfg.apiBase + INGEST_PATH;
  let lastErr = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    for (let i = 0; i < mediaPaths.length; i++) {
      const { readFile } = await import("node:fs/promises");
      const buf = await readFile(mediaPaths[i].path);
      const blob = new Blob([buf], {
        type: mediaPaths[i].mime || "image/jpeg",
      });
      form.append(`media${i}`, blob, mediaPaths[i].filename);
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-ingest-secret": cfg.ingestSecret },
        body: form,
      });
      if (res.status === 201) {
        const item = await res.json().catch(() => null);
        return { ok: true, item };
      }
      if (res.status >= 500 && attempt < RETRY_ATTEMPTS) {
        lastErr = new Error(`ingest 5xx: ${res.status}`);
        log(`ingest attempt ${attempt} got ${res.status}, backing off…`);
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      const body = await res.text().catch(() => "");
      log(`ingest rejected (${res.status}): ${body.slice(0, 300)}`);
      return { ok: false, status: res.status };
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_ATTEMPTS) {
        log(`ingest attempt ${attempt} network error: ${err?.message}, backing off…`);
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
    }
  }
  log(`ingest failed after ${RETRY_ATTEMPTS} attempts: ${lastErr?.message}`);
  return { ok: false, error: lastErr?.message };
}

async function handleChatMessage(sock, cfg, monitoredSet, allowSet, msg) {
  const remoteJid = msg.key?.remoteJid || "";
  const isGroup = isGroupJid(remoteJid);

  // ── What chats do we ingest? ─────────────────────────────
  if (isGroup) {
    if (!cfg.monitorAllGroups && !monitoredSet.has(remoteJid)) {
      // Onboarding logging only when nothing monitored at all.
      if (monitoredSet.size === 0 && !cfg.monitorAllGroups) {
        let name = "";
        try {
          name = await resolveGroupName(sock, remoteJid);
        } catch { /* ignore */ }
        log(`onboarding: group message in "${name}" <${remoteJid}> — not monitored, skipping`);
      }
      return;
    }
  } else {
    // DM (skip status broadcast / newsletters)
    if (remoteJid === "status@broadcast" || remoteJid.endsWith("@newsletter") || remoteJid.endsWith("@broadcast")) return;
    // DM allowlist: empty => ALL direct chats are ingested (dedicated number).
    if (allowSet.size > 0) {
      const bare = remoteJid.split("@")[0];
      const hit = [...allowSet].some((a) => remoteJid.startsWith(a) || bare.startsWith(a));
      if (!hit) {
        log(`dm skipped: sender not in ALLOWED_SENDERS <${remoteJid}>`);
        return;
      }
    }
  }

  const id = msg.key?.id;
  if (id && markSeen(id)) {
    log(`dedupe: skipping already-seen message ${id}`);
    return;
  }

  const text = extractText(msg);
  const senderName = msg.pushName || msg.verifiedBizName || "";
  const senderPhone = senderPhoneOf(msg);
  const groupName = isGroup ? await resolveGroupName(sock, remoteJid) : "";

  // Download attachments: images + documents (xlsx/pdf/csv/doc/vcf…).
  const mediaPaths = [];
  const mediaMeta = [];
  const tryDownload = async (mime, extHint, displayName) => {
    if (mediaPaths.length >= MAX_MEDIA_FILES) return;
    try {
      const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
      const buf = await downloadMediaMessage(msg, "buffer", {});
      if (!buf) return;
      if (buf.byteLength > MAX_MEDIA_BYTES) {
        log(`media skip: ${buf.byteLength} bytes exceeds cap (${displayName || mime})`);
        return;
      }
      const ext = extHint || "bin";
      const filename = `${Date.now()}-${(id || "nomid").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}.${ext}`;
      const fpath = path.join(MEDIA_DIR, filename);
      await writeFile(fpath, buf);
      mediaPaths.push({ path: fpath, filename, mime, originalName: displayName });
      mediaMeta.push({ kind: isImageMime(mime) ? "image" : "document", mime, ext, name: displayName || filename });
      log(`media ok: ${filename} (${buf.byteLength}B, ${mime})`);
    } catch (err) {
      log(`media download failed (continuing text-only): ${err?.message}`);
    }
  };

  try {
    const m = msg.message || {};
    const img = m.imageMessage;
    const doc = m.documentMessage;
    if (img) {
      const mime = img.mimetype || "image/jpeg";
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      await tryDownload(mime, ext, null);
    }
    if (doc && mediaPaths.length < MAX_MEDIA_FILES) {
      // A message can carry image+doc? WhatsApp: not really, but tolerate both.
      const mime = doc.mimetype || "";
      const ext = docExtForMime(mime, doc.fileName);
      if (!ext) {
        log(`document skipped: unsupported type "${mime}" file="${doc.fileName}"`);
      } else {
        await tryDownload(mime, ext, doc.fileName || null);
      }
    }
  } catch (err) {
    log(`media stage error (continuing text-only): ${err?.message}`);
  }

  const payload = {
    groupJid: remoteJid,
    ...(groupName ? { groupName } : {}),
    ...(senderName ? { senderName } : {}),
    ...(senderPhone ? { senderPhone } : {}),
    messageIds: id ? [id] : [],
    ...(msg.key?.fromMe ? { fromMe: true } : {}),
    text: text || "",
    ...(mediaMeta.length ? { mediaMeta } : {}),
    source: isGroup ? "WHATSAPP_GROUP" : "WHATSAPP_DM",
  };

  const result = await postToIngest(cfg, payload, mediaPaths);

  // Temp media policy: delete after 2xx; KEEP on failure for retry inspection.
  if (result.ok) {
    for (const m of mediaPaths) {
      try {
        await rm(m.path, { force: true });
      } catch { /* ignore */ }
    }
    log(`ingested ${payload.source}=${remoteJid} id=${id || "?"} media=${mediaPaths.length} text=${(text || "").slice(0, 80)}`);
  } else {
    if (mediaPaths.length) {
      log(`ingest failed — KEEPING ${mediaPaths.length} temp file(s) in media/ for inspection: ${mediaPaths.map((m) => m.filename).join(", ")}`);
    } else {
      log(`ingest failed for id=${id || "?"} (text-only, nothing kept)`);
    }
  }
}

async function main() {
  const cfg = loadConfig();

  if (cfg.missing.length) {
    log(
      `Missing required env: ${cfg.missing.join(", ")}. ` +
        `Set API_BASE and WHATSAPP_INGEST_SECRET in workers/whatsapp-bot/.env. Exiting.`
    );
    process.exit(1);
  }

  await mkdir(AUTH_DIR, { recursive: true });
  await mkdir(MEDIA_DIR, { recursive: true });

  // Dynamic imports so the missing-env path above works without node_modules.
  const baileys = await import("@whiskeysockets/baileys");
  const qrcode = (await import("qrcode-terminal")).default;
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = baileys;

  const monitoredSet = new Set(cfg.monitoredGroups);
  const allowSet = new Set(cfg.allowedSenders);
  if (cfg.monitorAllGroups) {
    log("MONITOR_ALL_GROUPS=true — every incoming GROUP is ingested (+ DMs per allowlist).");
  } else if (monitoredSet.size === 0) {
    log("MONITORED_GROUPS empty & MONITOR_ALL_GROUPS unset — ONBOARDING MODE: will log groupName+JID of every incoming group message and process nothing.");
  } else {
    log(`monitoring ${monitoredSet.size} group(s): ${[...monitoredSet].join(", ")}`);
  }
  log(`DM allowlist: ${allowSet.size === 0 ? "OPEN (every DM ingested)" : [...allowSet].join(", ")}`);
  log(`ingest target: ${cfg.apiBase}${INGEST_PATH}`);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // offline scaffold boot still reaches QR stage
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({
    auth: state,
    ...(version ? { version } : {}),
    printQRInTerminal: false, // we print via qrcode-terminal ourselves
  });
  sock.ev.on("creds.update", saveCreds);

  const shutdown = async (sig) => {
    log(`received ${sig}, closing socket…`);
    try {
      sock.end?.();
    } catch { /* ignore */ }
    try {
      sock.ws?.close?.();
    } catch { /* ignore */ }
    log("shutdown complete.");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  let pairingRequested = false;
  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      if (cfg.pairPhone && !pairingRequested) {
        // Pair with a phone-number code — no QR scanning needed.
        pairingRequested = true;
        (async () => {
          try {
            const code = await sock.requestPairingCode(cfg.pairPhone);
            log(`PAIRING CODE for ${cfg.pairPhone}: ${code} — WhatsApp > Linked devices > Link with phone number (valid ~1 min)`);
          } catch (err) {
            log(`pairing code failed (${err?.message}) — falling back to QR`);
            qrcode.generate(qr, { small: true });
          }
        })();
      } else {
        log(`QR_RAW: ${qr}`); // machine string — render/scan remotely (QR valid ~20s)
      }
    }
    if (connection === "open") log("connected — session persisted to auth/, idling…");
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const errMessage = String(lastDisconnect?.error?.message || "").slice(0, 200);
      log(`connection closed (code=${code}) ${errMessage}. ${code === DisconnectReason?.loggedOut ? "Logged out — delete auth/ and re-pair." : ""}`);
      // Transient drops: restart quietly (pm2 ALSO restarts, but this avoids a
      // visibly-crashed exit between drops). LoggedOut must NOT loop: exit 1.
      if (code === DisconnectReason?.loggedOut) {
        log("logged out — exiting so the owner can re-pair (delete auth/ first).");
        process.exit(1);
      }
      setTimeout(() => process.exit(75), 3000); // pm2 restarts on exit
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages || []) {
      try {
        if (msg.key?.fromMe) continue; // read-only posture; ignore own messages
        await handleChatMessage(sock, cfg, monitoredSet, allowSet, msg);
      } catch (err) {
        // NEVER crash on bad input — log per message.
        log(`message handler error (skipping): ${err?.message}`);
      }
    }
  });

  log("booted — waiting for connection/QR…");
}

// Export for potential tests; run when executed directly.
export { markSeen, extractText, isGroupJid, loadConfig as loadConfigReexport };
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__dirname + "/index.mjs")) {
  main().catch((err) => {
    appendFile(LOG_FILE, `${new Date().toISOString()} [wa-bot] FATAL: ${err?.message || err}\n`).catch(() => {});
    process.exit(1);
  });
}
