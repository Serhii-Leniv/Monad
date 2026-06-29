import { useStore, toPersisted, type LayoutMode, type PersistedAgent } from './store'
import { RECENT_KEY, getRecent, removeRecent, type RecentProject } from './recent'

export type { RecentProject }

/** Single writer for a project's canvas file — shared by the debounced autosave
 *  in App and the flush-on-switch below, so the on-disk shape stays in one place. */
export function saveCanvas(projectPath: string, agents: PersistedAgent[], layoutMode: LayoutMode): void {
  void window.api.project.save(projectPath, { agents, layoutMode })
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
  saveCanvas(st.projectPath, toPersisted(st.agents), st.layoutMode)
}

/** Load a project's saved canvas + git info, prune stale worktrees, open it. */
export async function openProjectByPath(ref: RecentProject): Promise<void> {
  const store = useStore.getState()
  // Switching to the already-open workspace is a no-op (don't respawn agents).
  if (store.projectPath === ref.path) return

  // A recent card may point at a folder that's since been moved or deleted.
  // Opening it would spawn a canvas full of dead terminals — refuse and prune.
  const exists = await window.api.project.exists(ref.path)
  if (!exists) {
    store.setWorkspaces(removeRecent(ref.path))
    store.pushToast(`“${ref.name}” no longer exists at that location`, 'error')
    return
  }

  saveCurrent()
  try {
    const [saved, git] = await Promise.all([
      window.api.project.load(ref.path),
      window.api.git.info(ref.path)
    ])
    void window.api.git.prune(ref.path)
    pushRecent(ref)
    useStore.getState().openProject(ref, saved, git)
    // Always land on at least one terminal so a freshly-opened project isn't a
    // bare canvas.
    if (useStore.getState().agents.length === 0) useStore.getState().addAgent()
  } catch (e) {
    console.error('[vectro] open project failed:', e)
    useStore.getState().pushToast(`Couldn’t open “${ref.name}”`, 'error')
  }
}

/** Pick a folder via the OS dialog, then open it. */
export async function openProjectInteractive(): Promise<void> {
  try {
    const ref = await window.api.project.pick()
    if (!ref) return
    await openProjectByPath(ref)
  } catch (e) {
    console.error('[vectro] open folder failed:', e)
    useStore.getState().pushToast('Couldn’t open that folder', 'error')
  }
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
