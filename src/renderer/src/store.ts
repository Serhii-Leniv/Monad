import { create } from 'zustand'
import { getRecent } from './recent'

export type Isolation = 'worktree' | 'shared'
export type LayoutMode = 'grid' | 'columns'

/** An opened project folder, surfaced as a switchable workspace in the dock. */
export interface Workspace {
  path: string
  name: string
}

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'error'
  /** Optional action button (e.g. "Download"); a toast with one never auto-dismisses. */
  actionLabel?: string
  onAction?: () => void
}

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
  /** Friendly name of the agent launched here (e.g. "Claude Code"), shown as a tag. */
  agentLabel?: string
  /** Id of the launched agent (claude/codex/gemini/…) → drives its icon. */
  agentId?: string
  // --- runtime only (never persisted) ---
  ptyId?: string
  branch?: string | null
  cwd?: string
  status?: AgentStatus
  /** False when an isolated terminal silently fell back to the shared dir. */
  isolated?: boolean
  /** While this card is the one being dragged: the slot it will drop into. */
  dropX?: number
  dropY?: number
  dropW?: number
  dropH?: number
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
  /** Re-run when the terminal respawns on reopen, so the agent (e.g. Claude)
   *  comes back up — not just a bare shell. */
  startupCommand?: string
  agentLabel?: string
  agentId?: string
}

interface AppState {
  projectPath: string | null
  projectName: string | null
  isGit: boolean
  baseBranch: string | null
  /** Recently-opened folders, newest first — the dock's workspace switcher. */
  workspaces: Workspace[]
  agents: AgentInstance[]
  layoutMode: LayoutMode
  canvasW: number
  canvasH: number
  /** True once the stage has been measured at least once (real viewport size). */
  canvasReady: boolean
  shells: ShellInfo[]
  agentClis: AgentCli[]
  /** True once detectAgents has returned — gates the "no CLIs" first-run hint so
   *  it never flashes during the initial async detect. */
  agentClisLoaded: boolean
  /** Snapshot of the most recently closed terminal, for reopen. */
  lastClosed: {
    label: string
    shellId?: string
    isolation: Isolation
    startupCommand?: string
    agentLabel?: string
    agentId?: string
  } | null
  selectedIds: string[]
  /** Agents mid close-animation — still rendered, removed for real once it ends. */
  closingIds: string[]
  draggingId: string | null
  panX: number
  panY: number
  zoom: number
  settings: AppSettings
  settingsOpen: boolean
  paletteOpen: boolean
  /** Agent whose worktree changes are open in the diff/merge review modal. */
  diffAgentId: string | null
  /** Agent the user asked to close from outside its pane (⌘W / palette) — the
   *  matching TerminalPane picks this up and runs its guarded close flow. */
  pendingCloseId: string | null
  focusedId: string | null
  toasts: Toast[]

