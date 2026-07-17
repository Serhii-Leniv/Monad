import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

type DataHandler = (data: string) => void
type ExitHandler = (code: number) => void

const dataListeners = new Map<string, Set<DataHandler>>()
const exitListeners = new Map<string, Set<ExitHandler>>()

ipcRenderer.on('pty:data', (_e, { id, data }: { id: string; data: string }) => {
  dataListeners.get(id)?.forEach((cb) => cb(data))
})

ipcRenderer.on('pty:exit', (_e, { id, code }: { id: string; code: number }) => {
  exitListeners.get(id)?.forEach((cb) => cb(code))
})

function subscribe<T>(map: Map<string, Set<T>>, id: string, cb: T): () => void {
  let set = map.get(id)
  if (!set) {
    set = new Set()
    map.set(id, set)
  }
  set.add(cb)
  return () => {
    set?.delete(cb)
    if (set && set.size === 0) map.delete(id)
  }
}

export interface PtySpawnOptions {
  shell?: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
}

export interface ProjectRef {
  path: string
  name: string
}

export interface UpdateInfo {
  current: string
  latest: string
  url: string
}

/** In-place auto-update progress (Windows; other platforms never emit). */
export type UpdateState =
  | { status: 'downloading'; percent: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }

export type FeedbackCategory = 'bug' | 'idea' | 'other'

export interface FeedbackInput {
  category: FeedbackCategory
  message: string
  email?: string
}

export interface FeedbackResult {
  ok: boolean
  error?: 'not-configured' | 'empty' | 'network' | 'rejected'
}

