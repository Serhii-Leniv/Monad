import { useShallow } from 'zustand/react/shallow'
import {
  useStore,
  activeWs,
  wsById,
  NEEDS_ATTENTION,
  MAX_LIVE_WORKSPACES,
  type WorkspaceSession
} from '../store'
import { openProjectInteractive, closeWorkspaceById, initGitForProject } from '../openProject'
import { emblemStyle } from '../projectColor'
import { modLabel } from '../shortcuts'

function initial(name: string): string {
  const m = name.match(/[a-z0-9]/i)
  return (m ? m[0] : name.charAt(0) || '?').toUpperCase()
}

/** A live workspace's at-a-glance state, worst-first: any agent waiting on you
 *  beats any agent working beats quiet. Drives the tab's status dot. */
function tabStatus(ws: WorkspaceSession | undefined): 'attention' | 'working' | 'idle' {
  if (!ws) return 'idle'
  if (ws.agents.some((a) => NEEDS_ATTENTION.includes(a.status ?? 'starting'))) return 'attention'
  if (ws.agents.some((a) => a.status === 'working')) return 'working'
  return 'idle'
}

/**
 * One workspace tab. Subscribes ONLY to its own workspace's name / status / active
 * flag (via useShallow), so a status tick in another workspace — or the constant
 * working/idle churn of streaming agents — never re-renders the whole strip. That
 * per-tab isolation is what keeps the bar smooth.
 */
function WorkspaceTab({ id }: { id: string }): JSX.Element {
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace)
  const { name, path, status, active } = useStore(
    useShallow((s) => {
      const w = wsById(s, id)
      return {
        name: w?.name ?? '',
        path: w?.path ?? '',
        status: tabStatus(w),
        active: s.activeWorkspaceId === id
      }
    })
  )
  return (
    <div
      className={'tab' + (active ? ' is-active' : '')}
      role="tab"
      aria-selected={active}
      title={path}
      onClick={() => setActiveWorkspace(id)}
    >
      <span className="tab__emblem" style={emblemStyle(path)}>
        {initial(name)}
      </span>
      <span className="tab__name">{name}</span>
      {status !== 'idle' && <span className={'tab__dot tab__dot--' + status} aria-hidden="true" />}
      <button
        className="tab__close"
        aria-label={`Close ${name}`}
        title="Close workspace (keeps its worktrees on disk)"
        onClick={(e) => {
          e.stopPropagation()
          closeWorkspaceById(id)
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
}

/**
 * Chrome-style workspace tabs at the top. Click a tab to switch (instant,
 * non-destructive — background workspaces keep running); the + opens another
 * project; × closes a tab (detach — worktrees stay on disk). The container only
 * re-renders when tabs are added/removed, never on agent activity.
 */
export default function ProjectBar(): JSX.Element {
  // Just the id list — shallow-compared, so this re-renders only on add/remove/
  // reorder, not on any agent status change inside a workspace.
  const ids = useStore(useShallow((s) => s.liveWorkspaces.map((w) => w.id)))
  const atCap = useStore((s) => s.liveWorkspaces.length >= MAX_LIVE_WORKSPACES)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const activePath = useStore((s) => activeWs(s)?.path ?? null)
  const activeIsGit = useStore((s) => activeWs(s)?.isGit ?? true)
  const empty = ids.length === 0

  return (
    <div className="tabbar">
      {!empty && (
        <div className="tabbar__tabs" role="tablist" aria-label="Workspaces">
          {ids.map((id) => (
            <WorkspaceTab key={id} id={id} />
          ))}
        </div>
      )}

      <button
        className={'tabbar__add' + (empty ? ' tabbar__add--labeled' : '')}
        onClick={() => void openProjectInteractive()}
        disabled={atCap}
        title={atCap ? `Up to ${MAX_LIVE_WORKSPACES} workspaces at once` : 'Open a project'}
        aria-label="Open a project"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        {empty && <span className="tabbar__add-label">Open a project</span>}
      </button>

      {/* Quick-launcher affordance — the palette is otherwise invisible (⌘K only). */}
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

      {/* Standing shared-mode caution for the workspace on screen: the folder isn't
          a git repo, so per-agent isolation is off. Click to git-init. */}
      {activePath && !activeIsGit && (
        <button
          className="projbar__chip"
          title="This folder isn’t a git repository — agents share it directly and their changes can collide. Click to initialize git."
          onClick={() => void initGitForProject(activePath)}
        >
          no isolation
        </button>
      )}
    </div>
  )
}
