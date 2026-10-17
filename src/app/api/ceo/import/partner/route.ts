import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import {
  partnerImportBodyZ,
  previewPartnerFeed,
  previewPartnerSample,
  importPartnerRows,
  importPartnerUnitRows,
  mapPartnerRow,
  parseJsonFeed,
  parseCsvFeed,
  parseXmlFeed,
  fetchPartnerText,
  redactUrl,
  PartnerFetchError,
  DEFAULT_FIELD_MAP,
  UNIT_DEFAULT_FIELD_MAP,
  PARTNER_CONFIG_SCHEMA,
  PARTNER_OUR_FIELDS,
  PARTNER_SAMPLE_ROWS,
  PARTNER_UNIT_SAMPLE_ROWS,
} from '@/lib/partner-import'
import type { PartnerImportResult, PartnerMappedRow, PartnerUnitMappedRow } from '@/lib/partner-import'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/import/partner — importer status + config schema ─
// Fully offline: never touches the partner feed (no credentials exist
// yet). Tells the owner exactly what to paste when Nawy replies.
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    let pendingDrafts = 0
    try {
      pendingDrafts = await db.project.count({
        where: { keywords: { contains: 'partner-feed' }, approvalStatus: 'PENDING' },
      })
    } catch {
      pendingDrafts = 0
    }

    return NextResponse.json({
      status: 'ready',
      credentialsLive: false,
      publishRule: 'IMPORT writes PENDING/inactive drafts only — drafts never auto-publish. A CEO publishes manually after review.',
      targets: ['project', 'unit'],
      configSchema: PARTNER_CONFIG_SCHEMA,
      ourFields: PARTNER_OUR_FIELDS,
      defaults: {
        target: 'project',
        fieldMap: DEFAULT_FIELD_MAP,
        unitFieldMap: UNIT_DEFAULT_FIELD_MAP,
        dataPath: '',
        limit: 20,
      },
      sample: {
        rows: PARTNER_SAMPLE_ROWS.length,
        offlinePreview: 'POST { "mode": "PREVIEW", "useSample": true } — no fetch, tests mapping today.',
        unitRows: PARTNER_UNIT_SAMPLE_ROWS.length,
        unitOfflinePreview: 'POST { "mode": "PREVIEW", "target": "unit", "useSample": true } — validates the unit shape; fake slugs are reported as unknown-project errors (read-only, never creates a project).',
      },
      stats: { pendingDrafts },
    })
  } catch (err) {
    console.error('Partner import status error:', err)
    return NextResponse.json({ error: 'Failed to load importer status' }, { status: 500 })
  }
}

