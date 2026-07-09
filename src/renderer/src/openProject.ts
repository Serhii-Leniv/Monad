import { useStore, toPersisted, activeWs, MAX_LIVE_WORKSPACES, type LayoutMode, type PersistedAgent } from './store'
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

/** Last path segment of a folder path (fallback display name). */
function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || p
}

/** The live workspace open on a given folder path, if any. */
function wsByPath(path: string): ReturnType<typeof activeWs> {
  return useStore.getState().liveWorkspaces.find((w) => w.path === path)
}

function pushRecent(ref: RecentProject): void {
  try {
    const list = getRecent().filter((r) => r.path !== ref.path)
    list.unshift({ path: ref.path, name: ref.name })
    const trimmed = list.slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed))
    // Mirror into the store so the +/dropdown's recents list updates live.
    useStore.getState().setWorkspaces(trimmed)
  } catch {
    /* ignore */
  }
}

// --- live-workspace set persistence (survives restart) ---------------------
// The ordered list of open tabs + which was active, so a relaunch reopens them
// all and spawns their agents (decision: "reopen all tabs, spawn all"). Legacy
// 'vectro.' prefix kept for consistency with the other persisted keys.
const OPEN_KEY = 'vectro.openWorkspaces'

interface OpenSet {
  paths: string[]
  active: string | null
}

function getOpenSet(): OpenSet | null {
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v || !Array.isArray(v.paths)) return null
    return {
      paths: v.paths.filter((p: unknown): p is string => typeof p === 'string'),
      active: typeof v.active === 'string' ? v.active : null
    }
  } catch {
    return null
  }
}

// Persist the live set on any open/close/switch. Subscribing keeps disk in sync
// without threading a save call through every mutation path. Gated until
// restoreWorkspaces has read the saved set — otherwise an early store mutation
// (e.g. shell detection landing) would write an EMPTY set and clobber the tabs
// we're about to restore.
let persistEnabled = false
let lastOpenSig = ''
useStore.subscribe((s) => {
  if (!persistEnabled) return
  const paths = s.liveWorkspaces.map((w) => w.path)
  const active = s.liveWorkspaces.find((w) => w.id === s.activeWorkspaceId)?.path ?? null
  const sig = paths.join('|') + '::' + (active ?? '')
  if (sig === lastOpenSig) return
  lastOpenSig = sig
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify({ paths, active }))
  } catch {
    /* ignore */
  }
})

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
    // The user may have switched workspaces while init ran — only stamp git state
    // when the inited folder is still the one on screen.
    if (activeWs(useStore.getState())?.path === path) useStore.getState().setGitInfo(git)
    useStore
      .getState()
      .pushToast(
        'Git initialized. Commit your files to enable isolated agents (each gets its own branch + worktree).',
        'info'
      )
  } catch (e) {
    console.error('[monad] git init failed:', e)
    useStore.getState().pushToast('Couldn’t initialize git here.', 'error')
  }
}

/** Remove the work-free orphaned worktrees the open-time check found. The main
 *  process re-lists at cleanup time (no path list round-trips through here) and
 *  never removes an orphan with unmerged/uncommitted work. */
async function cleanOrphanWorktrees(path: string): Promise<void> {
  try {
    // The toast can outlive a workspace close — never sweep against a folder that
    // isn't open any more.
    if (!wsByPath(path)) return
    // Owned ids are read at CLICK time, not from the toast's closure: agents
    // added since the toast appeared own fresh worktrees that must never sweep.
    const owned = wsByPath(path)?.agents.map((a) => a.id) ?? []
    const { removed } = await window.api.git.cleanOrphans(path, owned)
    if (!wsByPath(path)) return
    if (removed > 0) {
      useStore
        .getState()
        .pushToast(`Removed ${removed} worktree${removed === 1 ? '' : 's'}`, 'success')
    }
  } catch (e) {
    console.error('[monad] worktree cleanup failed:', e)
    useStore.getState().pushToast('Couldn’t clean up the leftover worktrees.', 'error')
  }
}

/** Fire-and-forget after a git workspace opens: stale canvas/* worktrees from
 *  crashed/force-quit sessions are still registered (so `worktree prune` skips
 *  them) and otherwise invisible — surface them with a cleanup offer. Orphans
 *  with work (kept-on-close worktrees, unmerged branches, dirty trees) are only
 *  mentioned, never offered a destructive action — "Keep" promised no loss. */
async function checkOrphanWorktrees(path: string): Promise<void> {
  try {
    // Read the agent list NOW (post-open, post-default-agent) so every live
    // agent's worktree — including ones being created this instant — is owned.
    const owned = wsByPath(path)?.agents.map((a) => a.id) ?? []
    const orphans = await window.api.git.orphans(path, owned)
    // The user may have closed this workspace while the check ran — this toast
    // (and its action) belongs to that folder only.
    if (!wsByPath(path)) return
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
    /* best-effort — never block or fail a workspace open over this */
  }
}

// Set while an open is in flight. Opening is async (canvas load + git info) and
// the Home card/button stay clickable meanwhile, so a second click (or a stray
// double-click) would spawn a duplicate canvas + a second set of shells.
let opening = false

