import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, activeWs, useActiveAgents, useActiveProjectPath, MAX_AGENTS } from '../store'
import { openProjectInteractive, openProjectByPath, closeCurrentProject } from '../openProject'
import { modLabel } from '../shortcuts'
import Modal from './Modal'

interface Cmd {
  id: string
  title: string
  hint?: string
  /** Section header shown while browsing (no query). Search results stay flat. */
  group?: string
  run: () => void
}

/**
 * Subsequence fuzzy match: every query char must appear in order in the title
 * (case-insensitive). Returns a score for ranking, or null on no match.
 * Greedy left-to-right is enough at this scale (dozens of commands) — no need
 * for optimal-alignment scoring. Weights: word-boundary hits and consecutive
 * runs score high (so "lg" → "Layout: Grid", "clo" → "Close…"), scattered
 * matches score low but still match; a start-of-title hit gets a small bonus.
 */
function fuzzyScore(query: string, title: string): number | null {
  const t = title.toLowerCase()
  let score = 0
  let ti = 0
  let prevHit = -2 // not adjacent to index 0
  for (const ch of query) {
    const at = t.indexOf(ch, ti)
    if (at === -1) return null
    if (at === prevHit + 1) score += 3 // consecutive run
    else if (at === 0 || !/[a-z0-9]/.test(t[at - 1])) score += 2 // word boundary
    else score += 1 // scattered
    if (at === 0) score += 1 // start-of-title bonus
    prevHit = at
    ti = at + 1
  }
  return score
}

export default function CommandPalette(): JSX.Element {
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const addAgent = useStore((s) => s.addAgent)
  const reopenLast = useStore((s) => s.reopenLast)
  const lastClosed = useStore((s) => activeWs(s)?.lastClosed ?? null)
  const focusTerminal = useStore((s) => s.focusTerminal)
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace)
  const shells = useStore((s) => s.shells)
  const agentClis = useStore((s) => s.agentClis)
  const workspaces = useStore((s) => s.workspaces) // recents
  const liveWorkspaces = useStore((s) => s.liveWorkspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const agents = useActiveAgents()
  const projectPath = useActiveProjectPath()

  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)

  const close = (): void => setPaletteOpen(false)
  const run = (fn: () => void): void => {
    fn()
    close()
  }

  // A quick launcher, not a mirror of the menus: the things keyboard-launch
  // uniquely wins at — spin up terminals/agents, switch projects, and jump to a
  // pane by name. Actions that already sit one click away (layout, settings,
  // close/wide/maximize, feedback) live on the rail/cards/gear, not here.
  const base = useMemo<Cmd[]>(() => {
    const list: Cmd[] = []
    const full = agents.length >= MAX_AGENTS
    if (projectPath) {
      if (!full) {
        list.push({ id: 'new', title: 'New terminal', hint: modLabel('T'), group: 'New', run: () => addAgent() })
        agentClis.forEach((a) =>
          list.push({ id: 'agent-' + a.id, title: `Start ${a.label}`, group: 'New', run: () => addAgent({ command: a.command, agentLabel: a.label, agentId: a.id }) })
        )
        shells.forEach((sh) =>
          list.push({ id: 'new-' + sh.id, title: `New terminal · ${sh.label}`, group: 'New', run: () => addAgent({ shellId: sh.id }) })
        )
        if (lastClosed) {
          list.push({ id: 'reopen', title: `Reopen closed terminal · ${lastClosed.label}`, group: 'New', run: reopenLast })
        }
      }
      // Jump to any open terminal by name — the palette's fast-navigation power,
      // shown while browsing (not just on a query) so the capability is visible.
      agents.forEach((a) =>
        list.push({ id: 'jump-' + a.id, title: `Jump to ${a.label}`, group: 'Jump to', run: () => focusTerminal(a.id) })
      )
    }
    // Switch between already-open workspaces — instant and non-destructive
    // (their agents keep running in the background either way).
    liveWorkspaces
      .filter((w) => w.id !== activeWorkspaceId)
      .forEach((w) =>
        list.push({ id: 'switch-' + w.id, title: `Switch to ${w.name}`, group: 'Workspace', run: () => setActiveWorkspace(w.id) })
      )
    list.push({ id: 'open', title: 'Open project…', group: 'Workspace', run: openProjectInteractive })
    // Recents not already open → open as a new live tab.
    workspaces
      .filter((w) => !liveWorkspaces.some((lw) => lw.defaultPath === w.path))
      .forEach((w) =>
        list.push({ id: 'open-' + w.path, title: `Open ${w.name}`, group: 'Workspace', run: () => void openProjectByPath(w) })
      )
    if (projectPath) {
      list.push({ id: 'close-workspace', title: 'Close workspace', group: 'Workspace', run: closeCurrentProject })
    }
    return list
  }, [projectPath, shells, agentClis, workspaces, liveWorkspaces, activeWorkspaceId, agents, lastClosed, addAgent, focusTerminal, reopenLast, setActiveWorkspace])

  const q = query.trim().toLowerCase()
  const items = useMemo<Cmd[]>(() => {
    const out: Cmd[] = []
    const full = agents.length >= MAX_AGENTS
    if (q && projectPath && !full) {
      out.push({ id: 'run', title: `Run "${query.trim()}" in a new terminal`, run: () => addAgent({ command: query.trim() }) })
    }
    if (q) {
      // Rank fuzzy hits by score; Array.sort is stable, so equal scores keep
      // the deliberate build order of `base`.
      const scored: { c: Cmd; s: number }[] = []
      for (const c of base) {
        const s = fuzzyScore(q, c.title)
        if (s !== null) scored.push({ c, s })
      }
      scored.sort((a, b) => b.s - a.s)
      out.push(...scored.map((x) => x.c))
    } else {
      out.push(...base)
    }
    return out
  }, [q, query, base, agents, projectPath, addAgent])

  const active = Math.min(idx, Math.max(0, items.length - 1))

  // Arrow keys move `idx`, but the list is a fixed-height scroller — past ~8
  // results the highlight walked off the bottom and kept going invisibly, so
  // Enter fired a command the user couldn't see. 'nearest' scrolls only when the
  // row is actually out of view, leaving mouse-driven browsing unjolted.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('.palette__item.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active, items])

  return (
    <Modal className="palette" label="Command palette" onClose={close} initialFocus=".palette__input">
      <input
        className="palette__input"
        placeholder="Run a command, or jump to a terminal…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIdx(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIdx((i) => Math.min(items.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIdx((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const c = items[active]
            if (c) run(c.run)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
      />
      <div className="palette__list" ref={listRef}>
        {items.map((c, i) => (
          <Fragment key={c.id}>
            {/* Section headers only while browsing — search results are a
               single ranked list where headers would just break the flow. */}
            {!q && c.group && items[i - 1]?.group !== c.group && (
              <div className="palette__head">{c.group}</div>
            )}
            <button
              className={'palette__item' + (i === active ? ' is-active' : '')}
              onMouseEnter={() => setIdx(i)}
              onClick={() => run(c.run)}
            >
              <span className="palette__item-title">{c.title}</span>
              {c.hint && <span className="palette__item-hint">{c.hint}</span>}
            </button>
          </Fragment>
        ))}
        {items.length === 0 && <div className="palette__empty">No matching commands</div>}
      </div>
    </Modal>
  )
}
