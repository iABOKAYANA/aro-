// Pure env parsing — must NOT require Baileys / network / connect.
// Safe to `import()` in smoke tests.
export function loadConfig(env = process.env) {
  const apiBase = (env.API_BASE || "").trim().replace(/\/+$/, "");
  const ingestSecret = (env.WHATSAPP_INGEST_SECRET || "").trim();
  const rawGroups = (env.MONITORED_GROUPS || "").trim();

  const monitoredGroups = rawGroups
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const missing = [];
  if (!apiBase) missing.push("API_BASE");
  if (!ingestSecret) missing.push("WHATSAPP_INGEST_SECRET");
  // MONITORED_GROUPS intentionally NOT required: empty => onboarding mode.

  return { apiBase, ingestSecret, monitoredGroups, missing };
}

export const INGEST_PATH = "/api/whatsapp/ingest";
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5MB per image (contract)
export const MAX_MEDIA_FILES = 10; // cap 10
export const RETRY_ATTEMPTS = 3;
