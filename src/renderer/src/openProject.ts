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

/** Run `git init` in a project folder, then refresh the store's git state so the
 *  non-git affordances (shared-mode chip, isolation default) update in place.
 *  Shared by the open-time toast action and the ProjectBar chip. Init alone
 *  doesn't create a commit, so worktree isolation still needs one — the follow-up
 *  toast says so (and the isolation-failure toast repeats it if they forget). */
export async function initGitForProject(path: string): Promise<void> {
  try {
    const res = await window.api.git.init(path)
    if (!res.ok) {
      useStore.getState().pushToast(res.error ?? 'Couldn’t initialize git here.', 'error')
      return
    }
    const git = await window.api.git.info(path)
    // The user may have switched projects while init ran — never stamp the
    // now-open project with another folder's git state.
    if (useStore.getState().projectPath === path) useStore.getState().setGitInfo(git)
    useStore
      .getState()
      .pushToast(
        'Git initialized. Commit your files to enable isolated agents (each gets its own branch + worktree).',
        'info'
      )
  } catch (e) {
    console.error('[vectro] git init failed:', e)
    useStore.getState().pushToast('Couldn’t initialize git here.', 'error')
  }
}

/** Remove the work-free orphaned worktrees the open-time check found. The main
 *  process re-lists at cleanup time (no path list round-trips through here) and
 *  never removes an orphan with unmerged/uncommitted work. */
async function cleanOrphanWorktrees(path: string): Promise<void> {
  try {
    // The toast can outlive a project switch — never sweep against another
    // project's agent list (same guard pattern as initGitForProject).
    if (useStore.getState().projectPath !== path) return
    // Owned ids are read at CLICK time, not from the toast's closure: agents
    // added since the toast appeared own fresh worktrees that must never sweep.
    const owned = useStore.getState().agents.map((a) => a.id)
    const { removed } = await window.api.git.cleanOrphans(path, owned)
    if (useStore.getState().projectPath !== path) return
    if (removed > 0) {
      useStore
        .getState()
        .pushToast(`Removed ${removed} worktree${removed === 1 ? '' : 's'}`, 'success')
    }
  } catch (e) {
    console.error('[vectro] worktree cleanup failed:', e)
    useStore.getState().pushToast('Couldn’t clean up the leftover worktrees.', 'error')
  }
}

/** Fire-and-forget after a git project opens: stale canvas/* worktrees from
 *  crashed/force-quit sessions are still registered (so `worktree prune` skips
 *  them) and otherwise invisible — surface them with a cleanup offer. Orphans
 *  with work (kept-on-close worktrees, unmerged branches, dirty trees) are only
 *  mentioned, never offered a destructive action — "Keep" promised no loss. */
async function checkOrphanWorktrees(path: string): Promise<void> {
  try {
    // Read the agent list NOW (post-open, post-default-agent) so every live
    // agent's worktree — including ones being created this instant — is owned.
    const owned = useStore.getState().agents.map((a) => a.id)
    const orphans = await window.api.git.orphans(path, owned)
    // The user may have switched projects while the check ran — this toast
    // (and its action) belongs to that project only.
    if (useStore.getState().projectPath !== path) return
    if (orphans.length === 0) return
    const removable = orphans.filter((o) => !o.hasWork).length
    const kept = orphans.length - removable
    const keptNote =
      kept > 0 ? `${kept} kept worktree${kept === 1 ? '' : 's'} with unmerged work left untouched` : ''
    if (removable > 0) {
      useStore
        .getState()
        .pushToast(
          `${removable} leftover agent worktree${removable === 1 ? '' : 's'} from previous sessions` +
            (keptNote ? ` — ${keptNote}` : ''),
          'info',
          { actionLabel: 'Clean up', onAction: () => void cleanOrphanWorktrees(path) }
        )
    } else if (kept > 0) {
      useStore.getState().pushToast(keptNote, 'info')
    }
  } catch {
    /* best-effort — never block or fail a project open over this */
  }
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
    // isolation) — say so instead of quietly downgrading to a shared dir, and
    // offer the fix in place. The action makes this toast sticky (Toasts.tsx),
    // so it can't vanish before the user reads it.
    if (!git.isGit) {
      useStore
        .getState()
        .pushToast('Not a git repo — agents will share this folder without isolation.', 'info', {
          actionLabel: 'Initialize git',
          onAction: () => void initGitForProject(ref.path)
        })
    }
    // Always land on at least one terminal so a freshly-opened project isn't a
    // bare canvas.
    if (useStore.getState().agents.length === 0) useStore.getState().addAgent()
    // After the canvas (and its default agent) exists, look for worktrees left
    // by crashed sessions — must run after addAgent so the fresh agent's ids
    // are in the owned set.
    if (git.isGit) void checkOrphanWorktrees(ref.path)
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
