import { memo, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { createPortal } from 'react-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useStore, displayBranch, RAIL_INSET, PAD, type AgentInstance, type AgentStatus } from '../store'
import { terminals } from '../terminalRegistry'
import { needsAttention, clampTail } from '../attention'
import { playCue, type Cue } from '../sound'
import { IconClose } from './Icons'
import AgentBadge from './AgentBadge'

// DECSCUSR (CSI Ps SP q) — shells like PSReadLine use it to force a (fast)
// blinking cursor. Strip it so our own calm CSS blink is the single source.
// eslint-disable-next-line no-control-regex
const CURSOR_STYLE_SEQ = /\x1b\[[0-9]* q/g

/** Floor for the maximized pane before the canvas has reported its size. */
const MIN_FOCUS_SIZE = 200

// Path-looking tokens in terminal output ("src/foo.ts:42", "..\lib\a.py") —
// candidates are verified against the pane's cwd in the main process, so only
// real files light up as links.
const FILE_RE = /(?:[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/])?[\w][\w.-]*(?:[\\/][\w.-]+)+(?::\d+(?::\d+)?)?/g

/** m:ss elapsed while an agent works; hidden for bursts under 3s (shell echo). */
function WorkTimer({ since }: { since: number }): JSX.Element | null {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000))
  if (s < 3) return null
  return (
    <span className="vec-pane__timer">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

/** Status → status-dot colour (CSS custom properties from the palette). */
const STATUS_COLOR: Record<AgentStatus, string> = {
  starting: 'var(--status-idle)',
  working: 'var(--status-working)',
  idle: 'var(--status-idle)',
  attention: 'var(--status-attention)',
  exited: 'var(--status-done)',
  error: 'var(--status-error)'
}

/**
 * One terminal window. The SAME instance is reused across every layout mode, so
 * switching Grid/Columns/Free never kills the PTY. In free mode it's absolutely
 * positioned (driven by Moveable). Status is detected from PTY output so the
 * canvas can show, at a glance, which agent is working / idle / waiting on you.
 */
function TerminalPane({ agent }: { agent: AgentInstance }): JSX.Element {
  const id = agent.id
  const termHostRef = useRef<HTMLDivElement>(null)
  // One array traversal for the three per-agent fields we read; useShallow keeps
  // the re-render gated to actual changes in branch / isolated / status.
  const { branch, isolated, status, workingSince } = useStore(
    useShallow((s) => {
      const a = s.agents.find((x) => x.id === id)
      return {
        branch: a?.branch,
        isolated: a?.isolated,
        status: a?.status ?? ('starting' as AgentStatus),
        workingSince: a?.workingSince
      }
    })
  )
  const selected = useStore((s) => s.selectedIds.includes(id))
  const closing = useStore((s) => s.closingIds.includes(id))
  const removeAgent = useStore((s) => s.removeAgent)
  const fontSize = useStore((s) => s.settings.fontSize)
  const fontFamily = useStore((s) => s.settings.fontFamily)
  const scrollback = useStore((s) => s.settings.scrollback)
  const confirmClose = useStore((s) => s.settings.confirmClose)
  const renameAgent = useStore((s) => s.renameAgent)
  const focusTerminal = useStore((s) => s.focusTerminal)
  const clearFocus = useStore((s) => s.clearFocus)
  const focused = useStore((s) => s.focusedId === id)
  const canvasW = useStore((s) => s.canvasW)
  const canvasH = useStore((s) => s.canvasH)
  const setDiffAgentId = useStore((s) => s.setDiffAgentId)
  const pendingClose = useStore((s) => s.pendingCloseId === id)
  const clearPendingClose = useStore((s) => s.clearPendingClose)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<(() => void) | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const ptyRef = useRef<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(agent.label)
  const [spawnError, setSpawnError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [closePrompt, setClosePrompt] = useState<{
    checking: boolean
    dirty: boolean
    count: number
    /** Shared-dir terminal: closing deletes nothing on disk. */
    shared?: boolean
  } | null>(null)

  // Read the clipboard and hand it to xterm — shared by Ctrl/Cmd-V and the
  // context-menu Paste. We read via the main process (window.api.clipboard),
  // not navigator.clipboard.readText(), which rejects intermittently in Electron
  // when the window isn't focused and made paste silently no-op. term.paste()
  // (rather than a raw pty.write) applies bracketed-paste and \r\n cleanup so
  // TUIs and agents receive the text correctly.
  const pasteFromClipboard = async (): Promise<void> => {
    try {
      const t = await window.api.clipboard.read()
      if (t) termRef.current?.paste(t)
    } catch {
      /* clipboard unavailable — nothing to paste */
    }
  }

  useEffect(() => {
    const host = termHostRef.current
    if (!host) return
    setSpawnError(null)

    const term = new Terminal({
      fontFamily,
      fontSize,
      scrollback,
      cursorBlink: false, // steady cursor — the blink read as a fast jitter
      allowTransparency: true, // so the pane bg / wallpaper can show through
      allowProposedApi: true, // Unicode11Addon + registerLinkProvider need it
      smoothScrollDuration: 120, // wheel scrolling glides instead of jumping
      // We own the context menu; xterm's mac default of selecting the word
      // under a right-click silently replaced the user's selection before the
      // menu's Copy could read it.
      rightClickSelectsWord: false,
      theme: {
        background: 'rgba(0,0,0,0)',
        foreground: '#cdd6e4',
        cursor: '#cdd6e4',
        // Explicit selection colours: on the translucent glass background,
        // xterm's default selection was nearly invisible.
        selectionBackground: 'rgba(138, 170, 255, 0.36)',
        selectionInactiveBackground: 'rgba(138, 170, 255, 0.18)'
      }
    })
    termRef.current = term
    // Expose to the macOS Edit-menu handler (routes ⌘C/⌘V/⌘A by focus).
    terminals.set(id, term)
    const fit = new FitAddon()
    term.loadAddon(fit)
    const search = new SearchAddon()
    term.loadAddon(search)
    searchRef.current = search
    // Clickable URLs open in the user's real browser.
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.openExternal(uri)))
    // Correct emoji / CJK cell widths — agent TUIs (Claude Code) are full of
    // them, and the default Unicode 6 tables misalign their box-drawing.
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.open(host)
    // Deliberately NO WebGL renderer: it draws glyphs into a bitmap canvas,
    // and with the interface zoom (default 1.1) + fractional tile coordinates
    // that bitmap lands between device pixels — the compositor resamples it
    // and EVERY glyph goes soft. The DOM renderer rasterizes text at final
    // resolution and stays crisp at any zoom; its perf is fine at ≤9 panes.

    // File paths in output become links (verified against the pane's cwd in
    // the main process; only real files activate). Click opens the default app.
    const fileLinks = term.registerLinkProvider({
      provideLinks(y, cb) {
        const text = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? ''
        const st = useStore.getState()
        const cwd = st.agents.find((a) => a.id === id)?.cwd ?? st.projectPath ?? ''
        const cands: { x: number; t: string }[] = []
        FILE_RE.lastIndex = 0
        for (let m = FILE_RE.exec(text); m; m = FILE_RE.exec(text)) {
          cands.push({ x: m.index, t: m[0] })
        }
        if (!cands.length || !cwd) return cb(undefined)
        void Promise.all(cands.map((c) => window.api.file.exists(cwd, c.t))).then((oks) => {
          const links = cands
            .filter((_, i) => oks[i])
            .map((c) => ({
              range: { start: { x: c.x + 1, y }, end: { x: c.x + c.t.length, y } },
              text: c.t,
              activate: () => void window.api.file.open(cwd, c.t)
            }))
          cb(links.length ? links : undefined)
        })
      }
    })

    // Copy on mod+C when there's a selection (else let Ctrl-C be SIGINT);
    // paste on mod+V; open find on mod+F. The modifier is PLATFORM-SPECIFIC:
    // Ctrl on Windows/Linux, ⌘ on macOS — treating ctrl===meta everywhere let a
    // mac Ctrl+C-with-selection copy instead of interrupting the process, and
    // Ctrl+F opened find instead of readline forward-char. (On mac ⌘C/⌘V are
    // consumed by the menu before reaching here; ⌘F still lands here.)
    // preventDefault() is load-bearing on the intercepted combos: returning
    // false only stops xterm's own processing, NOT the browser default. Without
    // it, Ctrl+V ALSO fired the native `paste` event on xterm's hidden textarea
    // (xterm pastes it too) — every paste landed TWICE. Dictation tools that
    // simulate Ctrl+V (Wispr Flow) hit the same double-paste.
    const isMac = window.api.platform === 'darwin'
    term.attachCustomKeyEventHandler((e): boolean => {
      if (e.type !== 'keydown') return true
      const mod = isMac ? e.metaKey : e.ctrlKey
      // App-level chords (maximize toggle, pane cycling) — keep them out of the
      // pty; the window keydown handler picks them up as the event bubbles.
      if (
        mod &&
        e.shiftKey &&
        (e.code === 'Enter' || e.code === 'BracketRight' || e.code === 'BracketLeft')
      ) {
        return false
      }
      const k = e.key.toLowerCase()
      if (mod && k === 'c' && term.hasSelection()) {
        e.preventDefault()
        window.api.clipboard.write(term.getSelection())
        return false
      }
      if (mod && k === 'v') {
        e.preventDefault()
        void pasteFromClipboard()
        return false
      }
      if (mod && k === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        return false
      }
      return true
    })

    // Copy-on-select (iTerm-style): a settled mouse selection lands on the
    // clipboard. Debounced — writing on every onSelectionChange tick during a
    // drag flooded the OS clipboard history (Win+V) with partial selections.
    let selTimer: ReturnType<typeof setTimeout> | undefined
    term.onSelectionChange(() => {
      clearTimeout(selTimer)
      selTimer = setTimeout(() => {
        if (!useStore.getState().settings.copyOnSelect) return
        const sel = term.getSelection()
        if (sel) window.api.clipboard.write(sel)
      }, 250)
    })

    let raf = 0
    const doFit = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        try {
          fit.fit()
        } catch {
          /* not laid out yet */
        }
        if (ptyId) window.api.pty.resize(ptyId, term.cols, term.rows)
      })
    }
    fitRef.current = doFit
    doFit()

    const state = useStore.getState()
    const { projectPath, setAgentRuntime, setStatus } = state
    const shell = state.shells.find((sh) => sh.id === agent.shellId)
    let ptyId: string | null = null
    let disposed = false
    let tail = ''
    let working = false
    let workingSince = 0
    let bellRang = false
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let lastNotify = 0
    const unsubs: Array<() => void> = []
    // A working burst shorter than this reads as routine shell echo (ls, cd…),
    // not a task — don't notify on those settling back to idle.
    const DONE_AFTER_MS = 8000

    const labelOf = (): string =>
      useStore.getState().agents.find((a) => a.id === id)?.label ?? 'Terminal'

    // Notify only for a backgrounded agent: app window unfocused OR the card is
    // off-screen. Never nag about the terminal you're already watching.
    const maybeNotify = (kind: 'attention' | 'done' | 'exited' | 'error'): void => {
      const st = useStore.getState()
      if (!st.settings.notifications) return
      if (kind === 'done' && !st.settings.notifyOnDone) return
      const a = st.agents.find((x) => x.id === id)
      if (!a) return
      const wz = a.w * st.zoom
      const hz = a.h * st.zoom
      const sx = st.panX + a.x * st.zoom
      const sy = st.panY + a.y * st.zoom
      const offscreen = sx + wz < 0 || sx > st.canvasW || sy + hz < 0 || sy > st.canvasH
      const appUnfocused = typeof document !== 'undefined' && !document.hasFocus()
      if (!offscreen && !appUnfocused) return
      const now = Date.now()
      if (now - lastNotify < 4000) return
      lastNotify = now
      const body =
        kind === 'attention'
          ? 'Waiting for your input'
          : kind === 'done'
            ? 'Finished — ready for you'
            : kind === 'error'
              ? 'Process exited with an error'
              : 'Process finished'
      window.api.notify.agent({ id, title: labelOf(), body })
    }

    // Audible cue — gated only by the setting (not by backgrounding), so you also
    // hear it for the agent you're watching. Rate-limiting lives in playCue.
    const maybeSound = (cue: Cue): void => {
      if (useStore.getState().settings.sounds) playCue(cue)
    }

    const evaluateIdle = (): void => {
      if (disposed) return
      const ranFor = workingSince ? Date.now() - workingSince : 0
      working = false
      workingSince = 0
      // A bell "sticks" until the next settle: programs usually ring it and
      // then keep drawing the prompt, which would otherwise flip the status
      // back to working → idle and lose the attention.
      const next: AgentStatus = bellRang || needsAttention(tail) ? 'attention' : 'idle'
      bellRang = false
      setStatus(id, next)
      if (next === 'attention') {
        maybeNotify('attention')
        maybeSound('attention')
      } else if (ranFor >= DONE_AFTER_MS) {
        // A real task wrapped up (worked a while, then went quiet without a prompt).
        maybeNotify('done')
        maybeSound('done')
      }
    }

    // Coalesce a stream of output into a single "working" flip (avoids a store
    // write per chunk); settle to idle/attention 800ms after output stops.
    // The tail stays RAW (needsAttention strips it whole) — stripping per chunk
    // leaked halves of escape sequences split across chunk boundaries.
    const onActivity = (d: string): void => {
      tail = clampTail(tail + d, 1200)
      if (!working) {
        working = true
        workingSince = Date.now()
        setAgentRuntime(id, { status: 'working', workingSince })
      }
      clearTimeout(idleTimer)
      idleTimer = setTimeout(evaluateIdle, 800)
    }

    // BEL from the program itself is the one non-heuristic "I need you" signal
    // (Claude Code rings it on permission prompts). Treat it as attention.
    term.onBell(() => {
      bellRang = true
      clearTimeout(idleTimer)
      working = false
      workingSince = 0
      setStatus(id, 'attention')
      maybeNotify('attention')
      maybeSound('attention')
    })

    const start = async (): Promise<void> => {
      setStatus(id, 'starting')
      const wt = await window.api.worktree.create(projectPath ?? '', id, agent.isolation)
      if (disposed) return
      setAgentRuntime(id, { branch: wt.branch, cwd: wt.cwd, isolated: wt.isolated })
      // Asked for an isolated worktree but git couldn't give us one — don't let it
      // pass as a silent "shared" tag; say why so the user can fix it (e.g. make an
      // initial commit) instead of unknowingly editing the shared project dir.
      if (agent.isolation === 'worktree' && !wt.isolated && wt.reason) {
        useStore.getState().pushToast(`“${labelOf()}” isn’t isolated — ${wt.reason}`, 'error')
      }

      let pid: string
      try {
        pid = await window.api.pty.spawn({
          cwd: wt.cwd || undefined,
          cols: term.cols,
          rows: term.rows,
          shell: shell?.command,
          args: shell?.args
        })
      } catch (e) {
        if (disposed) return
        setStatus(id, 'error')
        setSpawnError(e instanceof Error ? e.message : String(e))
        return
      }
      if (disposed) {
        window.api.pty.kill(pid)
        return
      }
      ptyId = pid
      ptyRef.current = pid
      setAgentRuntime(id, { ptyId: pid })
      setStatus(id, 'idle')

      // The DECSCUSR strip is chunk-boundary safe: a sequence split across two
      // PTY chunks is held back (carry) and stripped once complete — otherwise
      // the leaked half re-enabled the fast-blink cursor it exists to suppress.
      let seqCarry = ''
      unsubs.push(window.api.pty.onData(pid, (d) => {
        let s = seqCarry ? seqCarry + d : d
        seqCarry = ''
        const partial = s.match(/\x1b(?:\[[0-9]* ?)?$/)
        if (partial) {
          seqCarry = partial[0]
          s = s.slice(0, s.length - partial[0].length)
        }
        if (s) term.write(s.replace(CURSOR_STYLE_SEQ, ''))
        onActivity(d)
      }))
      unsubs.push(
        window.api.pty.onExit(pid, (code) => {
          clearTimeout(idleTimer)
          ptyRef.current = null
          const errored = !!code && code !== 0
          setStatus(id, errored ? 'error' : 'exited')
          term.write('\r\n\x1b[31m[process exited]\x1b[0m\r\n')
          maybeNotify(errored ? 'error' : 'exited')
          maybeSound(errored ? 'error' : 'done')
        })
      )
      term.onData((d) => {
        window.api.pty.write(pid, d)
        // When the user runs a command, tag the terminal if it's a known agent —
        // so the badge appears even when an agent is started by hand.
        if (d.includes('\r')) {
          const buf = term.buffer.active
          const line = buf.getLine(buf.baseY + buf.cursorY)?.translateToString(true) ?? ''
          // Take the command after the last shell-prompt character.
          const cmd = (line.match(/.*[>$#%]\s*(\S.*)$/)?.[1] ?? '').trim().split(/\s+/)[0]
          const base = (cmd.split(/[\\/]/).pop() ?? '').toLowerCase()
          if (base) {
            const st = useStore.getState()
            const hit = st.agentClis.find((c) => c.command.toLowerCase() === base || c.id === base)
            if (hit) {
              // Remember the launch command too (unless one's already set from the
              // "Start <agent>" menu) so a hand-started agent relaunches on reopen
              // instead of coming back as a bare shell.
              const had = st.agents.find((a) => a.id === id)?.startupCommand
              setAgentRuntime(id, {
                agentId: hit.id,
                agentLabel: hit.label,
                ...(had ? {} : { startupCommand: hit.command })
              })
            }
          }
        }
      })

      if (wt.cwd) {
        const sid = shell?.id
        const win = window.api.platform === 'win32'
        let cd: string | null = null
        if (sid === 'powershell' || sid === 'pwsh' || (win && !sid)) {
          cd = `Set-Location -LiteralPath '${wt.cwd.replace(/'/g, "''")}'`
        } else if (sid === 'cmd') {
          cd = `cd /d "${wt.cwd}"`
        } else if (!win && sid !== 'gitbash') {
          cd = `cd '${wt.cwd.replace(/'/g, "'\\''")}'`
        }
        if (cd) window.api.pty.write(pid, cd + '\r')
      }
      if (agent.startupCommand) window.api.pty.write(pid, agent.startupCommand + '\r')
    }
    void start().catch((e) => {
      if (disposed) return
      setStatus(id, 'error')
      setSpawnError(e instanceof Error ? e.message : String(e))
    })

    const ro = new ResizeObserver(doFit)
    ro.observe(host)

    return () => {
      disposed = true
      clearTimeout(idleTimer)
      clearTimeout(selTimer)
      cancelAnimationFrame(raf)
      ro.disconnect()
      unsubs.forEach((u) => u())
      fileLinks.dispose()
      if (ptyId) window.api.pty.kill(ptyId)
      ptyRef.current = null
      searchRef.current = null
      terminals.delete(id)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce])

  // Entering focus (maximize) also hands over KEYBOARD focus — same for a
  // notification click — so you can type immediately without clicking in.
  useEffect(() => {
    if (focused) termRef.current?.focus()
  }, [focused])

  // Live terminal options from settings (no respawn needed).
  useEffect(() => {
    const t = termRef.current
    if (!t) return
    t.options.fontSize = fontSize
    t.options.fontFamily = fontFamily
    t.options.scrollback = scrollback
    fitRef.current?.()
  }, [fontSize, fontFamily, scrollback])

  const beginClose = async (): Promise<void> => {
    // Shared dir (or downgraded): nothing is deleted on disk. Confirmed via
    // the same in-app modal as worktree closes (no native window.confirm).
    if (agent.isolation !== 'worktree' || isolated === false) {
      if (confirmClose) setClosePrompt({ checking: false, dirty: false, count: 0, shared: true })
      else removeAgent(id)
      return
    }
    // Isolated worktree: never delete a branch with uncommitted work silently.
    setClosePrompt({ checking: true, dirty: false, count: 0 })
    const projectPath = useStore.getState().projectPath
    try {
      const res = projectPath ? await window.api.git.diff(projectPath, id) : null
      const untracked = res?.untracked?.length ?? 0
      const changed = res?.diff ? res.diff.match(/^diff --git/gm)?.length ?? 0 : 0
      const count = untracked + changed
      const dirty = !!res?.hasChanges || untracked > 0
      if (!dirty && !confirmClose) {
        setClosePrompt(null)
        removeAgent(id)
        return
      }
      setClosePrompt({ checking: false, dirty, count })
    } catch {
      setClosePrompt({ checking: false, dirty: false, count: 0 })
    }
  }

  // A close requested from outside the pane (⌘W / command palette) runs the same
  // guarded flow as the × button, so a worktree's uncommitted work is never
  // force-deleted without a prompt. Ref keeps the effect off beginClose's identity.
  const beginCloseRef = useRef(beginClose)
  beginCloseRef.current = beginClose
  useEffect(() => {
    if (!pendingClose) return
    clearPendingClose()
    void beginCloseRef.current()
  }, [pendingClose, clearPendingClose])

  const relaunch = (): void => {
    setSpawnError(null)
    setSearchOpen(false)
    setRetryNonce((n) => n + 1)
  }

  // Context-menu actions hand focus back to the terminal, so you can keep
  // typing right after Copy/Paste without clicking into the pane again.
  const copySelection = (): void => {
    const sel = termRef.current?.getSelection()
    if (sel) window.api.clipboard.write(sel)
    setMenu(null)
    termRef.current?.focus()
  }
  const paste = (): void => {
    void pasteFromClipboard()
    setMenu(null)
    termRef.current?.focus()
  }

  const dotColor = STATUS_COLOR[status]
  const ringClass =
    status === 'attention'
      ? ' is-attention'
      : status === 'error'
        ? ' is-error'
        : status === 'working'
          ? ' is-working'
          : ''
  const ended = (status === 'exited' || status === 'error') && !spawnError

  // Focused = maximized to the viewport (real refit → more rows/cols, crisp
  // text, correct mouse selection). Otherwise the pane sits in its tiled slot.
  const style = focused
    ? {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        transform: `translate(${RAIL_INSET}px, ${PAD}px)`,
        width: Math.max(MIN_FOCUS_SIZE, canvasW - RAIL_INSET - PAD),
        height: Math.max(MIN_FOCUS_SIZE, canvasH - PAD * 2)
      }
    : {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        transform: `translate(${agent.x}px, ${agent.y}px)`,
        width: agent.w,
        height: agent.h
      }

  const commitRename = (): void => {
    renameAgent(id, draft.trim())
    setEditing(false)
  }

  const runSearch = (dir: 'next' | 'prev', q = query): void => {
    if (!q) return
    if (dir === 'next') searchRef.current?.findNext(q)
    else searchRef.current?.findPrevious(q)
  }

  // Closing find hands focus back to the terminal — no extra click to resume.
  const closeSearch = (): void => {
    setSearchOpen(false)
    termRef.current?.focus()
  }

  // Show "shared" when an isolated terminal silently fell back to the project dir.
  const downgraded = agent.isolation === 'worktree' && isolated === false

  return (
    <>
    <div
      className={
        'vec-pane' +
        (selected ? ' is-selected' : '') +
        (focused ? ' is-focused' : '') +
        ringClass +
        (closing ? ' is-closing' : '')
      }
      data-id={id}
      style={style}
    >
      <div
        className="vec-pane__header"
        title={focused ? 'Double-click to restore' : 'Double-click to focus'}
        onDoubleClick={() => (focused ? clearFocus() : focusTerminal(id))}
      >
        <span
          className={
            'vec-pane__dot' +
            (status === 'exited' ? ' vec-pane__dot--done' : '') +
            (status === 'working' ? ' vec-pane__dot--working' : '')
          }
          style={{ background: dotColor }}
        />
        <AgentBadge id={agent.agentId} label={agent.agentLabel} />
        {editing ? (
          <input
            className="vec-pane__rename"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') {
                e.stopPropagation()
                setEditing(false)
              }
            }}
          />
        ) : (
          <span
            className="vec-pane__title"
            title="Double-click to rename"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setDraft(agent.label)
              setEditing(true)
            }}
          >
            {agent.label}
          </span>
        )}
        {status === 'working' && workingSince ? <WorkTimer since={workingSince} /> : null}
        {downgraded ? (
          <span
            className="vec-pane__branch vec-pane__branch--shared"
            title="Worktree isolation unavailable — running in the shared project directory"
          >
            shared
          </span>
        ) : (
          agent.isolation === 'worktree' &&
          branch && (
            <button
              className="vec-pane__branch vec-pane__branch--btn"
              title="Review changes & merge"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setDiffAgentId(id)
              }}
            >
              {displayBranch(branch)}
            </button>
          )
        )}
        <button
          className="vec-pane__close"
          title="Remove terminal"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            void beginClose()
          }}
        >
          <IconClose />
        </button>
      </div>
      {spawnError ? (
        <div className="vec-pane__error">
          <div className="vec-pane__error-title">Couldn’t start the shell</div>
          <div className="vec-pane__error-msg">{spawnError}</div>
          <button className="vec-pane__retry" onPointerDown={(e) => e.stopPropagation()} onClick={relaunch}>
            Retry
          </button>
        </div>
      ) : (
        <div className="vec-pane__body">
          <div
            className="vec-pane__term"
            ref={termHostRef}
            // Focusing/typing in a terminal selects it (React onFocus fires when
            // xterm's hidden textarea gains focus). Guarded so it only updates
            // the store when the selection actually changes.
            onFocus={() => {
              const s = useStore.getState()
              if (s.selectedIds.length !== 1 || s.selectedIds[0] !== id) s.setSelected([id])
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })
            }}
          />

          {searchOpen && (
            <div className="vec-pane__search" onPointerDown={(e) => e.stopPropagation()}>
              <input
                className="vec-pane__search-input"
                autoFocus
                placeholder="Find"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  runSearch('next', e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next')
                  else if (e.key === 'Escape') {
                    e.stopPropagation()
                    closeSearch()
                  }
                }}
              />
              <button className="vec-pane__search-btn" title="Previous (Shift+Enter)" onClick={() => runSearch('prev')}>
                ‹
              </button>
              <button className="vec-pane__search-btn" title="Next (Enter)" onClick={() => runSearch('next')}>
                ›
              </button>
              <button className="vec-pane__search-btn" title="Close (Esc)" onClick={closeSearch}>
                ✕
              </button>
            </div>
          )}

          {ended && (
            <div className="vec-pane__ended" onPointerDown={(e) => e.stopPropagation()}>
              <span>Process ended</span>
              <button className="vec-pane__relaunch" onClick={relaunch}>
                Relaunch
              </button>
            </div>
          )}

          {menu && (
            <>
              <div
                className="vec-pane__menu-backdrop"
                onPointerDown={() => setMenu(null)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu(null)
                }}
              />
              <div
                className="vec-pane__menu"
                style={{ left: menu.x, top: menu.y }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  className="vec-pane__menu-item"
                  disabled={!termRef.current?.hasSelection()}
                  onClick={copySelection}
                >
                  Copy
                </button>
                <button className="vec-pane__menu-item" onClick={paste}>
                  Paste
                </button>
                <button
                  className="vec-pane__menu-item"
                  onClick={() => {
                    termRef.current?.selectAll()
                    setMenu(null)
                  }}
                >
                  Select all
                </button>
                <button
                  className="vec-pane__menu-item"
                  onClick={() => {
                    termRef.current?.clear()
                    setMenu(null)
                  }}
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>

    {/* Rendered via a portal: a position:fixed modal inside the canvas transform
        would be positioned relative to the pane, not the screen. */}
    {closePrompt &&
      createPortal(
        <div className="modal" onPointerDown={() => setClosePrompt(null)}>
          <div className="confirm" onPointerDown={(e) => e.stopPropagation()}>
            {closePrompt.checking ? (
              <div className="confirm__body">Checking for uncommitted changes…</div>
            ) : closePrompt.shared ? (
              <>
                <div className="confirm__title">Close “{agent.label}”?</div>
                <div className="confirm__body">
                  This ends the terminal’s process. Nothing on disk is deleted.
                </div>
                <div className="confirm__actions">
                  <button className="confirm__btn" onClick={() => setClosePrompt(null)}>
                    Cancel
                  </button>
                  <button
                    className="confirm__btn confirm__btn--danger"
                    onClick={() => {
                      removeAgent(id)
                      setClosePrompt(null)
                    }}
                  >
                    Close terminal
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="confirm__title">Close “{agent.label}”?</div>
                <div className="confirm__body">
                  {closePrompt.dirty ? (
                    <>
                      This branch has{' '}
                      <b>
                        {closePrompt.count > 0 ? closePrompt.count : 'uncommitted'}{' '}
                        {closePrompt.count === 1 ? 'change' : 'changes'}
                      </b>{' '}
                      that aren’t committed. Deleting the worktree will permanently lose them.
                    </>
                  ) : (
                    'This will delete the terminal’s worktree and branch. No uncommitted changes were found.'
                  )}
                </div>
                <div className="confirm__actions">
                  <button className="confirm__btn" onClick={() => setClosePrompt(null)}>
                    Cancel
                  </button>
                  <button
                    className="confirm__btn confirm__btn--safe"
                    title="Close the terminal but keep its branch + worktree on disk"
                    onClick={() => {
                      removeAgent(id, { keepWorktree: true })
                      setClosePrompt(null)
                    }}
                  >
                    Keep branch
                  </button>
                  <button
                    className="confirm__btn confirm__btn--danger"
                    onClick={() => {
                      removeAgent(id)
                      setClosePrompt(null)
                    }}
                  >
                    Delete worktree
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// Memoized: when the store changes, only panes whose agent object actually
// changed re-render (status flips touch a single agent, not the whole list).
export default memo(TerminalPane)
