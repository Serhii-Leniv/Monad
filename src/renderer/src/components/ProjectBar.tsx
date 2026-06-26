import { useState } from 'react'
import { useStore } from '../store'
import { openProjectInteractive, openProjectByPath } from '../openProject'
import { emblemStyle } from '../projectColor'

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
  const closeProject = useStore((s) => s.closeProject)
  const [open, setOpen] = useState(false)
  const closeMenu = (): void => setOpen(false)

  return (
    <div className="projbar">
      <button
        className={'projbar__btn' + (open ? ' is-open' : '')}
        onClick={() => setOpen((v) => !v)}
        title={projectPath ? `${projectName} — switch project` : 'Open a project'}
      >
        {projectPath ? (
          <>
            <span className="projbar__emblem" style={emblemStyle(projectPath)}>
              {initial(projectName ?? '?')}
            </span>
            <span className="projbar__name">{projectName}</span>
          </>
        ) : (
          <span className="projbar__name projbar__name--muted">No project open</span>
        )}
        <span className="projbar__caret">▾</span>
      </button>

      {open && (
        <>
          <div className="projbar__backdrop" onClick={closeMenu} />
          <div className="projbar__menu">
            <div className="rail__menu-head">Projects</div>
            {workspaces.length === 0 && <div className="rail__menu-empty">No recent projects</div>}
            {workspaces.map((w) => {
              const active = w.path === projectPath
              return (
                <button
                  key={w.path}
                  className={'rail__proj' + (active ? ' is-active' : '')}
                  title={w.path}
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
                  closeProject()
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
