/** Client-side helpers for saved (favorited) projects and recently viewed projects. */

export interface SavedProject {
  id: string
  slug: string
  name: string
  nameArabic?: string | null
  coverImage?: string | null
  startPrice?: number | null
  status: string
  savedAt: number
}

const SAVED_KEY = 'ghaya:saved-projects'
const RECENT_KEY = 'ghaya:recent-projects'

function read(key: string): SavedProject[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(key: string, list: SavedProject[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* storage full or unavailable — ignore */
  }
}

export function getSavedProjects(): SavedProject[] {
  return read(SAVED_KEY)
}

export function isProjectSaved(id: string): boolean {
  return read(SAVED_KEY).some((x) => x.id === id)
}

/** Adds the project if missing, removes it if present. Returns the new saved state. */
export function toggleSaved(project: SavedProject): boolean {
  const list = read(SAVED_KEY)
  const exists = list.some((x) => x.id === project.id)
  const next = exists
    ? list.filter((x) => x.id !== project.id)
    : [{ ...project, savedAt: Date.now() }, ...list]
  write(SAVED_KEY, next)
  return !exists
}

export function removeSaved(id: string): void {
  write(SAVED_KEY, read(SAVED_KEY).filter((x) => x.id !== id))
}

export function getRecentProjects(): SavedProject[] {
  return read(RECENT_KEY)
}

export function pushRecentProject(project: SavedProject): void {
  const list = read(RECENT_KEY).filter((x) => x.id !== project.id)
  write(RECENT_KEY, [{ ...project, savedAt: Date.now() }, ...list].slice(0, 6))
}
