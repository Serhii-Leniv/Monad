import { create } from 'zustand'

export type Isolation = 'worktree' | 'shared'
export type LayoutMode = 'grid' | 'columns'

/** Hard cap — more than this on one canvas is unreadable. */
export const MAX_AGENTS = 9

/**
 * Lifecycle of a terminal's agent, surfaced at a glance across the canvas:
 *  - starting   spawning the shell / creating the worktree
 *  - working    producing output right now
 *  - idle       alive, quiet, ready
 *  - attention  quiet but the last output looks like it's waiting on you
 *  - exited     the process finished cleanly
 *  - error      the process exited non-zero, or the shell failed to spawn
 */
export type AgentStatus = 'starting' | 'working' | 'idle' | 'attention' | 'exited' | 'error'

/** Statuses that should pull the user in (badge, edge-marker, notification). */
export const NEEDS_ATTENTION: AgentStatus[] = ['attention', 'error', 'exited']

export interface AgentInstance {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  isolation: Isolation
  /** Which detected shell this terminal runs (undefined = platform default). */
  shellId?: string
  /** Command auto-run once when the terminal spawns (runtime only). */
  startupCommand?: string
  // --- runtime only (never persisted) ---
  ptyId?: string
  branch?: string | null
  cwd?: string
  status?: AgentStatus
  /** False when an isolated terminal silently fell back to the shared dir. */
  isolated?: boolean
}

/** Fields written to .agent-canvas/canvas.json (runtime fields stripped). */
export interface PersistedAgent {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  isolation: Isolation
  shellId?: string
}

interface AppState {
  projectPath: string | null
  projectName: string | null
  isGit: boolean
  baseBranch: string | null
  agents: AgentInstance[]
  layoutMode: LayoutMode
  canvasW: number
  canvasH: number
  /** True once the stage has been measured at least once (real viewport size). */
  canvasReady: boolean
  shells: ShellInfo[]
  selectedIds: string[]
  draggingId: string | null
  panX: number
  panY: number
  zoom: number
  settings: AppSettings
  settingsOpen: boolean
  paletteOpen: boolean
  /** Agent whose worktree changes are open in the diff/merge review modal. */
  diffAgentId: string | null
  focusedId: string | null
  prevView: { panX: number; panY: number; zoom: number } | null

