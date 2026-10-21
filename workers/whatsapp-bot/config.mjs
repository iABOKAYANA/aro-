// Pure env parsing — must NOT require Baileys / network / connect.
// Safe to `import()` in smoke tests.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Minimal .env loader (no deps): fills process.env from sibling .env file. */
function loadDotenv() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(path.join(here, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* no .env — env must come from the shell/pm2 */ }
}
loadDotenv();

export function loadConfig(env = process.env) {
  const apiBase = (env.API_BASE || "").trim().replace(/\/+$/, "");
  const ingestSecret = (env.WHATSAPP_INGEST_SECRET || "").trim();
  const rawGroups = (env.MONITORED_GROUPS || "").trim();

  const monitoredGroups = rawGroups
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // MONITOR_ALL_GROUPS=true => ingest every group message, no JID list needed
  // (owner flow: add the bot to a developer group and it just works).
  const monitorAllGroups = /^(1|true|yes)$/i.test((env.MONITOR_ALL_GROUPS || "").trim());

  // Allowlist of DM senders (phone digits or JIDs, comma-separated). Empty =>
  // ALL direct chats are ingested. Use it to lock the bot down if spammed.
  const allowedSenders = (env.ALLOWED_SENDERS || "")
    .split(",")
    .map((s) => s.trim().replace(/[^0-9a-zA-Z@.]/g, ""))
    .filter(Boolean);

  // Pair-by-phone-number (no QR scanning): the dedicated number holding the
  // WhatsApp account, e.g. "201098765432". When set and no session exists the
  // worker requests a pairing code and prints it in the log.
  const pairPhone = (env.PAIR_PHONE || "").trim().replace(/\D/g, "");

  const missing = [];
  if (!apiBase) missing.push("API_BASE");
  if (!ingestSecret) missing.push("WHATSAPP_INGEST_SECRET");
  // MONITORED_GROUPS intentionally NOT required: empty + MONITOR_ALL_GROUPS
  // unset => onboarding mode (log every JID, ingest nothing).

  return {
    apiBase,
    ingestSecret,
    monitoredGroups,
    monitorAllGroups,
    allowedSenders,
    pairPhone,
    missing,
  };
}

export const INGEST_PATH = "/api/whatsapp/ingest";
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // 16MB per attachment (documents can be big)
export const MAX_MEDIA_FILES = 10; // cap 10 per message
export const RETRY_ATTEMPTS = 3;

/** Attachment mimes accepted by the ingest contract (images + office docs). */
export function docExtForMime(mime, fallbackName) {
  const m = (mime || "").toLowerCase();
  const name = (fallbackName || "").toLowerCase();
  const extFromName = name.includes(".") ? name.split(".").pop() : "";
  if (m.includes("pdf") || extFromName === "pdf") return "pdf";
  if (m.includes("spreadsheetml") || m.includes("excel") || extFromName === "xlsx") return "xlsx";
  if (m.includes("ms-excel") || extFromName === "xls") return "xls";
  if (m === "text/csv" || extFromName === "csv") return "csv";
  if (m.includes("wordprocessingml") || extFromName === "docx") return "docx";
  if (m.includes("msword") || extFromName === "doc") return "doc";
  if (m.includes("vcard") || extFromName === "vcf") return "vcf";
  return null; //unsupported — caller logs and skips the download
}

/** Is this mime one of the image kinds (server side has its own check)? */
export function isImageMime(mime) {
  const m = (mime || "").toLowerCase();
  return m.startsWith("image/");
}
