import { useStore, toPersisted } from './store'

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
    const trimmed = list.slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed))
    // Mirror into the store so the dock's workspace switcher updates live.
    useStore.getState().setWorkspaces(trimmed)
  } catch {
    /* ignore */
  }
}

/**
 * Flush the open project's canvas to disk before we tear it down. Autosave is
 * debounced, so a quick switch right after a layout change could otherwise lose
 * it (the timer is cancelled when the panes unmount).
 */
function saveCurrent(): void {
  const st = useStore.getState()
  if (!st.projectPath) return
  void window.api.project.save(st.projectPath, {
    agents: toPersisted(st.agents),
    layoutMode: st.layoutMode
  })
}

/** Load a project's saved canvas + git info, prune stale worktrees, open it. */
export async function openProjectByPath(ref: RecentProject): Promise<void> {
  // Switching to the already-open workspace is a no-op (don't respawn agents).
  if (useStore.getState().projectPath === ref.path) return
  saveCurrent()
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