/** Load a folder's saved canvas + git info, prune stale worktrees, and open it
 *  as a live workspace tab. If it's already open, just bring its tab forward. */
export async function openProjectByPath(ref: RecentProject): Promise<void> {
  const store = useStore.getState()
  // Already live → focus its tab (never a second copy, never respawn its agents).
  const already = store.liveWorkspaces.find((w) => w.path === ref.path)
  if (already) {
    store.setActiveWorkspace(already.id)
    return
  }
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

    // Hard cap so the tab strip always fits the screen — refuse rather than
    // overflow. (An already-open folder was focused above; this only blocks NEW ones.)
    if (useStore.getState().liveWorkspaces.length >= MAX_LIVE_WORKSPACES) {
      store.pushToast(
        `Up to ${MAX_LIVE_WORKSPACES} workspaces can be open at once — close one first.`,
        'info'
      )
      return
    }
    const [saved, git] = await Promise.all([
      window.api.project.load(ref.path),
      window.api.git.info(ref.path)
    ])
    void window.api.git.prune(ref.path)
    pushRecent(ref)
    useStore.getState().openWorkspace(ref, saved, git)
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
    // Always land on at least one terminal so a freshly-opened workspace isn't a
    // bare canvas. openWorkspace made it active, so addAgent targets it.
    if ((wsByPath(ref.path)?.agents.length ?? 0) === 0) useStore.getState().addAgent()
    // After the canvas (and its default agent) exists, look for worktrees left
    // by crashed sessions — must run after addAgent so the fresh agent's ids
    // are in the owned set.
    if (git.isGit) void checkOrphanWorktrees(ref.path)
  } catch (e) {
    console.error('[monad] open project failed:', e)
    useStore.getState().pushToast(`Couldn’t open “${ref.name}”`, 'error')
  } finally {
    opening = false
  }
}

/** Close a live workspace tab, flushing its canvas first so the debounced
 *  autosave can't drop the last <400ms of edits when its panes unmount. Detach
 *  only — worktrees/branches stay on disk (reopen restores them). */
export function closeWorkspaceById(id: string): void {
  const ws = useStore.getState().liveWorkspaces.find((w) => w.id === id)
  if (ws) saveCanvas(ws.path, toPersisted(ws.agents), ws.layoutMode)
  useStore.getState().closeWorkspace(id)
}

/** Close the workspace currently on screen (⌘ affordances / palette). */
export function closeCurrentProject(): void {
  const ws = activeWs(useStore.getState())
  if (ws) closeWorkspaceById(ws.id)
}

/** Pick a folder via the OS dialog, then open it as a tab. */
export async function openProjectInteractive(): Promise<void> {
  try {
    const ref = await window.api.project.pick()
    if (!ref) return
    await openProjectByPath(ref)
  } catch (e) {
    console.error('[monad] open folder failed:', e)
    useStore.getState().pushToast('Couldn’t open that folder', 'error')
  }
}

/** On launch, reopen every live workspace from last session (spawning all their
 *  agents) and restore which one was active. Falls back to the most-recent
 *  project for existing users with no persisted live set. */
export async function restoreWorkspaces(): Promise<void> {
  if (useStore.getState().liveWorkspaces.length > 0) {
    persistEnabled = true
    return
  }
  const openSet = getOpenSet()
  const recent = getRecent()
  const names = new Map(recent.map((r) => [r.path, r.name]))
  const paths = (
    openSet && openSet.paths.length > 0 ? openSet.paths : recent[0] ? [recent[0].path] : []
  ).slice(0, MAX_LIVE_WORKSPACES)
  if (paths.length === 0) {
    persistEnabled = true
    return
  }

  for (const path of paths) {
    try {
      const exists = await window.api.project.exists(path)
      if (!exists) continue
      // Guard against a duplicate if two restores raced (shouldn't, but cheap).
      if (wsByPath(path)) continue
      const ref: RecentProject = { path, name: names.get(path) ?? basename(path) }
      const [saved, git] = await Promise.all([
        window.api.project.load(path),
        window.api.git.info(path)
      ])
      void window.api.git.prune(path)
      // Don't pushRecent here — restoring shouldn't churn the recents order every
      // launch; these folders are already in the list.
      useStore.getState().openWorkspace(ref, saved, git)
      if ((wsByPath(path)?.agents.length ?? 0) === 0) {
        // addAgent targets the active workspace; openWorkspace just made this one
        // active, so it lands here.
        useStore.getState().addAgent()
      }
      if (git.isGit) void checkOrphanWorktrees(path)
    } catch (e) {
      console.error('[monad] restore workspace failed:', path, e)
    }
  }

  // Restore which tab was in front (else the last one opened stays active).
  const activePath = openSet?.active
  if (activePath) {
    const ws = wsByPath(activePath)
    if (ws) useStore.getState().setActiveWorkspace(ws.id)
  }
  // Saved set is fully restored — from here, mirror every open/close/switch to disk.
  persistEnabled = true
}
