/// <reference types="vite/client" />

type DataHandler = (data: string) => void
type ExitHandler = (code: number) => void

interface PtySpawnOptions {
  shell?: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
}

interface ProjectRef {
  path: string
  name: string
}

interface ShellInfo {
  id: string
  label: string
  command: string
  args: string[]
}

interface AgentCli {
  id: string
  label: string
  command: string
}

interface GitInfo {
  isGit: boolean
  repoRoot: string | null
  branch: string | null
}

interface GitInitResult {
  ok: boolean
  error?: string
}

interface WorktreeResult {
  cwd: string
  branch: string | null
  isolated: boolean
  /** Why isolation was downgraded to the shared dir (when isolated is false). */
  reason?: string
}

/** A leftover canvas/* worktree from a crashed or force-quit session. */
interface OrphanWorktree {
  path: string
  /** Short branch name; null when the worktree is detached. */
  branch: string | null
  /** Removal could lose work (unmerged branch or dirty tree) — never cleaned up. */
  hasWork: boolean
}

interface DiffResult {
  branch: string
  base: string | null
  diff: string
  untracked: string[]
  hasChanges: boolean
  /** Set when the diff couldn't be produced (e.g. too large to buffer). */
  error?: string
}

interface MergeResult {
  ok: boolean
  error?: string
  /** The branch actually merged into (the main worktree's HEAD at merge time),
   *  which may differ from the base captured at project open. */
  mergedInto?: string
  /** Files that couldn't merge automatically (captured before the abort). */
  conflictFiles?: string[]
}

interface UpdateInfo {
  current: string
  latest: string
  url: string
}

/** Shape of the per-project canvas file (.agent-canvas/canvas.json). */
interface PersistedCanvas {
  layoutMode?: 'grid' | 'columns' | 'preview' | 'free'
  previewUrl?: string
  agents: Array<{
    id: string
    label: string
    x: number
    y: number
    w: number
    h: number
    isolation: 'worktree' | 'shared'
    shellId?: string
    /** Double-weight tile (takes 2 shares of its row's width). */
    wide?: boolean
  }>
}

interface Window {
  api: {
    pty: {
      spawn: (opts: PtySpawnOptions) => Promise<string>
      write: (id: string, data: string) => void
      resize: (id: string, cols: number, rows: number) => void
      kill: (id: string) => void
      onData: (id: string, cb: DataHandler) => () => void
      onExit: (id: string, cb: ExitHandler) => () => void
    }
    clipboard: {
      read: () => Promise<string>
      write: (text: string) => void
      hasImage: () => Promise<boolean>
      readFiles: () => Promise<string[]>
    }
    getPathForFile: (file: File) => string
    menu: {
      onEdit: (cb: (action: 'copy' | 'paste' | 'selectAll') => void) => () => void
    }
    shells: {
      list: () => Promise<ShellInfo[]>
    }
    agents: {
      list: () => Promise<AgentCli[]>
    }
    openExternal: (url: string) => Promise<boolean>
    file: {
      exists: (base: string, raw: string) => Promise<boolean>
      open: (base: string, raw: string) => Promise<boolean>
    }
    update: {
      check: () => Promise<UpdateInfo | null>
    }
    app: {
      version: () => Promise<string>
    }
    wallpaper: {
      pick: () => Promise<string | null>
      read: (path: string) => Promise<string | null>
    }
    zoom: {
      set: (factor: number) => void
    }
    notify: {
      agent: (payload: { id: string; title: string; body: string }) => Promise<boolean>
      onClick: (cb: (id: string) => void) => () => void
    }
    attention: {
      set: (count: number) => void
    }
    project: {
      pick: () => Promise<ProjectRef | null>
      exists: (projectPath: string) => Promise<boolean>
      load: (projectPath: string) => Promise<PersistedCanvas | null>
      save: (projectPath: string, data: PersistedCanvas) => Promise<boolean>
    }
    git: {
      info: (projectPath: string) => Promise<GitInfo>
      init: (projectPath: string) => Promise<GitInitResult>
      prune: (projectPath: string) => Promise<boolean>
      orphans: (projectPath: string, ownedAgentIds: string[]) => Promise<OrphanWorktree[]>
      cleanOrphans: (
        projectPath: string,
        ownedAgentIds: string[]
      ) => Promise<{ removed: number; keptWithWork: number }>
      diff: (projectPath: string, agentId: string) => Promise<DiffResult>
      merge: (projectPath: string, agentId: string, message: string) => Promise<MergeResult>
      applyFiles: (
        projectPath: string,
        agentId: string,
        paths: string[],
        deletedPaths: string[],
        message: string
      ) => Promise<MergeResult>
    }
    worktree: {
      create: (projectPath: string, agentId: string, isolation: string) => Promise<WorktreeResult>
      remove: (projectPath: string, agentId: string) => Promise<boolean>
    }
    platform: string
  }
}
