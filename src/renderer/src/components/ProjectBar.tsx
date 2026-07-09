import { useEffect } from 'react'
import { useStore, activeWs, NEEDS_ATTENTION, type WorkspaceSession } from '../store'
import {
  openProjectInteractive,
  openProjectByPath,
  closeWorkspaceById,
  initGitForProject
} from '../openProject'
import { emblemStyle } from '../projectColor'
import { altModLabel, modLabel } from '../shortcuts'

function initial(name: string): string {
  const m = name.match(/[a-z0-9]/i)
  return (m ? m[0] : name.charAt(0) || '?').toUpperCase()
}
function prettyPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(-2).join('/') || p
}

/** A live workspace's at-a-glance state, worst-first: any agent waiting on you
 *  beats any agent working beats quiet. Drives the tab's status dot. */
function tabStatus(ws: WorkspaceSession): 'attention' | 'working' | 'idle' {
  if (ws.agents.some((a) => NEEDS_ATTENTION.includes(a.status ?? 'starting'))) return 'attention'
  if (ws.agents.some((a) => a.status === 'working')) return 'working'
  return 'idle'
}

/**
 * Floating, centered glass strip at the top — the live-workspace switcher. Each
 * open project is a tab (emblem + name + status dot + close ×); the active one is
 * highlighted. Switching tabs is instant and non-destructive — background
 * workspaces keep their agents running. The trailing + opens/creates more.
 */
export default function ProjectBar(): JSX.Element {
  const liveWorkspaces = useStore((s) => s.liveWorkspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const workspaces = useStore((s) => s.workspaces) // recents
  const activeIsGit = useStore((s) => activeWs(s)?.isGit ?? true)
  const activePath = useStore((s) => activeWs(s)?.path ?? null)
  // Single shared menu state — opening this closes the rail's "new" menu, etc.
  const open = useStore((s) => s.openMenu === 'project')
  const setOpenMenu = useStore((s) => s.setOpenMenu)
  const closeMenu = (): void => setOpenMenu(null)

  // Esc closes the switcher — parity with every other overlay, and the only
  // keyboard dismiss (the backdrop is mouse-only).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpenMenu(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  // Recents not already open as a live tab — the dropdown offers these to open.
  const openableRecents = workspaces.filter(
    (w) => !liveWorkspaces.some((lw) => lw.path === w.path)
  )

  return (
    <div className="projbar">
      <div className="projbar__tabs" role="tablist" aria-label="Workspaces">
        {liveWorkspaces.map((ws, i) => {
          const active = ws.id === activeWorkspaceId
          const st = tabStatus(ws)
          return (
            <div key={ws.id} className={'wstab' + (active ? ' is-active' : '')} role="tab" aria-selected={active}>
              <button
                className="wstab__main"
                onClick={() => setActiveWorkspace(ws.id)}
                title={i < 9 ? `${ws.path}  ·  ${altModLabel(i + 1)}` : ws.path}
              >
                <span className="wstab__emblem" style={emblemStyle(ws.path)}>
                  {initial(ws.name)}
                </span>
                <span className="wstab__name">{ws.name}</span>
                <span className={'wstab__dot wstab__dot--' + st} aria-hidden="true" />
              </button>
              <button
                className="wstab__close"
                aria-label={`Close ${ws.name}`}
                title="Close workspace (keeps its worktrees on disk)"
                onClick={(e) => {
                  e.stopPropagation()
                  closeWorkspaceById(ws.id)
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )
        })}

        <button
          className={'wstab__add' + (open ? ' is-open' : '')}
          onClick={() => setOpenMenu(open ? null : 'project')}
          aria-haspopup="menu"
          aria-expanded={open}
          title={liveWorkspaces.length ? 'Open another workspace' : 'Open a project'}
          aria-label="Open a workspace"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Quick-launcher affordance — the palette is otherwise invisible (⌘K
          only). Sits by the tab strip because the top corners are taken by the
          window controls (mac traffic lights / Windows caption buttons). */}
      <button
        className="projbar__cmdk"
        onClick={() => setPaletteOpen(true)}
        title="Command palette — run a command or jump to a terminal"
        aria-label="Open command palette"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="projbar__cmdk-key">{modLabel('K')}</span>
      </button>

      {/* Persistent shared-mode indicator for the workspace on screen: unlike the
          one-shot open toast, this stays as long as the folder isn't a git repo —
          the one state where the headline feature (per-agent isolation) is
          silently off. Clicking it runs the git-init flow; a successful init flips
          the workspace's isGit and the chip disappears on its own. */}
      {activePath && !activeIsGit && (
        <button
          className="projbar__chip"
          title="This folder isn’t a git repository — agents share it directly and their changes can collide. Click to initialize git."
          onClick={() => void initGitForProject(activePath)}
        >
          no isolation
        </button>
      )}

      {open && (
        <>
          <div className="projbar__backdrop" onClick={closeMenu} />
          <div className="projbar__menu" role="menu">
            <div className="rail__menu-head">Open a workspace</div>
            {openableRecents.length === 0 && (
              <div className="rail__menu-empty">No other recent projects</div>
            )}
            {openableRecents.map((w) => (
              <button
                key={w.path}
                role="menuitem"
                className="rail__proj"
                title={w.path}
                onClick={() => {
                  closeMenu()
                  void openProjectByPath(w)
                }}
              >
                <span className="rail__proj-emblem" style={emblemStyle(w.path)}>
                  {initial(w.name)}
                </span>
                <span className="rail__proj-text">
                  <span className="rail__proj-name">{w.name}</span>
                  <span className="rail__proj-path">{prettyPath(w.path)}</span>
                </span>
              </button>
            ))}
            <div className="rail__menu-sep" />
            <button
              className="rail__menu-item"
              onClick={() => {
                closeMenu()
                void openProjectInteractive()
              }}
            >
              Open folder…
            </button>
          </div>
        </>
      )}
    </div>
  )
}
