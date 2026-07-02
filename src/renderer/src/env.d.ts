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

interface WorktreeResult {
  cwd: string
  branch: string | null
  isolated: boolean
  /** Why isolation was downgraded to the shared dir (when isolated is false). */
  reason?: string
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
    project: {
      pick: () => Promise<ProjectRef | null>
      exists: (projectPath: string) => Promise<boolean>
      load: (projectPath: string) => Promise<PersistedCanvas | null>
      save: (projectPath: string, data: PersistedCanvas) => Promise<boolean>
    }
    git: {
      info: (projectPath: string) => Promise<GitInfo>
      prune: (projectPath: string) => Promise<boolean>
      diff: (projectPath: string, agentId: string) => Promise<DiffResult>
      merge: (projectPath: string, agentId: string, message: string) => Promise<MergeResult>
    }
    worktree: {
      create: (projectPath: string, agentId: string, isolation: string) => Promise<WorktreeResult>
      remove: (projectPath: string, agentId: string) => Promise<boolean>
    }
    platform: string
  }
}
