import { useShallow } from 'zustand/react/shallow'
import {
  useStore,
  activeWs,
  wsById,
  NEEDS_ATTENTION,
  MAX_LIVE_WORKSPACES,
  type WorkspaceSession
} from '../store'
import { openProjectInteractive, initGitForProject, pickFolderForWorkspace } from '../openProject'
import { modLabel } from '../shortcuts'

/** A live workspace's at-a-glance state, worst-first: any agent waiting on you
 *  beats any agent working beats quiet. Drives the tab's status dot — always
 *  shown: gray when idle, green while an agent works, amber when one needs you. */
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
  // `count` rides along in the same shallow-compared object: it only changes when
  // an agent is added or removed, so it can't reintroduce per-tick re-renders.
  const { name, path, status, active, count } = useStore(
    useShallow((s) => {
      const w = wsById(s, id)
      return {
        name: w?.name ?? '',
        path: w?.defaultPath ?? '',
        status: tabStatus(w),
        active: s.activeWorkspaceId === id,
        count: w?.agents.length ?? 0
      }
    })
  )
  return (
    <div
      className={'tab' + (active ? ' is-active' : '')}
      role="tab"
      aria-selected={active}
      title={path || name}
      onClick={() => setActiveWorkspace(id)}
    >
      <span className={'tab__dot tab__dot--' + status} aria-hidden="true" />
      {/* The folder's name, and only that. Renaming a tab is gone: a tab IS a
          folder now, so a name of its own could only drift from the thing it
          names. The store still holds a `name` — it seeds from the folder's
          basename and stays the label — so nothing on disk changed. */}
      <span className="tab__name">{name}</span>
      {count > 0 && (
        <span
          className="tab__count"
          title={`${count} agent${count > 1 ? 's' : ''} in this folder`}
        >
          {count}
        </span>
      )}
      <button
        className="tab__close"
        aria-label={`Close ${name}`}
        title="Close workspace (keeps its worktrees on disk)"
        onClick={(e) => {
          e.stopPropagation()
          useStore.getState().requestWorkspaceClose(id)
        }}
      >
        <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path
            d="M7 7l10 10M17 7L7 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
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
  const activeId = useStore((s) => s.activeWorkspaceId)
  const activePath = useStore((s) => activeWs(s)?.defaultPath ?? null)
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

      {/* One tab = one folder, so + goes straight to the folder picker. It used
          to open a menu offering "New workspace", which created a tab with no
          folder — an idea that no longer exists. */}
      <div className="tabbar__addwrap">
        <button
          className={'tabbar__add' + (empty ? ' tabbar__add--labeled' : '')}
          onClick={() => void openProjectInteractive()}
          disabled={atCap}
          title={atCap ? `Up to ${MAX_LIVE_WORKSPACES} folders open at once` : 'Open a folder'}
          aria-label="Open a folder"
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

      </div>

      {/* Quick-launcher affordance — the palette is otherwise invisible (⌘K only). */}
      <button
        className="projbar__cmdk"
        onClick={() => setPaletteOpen(true)}
        title="Command palette: run a command or jump to a terminal"
        aria-label="Open command palette"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="projbar__cmdk-key">{modLabel('K')}</span>
      </button>

      {/* An empty workspace has no folder yet — agents launched here would land in
          the default shell directory. Offer the folder before that happens. */}
      {activeId && !activePath && (
        <button
          className="projbar__chip"
          title="This workspace has no folder yet. Agents will start in your home directory. Click to choose one."
          onClick={() => void pickFolderForWorkspace(activeId)}
        >
          set folder
        </button>
      )}

      {/* Standing shared-mode caution for the workspace on screen: the folder isn't
          a git repo, so per-agent isolation is off. Click to git-init. */}
      {activePath && !activeIsGit && (
        <button
          className="projbar__chip"
          title="This folder isn’t a git repository. Agents share it directly and their changes can collide. Click to initialize git."
          onClick={() => void initGitForProject(activePath)}
        >
          no isolation
        </button>
      )}
    </div>
  )
}
