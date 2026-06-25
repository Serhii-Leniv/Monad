import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { IconClose } from './Icons'

function lineClass(l: string): string {
  if (
    l.startsWith('diff --git') ||
    l.startsWith('index ') ||
    l.startsWith('--- ') ||
    l.startsWith('+++ ') ||
    l.startsWith('new file') ||
    l.startsWith('deleted file') ||
    l.startsWith('rename ') ||
    l.startsWith('similarity ')
  )
    return 'diff__line diff__line--meta'
  if (l.startsWith('@@')) return 'diff__line diff__line--hunk'
  if (l.startsWith('+')) return 'diff__line diff__line--add'
  if (l.startsWith('-')) return 'diff__line diff__line--del'
  return 'diff__line'
}

/** Review one agent's worktree changes, then merge into the base branch or discard. */
export default function DiffPanel(): JSX.Element {
  const id = useStore((s) => s.diffAgentId) as string
  const label = useStore((s) => s.agents.find((a) => a.id === id)?.label ?? 'Terminal')
  const projectPath = useStore((s) => s.projectPath)
  const baseBranch = useStore((s) => s.baseBranch)
  const setDiffAgentId = useStore((s) => s.setDiffAgentId)
  const removeAgent = useStore((s) => s.removeAgent)

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
      setMessage(`Merge ${d.branch.replace(/^canvas\//, '') || label}`)
    })
  }

  useEffect(load, [id, projectPath])

  const lines = useMemo(() => (diff?.diff ? diff.diff.split('\n') : []), [diff])
  const hasChanges = !!diff && (diff.hasChanges || diff.untracked.length > 0)

  const doMerge = async (): Promise<void> => {
    if (!projectPath) return
    setBusy(true)
    setError(null)
    const r = await window.api.git.merge(projectPath, id, message.trim() || `Merge ${diff?.branch}`)
    setBusy(false)
    if (r.ok) setMerged(true)
    else setError(r.error || 'Merge failed')
  }

  const doDiscard = (): void => {
    const ok = window.confirm(
      `Discard “${label}”? Its branch and worktree will be deleted — committed and uncommitted work on it is lost.`
    )
    if (ok) {
      removeAgent(id)
      close()
    }
  }

  return (
    <div className="modal" onPointerDown={close}>
      <div className="review" onPointerDown={(e) => e.stopPropagation()}>
        <div className="review__head">
          <div className="review__title">
            <span className="review__name">{label}</span>
            {diff && (
              <span className="review__branch">
                {diff.branch.replace(/^canvas\//, '')}
                {diff.base ? ` → ${diff.base}` : ''}
              </span>
            )}
          </div>
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
            <div className="review__empty">No changes on this branch yet.</div>
          ) : (
            <>
              {diff!.untracked.length > 0 && (
                <div className="review__untracked">
                  {diff!.untracked.map((f) => (
                    <div key={f} className="diff__line diff__line--new">
                      + {f} <span className="diff__tag">(new file)</span>
                    </div>
                  ))}
                </div>
              )}
              {lines.map((l, i) => (
                <div key={i} className={lineClass(l)}>
                  {l || ' '}
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
