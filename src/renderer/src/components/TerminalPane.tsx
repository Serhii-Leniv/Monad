import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useStore, type AgentInstance, type AgentStatus } from '../store'
import { needsAttention, stripAnsi, clampTail } from '../attention'
import { IconClose } from './Icons'

// DECSCUSR (CSI Ps SP q) — shells like PSReadLine use it to force a (fast)
// blinking cursor. Strip it so our own calm CSS blink is the single source.
// eslint-disable-next-line no-control-regex
const CURSOR_STYLE_SEQ = /\x1b\[[0-9]* q/g

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
  const branch = useStore((s) => s.agents.find((a) => a.id === id)?.branch)
  const isolated = useStore((s) => s.agents.find((a) => a.id === id)?.isolated)
  const status = useStore((s) => s.agents.find((a) => a.id === id)?.status ?? 'starting')
  const selected = useStore((s) => s.selectedIds.includes(id))
  const removeAgent = useStore((s) => s.removeAgent)
  const fontSize = useStore((s) => s.settings.fontSize)
  const fontFamily = useStore((s) => s.settings.fontFamily)
  const scrollback = useStore((s) => s.settings.scrollback)
  const confirmClose = useStore((s) => s.settings.confirmClose)
  const renameAgent = useStore((s) => s.renameAgent)
  const focusTerminal = useStore((s) => s.focusTerminal)
  const setDiffAgentId = useStore((s) => s.setDiffAgentId)
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
  const [closePrompt, setClosePrompt] = useState<{ checking: boolean; dirty: boolean; count: number } | null>(
    null
  )

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
      theme: { background: 'rgba(0,0,0,0)', foreground: '#cdd6e4', cursor: '#cdd6e4' }
    })
    termRef.current = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    const search = new SearchAddon()
    term.loadAddon(search)
    searchRef.current = search
    // Clickable URLs open in the user's real browser.
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.openExternal(uri)))
    term.open(host)

    // Copy on Ctrl/Cmd-C when there's a selection (else let Ctrl-C be SIGINT);
    // paste on Ctrl/Cmd-V; open find on Ctrl/Cmd-F.
    term.attachCustomKeyEventHandler((e): boolean => {
      if (e.type !== 'keydown') return true
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'c' && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection())
        return false
      }
      if (mod && k === 'v') {
        void navigator.clipboard.readText().then((t) => {
          if (ptyRef.current) window.api.pty.write(ptyRef.current, t)
        })
        return false
      }
      if (mod && k === 'f') {
        setSearchOpen(true)
        return false
      }
      return true
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

    const evaluateIdle = (): void => {
      if (disposed) return
      const ranFor = workingSince ? Date.now() - workingSince : 0
      working = false
      workingSince = 0
      const next: AgentStatus = needsAttention(tail) ? 'attention' : 'idle'
      setStatus(id, next)
      if (next === 'attention') maybeNotify('attention')
      // A real task wrapped up (worked a while, then went quiet without a prompt).
      else if (ranFor >= DONE_AFTER_MS) maybeNotify('done')
    }

    // Coalesce a stream of output into a single "working" flip (avoids a store
    // write per chunk); settle to idle/attention 800ms after output stops.
    const onActivity = (d: string): void => {
      tail = clampTail(tail + stripAnsi(d))
      if (!working) {
        working = true
        workingSince = Date.now()
        setStatus(id, 'working')
      }
      clearTimeout(idleTimer)
      idleTimer = setTimeout(evaluateIdle, 800)
    }

    const start = async (): Promise<void> => {
      setStatus(id, 'starting')
      const wt = await window.api.worktree.create(projectPath ?? '', id, agent.isolation)
      if (disposed) return
      setAgentRuntime(id, { branch: wt.branch, cwd: wt.cwd, isolated: wt.isolated })

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

      unsubs.push(window.api.pty.onData(pid, (d) => {
        term.write(d.replace(CURSOR_STYLE_SEQ, ''))
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
        })
      )
      term.onData((d) => window.api.pty.write(pid, d))

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
      cancelAnimationFrame(raf)
      ro.disconnect()
      unsubs.forEach((u) => u())
      if (ptyId) window.api.pty.kill(ptyId)
      ptyRef.current = null
      searchRef.current = null
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce])

  // Live terminal options from settings (no respawn needed).
  useEffect(() => {
    const t = termRef.current
    if (!t) return
    t.options.fontSize = fontSize
    t.options.fontFamily = fontFamily
    t.options.scrollback = scrollback
    fitRef.current?.()
  }, [fontSize, fontFamily, scrollback])

  const onClose = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    // Shared dir (or downgraded): nothing is deleted on disk.
    if (agent.isolation !== 'worktree' || isolated === false) {
      if (confirmClose && !window.confirm('Remove this terminal?')) return
      removeAgent(id)
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

  const relaunch = (): void => {
    setSpawnError(null)
    setSearchOpen(false)
    setRetryNonce((n) => n + 1)
  }

  const copySelection = (): void => {
    const sel = termRef.current?.getSelection()
    if (sel) void navigator.clipboard.writeText(sel)
    setMenu(null)
  }
  const paste = (): void => {
    void navigator.clipboard.readText().then((t) => {
      if (ptyRef.current) window.api.pty.write(ptyRef.current, t)
    })
    setMenu(null)
  }

  const dotColor = STATUS_COLOR[status]
  const ringClass =
    status === 'attention' ? ' is-attention' : status === 'error' ? ' is-error' : ''
  const ended = (status === 'exited' || status === 'error') && !spawnError

  const style = {
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

  // Show "shared" when an isolated terminal silently fell back to the project dir.
  const downgraded = agent.isolation === 'worktree' && isolated === false

  return (
    <>
    <div
      className={'vec-pane' + (selected ? ' is-selected' : '') + ringClass}
      data-id={id}
      style={style}
    >
      <div className="vec-pane__header" onDoubleClick={() => focusTerminal(id)}>
        <span
          className={
            'vec-pane__dot' +
            (status === 'exited' ? ' vec-pane__dot--done' : '') +
            (status === 'working' ? ' vec-pane__dot--working' : '')
          }
          style={{ background: dotColor }}
        />
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
              {branch.replace(/^canvas\//, '')}
            </button>
          )
        )}
        <button
          className="vec-pane__close"
          title="Remove terminal"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
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
                    setSearchOpen(false)
                  }
                }}
              />
              <button className="vec-pane__search-btn" title="Previous (Shift+Enter)" onClick={() => runSearch('prev')}>
                ‹
              </button>
              <button className="vec-pane__search-btn" title="Next (Enter)" onClick={() => runSearch('next')}>
                ›
              </button>
              <button className="vec-pane__search-btn" title="Close (Esc)" onClick={() => setSearchOpen(false)}>
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
