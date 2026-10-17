import { db } from '@/lib/db'
import { newLaunchesConfigSchema } from '@/lib/validations'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

// ─── "New Launches" section configuration ──────────────────
// The homepage "New Launches" band used to be purely automatic
// (projects created in the last N days). It is now fully
// configurable by the CEO. All state lives in SystemSetting
// (key `new_launches`) — no schema change, consistent with the
// lead-protection / commission configuration pattern.
//
//  enabled     → master switch for the whole feature (band + badges)
//  windowDays  → automatic inclusion window (was hardcoded 30)
//  limit       → max cards in the band (pinned always included)
//  pinnedIds   → force-include these projects (shown first, any age)
//  hiddenIds   → force-exclude these projects (even if brand new)

export interface NewLaunchesConfig {
  enabled: boolean
  windowDays: number
  limit: number
  pinnedIds: string[]
  hiddenIds: string[]
}

export const NEW_LAUNCHES_SETTING_KEY = 'new_launches'

export const DEFAULT_NEW_LAUNCHES_CONFIG: NewLaunchesConfig = {
  enabled: true,
  windowDays: 30,
  limit: 6,
  pinnedIds: [],
  hiddenIds: [],
}

/** Read the stored config; never throws — falls back to defaults. */
export async function getNewLaunchesConfig(): Promise<NewLaunchesConfig> {
  try {
    const row = await db.systemSetting.findUnique({
      where: { key: NEW_LAUNCHES_SETTING_KEY },
    })
    if (!row) return { ...DEFAULT_NEW_LAUNCHES_CONFIG, pinnedIds: [], hiddenIds: [] }
    const parsed = newLaunchesConfigSchema.safeParse(JSON.parse(row.value))
    if (!parsed.success) return { ...DEFAULT_NEW_LAUNCHES_CONFIG, pinnedIds: [], hiddenIds: [] }
    return parsed.data
  } catch {
    return { ...DEFAULT_NEW_LAUNCHES_CONFIG, pinnedIds: [], hiddenIds: [] }
  }
}

/** Validate + persist the config (upsert). Caller handles audit logging. */
export async function saveNewLaunchesConfig(
  input: unknown
): Promise<{ ok: true; config: NewLaunchesConfig } | { ok: false; error: string }> {
  const parsed = newLaunchesConfigSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid configuration' }
  }
  const config = {
    ...parsed.data,
    // keep IDs unique and free of blanks
    pinnedIds: [...new Set(parsed.data.pinnedIds.filter(Boolean))],
    hiddenIds: [...new Set(parsed.data.hiddenIds.filter(Boolean))],
  }
  await db.systemSetting.upsert({
    where: { key: NEW_LAUNCHES_SETTING_KEY },
    update: { value: JSON.stringify(config), category: 'content' },
    create: { key: NEW_LAUNCHES_SETTING_KEY, value: JSON.stringify(config), category: 'content' },
  })
  return { ok: true, config }
}

/** Is this project designated a "new launch"? (drives the New badge on cards) */
export function computeIsNewLaunch(
  config: NewLaunchesConfig,
  project: { id: string; createdAt: Date | string }
): boolean {
  if (!config.enabled) return false
  if (config.hiddenIds.includes(project.id)) return false
  if (config.pinnedIds.includes(project.id)) return true
  const created = new Date(project.createdAt).getTime()
  if (!Number.isFinite(created)) return false
  return Date.now() - created < config.windowDays * 86_400_000
}

/** Fields the homepage launch band renders (mirrors /api/projects shape). */
export const LAUNCH_PROJECT_SELECT = {
  id: true,
  name: true,
  nameArabic: true,
  slug: true,
  coverImage: true,
  startPrice: true,
  status: true,
  completionPercent: true,
  propertyTypes: true,
  createdAt: true,
  developer: { select: { companyName: true, logo: true, isVerified: true } },
  governorate: { select: { name: true, nameArabic: true } },
  city: { select: { name: true, nameArabic: true, nameSlug: true } },
  district: { select: { name: true, nameArabic: true } },
} as const

/**
 * Compute the final homepage list:
 *  - only active, approved/published projects (non-approved never render)
 *  - hidden excluded everywhere
 *  - pinned first (in pin order), then automatic window matches (newest first)
 *  - pinned are always shown and are not counted against `limit`
 */
export async function computeNewLaunches(config?: NewLaunchesConfig) {
  const cfg = config ?? (await getNewLaunchesConfig())
  if (!cfg.enabled) return { config: cfg, items: [] as any[] }

  const [pinnedRows, autoRows] = await Promise.all([
    cfg.pinnedIds.length
      ? db.project.findMany({
          where: { id: { in: cfg.pinnedIds }, ...PUBLIC_PROJECT_WHERE },
          select: LAUNCH_PROJECT_SELECT,
        })
      : Promise.resolve([]),
    db.project.findMany({
      where: {
        ...PUBLIC_PROJECT_WHERE,
        createdAt: { gte: new Date(Date.now() - cfg.windowDays * 86_400_000) },
        ...(cfg.pinnedIds.length || cfg.hiddenIds.length
          ? { id: { notIn: [...cfg.pinnedIds, ...cfg.hiddenIds] } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: cfg.limit,
      select: LAUNCH_PROJECT_SELECT,
    }),
  ])

  // preserve the CEO's pin order
  const pinnedOrdered = cfg.pinnedIds
    .map((id) => pinnedRows.find((p) => p.id === id))
    .filter((p): p is (typeof pinnedRows)[number] => Boolean(p))

  const autoBudget = Math.max(0, cfg.limit - pinnedOrdered.length)
  const items = [...pinnedOrdered, ...autoRows.slice(0, autoBudget)]

  return { config: cfg, items }
}
