// WhatsApp worker SCAFFOLD (read-only listener).
// Boot -> QR in terminal -> persist session to auth/ -> idle.
// Forwards monitored group messages to POST {API_BASE}/api/whatsapp/ingest.
// NEVER replies/sends in groups. NEVER crashes on bad input.

import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  INGEST_PATH,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_FILES,
  RETRY_ATTEMPTS,
} from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, "auth");
const MEDIA_DIR = path.join(__dirname, "media");

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
  console.log(new Date().toISOString(), "[wa-bot]", ...args);
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

async function handleGroupMessage(sock, cfg, monitoredSet, msg) {
  const remoteJid = msg.key?.remoteJid || "";
  if (!isGroupJid(remoteJid)) return; // ignore DMs/status

  // --- Onboarding mode: MONITORED_GROUPS empty => log JID, process NOTHING.
  if (monitoredSet.size === 0) {
    let name = "";
    try {
      name = await resolveGroupName(sock, remoteJid);
    } catch { /* ignore */ }
    log(`onboarding: group message in "${name}" <${remoteJid}> — not monitored, skipping`);
    return;
  }

  if (!monitoredSet.has(remoteJid)) return;

  const id = msg.key?.id;
  if (id && markSeen(id)) {
    log(`dedupe: skipping already-seen message ${id}`);
    return;
  }

  const text = extractText(msg);
  const senderName = msg.pushName || msg.verifiedBizName || "";
  const senderPhone = senderPhoneOf(msg);
  const groupName = await resolveGroupName(sock, remoteJid);

  // Download images (contract: images ≤5MB, cap 10) to media/ temp.
  const mediaPaths = [];
  try {
    const img = msg.message?.imageMessage;
    if (img && mediaPaths.length < MAX_MEDIA_FILES) {
      try {
        const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
        const buf = await downloadMediaMessage(msg, "buffer", {});
        if (buf && buf.byteLength <= MAX_MEDIA_BYTES) {
          const ext =
            img.mimetype?.includes("png") ? "png"
            : img.mimetype?.includes("webp") ? "webp"
            : "jpg";
          const filename = `${Date.now()}-${(id || "nomid").replace(/[^a-zA-Z0-9_-]/g, "")}.${ext}`;
          const fpath = path.join(MEDIA_DIR, filename);
          await writeFile(fpath, buf);
          mediaPaths.push({ path: fpath, filename, mime: img.mimetype });
        } else if (buf) {
          log(`media skip: image ${buf.byteLength} bytes exceeds 5MB cap`);
        }
      } catch (err) {
        log(`media download failed (continuing text-only): ${err?.message}`);
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
    text: text || "",
  };

  const result = await postToIngest(cfg, payload, mediaPaths);

  // Temp media policy: delete after 2xx; KEEP on failure for retry inspection.
  if (result.ok) {
    for (const m of mediaPaths) {
      try {
        await rm(m.path, { force: true });
      } catch { /* ignore */ }
    }
    log(`ingested group=${remoteJid} id=${id || "?"} media=${mediaPaths.length} text=${(text || "").slice(0, 80)}`);
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
    console.log(
      `[wa-bot] Missing required env: ${cfg.missing.join(", ")}.\n` +
        `  Set API_BASE (e.g. http://localhost:3000) and WHATSAPP_INGEST_SECRET\n` +
        `  (must match backend env), plus MONITORED_GROUPS as comma-separated\n` +
        `  group JIDs (e.g. "120363xxx@g.us"). See README.md. Exiting.`
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
  if (monitoredSet.size === 0) {
    log("MONITORED_GROUPS empty — ONBOARDING MODE: will log groupName+JID of every incoming group message and process nothing.");
  } else {
    log(`monitoring ${monitoredSet.size} group(s): ${[...monitoredSet].join(", ")}`);
  }
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

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      console.log("[wa-bot] Scan this QR with WhatsApp (Linked devices):");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") log("connected — session persisted to auth/, idling…");
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      log(`connection closed (code=${code}). ${code === DisconnectReason?.loggedOut ? "Logged out — delete auth/ and re-pair." : "Restart to reconnect."}`);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages || []) {
      try {
        if (msg.key?.fromMe) continue; // read-only posture; ignore own messages
        await handleGroupMessage(sock, cfg, monitoredSet, msg);
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
    console.error("[wa-bot] fatal:", err?.message || err);
    process.exit(1);
  });
}
