import { useMemo, useState } from 'react'
import { useStore, MAX_AGENTS } from '../store'
import { openProjectInteractive } from '../openProject'

interface Cmd {
  id: string
  title: string
  hint?: string
  run: () => void
}

export default function CommandPalette(): JSX.Element {
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const addAgent = useStore((s) => s.addAgent)
  const setLayoutMode = useStore((s) => s.setLayoutMode)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const removeAgent = useStore((s) => s.removeAgent)
  const focusTerminal = useStore((s) => s.focusTerminal)
  const shells = useStore((s) => s.shells)
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
        list.push({ id: 'new', title: 'New terminal', hint: '⌘T', run: () => addAgent() })
        shells.forEach((sh) =>
          list.push({ id: 'new-' + sh.id, title: `New terminal · ${sh.label}`, run: () => addAgent({ shellId: sh.id }) })
        )
      }
      list.push({ id: 'grid', title: 'Layout: Grid', hint: '⌘1', run: () => setLayoutMode('grid') })
      list.push({ id: 'cols', title: 'Layout: Columns', hint: '⌘2', run: () => setLayoutMode('columns') })
      const sel = selectedIds[0]
      if (sel) {
        list.push({ id: 'focus', title: 'Focus selected terminal', run: () => focusTerminal(sel) })
        list.push({ id: 'close', title: 'Close selected terminal', hint: '⌘W', run: () => removeAgent(sel) })
      }
    }
    list.push({ id: 'open', title: 'Open project…', run: openProjectInteractive })
    list.push({ id: 'settings', title: 'Settings', run: () => setSettingsOpen(true) })
    return list
  }, [projectPath, shells, selectedIds, agents.length, addAgent, setLayoutMode, focusTerminal, removeAgent, setSettingsOpen])

  const q = query.trim().toLowerCase()
  const items = useMemo<Cmd[]>(() => {
    const out: Cmd[] = []
    const full = agents.length >= MAX_AGENTS
    if (q && projectPath && !full) {
      out.push({ id: 'run', title: `Run "${query.trim()}" in a new terminal`, run: () => addAgent({ command: query.trim() }) })
    }
    out.push(...(q ? base.filter((c) => c.title.toLowerCase().includes(q)) : base))
    if (q && projectPath) {
      agents
        .filter((a) => a.label.toLowerCase().includes(q))
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
            <button
              key={c.id}
              className={'palette__item' + (i === active ? ' is-active' : '')}
              onMouseEnter={() => setIdx(i)}
              onClick={() => run(c.run)}
            >
              <span className="palette__item-title">{c.title}</span>
              {c.hint && <span className="palette__item-hint">{c.hint}</span>}
            </button>
          ))}
          {items.length === 0 && <div className="palette__empty">No matching commands</div>}
        </div>
      </div>
    </div>
  )
}
