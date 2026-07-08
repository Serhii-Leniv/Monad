import { Fragment, useMemo, useState } from 'react'
import { useStore, MAX_AGENTS } from '../store'
import { openProjectInteractive, openProjectByPath, closeCurrentProject } from '../openProject'
import { modLabel } from '../shortcuts'

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
  const setLayoutMode = useStore((s) => s.setLayoutMode)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
  const setFeedbackOpen = useStore((s) => s.setFeedbackOpen)
  const setDiffAgentId = useStore((s) => s.setDiffAgentId)
  const requestClose = useStore((s) => s.requestClose)
  const requestBulkClose = useStore((s) => s.requestBulkClose)
  const toggleWide = useStore((s) => s.toggleWide)
  const reopenLast = useStore((s) => s.reopenLast)
  const lastClosed = useStore((s) => s.lastClosed)
  const focusTerminal = useStore((s) => s.focusTerminal)
  const shells = useStore((s) => s.shells)
  const agentClis = useStore((s) => s.agentClis)
  const workspaces = useStore((s) => s.workspaces)
  const agents = useStore((s) => s.agents)
  const selectedIds = useStore((s) => s.selectedIds)
  const projectPath = useStore((s) => s.projectPath)

  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)

  const close = (): void => setPaletteOpen(false)
  const run = (fn: () => void): void => {
    fn()
    close()
  }

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
      const sel = selectedIds[0]
      if (sel) {
        const selAgent = agents.find((a) => a.id === sel)
        if (selAgent?.isolation === 'worktree') {
          list.push({ id: 'review', title: 'Review changes & merge…', group: 'Selected terminal', run: () => setDiffAgentId(sel) })
        }
        list.push({ id: 'focus', title: 'Maximize terminal', group: 'Selected terminal', run: () => focusTerminal(sel) })
        if (selectedIds.length >= 2) {
          // Mirrors ⌘W on a multi-selection: one confirm (in App.tsx) closes the batch.
          list.push({
            id: 'close-selected',
            title: `Close ${selectedIds.length} selected terminals`,
            hint: modLabel('W'),
            group: 'Selected terminal',
            run: () => requestBulkClose(selectedIds)
          })
        } else {
          list.push({ id: 'close', title: 'Close selected terminal', hint: modLabel('W'), group: 'Selected terminal', run: () => requestClose(sel) })
          // Width toggle only makes sense for a single card (it's per-tile).
          list.push({
            id: 'wide',
            title: selAgent?.wide ? 'Make card normal' : 'Make card wider',
            group: 'Selected terminal',
            run: () => toggleWide(sel)
          })
        }
      }
      list.push({ id: 'grid', title: 'Layout: Grid', hint: modLabel('1'), group: 'Canvas', run: () => setLayoutMode('grid') })
      list.push({ id: 'cols', title: 'Layout: Columns', hint: modLabel('2'), group: 'Canvas', run: () => setLayoutMode('columns') })
    }
    list.push({ id: 'open', title: 'Open project…', group: 'Project', run: openProjectInteractive })
    workspaces
      .filter((w) => w.path !== projectPath)
      .forEach((w) =>
        list.push({ id: 'switch-' + w.path, title: `Switch to ${w.name}`, group: 'Project', run: () => void openProjectByPath(w) })
      )
    if (projectPath) {
      list.push({ id: 'close-project', title: 'Close project', group: 'Project', run: closeCurrentProject })
    }
    list.push({ id: 'settings', title: 'Settings', group: 'Application', run: () => setSettingsOpen(true) })
    list.push({ id: 'shortcuts', title: 'Keyboard shortcuts', hint: modLabel('/'), group: 'Application', run: () => setShortcutsOpen(true) })
    list.push({ id: 'feedback', title: 'Send feedback…', group: 'Application', run: () => setFeedbackOpen(true) })
    return list
  }, [projectPath, shells, agentClis, workspaces, selectedIds, agents, lastClosed, addAgent, setLayoutMode, focusTerminal, requestClose, requestBulkClose, toggleWide, reopenLast, setSettingsOpen, setShortcutsOpen, setFeedbackOpen, setDiffAgentId])

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
    if (q && projectPath) {
      agents
        .filter((a) => fuzzyScore(q, a.label) !== null)
        .forEach((a) => out.push({ id: 'focus-' + a.id, title: `Focus: ${a.label}`, run: () => focusTerminal(a.id) }))
    }
    return out
  }, [q, query, base, agents, projectPath, addAgent, focusTerminal])

  const active = Math.min(idx, Math.max(0, items.length - 1))

  return (
    <div className="modal" onPointerDown={close}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          className="palette__input"
          autoFocus
          placeholder="Type a command, or anything to run in a new terminal…"
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
        <div className="palette__list">
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
      </div>
    </div>
  )
}
