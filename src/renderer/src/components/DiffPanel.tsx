import { useEffect, useMemo, useState } from 'react'
import { useStore, displayBranch } from '../store'
import { IconClose } from './Icons'

type FileStatus = 'added' | 'deleted' | 'renamed' | 'modified'

interface FileGroup {
  path: string
  status: FileStatus
  adds: number
  dels: number
  /** Hunk + content lines only — git's index/mode/+++/--- plumbing is stripped. */
  lines: string[]
}

function lineClass(l: string): string {
  if (l.startsWith('@@')) return 'diff__line diff__line--hunk'
  if (l.startsWith('+')) return 'diff__line diff__line--add'
  if (l.startsWith('-')) return 'diff__line diff__line--del'
  return 'diff__line'
}

/** One-letter status badge → its tone. */
const STATUS_META: Record<FileStatus, { glyph: string; cls: string; title: string }> = {
  added: { glyph: 'A', cls: 'review__fstat--add', title: 'Added' },
  deleted: { glyph: 'D', cls: 'review__fstat--del', title: 'Deleted' },
  renamed: { glyph: 'R', cls: 'review__fstat--ren', title: 'Renamed' },
  modified: { glyph: 'M', cls: 'review__fstat--mod', title: 'Modified' }
}

/**
 * Split a unified diff into per-file groups with +/- tallies, dropping git's
 * plumbing lines (index/mode/---/+++) so the body reads like a clean review
 * instead of a raw patch dump.
 */
function parseDiff(text: string): FileGroup[] {
  const groups: FileGroup[] = []
  let cur: FileGroup | null = null
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git')) {
      if (cur) groups.push(cur)
      const m = raw.match(/ b\/(.+)$/)
      cur = {
        path: m ? m[1] : raw.replace(/^diff --git /, ''),
        status: 'modified',
        adds: 0,
        dels: 0,
        lines: []
      }
      continue
    }
    if (!cur) continue
    if (raw.startsWith('new file')) {
      cur.status = 'added'
      continue
    }
    if (raw.startsWith('deleted file')) {
      cur.status = 'deleted'
      continue
    }
    if (raw.startsWith('rename ')) cur.status = 'renamed'
    // Drop git's plumbing — the file header already conveys all of it.
    if (
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('old mode') ||
      raw.startsWith('new mode') ||
      raw.startsWith('similarity ') ||
      raw.startsWith('rename ') ||
      raw.startsWith('\\ No newline')
    )
      continue
    if (raw.startsWith('+')) cur.adds++
    else if (raw.startsWith('-')) cur.dels++
    cur.lines.push(raw)
  }
  if (cur) groups.push(cur)
  return groups
}

