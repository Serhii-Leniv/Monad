import { useMemo, useRef, useState } from 'react'
import Logo from './Logo'
import { IconFolder, IconPlus, IconGrid, IconColumns, IconSettings, IconBell } from './Icons'
import { useStore, NEEDS_ATTENTION, MAX_AGENTS } from '../store'
import { openProjectInteractive, openProjectByPath, getRecent } from '../openProject'

/** Minimal floating dock — icons only, refined liquid glass. */
export default function Rail(): JSX.Element {
  const projectName = useStore((s) => s.projectName)
  const projectPath = useStore((s) => s.projectPath)
  const agents = useStore((s) => s.agents)
  const agentCount = agents.length
  const full = agentCount >= MAX_AGENTS
  const layoutMode = useStore((s) => s.layoutMode)
  // Derive with useMemo — a selector that returns a fresh array on every call
  // breaks React 18's useSyncExternalStore (unstable snapshot → render crash).
  const attentionIds = useMemo(
    () => agents.filter((a) => NEEDS_ATTENTION.includes(a.status ?? 'starting')).map((a) => a.id),
    [agents]
  )
  const addAgent = useStore((s) => s.addAgent)
  const setLayoutMode = useStore((s) => s.setLayoutMode)
  const focusTerminal = useStore((s) => s.focusTerminal)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const [projMenu, setProjMenu] = useState(false)
  const recent = projMenu ? getRecent() : []

  // Cycle focus through the agents that currently need you.
  const cycleRef = useRef(0)
  const focusNextAttention = (): void => {
    if (!attentionIds.length) return
    const next = attentionIds[cycleRef.current % attentionIds.length]
    cycleRef.current += 1
    focusTerminal(next)
  }

  return (
    <div className="rail">
      <div className="rail__logo" title="Vectro">
        <Logo size={24} />
      </div>

      <div className="rail__shell">
        <button
          className="rail-btn"
          onClick={() => setProjMenu((v) => !v)}
          title={projectName ? `Project: ${projectName}` : 'Open project'}
        >
          <IconFolder />
        </button>
        {projMenu && (
          <>
            <div className="rail__backdrop" onClick={() => setProjMenu(false)} />
            <div className="rail__menu rail__menu--proj">
              <button
                className="rail__menu-item"
                onClick={() => {
                  setProjMenu(false)
                  void openProjectInteractive()
                }}
              >
                Open folder…
              </button>
              {recent.length > 0 && <div className="rail__menu-sep" />}
              {recent.map((r) => (
                <button
                  key={r.path}
                  className={'rail__menu-item' + (r.path === projectPath ? ' is-active' : '')}
                  title={r.path}
                  onClick={() => {
                    setProjMenu(false)
                    void openProjectByPath(r)
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {projectPath && (
        <>
          <button
            className="rail-btn rail-btn--primary"
            onClick={() => addAgent()}
            disabled={full}
            title={full ? `Maximum ${MAX_AGENTS} terminals` : 'New terminal'}
          >
            <IconPlus />
          </button>

          <div className="rail__divider" />

          <button
            className={'rail-btn' + (layoutMode === 'grid' ? ' is-active' : '')}
            onClick={() => setLayoutMode('grid')}
            title="Grid layout"
          >
            <IconGrid />
          </button>
          <button
            className={'rail-btn' + (layoutMode === 'columns' ? ' is-active' : '')}
            onClick={() => setLayoutMode('columns')}
            title="Columns layout"
          >
            <IconColumns />
          </button>
        </>
      )}

      <div className="rail__spacer" />

      {attentionIds.length > 0 && (
        <button
          className="rail-btn rail-btn--attention"
          onClick={focusNextAttention}
          title={`${attentionIds.length} terminal${attentionIds.length > 1 ? 's' : ''} need attention`}
        >
          <IconBell />
          <span className="rail-btn__badge">{attentionIds.length}</span>
        </button>
      )}

      <button className="rail-btn" onClick={() => setSettingsOpen(true)} title="Settings">
        <IconSettings />
      </button>
    </div>
  )
}