  openProject: (ref: ProjectRef, saved: PersistedCanvas | null, git: GitInfo) => void
  closeProject: () => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setCanvasSize: (w: number, h: number) => void
  setShells: (shells: ShellInfo[]) => void
  setAgentClis: (agentClis: AgentCli[]) => void
  setSelected: (ids: string[]) => void
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  setSettingsOpen: (open: boolean) => void
  setPaletteOpen: (open: boolean) => void
  setDiffAgentId: (id: string | null) => void
  requestClose: (id: string) => void
  clearPendingClose: () => void
  addAgent: (opts?: {
    command?: string
    shellId?: string
    agentLabel?: string
    agentId?: string
  }) => void
  removeAgent: (id: string, opts?: { keepWorktree?: boolean }) => void
  reopenLast: () => void
  renameAgent: (id: string, label: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  setDraggingId: (id: string | null) => void
  reorderAgent: (id: string, toIndex: number) => void
  relayout: () => void
  focusTerminal: (id: string) => void
  clearFocus: () => void
  setAgentRuntime: (id: string, rt: Partial<AgentInstance>) => void
  setStatus: (id: string, status: AgentStatus) => void
  pushToast: (text: string, kind?: Toast['kind'], action?: Pick<Toast, 'actionLabel' | 'onAction'>) => void
  dismissToast: (id: string) => void
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
  /** Selecting text with the mouse copies it immediately (iTerm-style). */
  copyOnSelect: boolean
  confirmClose: boolean
  zoomFactor: number
  /** Accent colour (hex) — drives the whole UI palette. */
  accent: string
  /** Desktop notification when a backgrounded/off-screen agent needs you. */
  notifications: boolean
  /** Also notify when a long-running agent finishes a task (working → idle). */
  notifyOnDone: boolean
  /** Soft chime when an agent needs you / finishes / errors. */
  sounds: boolean
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
  defaultIsolation: 'shared',
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  scrollback: 2000,
  copyOnSelect: true,
  confirmClose: true,
  zoomFactor: 1.1,
  accent: '#ff453a',
  notifications: true,
  notifyOnDone: true,
  sounds: false,
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
export const RAIL_INSET = 84 // room for the floating dock on the left (max adaptive width)
export const PAD = 14
const BOTTOM_INSET = 14 // bottom margin for the tiled panes (symmetric with the top PAD)

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
      const x = RAIL_INSET + c * (cw + GAP)
      const y = PAD + r * (ch + GAP)
      // The dragged card keeps its position constant so React never fights
      // Moveable for its transform — it follows the cursor; its slot stays an
      // empty gap that the other cards reflow around. We stash that slot in
      // drop* so the canvas can draw a placeholder there.
      if (skipId && a.id === skipId) {
        out.push({ ...a, dropX: x, dropY: y, dropW: cw, dropH: ch })
        continue
      }
      // Reuse the SAME object when its slot is unchanged — a fresh `{...a}` every
      // relayout would give each pane a new identity and defeat TerminalPane's
      // memo, re-rendering every xterm on each drag-cross / resize tick.
      const unchanged =
        a.x === x && a.y === y && a.w === cw && a.h === ch &&
        a.dropX === undefined && a.dropY === undefined &&
        a.dropW === undefined && a.dropH === undefined
      if (unchanged) out.push(a)
      else out.push({ ...a, x, y, w: cw, h: ch, dropX: undefined, dropY: undefined, dropW: undefined, dropH: undefined })
    }
  }
  return out
}

// Soft consonants + vowels → short, pronounceable names like "Robi", "Dan",
// "Rori" (alternating C/V so they always read aloud cleanly).
const CONSONANTS = 'bdfgjklmnprstvz'
const VOWELS = 'aeiou'

function pronounceable(): string {
  const len = 3 + Math.floor(Math.random() * 2) // 3–4 letters
  let name = ''
  for (let i = 0; i < len; i++) {
    const pool = i % 2 === 0 ? CONSONANTS : VOWELS
    name += pool[Math.floor(Math.random() * pool.length)]
  }
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** A short, pronounceable terminal name unique among `agents`. */
function uniqueName(agents: AgentInstance[]): string {
  const taken = new Set(agents.map((a) => a.label.toLowerCase()))
  for (let attempt = 0; attempt < 60; attempt++) {
    const name = pronounceable()
    if (!taken.has(name.toLowerCase())) return name
  }
  return 'Term' + (agents.length + 1)
}

/** A worktree branch as shown to the user — drop the internal `canvas/` prefix. */
export function displayBranch(branch: string): string {
  return branch.replace(/^canvas\//, '')
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
    shellId: a.shellId,
    startupCommand: a.startupCommand,
    agentLabel: a.agentLabel,
    agentId: a.agentId
  }))
}

