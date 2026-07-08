import { useEffect } from 'react'
import { useStore } from '../store'
import {
  openProjectInteractive,
  openProjectByPath,
  closeCurrentProject,
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

/**
 * Floating, centered glass pill at the top — the project switcher. It sits above
 * the canvas (no-drag, so it's fully clickable) and opens a readable dropdown of
 * recent projects + open/close.
 */
export default function ProjectBar(): JSX.Element {
  const projectPath = useStore((s) => s.projectPath)
  const projectName = useStore((s) => s.projectName)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const isGit = useStore((s) => s.isGit)
  const workspaces = useStore((s) => s.workspaces)
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

  return (
    <div className="projbar">
      <button
        className={'projbar__btn' + (open ? ' is-open' : '')}
        onClick={() => setOpenMenu(open ? null : 'project')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={projectPath ? `${projectName} — switch project` : 'Open a project'}
      >
        {projectPath ? (
          <>
            <span className="projbar__emblem" style={emblemStyle(projectPath)}>
              {initial(projectName ?? '?')}
            </span>
            <span className="projbar__text">
              <span className="projbar__label">Project</span>
              <span className="projbar__name">{projectName}</span>
            </span>
          </>
        ) : (
          <>
            <span className="projbar__emblem projbar__emblem--empty">+</span>
            <span className="projbar__name projbar__name--muted">Open a project</span>
          </>
        )}
        <svg
          className="projbar__caret"
          viewBox="0 0 24 24"
          width="13"
          height="13"
          aria-hidden="true"
        >
          <path
            d="M7 10l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Quick-launcher affordance — the palette is otherwise invisible (⌘K
          only). Sits by the centered pill because the top corners are taken by
          the window controls (mac traffic lights / Windows caption buttons). */}
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

      {/* Persistent shared-mode indicator: unlike the one-shot open toast, this
          stays as long as the folder isn't a git repo — the one state where the
          headline feature (per-agent isolation) is silently off. Clicking it runs
          the same git-init flow as the toast action; a successful init flips the
          store's isGit and the chip disappears on its own. */}
      {projectPath && !isGit && (
        <button
          className="projbar__chip"
          title="This folder isn’t a git repository — agents share it directly and their changes can collide. Click to initialize git."
          onClick={() => void initGitForProject(projectPath)}
        >
          no isolation
        </button>
      )}

      {open && (
        <>
          <div className="projbar__backdrop" onClick={closeMenu} />
          <div className="projbar__menu" role="menu">
            <div className="rail__menu-head">Projects</div>
            {workspaces.length === 0 && <div className="rail__menu-empty">No recent projects</div>}
            {workspaces.map((w, i) => {
              const active = w.path === projectPath
              return (
                <button
                  key={w.path}
                  role="menuitem"
                  className={'rail__proj' + (active ? ' is-active' : '')}
                  title={i < 9 ? `${w.path}  ·  ${altModLabel(i + 1)}` : w.path}
                  onClick={() => {
                    closeMenu()
                    if (!active) void openProjectByPath(w)
                  }}
                >
                  <span className="rail__proj-emblem" style={emblemStyle(w.path)}>
                    {initial(w.name)}
                  </span>
                  <span className="rail__proj-text">
                    <span className="rail__proj-name">{w.name}</span>
                    <span className="rail__proj-path">{prettyPath(w.path)}</span>
                  </span>
                  {active && <span className="rail__proj-check">✓</span>}
                </button>
              )
            })}
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
            {projectPath && (
              <button
                className="rail__menu-item rail__menu-item--danger"
                onClick={() => {
                  closeMenu()
                  closeCurrentProject()
                }}
              >
                Close project
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
