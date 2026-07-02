import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { openProjectInteractive, openProjectByPath, closeCurrentProject } from '../openProject'
import { emblemStyle } from '../projectColor'
import { altModLabel } from '../shortcuts'

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
  const workspaces = useStore((s) => s.workspaces)
  const [open, setOpen] = useState(false)
  const closeMenu = (): void => setOpen(false)

  // Esc closes the switcher — parity with every other overlay, and the only
  // keyboard dismiss (the backdrop is mouse-only).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  return (
    <div className="projbar">
      <button
        className={'projbar__btn' + (open ? ' is-open' : '')}
        onClick={() => setOpen((v) => !v)}
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
