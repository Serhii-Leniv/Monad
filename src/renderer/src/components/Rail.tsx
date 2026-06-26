import { useMemo, useRef } from 'react'
import Logo from './Logo'
import { IconFolder, IconPlus, IconGrid, IconColumns, IconSettings, IconBell } from './Icons'
import { useStore, NEEDS_ATTENTION, MAX_AGENTS } from '../store'
import { openProjectInteractive, openProjectByPath } from '../openProject'

/** First letter/number of a workspace name → the tile's emblem. */
function initial(name: string): string {
  const m = name.match(/[a-z0-9]/i)
  return (m ? m[0] : name.charAt(0) || '?').toUpperCase()
}

/** Minimal floating dock — icons only, refined liquid glass. */
export default function Rail(): JSX.Element {
  const projectPath = useStore((s) => s.projectPath)
  const workspaces = useStore((s) => s.workspaces)
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
        <Logo size={36} />
      </div>

      {/* Workspace switcher — one tile per opened folder; agents are saved &
          restored per workspace. Only shown once there's somewhere to switch
          TO (2+ folders) — a lone self-tile just reads as a dead button. */}
      {workspaces.length >= 2 && (
        <div className="rail__ws" role="group" aria-label="Workspaces">
          {workspaces.map((w, i) => {
            const active = w.path === projectPath
            return (
              <button
                key={w.path}
                className={'rail__ws-tile' + (active ? ' is-active' : '')}
                title={`${w.name}\n${w.path}${i < 9 ? `\n⌘⌥${i + 1}` : ''}`}
                onClick={() => void openProjectByPath(w)}
              >
                {initial(w.name)}
                {active && attentionIds.length > 0 && <span className="rail__ws-dot" />}
              </button>
            )
          })}
        </div>
      )}

      <button className="rail-btn" onClick={() => void openProjectInteractive()} title="Open folder…">
        <IconFolder />
      </button>

      {projectPath && (
        <>
          <button
            className="rail-btn rail-btn--primary"
            onClick={() => addAgent()}
            disabled={full}
            title={full ? `Maximum ${MAX_AGENTS} terminals` : 'New terminal  (⌘T)'}
          >
            <IconPlus />
          </button>

          <div className="rail__divider" />

          {/* Layout is one choice → one segmented control, not two buttons. */}
          <div className="rail__seg" role="group" aria-label="Layout" data-mode={layoutMode}>
            <button
              className={'rail__seg-btn' + (layoutMode === 'grid' ? ' is-active' : '')}
              onClick={() => setLayoutMode('grid')}
              title="Grid  (⌘1)"
            >
              <IconGrid />
            </button>
            <button
              className={'rail__seg-btn' + (layoutMode === 'columns' ? ' is-active' : '')}
              onClick={() => setLayoutMode('columns')}
              title="Columns  (⌘2)"
            >
              <IconColumns />
            </button>
          </div>
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
