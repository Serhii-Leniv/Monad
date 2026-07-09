import { useMemo, useRef } from 'react'
import { IconTerminal, IconGrid, IconColumns, IconSettings, IconBell } from './Icons'
import {
  useStore,
  useActiveAgents,
  useActiveLayoutMode,
  useActiveProjectPath,
  NEEDS_ATTENTION,
  MAX_AGENTS
} from '../store'
import { modLabel } from '../shortcuts'

/** Below this many terminals, grid and columns produce the same layout, so the
 *  layout toggle is hidden to keep the dock uncluttered. */
const LAYOUT_TOGGLE_MIN = 3

/** Minimal floating dock — icons only, refined liquid glass. Workspace switching
 *  lives in the top bar; the rail is just identity + the active canvas's tools. */
export default function Rail(): JSX.Element {
  const projectPath = useActiveProjectPath()
  const agents = useActiveAgents()
  const agentClis = useStore((s) => s.agentClis)
  const full = agents.length >= MAX_AGENTS
  // Single shared menu state — opening this closes the project switcher, etc.
  const newOpen = useStore((s) => s.openMenu === 'rail-new')
  const setOpenMenu = useStore((s) => s.setOpenMenu)
  const setNewOpen = (open: boolean): void => setOpenMenu(open ? 'rail-new' : null)
  const layoutMode = useActiveLayoutMode()
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
    <div className="rail-dock">
      <div className="rail">
        {projectPath && (
          <>
            <div className="rail__new">
              <button
                className="rail-btn rail-btn--primary"
                onClick={() => (agentClis.length ? setNewOpen(!newOpen) : addAgent())}
                disabled={full}
                aria-label="New terminal"
                data-tip={
                  full ? `Maximum ${MAX_AGENTS} terminals` : `New terminal · ${modLabel('T')}`
                }
                title={full ? `Maximum ${MAX_AGENTS} terminals` : undefined}
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
                    <div className="rail__menu-head">Agents</div>
                    {agentClis.map((a) => (
                      <button
                        key={a.id}
                        className="rail__menu-item"
                        onClick={() => {
                          setNewOpen(false)
                          addAgent({ command: a.command, agentLabel: a.label, agentId: a.id })
                        }}
                      >
                        Start {a.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Layout is one choice → one segmented control, not two buttons.
               Grid and columns only diverge at 3+ panes, so the toggle stays
               hidden below that — it would be an inert control. */}
            {agents.length >= LAYOUT_TOGGLE_MIN && (
            <div className="rail__seg" role="group" aria-label="Layout" data-mode={layoutMode}>
              <button
                className={'rail__seg-btn' + (layoutMode === 'grid' ? ' is-active' : '')}
                onClick={() => setLayoutMode('grid')}
                aria-label="Grid layout"
                data-tip={`Grid · ${modLabel('1')}`}
              >
                <IconGrid />
              </button>
              <button
                className={'rail__seg-btn' + (layoutMode === 'columns' ? ' is-active' : '')}
                onClick={() => setLayoutMode('columns')}
                aria-label="Columns layout"
                data-tip={`Columns · ${modLabel('2')}`}
              >
                <IconColumns />
              </button>
            </div>
            )}
          </>
        )}

        <div className="rail__spacer" />

        {attentionIds.length > 0 && (
          <button
            className="rail-btn rail-btn--attention"
            onClick={focusNextAttention}
            aria-label="Focus terminal needing attention"
            data-tip={`${attentionIds.length} terminal${attentionIds.length > 1 ? 's' : ''} need attention`}
          >
            <IconBell />
            <span className="rail-btn__badge">{attentionIds.length}</span>
          </button>
        )}

        {/* The gear opens Settings directly — the dock stays minimal. Command
           palette and keyboard shortcuts live inside Settings (and keep their
           own hotkeys), so they don't need a spot on the rail. */}
        <button
          className="rail-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          data-tip="Settings"
        >
          <IconSettings />
        </button>
      </div>
    </div>
  )
}
