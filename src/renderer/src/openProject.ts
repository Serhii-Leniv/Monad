import { useStore, toPersisted, type LayoutMode, type PersistedAgent } from './store'
import { RECENT_KEY, getRecent, removeRecent, type RecentProject } from './recent'

export type { RecentProject }

// Surface a save failure once per "broken" streak — autosave fires every few
// hundred ms, so we must not toast on every attempt. Reset when a save succeeds.
let saveFailedNotified = false

/** Single writer for a project's canvas file — shared by the debounced autosave
 *  in App and the flush-on-switch below, so the on-disk shape stays in one place.
 *  A read-only folder / full disk / network share returns false; we tell the user
 *  once rather than silently dropping their canvas. */
export async function saveCanvas(
  projectPath: string,
  agents: PersistedAgent[],
  layoutMode: LayoutMode
): Promise<void> {
  let ok = false
  try {
    ok = await window.api.project.save(projectPath, { agents, layoutMode })
  } catch {
    ok = false
  }
  if (ok) {
    saveFailedNotified = false
  } else if (!saveFailedNotified) {
    saveFailedNotified = true
    useStore
      .getState()
      .pushToast('Couldn’t save this canvas — the project folder may be read-only.', 'error')
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
  saveCanvas(st.projectPath, toPersisted(st.agents), st.layoutMode)
}

// Set while an open is in flight. Opening is async (canvas load + git info) and
// the Home card/button stay clickable meanwhile, so a second click (or a stray
// double-click) would spawn a duplicate canvas + a second set of shells.
let opening = false

/** Load a project's saved canvas + git info, prune stale worktrees, open it. */
export async function openProjectByPath(ref: RecentProject): Promise<void> {
  const store = useStore.getState()
  // Switching to the already-open workspace is a no-op (don't respawn agents).
  if (store.projectPath === ref.path) return
  if (opening) return
  opening = true
  try {
    // A recent card may point at a folder that's since been moved or deleted.
    // Opening it would spawn a canvas full of dead terminals — refuse and prune.
    const exists = await window.api.project.exists(ref.path)
    if (!exists) {
      store.setWorkspaces(removeRecent(ref.path))
      store.pushToast(`“${ref.name}” no longer exists at that location`, 'error')
      return
    }

    saveCurrent()
    const [saved, git] = await Promise.all([
      window.api.project.load(ref.path),
      window.api.git.info(ref.path)
    ])
    void window.api.git.prune(ref.path)
    pushRecent(ref)
    useStore.getState().openProject(ref, saved, git)
    // A non-git folder silently loses the headline feature (per-agent worktree
    // isolation) — say so once instead of quietly downgrading to a shared dir.
    if (!git.isGit) {
      useStore
        .getState()
        .pushToast('Not a git repo — agents share this folder (no per-agent isolation).', 'info')
    }
    // Always land on at least one terminal so a freshly-opened project isn't a
    // bare canvas.
    if (useStore.getState().agents.length === 0) useStore.getState().addAgent()
  } catch (e) {
    console.error('[vectro] open project failed:', e)
    useStore.getState().pushToast(`Couldn’t open “${ref.name}”`, 'error')
  } finally {
    opening = false
  }
}

/** Close the current project, flushing its canvas first. `closeProject` in the
 *  store just clears state; the debounced autosave (App) would drop the last
 *  <400ms of edits (a just-spawned/moved pane) when the panes unmount. Route the
 *  "Close project" affordances through here so a switch and a close behave alike. */
export function closeCurrentProject(): void {
  saveCurrent()
  useStore.getState().closeProject()
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