export const useStore = create<AppState>((set, get) => ({
  projectPath: null,
  projectName: null,
  isGit: false,
  baseBranch: null,
  workspaces: getRecent(),
  agents: [],
  layoutMode: 'grid',
  canvasW: 1200,
  canvasH: 800,
  canvasReady: false,
  shells: [],
  agentClis: [],
  agentClisLoaded: false,
  lastClosed: null,
  selectedIds: [],
  closingIds: [],
  draggingId: null,
  settings: loadSettings(),
  settingsOpen: false,
  paletteOpen: false,
  diffAgentId: null,
  pendingCloseId: null,
  focusedId: null,
  toasts: [],
  panX: 0,
  panY: 0,
  zoom: 1,

  openProject: (ref, saved, git) =>
    set((s) => {
      const loaded: AgentInstance[] = []
      for (const p of (saved?.agents ?? []).slice(0, MAX_AGENTS)) {
        // Migrate old numeric auto-names (and blanks) to short random names;
        // preserve any custom rename the user made.
        const label = !p.label || /^\d+$/.test(p.label.trim()) ? uniqueName(loaded) : p.label
        loaded.push({ ...p, label, isolation: p.isolation ?? 'shared' })
      }
      const mode: LayoutMode = saved?.layoutMode === 'columns' ? 'columns' : 'grid'
      return {
        projectPath: ref.path,
        projectName: ref.name,
        isGit: git.isGit,
        baseBranch: git.branch,
        selectedIds: [],
        focusedId: null,
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

  setWorkspaces: (workspaces) => set({ workspaces }),

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

  setAgentClis: (agentClis) => set({ agentClis, agentClisLoaded: true }),

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

  // The pane owning `id` runs the guarded close (dirty-check + confirm); these
  // just hand the request to it and clear it once picked up.
  requestClose: (id) => set({ pendingCloseId: id }),
  clearPendingClose: () => set({ pendingCloseId: null }),


  addAgent: (opts) =>
    set((s) => {
      if (s.agents.length >= MAX_AGENTS) return {} // capped — ignore
      const isolation: Isolation =
        s.isGit && s.settings.defaultIsolation === 'worktree' ? 'worktree' : 'shared'
      const shellId = opts?.shellId ?? s.settings.defaultShellId ?? undefined
      const agent: AgentInstance = {
        id: uuid(),
        label: uniqueName(s.agents),
        x: 0,
        y: 0,
        w: DEFAULT_W,
        h: DEFAULT_H,
        isolation,
        shellId,
        startupCommand: opts?.command,
        agentLabel: opts?.agentLabel,
        agentId: opts?.agentId
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

  removeAgent: (id, opts) => {
    // Two-phase: flag the pane so it plays its collapse animation, then do the
    // real removal (and worktree cleanup) once that's had time to finish. Guard
    // against double-calls so a second close can't double-remove the worktree.
    const st = get()
    if (st.closingIds.includes(id) || !st.agents.some((a) => a.id === id)) return
    set({ closingIds: [...st.closingIds, id] })
    setTimeout(() => {
      set((s) => {
        const agent = s.agents.find((a) => a.id === id)
        const closingIds = s.closingIds.filter((c) => c !== id)
        if (!agent) return { closingIds }
        // keepWorktree leaves the branch + worktree on disk (recoverable work).
        if (!opts?.keepWorktree && agent.isolation === 'worktree' && s.projectPath) {
          void window.api.worktree.remove(s.projectPath, id)
        }
        const rest = s.agents.filter((a) => a.id !== id)
        return {
          agents: laidOut(rest, s.layoutMode, s.canvasW, s.canvasH),
          selectedIds: s.selectedIds.filter((sid) => sid !== id),
          closingIds,
          focusedId: s.focusedId === id ? null : s.focusedId,
          pendingCloseId: s.pendingCloseId === id ? null : s.pendingCloseId,
          lastClosed: {
            label: agent.label,
            shellId: agent.shellId,
            isolation: agent.isolation,
            startupCommand: agent.startupCommand,
            agentLabel: agent.agentLabel,
            agentId: agent.agentId
          },
          panX: 0,
          panY: 0,
          zoom: 1
        }
      })
    }, 180)
  },

  reopenLast: () =>
    set((s) => {
      const lc = s.lastClosed
      if (!lc || s.agents.length >= MAX_AGENTS) return {}
      const taken = new Set(s.agents.map((a) => a.label.toLowerCase()))
      const agent: AgentInstance = {
        id: uuid(),
        label: taken.has(lc.label.toLowerCase()) ? uniqueName(s.agents) : lc.label,
        x: 0,
        y: 0,
        w: DEFAULT_W,
        h: DEFAULT_H,
        isolation: lc.isolation,
        shellId: lc.shellId,
        startupCommand: lc.startupCommand,
        agentLabel: lc.agentLabel,
        agentId: lc.agentId
      }
      return {
        agents: laidOut([...s.agents, agent], s.layoutMode, s.canvasW, s.canvasH),
        selectedIds: [agent.id],
        focusedId: null,
        lastClosed: null,
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

  // Focus: the pane expands to fill the viewport (tmux-style zoom) rather than
  // scaling the camera. A CSS scale() breaks xterm's mouse math — its cell
  // hit-testing doesn't compensate for transforms, so selection landed on the
  // wrong characters — and scaled glyphs blur. Maximizing refits the terminal
  // instead: crisp text, MORE rows/cols, and pixel-perfect selection.
  focusTerminal: (id) =>
    set((s) => (s.agents.some((x) => x.id === id) ? { focusedId: id, selectedIds: [id] } : s)),

  clearFocus: () => set({ focusedId: null }),

  setAgentRuntime: (id, rt) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...rt } : a)) })),

  setStatus: (id, status) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, status } : a)) })),

  pushToast: (text, kind = 'info', action) =>
    set((s) => ({ toasts: [...s.toasts, { id: uuid(), text, kind, ...action }] })),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

// Exposed for diagnostics / debugging from the main process.
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__agentStore = useStore
}
