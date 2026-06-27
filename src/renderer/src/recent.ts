export interface RecentProject {
  path: string
  name: string
}

export const RECENT_KEY = 'vectro.recent'

/** Most-recently-opened projects (newest first), persisted in localStorage. The
 *  single reader shared by the store's workspace switcher and openProject. */
export function getRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as RecentProject[]) : []
  } catch {
    return []
  }
}