/** Review one agent's worktree changes, then merge into the base branch or discard. */
export default function DiffPanel(): JSX.Element {
  const id = useStore((s) => s.diffAgentId) as string
  const label = useStore((s) => s.agents.find((a) => a.id === id)?.label ?? 'Terminal')
  const projectPath = useStore((s) => s.projectPath)
  const baseBranch = useStore((s) => s.baseBranch)
  const setDiffAgentId = useStore((s) => s.setDiffAgentId)
  const removeAgent = useStore((s) => s.removeAgent)
  const pushToast = useStore((s) => s.pushToast)

  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [merged, setMerged] = useState(false)

  const close = (): void => setDiffAgentId(null)

  const load = (): void => {
    if (!projectPath) return
    setLoading(true)
    setError(null)
    void window.api.git.diff(projectPath, id).then((d) => {
      setDiff(d)
      setLoading(false)
      setMessage(`Merge ${displayBranch(d.branch) || label}`)
    })
  }

  useEffect(load, [id, projectPath])

  const groups = useMemo(() => (diff?.diff ? parseDiff(diff.diff) : []), [diff])
  const totals = useMemo(() => {
    const adds = groups.reduce((n, g) => n + g.adds, 0)
    const dels = groups.reduce((n, g) => n + g.dels, 0)
    const files = groups.length + (diff?.untracked.length ?? 0)
    return { adds, dels, files }
  }, [groups, diff])
  const hasChanges = !!diff && (diff.hasChanges || diff.untracked.length > 0)

  const doMerge = async (): Promise<void> => {
    if (!projectPath) return
    setBusy(true)
    setError(null)
    const r = await window.api.git.merge(projectPath, id, message.trim() || `Merge ${diff?.branch}`)
    setBusy(false)
    if (r.ok) {
      setMerged(true)
      pushToast(`Merged “${label}” into ${baseBranch || 'base'}`, 'success')
    } else setError(r.error || 'Merge failed')
  }

  const doDiscard = (): void => {
    const ok = window.confirm(
      `Discard “${label}”? Its branch and worktree will be deleted — committed and uncommitted work on it is lost.`
    )
    if (ok) {
      removeAgent(id)
      pushToast(`Discarded “${label}”`, 'info')
      close()
    }
  }

  return (
    <div className="modal" onPointerDown={close}>
      <div
        className={'review' + (merged ? ' is-merged' : '')}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="review__head">
          <div className="review__title">
            <span className="review__name">{label}</span>
            {diff && (
              <span className="review__branch">
                {displayBranch(diff.branch)}
                {diff.base ? ` → ${diff.base}` : ''}
              </span>
            )}
          </div>
          {!loading && !merged && hasChanges && (
            <div className="review__summary" title={`${totals.files} file${totals.files === 1 ? '' : 's'} changed`}>
              <span className="review__sum-files">
                {totals.files} {totals.files === 1 ? 'file' : 'files'}
              </span>
              {totals.adds > 0 && <span className="review__sum-add">+{totals.adds}</span>}
              {totals.dels > 0 && <span className="review__sum-del">−{totals.dels}</span>}
            </div>
          )}
          <button className="settings__close" onClick={close} title="Close">
            <IconClose size={16} />
          </button>
        </div>

        <div className="review__body">
          {loading ? (
            <div className="review__empty">Loading changes…</div>
          ) : merged ? (
            <div className="review__empty review__empty--ok">
              ✓ Merged into {baseBranch || 'the base branch'}.
            </div>
          ) : !hasChanges ? (
            <div className="review__empty">
              {diff?.error ? diff.error : 'No changes on this branch yet.'}
            </div>
          ) : (
            <>
              {diff!.error && <div className="review__note">{diff!.error}</div>}
              {diff!.untracked.length > 0 && (
                <div className="review__file review__file--untracked">
                  <span className="review__fstat review__fstat--add" title="New file">
                    A
                  </span>
                  <span className="review__fname">
                    {diff!.untracked.length} new {diff!.untracked.length === 1 ? 'file' : 'files'}
                  </span>
                </div>
              )}
              {diff!.untracked.length > 0 && (
                <div className="review__untracked">
                  {diff!.untracked.map((f) => (
                    <div key={f} className="diff__line diff__line--new">
                      + {f}
                    </div>
                  ))}
                </div>
              )}
              {groups.map((g, gi) => (
                <div key={g.path + gi} className="review__group">
                  <div className="review__file">
                    <span
                      className={'review__fstat ' + STATUS_META[g.status].cls}
                      title={STATUS_META[g.status].title}
                    >
                      {STATUS_META[g.status].glyph}
                    </span>
                    <span className="review__fname" title={g.path}>
                      {g.path}
                    </span>
                    <span className="review__fcount">
                      {g.adds > 0 && <span className="review__sum-add">+{g.adds}</span>}
                      {g.dels > 0 && <span className="review__sum-del">−{g.dels}</span>}
                    </span>
                  </div>
                  {g.lines.map((l, i) => (
                    <div key={i} className={lineClass(l)}>
                      {l || ' '}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {error && <div className="review__error">{error}</div>}

        <div className="review__foot">
          {merged ? (
            <>
              <button className="review__btn" onClick={close}>
                Done
              </button>
              <button
                className="review__btn review__btn--merge"
                onClick={() => {
                  removeAgent(id)
                  close()
                }}
                title="Merged — remove the terminal and clean up its worktree"
              >
                Remove terminal
              </button>
            </>
          ) : (
            <>
              <input
                className="review__msg"
                value={message}
                placeholder="Commit message"
                onChange={(e) => setMessage(e.target.value)}
                disabled={busy || !hasChanges}
              />
              <button className="review__btn review__btn--discard" onClick={doDiscard} disabled={busy}>
                Discard
              </button>
              <button
                className="review__btn review__btn--merge"
                onClick={doMerge}
                disabled={busy || !hasChanges}
              >
                {busy ? 'Merging…' : 'Merge'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
