import { useEffect, useState } from 'react'

interface FileTreeProps {
  /** Absolute directory the tree is rooted at (scope root, resolved by FilePanel). */
  root: string
  /** The rel path currently open in the editor — highlighted when matched. */
  selectedPath: string | null
  /** Fired when a file row is clicked; rel is relative to `root`. */
  onOpen: (rel: string) => void
  /** Bumped by FilePanel's watcher — re-lists the root + expanded dirs live. */
  refreshNonce: number
}

/**
 * Lazy directory tree: only the root listing loads eagerly; every other dir is
 * fetched (and cached) the first time it's expanded. Flat recursive render —
 * no virtualization, fine for the directory sizes a file panel realistically shows.
 */
export default function FileTree({ root, selectedPath, onOpen, refreshNonce }: FileTreeProps): JSX.Element {
  const [rootEntries, setRootEntries] = useState<FileEntry[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [cache, setCache] = useState<Map<string, FileEntry[]>>(new Map())
  const [loading, setLoading] = useState<Set<string>>(new Set())

  // A new scope root invalidates everything below it — reload from scratch.
  useEffect(() => {
    setExpanded(new Set())
    setCache(new Map())
    setLoading(new Set())
    setRootEntries(null)
    if (!root) return
    let cancelled = false
    window.api.file.tree(root, '').then((r) => {
      if (!cancelled) setRootEntries(r.entries)
    })
    return () => {
      cancelled = true
    }
  }, [root])

  // Live refresh: on a watcher bump, re-list the root and every currently
  // expanded dir so created/deleted/renamed entries appear — WITHOUT collapsing
  // anything (expansion state is untouched). Keyed on refreshNonce only; it
  // reads the current `expanded`/`root` via closure (both are current on the
  // render that the nonce bump triggers).
  useEffect(() => {
    if (refreshNonce === 0 || !root) return
    let cancelled = false
    window.api.file.tree(root, '').then((r) => {
      if (!cancelled) setRootEntries(r.entries)
    })
    expanded.forEach((rel) => {
      window.api.file.tree(root, rel).then((r) => {
        if (!cancelled) setCache((c) => new Map(c).set(rel, r.entries))
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce])

  const toggleDir = (rel: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) {
        next.delete(rel)
        return next
      }
      next.add(rel)
      if (!cache.has(rel) && !loading.has(rel)) {
        setLoading((l) => new Set(l).add(rel))
        window.api.file.tree(root, rel).then((r) => {
          setCache((c) => new Map(c).set(rel, r.entries))
          setLoading((l) => {
            const n = new Set(l)
            n.delete(rel)
            return n
          })
        })
      }
      return next
    })
  }

  const renderEntries = (entries: FileEntry[], parentRel: string, depth: number): JSX.Element[] =>
    entries.map((e) => {
      const rel = parentRel ? parentRel + '/' + e.name : e.name
      const isDotfile = e.name.startsWith('.')
      if (e.kind === 'dir') {
        const isOpen = expanded.has(rel)
        const children = cache.get(rel)
        const isLoading = loading.has(rel)
        return (
          <div key={rel}>
            <div
              className={'filetree__row filetree__row--dir' + (isDotfile ? ' is-dotfile' : '')}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => toggleDir(rel)}
              title={rel}
            >
              <span className="filetree__twisty">{isOpen ? '▾' : '▸'}</span>
              <span className="filetree__name">{e.name}</span>
            </div>
            {isOpen &&
              (isLoading ? (
                <div
                  className="filetree__row filetree__row--loading"
                  style={{ paddingLeft: 6 + (depth + 1) * 14 + 14 }}
                >
                  Loading…
                </div>
              ) : children && children.length === 0 ? (
                <div
                  className="filetree__row filetree__row--empty"
                  style={{ paddingLeft: 6 + (depth + 1) * 14 + 14 }}
                >
                  (empty)
                </div>
              ) : children ? (
                renderEntries(children, rel, depth + 1)
              ) : null)}
          </div>
        )
      }
      return (
        <div
          key={rel}
          className={
            'filetree__row filetree__row--file' +
            (rel === selectedPath ? ' is-selected' : '') +
            (isDotfile ? ' is-dotfile' : '')
          }
          style={{ paddingLeft: 6 + depth * 14 + 14 }}
          onClick={() => onOpen(rel)}
          title={rel}
        >
          <span className="filetree__name">{e.name}</span>
        </div>
      )
    })

  return (
    <div className="filetree">
      {rootEntries === null ? (
        <div className="filetree__row filetree__row--loading">Loading…</div>
      ) : rootEntries.length === 0 ? (
        <div className="filetree__row filetree__row--empty">(empty)</div>
      ) : (
        renderEntries(rootEntries, '', 0)
      )}
    </div>
  )
}