  openProject: (ref: ProjectRef, saved: PersistedCanvas | null, git: GitInfo) => void
  closeProject: () => void
  setCanvasSize: (w: number, h: number) => void
  setShells: (shells: ShellInfo[]) => void
  setSelected: (ids: string[]) => void
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  setSettingsOpen: (open: boolean) => void
  setPaletteOpen: (open: boolean) => void
  setDiffAgentId: (id: string | null) => void
  setView: (panX: number, panY: number, zoom: number) => void
  addAgent: (opts?: { command?: string; shellId?: string }) => void
  removeAgent: (id: string, opts?: { keepWorktree?: boolean }) => void
  renameAgent: (id: string, label: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  setDraggingId: (id: string | null) => void
  reorderAgent: (id: string, toIndex: number) => void
  relayout: () => void
  focusTerminal: (id: string) => void
  clearFocus: () => void
  setAgentRuntime: (id: string, rt: Partial<AgentInstance>) => void
  setStatus: (id: string, status: AgentStatus) => void
  broadcast: (text: string) => void
}

const DEFAULT_W = 520
const DEFAULT_H = 360
// Hard minimum so a card can never shrink into an ungrabbable micro-window.
export const MIN_W = 300
export const MIN_H = 190

export interface AppSettings {
  defaultShellId: string | null
  defaultIsolation: Isolation
  fontSize: number
  fontFamily: string
  scrollback: number
  confirmClose: boolean
  zoomFactor: number
  /** Accent colour (hex) — drives the whole UI palette. */
  accent: string
  /** Desktop notification when a backgrounded/off-screen agent needs you. */
  notifications: boolean
  /** Absolute path to a background image, or null for the default dark scene. */
  wallpaper: string | null
  /** Terminal background opacity 0.4–1 (lower reveals the wallpaper behind). */
  terminalOpacity: number
}

/** Monospace stacks offered in Settings (first that's installed wins). */
export const FONT_FAMILIES: { id: string; label: string; stack: string }[] = [
  { id: 'cascadia', label: 'Cascadia Code', stack: 'Cascadia Code, Consolas, monospace' },
  { id: 'jetbrains', label: 'JetBrains Mono', stack: 'JetBrains Mono, Consolas, monospace' },
  { id: 'fira', label: 'Fira Code', stack: 'Fira Code, Consolas, monospace' },
  { id: 'consolas', label: 'Consolas', stack: 'Consolas, monospace' },
  { id: 'menlo', label: 'Menlo / Monaco', stack: 'Menlo, Monaco, monospace' },
  { id: 'system', label: 'System monospace', stack: 'ui-monospace, monospace' }
]

const DEFAULT_SETTINGS: AppSettings = {
  defaultShellId: null,
  defaultIsolation: 'worktree',
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  scrollback: 2000,
  confirmClose: true,
  zoomFactor: 1.1,
  accent: '#3b5bd9',
  notifications: true,
  wallpaper: null,
  terminalOpacity: 0.55
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('vectro.settings')
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem('vectro.settings', JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** crypto.randomUUID requires a secure context (not guaranteed under file://). */
function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

const GAP = 12
const RAIL_INSET = 84 // room for the floating dock on the left (max adaptive width)
const PAD = 14
const BOTTOM_INSET = 80 // room for the floating broadcast bar at the bottom (max adaptive height)

/**
 * Tile every terminal into the viewport at **zoom 1** (font stays fixed). Array
 * ORDER is the layout order. Every row is stretched to the FULL width, so an odd
 * count never leaves an awkward hole — e.g. 3 → row of 2 + a full-width row of 1,
 * 5 → 3 over 2. Columns mode is just a single full-height row.
 */
function laidOut(
  agents: AgentInstance[],
  mode: LayoutMode,
  W: number,
  H: number,
  skipId?: string | null
): AgentInstance[] {
  const n = agents.length
  if (!n) return agents
  const availW = Math.max(1, W - RAIL_INSET - PAD)
  const availH = Math.max(1, H - PAD - BOTTOM_INSET)

  // How many rows, and how many cells per row (as even as possible).
  const rows = mode === 'columns' ? 1 : Math.max(1, Math.round(Math.sqrt(n)))
  const base = Math.floor(n / rows)
  const extra = n % rows
  const perRow: number[] = []
  for (let r = 0; r < rows; r++) perRow.push(base + (r < extra ? 1 : 0))

  const ch = (availH - GAP * (rows - 1)) / rows
  const out: AgentInstance[] = []
  let i = 0
  for (let r = 0; r < rows; r++) {
    const cols = perRow[r]
    const cw = (availW - GAP * (cols - 1)) / cols
    for (let c = 0; c < cols; c++) {
      const a = agents[i++]
      // The dragged card keeps its position constant so React never fights
      // Moveable for its transform — it follows the cursor; its slot stays an
      // empty gap that the other cards reflow around.
      if (skipId && a.id === skipId) out.push(a)
      else out.push({ ...a, x: RAIL_INSET + c * (cw + GAP), y: PAD + r * (ch + GAP), w: cw, h: ch })
    }
  }
  return out
}

export function toPersisted(agents: AgentInstance[]): PersistedAgent[] {
  return agents.map((a) => ({
    id: a.id,
    label: a.label,
    x: a.x,
    y: a.y,
    w: a.w,
    h: a.h,
    isolation: a.isolation,
    shellId: a.shellId
  }))
}

export const useStore = create<AppState>((set, get) => ({
  projectPath: null,
  projectName: null,
  isGit: false,
  baseBranch: null,
  agents: [],
  layoutMode: 'grid',
  canvasW: 1200,
  canvasH: 800,
  canvasReady: false,
  shells: [],
  selectedIds: [],
  draggingId: null,
  settings: loadSettings(),
  settingsOpen: false,
  paletteOpen: false,
  diffAgentId: null,
  focusedId: null,
  prevView: null,
  panX: 0,
  panY: 0,
  zoom: 1,

  openProject: (ref, saved, git) =>
    set((s) => {
      const loaded: AgentInstance[] = (saved?.agents ?? [])
        .slice(0, MAX_AGENTS)
        .map((p) => ({ ...p, isolation: p.isolation ?? 'shared' }))
      const mode: LayoutMode = saved?.layoutMode === 'columns' ? 'columns' : 'grid'
      return {
        projectPath: ref.path,
        projectName: ref.name,
        isGit: git.isGit,
        baseBranch: git.branch,
        selectedIds: [],
        focusedId: null,
        prevView: null,
        layoutMode: mode,
        agents: laidOut(loaded, mode, s.canvasW, s.canvasH),
        panX: 0,
        panY: 0,
        zoom: 1
      }
    }),

  closeProject: () =>
    set({
      projectPath: null,
      projectName: null,
      isGit: false,
      baseBranch: null,
      agents: [],
      selectedIds: []
    }),

  // Re-tile to the new viewport (zoom stays 1 → font fixed; terminals re-flow).
  setCanvasSize: (w, h) =>
    set((s) => {
      if (s.canvasReady && w === s.canvasW && h === s.canvasH) return {}
      return {
        canvasW: w,
        canvasH: h,
        canvasReady: true,
        agents: laidOut(s.agents, s.layoutMode, w, h)
      }
    }),

  setShells: (shells) =>
    set((s) => {
      if (!s.settings.defaultShellId && shells[0]) {
        const settings = { ...s.settings, defaultShellId: shells[0].id }
        saveSettings(settings)
        return { shells, settings }
      }
      return { shells }
    }),

  setSelected: (ids) => set({ selectedIds: ids }),

  setSetting: (key, value) =>
    set((s) => {
      const settings = { ...s.settings, [key]: value }
      saveSettings(settings)
      return { settings }
    }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  setDiffAgentId: (id) => set({ diffAgentId: id }),

  setView: (panX, panY, zoom) => set({ panX, panY, zoom }),

  addAgent: (opts) =>
    set((s) => {
      if (s.agents.length >= MAX_AGENTS) return {} // capped — ignore
      const count = s.agents.length + 1
      const isolation: Isolation =
        s.isGit && s.settings.defaultIsolation === 'worktree' ? 'worktree' : 'shared'
      const shellId = opts?.shellId ?? s.settings.defaultShellId ?? undefined
      const shell = s.shells.find((sh) => sh.id === shellId)
      const agent: AgentInstance = {
        id: uuid(),
        label: shell ? shell.label : `Terminal ${count}`,
        x: 0,
        y: 0,
        w: DEFAULT_W,
        h: DEFAULT_H,
        isolation,
        shellId,
        startupCommand: opts?.command
      }
      return {
        agents: laidOut([...s.agents, agent], s.layoutMode, s.canvasW, s.canvasH),
        selectedIds: [agent.id],
        focusedId: null,
        panX: 0,
        panY: 0,
        zoom: 1
      }
    }),

  removeAgent: (id, opts) =>
    set((s) => {
      const agent = s.agents.find((a) => a.id === id)
      // keepWorktree leaves the branch + worktree on disk (recoverable work).
      if (!opts?.keepWorktree && agent?.isolation === 'worktree' && s.projectPath) {
        void window.api.worktree.remove(s.projectPath, id)
      }
      const rest = s.agents.filter((a) => a.id !== id)
      return {
        agents: laidOut(rest, s.layoutMode, s.canvasW, s.canvasH),
        selectedIds: s.selectedIds.filter((sid) => sid !== id),
        focusedId: s.focusedId === id ? null : s.focusedId,
        panX: 0,
        panY: 0,
        zoom: 1
      }
    }),

  renameAgent: (id, label) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, label: label || a.label } : a))
    })),

  // Switch the persistent layout and re-tile immediately.
  setLayoutMode: (mode) =>
    set((s) => ({
      layoutMode: mode,
      focusedId: null,
      prevView: null,
      agents: laidOut(s.agents, mode, s.canvasW, s.canvasH),
      panX: 0,
      panY: 0,
      zoom: 1
    })),

  setDraggingId: (id) => set({ draggingId: id }),

  // Live reorder while dragging: move it in the order, re-tile the OTHERS (the
  // dragged one is skipped so it keeps following the cursor, leaving a gap).
  reorderAgent: (id, toIndex) =>
    set((s) => {
      const from = s.agents.findIndex((a) => a.id === id)
      if (from < 0) return {}
      const arr = [...s.agents]
      const [moved] = arr.splice(from, 1)
      arr.splice(Math.max(0, Math.min(arr.length, toIndex)), 0, moved)
      return {
        agents: laidOut(arr, s.layoutMode, s.canvasW, s.canvasH, s.draggingId),
        panX: 0,
        panY: 0,
        zoom: 1
      }
    }),

  // Re-tile everything to the viewport (skips the dragged card if one is held).
  relayout: () =>
    set((s) => ({
      agents: laidOut(s.agents, s.layoutMode, s.canvasW, s.canvasH, s.draggingId),
      panX: 0,
      panY: 0,
      zoom: 1
    })),

  // Camera focus: frame a single terminal to fill the viewport; restore on exit.
  focusTerminal: (id) =>
    set((s) => {
      const a = s.agents.find((x) => x.id === id)
      if (!a) return s
      const availW = s.canvasW - RAIL_INSET - PAD
      const availH = s.canvasH - PAD * 2
      const zoom = Math.min(availW / a.w, availH / a.h, 1.6)
      return {
        focusedId: id,
        prevView: { panX: s.panX, panY: s.panY, zoom: s.zoom },
        selectedIds: [id],
        zoom,
        panX: RAIL_INSET + (availW - a.w * zoom) / 2 - a.x * zoom,
        panY: PAD + (availH - a.h * zoom) / 2 - a.y * zoom
      }
    }),

  clearFocus: () =>
    set((s) =>
      s.prevView
        ? { focusedId: null, prevView: null, ...s.prevView }
        : { focusedId: null, prevView: null }
    ),

  setAgentRuntime: (id, rt) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...rt } : a)) })),

  setStatus: (id, status) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, status } : a)) })),

  broadcast: (text) => {
    for (const a of get().agents) {
      if (a.ptyId) window.api.pty.write(a.ptyId, text + '\r')
    }
  }
}))

// Exposed for diagnostics / debugging from the main process.
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__agentStore = useStore
}