// ─── POST /api/ceo/import/partner — PREVIEW / IMPORT ─────────────
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const parsed = partnerImportBodyZ.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 }
      )
    }
    const { mode, useSample, limit, source, fieldMap, target } = parsed.data
    // Legacy default: target 'project' → same field map + same behaviour as
    // before (export/UX preview stays backward compatible).
    const baseFieldMap: Record<string, string> = target === 'unit' ? UNIT_DEFAULT_FIELD_MAP : DEFAULT_FIELD_MAP
    const effectiveFieldMap: Record<string, string> = {
      ...baseFieldMap,
      ...(source?.fieldMap ?? {}),
      ...(fieldMap ?? {}),
    }

    if (mode === 'PREVIEW') {
      // ZERO writes on this path (sample path performs no fetch at all;
      // unit mode only READS project slugs to report unknown ones).
      const preview = useSample
        ? await previewPartnerSample(effectiveFieldMap, limit, target)
        : await previewPartnerFeed(source!, { limit, fieldMapOverride: effectiveFieldMap, target })
      return NextResponse.json({ preview, target })
    }

    // ── IMPORT: drafts only (project) / real units (unit), audit-logged ──
    let rawRows: Record<string, unknown>[]
    if (useSample) {
      const fixture = target === 'unit' ? PARTNER_UNIT_SAMPLE_ROWS : PARTNER_SAMPLE_ROWS
      rawRows = fixture.slice(0, Math.min(limit, 50))
    } else {
      try {
        const text = await fetchPartnerText(source!)
        rawRows =
          source!.kind === 'csv'
            ? parseCsvFeed(text)
            : source!.kind === 'xml'
              ? parseXmlFeed(text)
              : parseJsonFeed(text, source!.dataPath || '')
      } catch (err) {
        if (err instanceof PartnerFetchError) {
          // 401/403 passthrough from the source; anything else is a 502.
          // Messages carry only the redacted URL — never the credential.
          const status = err.upstreamStatus === 401 || err.upstreamStatus === 403 ? err.upstreamStatus : 502
          return NextResponse.json({ error: err.message }, { status })
        }
        throw err
      }
    }

    const skipped: { name: string; reason: string }[] = []
    const rowErrors: { index: number; error: string }[] = []
    let result: PartnerImportResult

    if (target === 'unit') {
      // STRICT: every mapping/validation failure is an ERROR row (no partial
      // writes) — including missing name. Unknown project slugs are detected
      // inside importPartnerUnitRows (read-only lookup, never a create).
      const validRows: PartnerUnitMappedRow[] = []
      for (let i = 0; i < Math.min(rawRows.length, 50); i++) {
        const m = mapPartnerRow(rawRows[i], effectiveFieldMap, 'unit')
        if (!m.row) {
          rowErrors.push({ index: i, error: m.error ?? 'row failed validation' })
          continue
        }
        validRows.push(m.row)
      }
      result = await importPartnerUnitRows(validRows)
    } else {
      const mapped: { index: number; name: string }[] = []
      for (let i = 0; i < Math.min(rawRows.length, 50); i++) {
        const m = mapPartnerRow(rawRows[i], effectiveFieldMap)
        if (!m.row) {
          const rawName = rawRows[i][Object.keys(effectiveFieldMap)[0]] ?? rawRows[i].name
          if (m.error === 'missing required "name"') {
            skipped.push({ name: typeof rawName === 'string' ? rawName.slice(0, 80) : `row ${i}`, reason: 'missing name' })
          } else {
            rowErrors.push({ index: i, error: m.error ?? 'row failed validation' })
          }
          continue
        }
        mapped.push({ index: i, name: m.row.name })
      }

      const validRows: PartnerMappedRow[] = mapped.map((m) => {
        const r = mapPartnerRow(rawRows[m.index], effectiveFieldMap)
        return r.row!
      })
      result = await importPartnerRows(validRows)
    }

    // Audit log: counts + feed kind + redacted host only. The credential
    // (per-request, in-memory) is never written here or anywhere else.
    await logAudit({
      userId: session!.user?.id,
      action: 'PARTNER_IMPORT',
      entity: target === 'unit' ? 'Unit' : 'Project',
      changes: {
        mode: 'IMPORT',
        target,
        offline: useSample,
        kind: useSample ? 'sample' : source!.kind,
        feed: useSample ? 'sample-fixture' : redactUrl(source!.url),
        requested: rawRows.length,
        imported: result.imported.length,
        skipped: result.skipped.length + skipped.length,
        errors: result.errors.length + rowErrors.length,
        publishRule: target === 'unit' ? 'real Unit rows on an existing project (visibility follows the project)' : 'draft-only (PENDING/inactive)',
      },
    })

    return NextResponse.json({
      target,
      publishRule:
        target === 'unit'
          ? 'unit-mode: valid rows are written as real Unit rows on an EXISTING project matched by exact slug; unknown slugs are errors and no project is ever created. Visibility follows the parent project, so units on a PENDING draft stay hidden until the CEO approves it.'
          : 'draft-only: all rows written as PENDING/inactive drafts, never published.',
      imported: result.imported,
      skipped: [...skipped, ...result.skipped],
      errors: [...rowErrors, ...result.errors],
    })
  } catch (err) {
    if (err instanceof PartnerFetchError) {
      const status = err.upstreamStatus === 401 || err.upstreamStatus === 403 ? err.upstreamStatus : 502
      return NextResponse.json({ error: err.message }, { status })
    }
    console.error('Partner import error:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
