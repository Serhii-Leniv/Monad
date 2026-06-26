import { useMemo, useRef, useState } from 'react'
import Logo from './Logo'
import { IconTerminal, IconGrid, IconColumns, IconSettings, IconBell } from './Icons'
import { useStore, NEEDS_ATTENTION, MAX_AGENTS } from '../store'

/** Minimal floating dock — icons only, refined liquid glass. Project switching
 *  lives in the top bar; the rail is just identity + per-canvas tools. */
export default function Rail(): JSX.Element {
  const projectPath = useStore((s) => s.projectPath)
  const agents = useStore((s) => s.agents)
  const agentClis = useStore((s) => s.agentClis)
  const full = agents.length >= MAX_AGENTS
  const [newOpen, setNewOpen] = useState(false)
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
        <Logo size={34} />
      </div>

      {projectPath && (
        <>
          <div className="rail__new">
            <button
              className="rail-btn rail-btn--primary"
              onClick={() => (agentClis.length ? setNewOpen((v) => !v) : addAgent())}
              disabled={full}
              title={full ? `Maximum ${MAX_AGENTS} terminals` : 'New terminal  (⌘T)'}
            >
              <IconTerminal />
            </button>
            {newOpen && (
              <>
                <div className="rail__backdrop" onClick={() => setNewOpen(false)} />
                <div className="rail__menu rail__newmenu">
                  <button
                    className="rail__menu-item"
                    onClick={() => {
                      setNewOpen(false)
                      addAgent()
                    }}
                  >
                    New terminal
                  </button>
                  <div className="rail__menu-sep" />
                  {agentClis.map((a) => (
                    <button
                      key={a.id}
                      className="rail__menu-item"
                      onClick={() => {
                        setNewOpen(false)
                        addAgent({ command: a.command })
                      }}
                    >
                      Start {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

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
