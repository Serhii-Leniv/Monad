import { useStore } from './store'

export interface RecentProject {
  path: string
  name: string
}

const RECENT_KEY = 'vectro.recent'

/** Most-recently-opened projects (newest first), persisted in localStorage. */
export function getRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as RecentProject[]) : []
  } catch {
    return []
  }
}

function pushRecent(ref: RecentProject): void {
  try {
    const list = getRecent().filter((r) => r.path !== ref.path)
    list.unshift({ path: ref.path, name: ref.name })
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)))
  } catch {
    /* ignore */
  }
}

/** Load a project's saved canvas + git info, prune stale worktrees, open it. */
export async function openProjectByPath(ref: RecentProject): Promise<void> {
  const [saved, git] = await Promise.all([
    window.api.project.load(ref.path),
    window.api.git.info(ref.path)
  ])
  void window.api.git.prune(ref.path)
  pushRecent(ref)
  useStore.getState().openProject(ref, saved, git)
}

/** Pick a folder via the OS dialog, then open it. */
export async function openProjectInteractive(): Promise<void> {
  const ref = await window.api.project.pick()
  if (!ref) return
  await openProjectByPath(ref)
}

/** On launch, reopen the last project if its folder still exists. */
export async function restoreLastProject(): Promise<void> {
  const recent = getRecent()
  const last = recent[0]
  if (!last) return
  if (useStore.getState().projectPath) return
  const ok = await window.api.project.exists(last.path)
  if (ok && !useStore.getState().projectPath) await openProjectByPath(last)
}
