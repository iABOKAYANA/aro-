// Arabic backfill: MISSING-ONLY translations via local Ollama (qwen2.5:3b).
// Usage: node scripts/translate-ar.mjs [path-to-dev.db]
// Updates: Project.nameArabic, Unit.nameArabic, DeveloperProfile.companyNameArabic,
//          Amenity.nameArabic (where missing). Row-by-row try/catch. No new npm deps.
import { execFileSync } from 'node:child_process';

const DB = process.argv[2] || 'prisma/dev.db';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

function q(sql) {
  const out = execFileSync('sqlite3', ['-separator', '\t', DB, sql], { encoding: 'utf8' });
  return out.split('\n').filter((l) => l.length > 0).map((l) => l.split('\t'));
}
function esc(s) {
  return String(s ?? '').replace(/'/g, "''");
}
function update(table, idCol, id, setCol, value) {
  execFileSync('sqlite3', [DB, `UPDATE "${table}" SET "${setCol}"='${esc(value)}' WHERE "${idCol}"='${esc(id)}';`]);
}

async function translate(name) {
  const prompt = `Translate this Egyptian real-estate name to Arabic. Reply with ONLY the Arabic name, no explanation, no quotes, max 8 words: "${name}"`;
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.2 } }),
  });
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
  const data = await res.json();
  const text = String(data.response || '').trim().replace(/^["'«»“”]+|["'«»“”]+$/g, '').trim();
  // Validate: non-empty, contains Arabic, sane length, not identical to input
  if (!text) throw new Error('empty response');
  if (!/[\u0600-\u06FF]/.test(text)) throw new Error(`no Arabic chars: ${text}`);
  if (text.length > 200) throw new Error(`too long (${text.length})`);
  if (text === name) throw new Error('unchanged');
  return text.split('\n')[0].trim();
}

const stats = {};
async function backfill(label, selectSql, table, idIdx, nameIdx, setCol) {
  const rows = q(selectSql);
  stats[label] = { total: rows.length, translated: 0, failed: 0, skipped: 0 };
  const samples = [];
  for (const r of rows) {
    const id = r[idIdx];
    const name = r[nameIdx];
    if (!name || !name.trim()) { stats[label].skipped++; continue; }
    try {
      const ar = await translate(name.trim());
      update(table, 'id', id, setCol, ar);
      stats[label].translated++;
      if (samples.length < 2) samples.push([name, ar]);
    } catch (e) {
      stats[label].failed++;
      console.error(`[${label}] SKIP id=${id} name=${JSON.stringify(name)}: ${e.message}`);
    }
  }
  stats[label].samples = samples;
}

await backfill('Project', `SELECT id, name FROM Project WHERE nameArabic IS NULL OR nameArabic='';`, 'Project', 0, 1, 'nameArabic');
await backfill('Unit', `SELECT id, name FROM Unit WHERE nameArabic IS NULL OR nameArabic='';`, 'Unit', 0, 1, 'nameArabic');
await backfill('DeveloperProfile', `SELECT id, companyName FROM DeveloperProfile WHERE companyNameArabic IS NULL OR companyNameArabic='' OR companyNameArabic=companyName;`, 'DeveloperProfile', 0, 1, 'companyNameArabic');
await backfill('Amenity', `SELECT id, name FROM Amenity WHERE nameArabic IS NULL OR nameArabic='' OR nameArabic=name;`, 'Amenity', 0, 1, 'nameArabic');

console.log(JSON.stringify(stats, null, 2));
