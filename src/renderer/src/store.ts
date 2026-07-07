import { create } from 'zustand'
import { getRecent } from './recent'
import { sanitizeTheme, type ThemePreference } from './theme'

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
  /** Optional lower-emphasis second action (e.g. "Skip this version"). */
  secondaryLabel?: string
  onSecondary?: () => void
  /**
   * Bumped when a duplicate push refreshes this toast instead of stacking a
   * twin — Toasts.tsx keys its auto-dismiss timer on it so the toast gets a
   * fresh 3.4s from the latest trigger.
   */
  refresh?: number
}

/** Visible toast cap — a 6th pushes the oldest (non-sticky first) off the stack. */
const MAX_TOASTS = 5

/** Sticky toasts never auto-dismiss: errors and anything with an action to lose. */
export function toastIsSticky(t: Pick<Toast, 'kind' | 'actionLabel' | 'secondaryLabel'>): boolean {
  return !!t.actionLabel || !!t.secondaryLabel || t.kind === 'error'
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
  /** Double-weight tile: takes 2 shares of its row's width instead of 1. */
  wide?: boolean
  // --- runtime only (never persisted) ---
  ptyId?: string
  branch?: string | null
  cwd?: string
  status?: AgentStatus
  /** When the current working burst started — drives the header's elapsed timer. */
  workingSince?: number
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
  wide?: boolean
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
  /** Keyboard-shortcuts help overlay (⌘/ / Ctrl+Shift+/). */
  shortcutsOpen: boolean
  /** Agent whose worktree changes are open in the diff/merge review modal. */
  diffAgentId: string | null
  /** Agent the user asked to close from outside its pane (⌘W / palette) — the
   *  matching TerminalPane picks this up and runs its guarded close flow. */
  pendingCloseId: string | null
  /** Ids snapshotted when a bulk close was requested (⌘W on a multi-selection,
   *  or the palette command) — one confirm in App.tsx closes them all. */
  bulkCloseIds: string[] | null
  focusedId: string | null
  toasts: Toast[]

  openProject: (ref: ProjectRef, saved: PersistedCanvas | null, git: GitInfo) => void
  closeProject: () => void
  /** Refresh the open project's git state in place (e.g. after "Initialize git")
   *  without re-opening — keeps the shared-mode chip and isolation default live. */
  setGitInfo: (git: GitInfo) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setCanvasSize: (w: number, h: number) => void
  setShells: (shells: ShellInfo[]) => void
  setAgentClis: (agentClis: AgentCli[]) => void
  setSelected: (ids: string[]) => void
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  setSettingsOpen: (open: boolean) => void
  setPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setDiffAgentId: (id: string | null) => void
  requestClose: (id: string) => void
  clearPendingClose: () => void
  requestBulkClose: (ids: string[]) => void
  clearBulkClose: () => void
  addAgent: (opts?: {
    command?: string
    shellId?: string
    agentLabel?: string
    agentId?: string
  }) => void
  removeAgent: (id: string, opts?: { keepWorktree?: boolean }) => void
  reopenLast: () => void
  renameAgent: (id: string, label: string) => void
  toggleWide: (id: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  setDraggingId: (id: string | null) => void
  reorderAgent: (id: string, toIndex: number) => void
  relayout: () => void
  focusTerminal: (id: string) => void
  clearFocus: () => void
  setAgentRuntime: (id: string, rt: Partial<AgentInstance>) => void
  setStatus: (id: string, status: AgentStatus) => void
  pushToast: (
    text: string,
    kind?: Toast['kind'],
    action?: Pick<Toast, 'actionLabel' | 'onAction' | 'secondaryLabel' | 'onSecondary'>
  ) => void
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
  /** UI theme — 'system' follows the OS light/dark setting live. */
  theme: ThemePreference
  /** Accent colour (hex) — drives the whole UI palette. */
  accent: string
  /** Desktop notification when a backgrounded/off-screen agent needs you. */
  notifications: boolean
  /**
   * Alert when a long-running agent finishes (working → idle / clean exit).
   * Independent master switch for the finish event; `notifications` gates the
   * desktop popup and `sounds` gates the chime.
   */
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
  theme: 'dark', // dark is the app's native look — existing users see zero change
  accent: '#ff453a',
  notifications: true,
  notifyOnDone: true,
  sounds: false,
  wallpaper: null,
  terminalOpacity: 0.55
}

function clampNum(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : dflt
  return Math.min(hi, Math.max(lo, v))
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('vectro.settings')
    const merged = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
    // A corrupt / hand-edited store must not be able to brick the app (zoom 8×,
    // fontSize 999, a half-gig scrollback ring buffer). Clamp numerics to the same
    // ranges the Settings sliders enforce for new input.
    return {
      ...merged,
      fontSize: clampNum(merged.fontSize, 9, 22, DEFAULT_SETTINGS.fontSize),
      scrollback: clampNum(merged.scrollback, 500, 20000, DEFAULT_SETTINGS.scrollback),
      zoomFactor: clampNum(merged.zoomFactor, 0.7, 1.8, DEFAULT_SETTINGS.zoomFactor),
      terminalOpacity: clampNum(merged.terminalOpacity, 0.4, 1, DEFAULT_SETTINGS.terminalOpacity),
      theme: sanitizeTheme(merged.theme)
    }
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

  // Integer pixel geometry: fractional tile coords put the terminal between
  // device pixels and the compositor resamples it — text and borders go soft.
  const ch = Math.round((availH - GAP * (rows - 1)) / rows)
  const out: AgentInstance[] = []
  let i = 0
  for (let r = 0; r < rows; r++) {
    const cols = perRow[r]
    // Widths within a row are allocated by weight (wide = 2, normal = 1) rather
    // than equally; which cards land in which row stays purely count-based above.
    const rowAgents = agents.slice(i, i + cols)
    const totalWeight = rowAgents.reduce((sum, a) => sum + (a.wide ? 2 : 1), 0)
    const inner = availW - GAP * (cols - 1)
    let x = RAIL_INSET
    let used = 0
    for (let c = 0; c < cols; c++) {
      const a = agents[i++]
      // Integer widths (crisp glyphs, see above); the LAST card in a row absorbs
      // the rounding remainder so every row still fills the full width exactly.
      const cw =
        c === cols - 1 ? inner - used : Math.round((inner * (a.wide ? 2 : 1)) / totalWeight)
      const y = Math.round(PAD + r * (ch + GAP))
      // The dragged card keeps its position constant so React never fights
      // Moveable for its transform — it follows the cursor; its slot stays an
      // empty gap that the other cards reflow around. We stash that slot in
      // drop* so the canvas can draw a placeholder there.
      if (skipId && a.id === skipId) {
        out.push({ ...a, dropX: x, dropY: y, dropW: cw, dropH: ch })
      } else {
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
      used += cw
      x += cw + GAP
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
    agentId: a.agentId,
    wide: a.wide
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
  shortcutsOpen: false,
  diffAgentId: null,
  pendingCloseId: null,
  bulkCloseIds: null,
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
        // Start with the first terminal active so you can type immediately.
        selectedIds: loaded[0] ? [loaded[0].id] : [],
        focusedId: null,
        // Clear transient lifecycle state so nothing leaks across projects (a stale
        // diff target, a "reopen" from the old project, a half-closed pane).
        closingIds: [],
        draggingId: null,
        pendingCloseId: null,
        bulkCloseIds: null,
        diffAgentId: null,
        lastClosed: null,
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
      selectedIds: [],
      // Drop transient lifecycle state so it can't leak into the next project.
      closingIds: [],
      draggingId: null,
      pendingCloseId: null,
      bulkCloseIds: null,
      diffAgentId: null,
      lastClosed: null,
      focusedId: null
    }),

  setGitInfo: (git) => set({ isGit: git.isGit, baseBranch: git.branch }),

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

  setSelected: (ids) =>
    set((s) => {
      // Invariant: while any terminal exists, one is always selected (and so
      // keyboard-focused). Clicking empty canvas / rubber-banding nothing must
      // never leave the canvas with no active terminal to type into — keep the
      // current selection, or fall back to the first terminal.
      if (ids.length === 0 && s.agents.length > 0) {
        return s.selectedIds.length > 0 ? {} : { selectedIds: [s.agents[0].id] }
      }
      return { selectedIds: ids }
    }),

  setSetting: (key, value) =>
    set((s) => {
      const settings = { ...s.settings, [key]: value }
      saveSettings(settings)
      return { settings }
    }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  setDiffAgentId: (id) => set({ diffAgentId: id }),

  // The pane owning `id` runs the guarded close (dirty-check + confirm); these
  // just hand the request to it and clear it once picked up.
  requestClose: (id) => set({ pendingCloseId: id }),
  clearPendingClose: () => set({ pendingCloseId: null }),

  // Bulk close is confirmed (and executed) by the modal in App.tsx; the store
  // only carries the request so both ⌘W and the palette can raise it.
  requestBulkClose: (ids) => set({ bulkCloseIds: ids }),
  clearBulkClose: () => set({ bulkCloseIds: null }),


  addAgent: (opts) => {
    // Tell the user why nothing happened at the cap — the ⌘T / reopen keyboard
    // paths otherwise no-op silently (the Rail button + palette already hide/disable
    // themselves, but a keystroke gave no feedback and read as a broken shortcut).
    if (get().agents.length >= MAX_AGENTS) {
      get().pushToast(`Maximum ${MAX_AGENTS} terminals on one canvas`, 'info')
      return
    }
    set((s) => {
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
    })
  },

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
        let selectedIds = s.selectedIds.filter((sid) => sid !== id)
        // Closing the active terminal shouldn't leave the canvas inert — hand
        // selection (and thus keyboard focus) to the nearest surviving neighbour.
        if (selectedIds.length === 0 && rest.length > 0) {
          const idx = s.agents.findIndex((a) => a.id === id)
          selectedIds = [rest[Math.min(idx, rest.length - 1)].id]
        }
        return {
          agents: laidOut(rest, s.layoutMode, s.canvasW, s.canvasH),
          selectedIds,
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

  reopenLast: () => {
    if (get().agents.length >= MAX_AGENTS) {
      get().pushToast(`Maximum ${MAX_AGENTS} terminals on one canvas`, 'info')
      return
    }
    set((s) => {
      const lc = s.lastClosed
      if (!lc) return {}
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
    })
  },

  renameAgent: (id, label) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, label: label || a.label } : a))
    })),

  // Toggle a card's wide (double-weight) tile and re-tile. A layout action, so
  // it resets the camera like the others (setLayoutMode / relayout).
  toggleWide: (id) =>
    set((s) => ({
      agents: laidOut(
        s.agents.map((a) => (a.id === id ? { ...a, wide: !a.wide } : a)),
        s.layoutMode,
        s.canvasW,
        s.canvasH
      ),
      panX: 0,
      panY: 0,
      zoom: 1
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
    set((s) => {
      // De-dupe: the same message firing again (e.g. a burst of merge/CLI errors)
      // must not wallpaper the corner with twins. Refresh the live one instead —
      // move it to the top of the stack and bump `refresh` so its timer restarts.
      const dup = s.toasts.find((t) => t.text === text && t.kind === kind)
      if (dup) {
        // Keep the id, but take THIS call's action fields — keeping the old
        // object would keep a stale closure (e.g. "Initialize git" still bound
        // to a previously opened project's path). Actions are overwritten even
        // when the new push has none: the caller's latest intent wins.
        const fresh: Toast = {
          id: dup.id,
          text,
          kind,
          actionLabel: action?.actionLabel,
          onAction: action?.onAction,
          secondaryLabel: action?.secondaryLabel,
          onSecondary: action?.onSecondary,
          refresh: (dup.refresh ?? 0) + 1
        }
        return { toasts: [...s.toasts.filter((t) => t !== dup), fresh] }
      }
      let toasts: Toast[] = [...s.toasts, { id: uuid(), text, kind, ...action }]
      // Cap the stack: evict the OLDEST, preferring non-sticky (sticky ones carry
      // an action or an error the user must see). Never drop the newest — the
      // user just triggered it.
      if (toasts.length > MAX_TOASTS) {
        const victim = toasts.find((t) => !toastIsSticky(t)) ?? toasts[0]
        toasts = toasts.filter((t) => t !== victim)
      }
      return { toasts }
    }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

// Exposed for diagnostics / debugging from the main process.
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__agentStore = useStore
}