const api = {
  pty: {
    spawn: (opts: PtySpawnOptions): Promise<string> => ipcRenderer.invoke('pty:spawn', opts),
    write: (id: string, data: string): void => ipcRenderer.send('pty:input', { id, data }),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', { id, cols, rows }),
    kill: (id: string): void => ipcRenderer.send('pty:kill', { id }),
    onData: (id: string, cb: DataHandler): (() => void) => subscribe(dataListeners, id, cb),
    onExit: (id: string, cb: ExitHandler): (() => void) => subscribe(exitListeners, id, cb)
  },
  clipboard: {
    read: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),
    write: (text: string): void => ipcRenderer.send('clipboard:write', { text }),
    hasImage: (): Promise<boolean> => ipcRenderer.invoke('clipboard:hasImage'),
    readFiles: (): Promise<string[]> => ipcRenderer.invoke('clipboard:readFiles')
  },
  // Absolute path of a File dropped onto the window (drag & drop into a
  // terminal). Must run in the preload — the renderer can't see file paths.
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  // macOS Edit-menu commands (⌘C/⌘V/⌘A) forwarded from the main process so the
  // renderer can route them by focus (terminal vs. plain input). See menu.ts.
  menu: {
    onEdit: (cb: (action: 'copy' | 'paste' | 'selectAll') => void): (() => void) => {
      const handler = (_e: unknown, action: 'copy' | 'paste' | 'selectAll'): void => cb(action)
      ipcRenderer.on('menu:edit', handler)
      return () => ipcRenderer.removeListener('menu:edit', handler)
    }
  },
  shells: {
    list: (): Promise<unknown> => ipcRenderer.invoke('shells:list')
  },
  agents: {
    list: (): Promise<unknown> => ipcRenderer.invoke('agents:list')
  },
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('open:external', url),
  file: {
    exists: (base: string, raw: string): Promise<boolean> =>
      ipcRenderer.invoke('path:exists', { base, raw }),
    open: (base: string, raw: string): Promise<boolean> =>
      ipcRenderer.invoke('path:open', { base, raw })
  },
  update: {
    check: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('update:check'),
    /** Restart into the downloaded version (no-op until state says 'ready'). */
    install: (): void => ipcRenderer.send('update:install'),
    onState: (cb: (state: UpdateState) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, state: UpdateState): void => cb(state)
      ipcRenderer.on('update:state', handler)
      return () => ipcRenderer.removeListener('update:state', handler)
    }
  },
  feedback: {
    send: (input: FeedbackInput): Promise<FeedbackResult> =>
      ipcRenderer.invoke('feedback:send', input),
    // Opens the user's mail client, prefilled — the offline fallback for send().
    mailto: (input: FeedbackInput): Promise<boolean> =>
      ipcRenderer.invoke('feedback:mailto', input)
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version')
  },
  wallpaper: {
    pick: (): Promise<string | null> => ipcRenderer.invoke('wallpaper:pick'),
    read: (path: string): Promise<string | null> => ipcRenderer.invoke('wallpaper:read', path)
  },
  zoom: {
    set: (factor: number): void => webFrame.setZoomFactor(factor)
  },
  notify: {
    agent: (payload: { id: string; title: string; body: string }): Promise<boolean> =>
      ipcRenderer.invoke('notify:agent', payload),
    onClick: (cb: (id: string) => void): (() => void) => {
      const handler = (_e: unknown, { id }: { id: string }): void => cb(id)
      ipcRenderer.on('notify:click', handler)
      return () => ipcRenderer.removeListener('notify:click', handler)
    }
  },
  // How many agents currently need the user — drives the OS-level indicator
  // (taskbar flash / dock badge) in the main process.
  attention: {
    set: (count: number): void => ipcRenderer.send('attention:set', { count })
  },
  project: {
    pick: (): Promise<ProjectRef | null> => ipcRenderer.invoke('project:pick'),
    exists: (projectPath: string): Promise<boolean> =>
      ipcRenderer.invoke('project:exists', projectPath),
    load: (projectPath: string): Promise<unknown> => ipcRenderer.invoke('project:load', projectPath),
    save: (projectPath: string, data: unknown): Promise<boolean> =>
      ipcRenderer.invoke('project:save', { projectPath, data })
  },
  git: {
    info: (projectPath: string): Promise<unknown> => ipcRenderer.invoke('git:info', projectPath),
    init: (projectPath: string): Promise<unknown> => ipcRenderer.invoke('git:init', projectPath),
    prune: (projectPath: string): Promise<boolean> => ipcRenderer.invoke('git:prune', projectPath),
    orphans: (projectPath: string, ownedAgentIds: string[]): Promise<unknown> =>
      ipcRenderer.invoke('git:orphans', { projectPath, ownedAgentIds }),
    // Takes agent ids, not worktree paths — the main process re-lists orphans
    // itself, so a stale/tampered path list can never reach the removal.
    cleanOrphans: (
      projectPath: string,
      ownedAgentIds: string[]
    ): Promise<{ removed: number; keptWithWork: number }> =>
      ipcRenderer.invoke('git:cleanOrphans', { projectPath, ownedAgentIds }),
    diff: (projectPath: string, agentId: string): Promise<unknown> =>
      ipcRenderer.invoke('git:diff', { projectPath, agentId }),
    merge: (projectPath: string, agentId: string, message: string): Promise<unknown> =>
      ipcRenderer.invoke('git:merge', { projectPath, agentId, message }),
    applyFiles: (
      projectPath: string,
      agentId: string,
      paths: string[],
      deletedPaths: string[],
      message: string
    ): Promise<unknown> =>
      ipcRenderer.invoke('git:applyFiles', { projectPath, agentId, paths, deletedPaths, message })
  },
  worktree: {
    create: (projectPath: string, agentId: string, isolation: string): Promise<unknown> =>
      ipcRenderer.invoke('worktree:create', { projectPath, agentId, isolation }),
    remove: (projectPath: string, agentId: string): Promise<boolean> =>
      ipcRenderer.invoke('worktree:remove', { projectPath, agentId })
  }
}

contextBridge.exposeInMainWorld('api', { ...api, platform: process.platform })

export type Api = typeof api
