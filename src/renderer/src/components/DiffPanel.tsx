import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, activeWs, agentPath, displayBranch } from '../store'
import { celebrate } from '../celebrate'
import { IconClose, IconRefresh } from './Icons'
import Modal from './Modal'

type FileStatus = 'added' | 'deleted' | 'renamed' | 'modified'

interface FileGroup {
  path: string
  /** For renames: the pre-rename path — applying must also REMOVE this one. */
  oldPath?: string
  status: FileStatus
  adds: number
  dels: number
  /** Hunk + content lines only — git's index/mode/+++/--- plumbing is stripped. */
  lines: string[]
}

/** Decode a git C-quoted path (`"a\303\251.txt"` → `aé.txt`). Mirrors
 *  unquoteGitPath in src/main/git.ts — duplicated because the renderer can't
 *  import main-process code; octal escapes are UTF-8 BYTES, so collect bytes
 *  and decode once at the end (TextEncoder/Decoder instead of node's Buffer). */
function unquoteGitPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw
  const inner = raw.slice(1, -1)
  const enc = new TextEncoder()
  const bytes: number[] = []
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (c !== '\\') {
      for (const b of enc.encode(c)) bytes.push(b)
      continue
    }
    const n = inner[++i]
    if (n === undefined) break // malformed (trailing backslash) — stop cleanly
    if (n >= '0' && n <= '7') {
      bytes.push(parseInt(inner.slice(i, i + 3), 8))
      i += 2
    } else {
      const esc: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' }
      for (const b of enc.encode(esc[n] ?? n)) bytes.push(b)
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

/** Path from a `diff --git a/… b/…` header. Git C-quotes each side when the
 *  path has non-ASCII/special chars — `"b/…"` must be matched and unquoted, or
 *  the garbled quoted pair becomes the "path" (breaking both display and the
 *  per-file apply pathspec). Plain headers keep the old everything-after-" b/"
 *  behavior. */
function pathFromDiffHeader(raw: string): string | null {
  const rest = raw.slice('diff --git '.length)
  const quoted = rest.match(/"b\/((?:[^"\\]|\\.)*)"\s*$/)
  if (quoted) return unquoteGitPath(`"${quoted[1]}"`)
  const plain = rest.match(/ b\/(.+)$/)
  return plain ? plain[1] : null
}

function lineClass(l: string): string {
  if (l.startsWith('@@')) return 'diff__line diff__line--hunk'
  // git's "Binary files a/x and b/x differ" + our synthesized "Binary file x
  // added" (git.ts) — a note about the file, not content; styled as such.
  if (l.startsWith('Binary file')) return 'diff__line diff__line--binary'
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
      cur = {
        path: pathFromDiffHeader(raw) ?? raw.replace(/^diff --git /, ''),
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
    // Renames carry BOTH paths (quoted like the header when special). The `to`
    // side also overrides the header path — for a rename it's the unambiguous
    // new path. doApply needs oldPath: checking out only the new path would
    // leave the old copy in place.
    if (raw.startsWith('rename from ')) {
      cur.status = 'renamed'
      cur.oldPath = unquoteGitPath(raw.slice('rename from '.length))
      continue
    }
    if (raw.startsWith('rename to ')) {
      cur.status = 'renamed'
      cur.path = unquoteGitPath(raw.slice('rename to '.length))
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
  const id = useStore((s) => activeWs(s)?.diffAgentId) as string
  const label = useStore((s) => activeWs(s)?.agents.find((a) => a.id === id)?.label ?? 'Terminal')
  const status = useStore((s) => activeWs(s)?.agents.find((a) => a.id === id)?.status)
  // The repo being reviewed is the one THIS agent works in — with per-agent
  // folders that can differ from the workspace default, and diffing/merging
  // against the wrong repo would be destructive rather than merely wrong.
  const projectPath = useStore((s) => {
    const ws = activeWs(s)
    return agentPath(ws, ws?.agents.find((a) => a.id === id))
  })
  const baseBranch = useStore((s) => activeWs(s)?.baseBranch ?? null)
  const setDiffAgentId = useStore((s) => s.setDiffAgentId)
  const removeAgent = useStore((s) => s.removeAgent)
  const pushToast = useStore((s) => s.pushToast)

  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictFiles, setConflictFiles] = useState<string[] | null>(null)
  const [merged, setMerged] = useState(false)
  /** > 0 after a PARTIAL apply — the success copy differs (branch stays unmerged). */
  const [appliedCount, setAppliedCount] = useState(0)
  const [mergedInto, setMergedInto] = useState<string | null>(null)
  /** Paths the user UNchecked — default is everything selected. */
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  // Once the user has typed in the message box, reloads must not clobber it.
  const messageEdited = useRef(false)

  const close = (): void => setDiffAgentId(null)

  // Monotonic request token. The manual refresh button, the auto-refresh on
  // settle, and the id/path effect can all have a git.diff in flight at once;
  // without this the LAST TO RESOLVE won, not the last requested, so the panel
  // could settle on a stale diff. It also stops setState after unmount.
  const loadSeq = useRef(0)

  const load = (): void => {
    if (!projectPath) {
      // Nothing to diff against — don't leave the body stuck on "Loading changes…".
      setLoading(false)
      setError('No project is open.')
      return
    }
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    window.api.git
      .diff(projectPath, id)
      .then((d) => {
        if (seq !== loadSeq.current) return
        setDiff(d)
        if (!messageEdited.current) setMessage(`Merge ${displayBranch(d.branch) || label}`)
      })
      // A rejected diff (git missing, worktree gone) must clear the spinner too.
      .catch((e) => {
        if (seq !== loadSeq.current) return
        setError(e instanceof Error ? e.message : 'Couldn’t load changes')
      })
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false)
      })
  }

  useEffect(load, [id, projectPath])

  // Invalidate any in-flight load on unmount.
  useEffect(() => () => void ++loadSeq.current, [])

  // Auto-refresh when the agent settles (working → idle/attention) while the
  // review is open — whatever's on screen is likely stale by then.
  const prevStatus = useRef(status)
  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = status
    if (
      status !== prev &&
      (status === 'idle' || status === 'attention') &&
      !busy &&
      !merged &&
      !loading
    )
      load()
  }, [status])

  const groups = useMemo(() => (diff?.diff ? parseDiff(diff.diff) : []), [diff])
  const totals = useMemo(() => {
    const adds = groups.reduce((n, g) => n + g.adds, 0)
    const dels = groups.reduce((n, g) => n + g.dels, 0)
    return { adds, dels, files: groups.length }
  }, [groups])
  const hasChanges = !!diff && diff.hasChanges

  // Per-file selection: which groups take part in the merge/apply. Everything
  // is included until the user unticks a file.
  const selectedGroups = useMemo(
    () => groups.filter((g) => !deselected.has(g.path)),
    [groups, deselected]
  )
  const allSelected = selectedGroups.length === groups.length
  const selCount = selectedGroups.length
  const toggleFile = (path: string): void =>
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const doMerge = async (): Promise<void> => {
    if (!projectPath) return
    setBusy(true)
    setError(null)
    setConflictFiles(null)
    // try/finally: a rejected invoke (main-process throw, window teardown) used
    // to leave `busy` latched, disabling the entire review UI at "Merging…" with
    // no way out but reopening the panel.
    try {
      const r = await window.api.git.merge(projectPath, id, message.trim() || `Merge ${diff?.branch}`)
      if (r.ok) {
        setMerged(true)
        setMergedInto(r.mergedInto ?? null)
        celebrate()
        // Show the branch actually merged into — it may differ from the base at open
        // if the user switched branches in the main repo since.
        pushToast(`Merged “${label}” into ${r.mergedInto || baseBranch || 'base'}`, 'success')
      } else {
        setError(r.error || 'Merge failed')
        if (r.conflictFiles && r.conflictFiles.length > 0) setConflictFiles(r.conflictFiles)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setBusy(false)
    }
  }

  // Subset selected: apply just those files onto the current branch as a plain
  // commit — the agent's branch stays unmerged.
  const doApply = async (): Promise<void> => {
    if (!projectPath) return
    const paths = selectedGroups.filter((g) => g.status !== 'deleted').map((g) => g.path)
    const deletedPaths = selectedGroups.filter((g) => g.status === 'deleted').map((g) => g.path)
    // A rename is materialize-new + remove-old: `checkout <branch> -- <new>`
    // alone would leave BOTH copies. The old path rides in deletedPaths, so
    // applyAgentFiles `git rm`s it — and its dirty-gate covers it too, refusing
    // if the user has uncommitted changes at the old location.
    for (const g of selectedGroups) {
      if (g.status === 'renamed' && g.oldPath && g.oldPath !== g.path) deletedPaths.push(g.oldPath)
    }
    setBusy(true)
    setError(null)
    setConflictFiles(null)
    try {
      const r = await window.api.git.applyFiles(
        projectPath,
        id,
        paths,
        deletedPaths,
        message.trim() || `Apply files from ${diff?.branch}`
      )
      if (r.ok) {
        setMerged(true)
        setAppliedCount(selCount)
        setMergedInto(r.mergedInto ?? null)
        celebrate()
        pushToast(
          `Applied ${selCount} file${selCount === 1 ? '' : 's'} from “${label}”`,
          'success'
        )
      } else setError(r.error || 'Apply failed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setBusy(false)
    }
  }

  // Two-step destructive confirm, in place of a native window.confirm: the
  // first click arms the button ("Really discard?"), a second within 3s acts.
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const discardTimer = useRef<number>()
  useEffect(() => () => window.clearTimeout(discardTimer.current), [])
  const doDiscard = (): void => {
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      window.clearTimeout(discardTimer.current)
      discardTimer.current = window.setTimeout(() => setConfirmDiscard(false), 3000)
      return
    }
    window.clearTimeout(discardTimer.current)
    removeAgent(id)
    pushToast(`Discarded “${label}”`, 'info')
    close()
  }

  return (
    <Modal
      className={'review' + (merged ? ' is-merged' : '')}
      label={`Review changes: ${label}`}
      onClose={close}
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
              {allSelected
                ? `${totals.files} ${totals.files === 1 ? 'file' : 'files'}`
                : `${selCount} of ${totals.files} files selected`}
            </span>
            {totals.adds > 0 && <span className="review__sum-add">+{totals.adds}</span>}
            {totals.dels > 0 && <span className="review__sum-del">−{totals.dels}</span>}
          </div>
        )}
        <button
          className="settings__close review__refresh"
          onClick={load}
          disabled={loading || busy || merged}
          title="Refresh changes"
        >
          <IconRefresh size={15} />
        </button>
        <button className="settings__close" onClick={close} title="Close">
          <IconClose size={16} />
        </button>
      </div>

      <div className="review__body">
        {loading ? (
          <div className="review__empty">Loading changes…</div>
        ) : merged ? (
          appliedCount > 0 ? (
            <div className="review__empty review__empty--ok">
              ✓ Applied {appliedCount} file{appliedCount === 1 ? '' : 's'} to{' '}
              {mergedInto || baseBranch || 'the current branch'}.
              <br />
              <span className="review__empty-sub">
                This branch still has unmerged work. The terminal and its worktree are
                untouched, so the agent can keep going and you can merge the rest later.
              </span>
            </div>
          ) : (
            <div className="review__empty review__empty--ok">
              ✓ Merged into {mergedInto || baseBranch || 'the base branch'}.
              <br />
              <span className="review__empty-sub">
                The terminal’s worktree is still on disk. Remove it to clean up, or keep it to
                keep working on the branch.
              </span>
            </div>
          )
        ) : !hasChanges ? (
          <div className="review__empty">
            {error ?? diff?.error ?? 'No changes on this branch yet.'}
          </div>
        ) : (
          <>
            {diff!.error && <div className="review__note">{diff!.error}</div>}
            {groups.map((g, gi) => (
              <div key={g.path + gi} className="review__group">
                <div className="review__file">
                  <input
                    type="checkbox"
                    className="review__fcheck"
                    checked={!deselected.has(g.path)}
                    onChange={() => toggleFile(g.path)}
                    disabled={busy}
                    title="Include this file when merging / applying"
                  />
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

      {conflictFiles && !merged ? (
        <div className="review__conflict">
          <div className="review__conflict-title">
            Merge conflict: {conflictFiles.length} file
            {conflictFiles.length === 1 ? '' : 's'} couldn’t merge automatically
          </div>
          <div className="review__conflict-files">
            {conflictFiles.map((f) => (
              <div key={f}>{f}</div>
            ))}
          </div>
          <div className="review__conflict-hint">
            The merge was safely rolled back. {baseBranch || 'your base branch'} is untouched. The
            easiest fix: ask the agent to pull the base branch into its own branch and resolve the
            conflicts there: paste <code>git merge {baseBranch || '<base-branch>'}</code> into its
            terminal, then retry the merge here.
          </div>
        </div>
      ) : (
        error && hasChanges && <div className="review__error">{error}</div>
      )}

      <div className="review__foot">
        {merged ? (
          <>
            <button
              className={'review__btn' + (appliedCount > 0 ? ' review__btn--merge' : '')}
              onClick={close}
              title={
                appliedCount > 0
                  ? 'Keep the terminal and its worktree. The branch still has unmerged work'
                  : 'Keep the terminal and its worktree. You can keep working on this branch'
              }
            >
              Keep terminal
            </button>
            <button
              className={'review__btn' + (appliedCount > 0 ? '' : ' review__btn--merge')}
              onClick={() => {
                removeAgent(id)
                close()
              }}
              title={
                appliedCount > 0
                  ? 'Remove the terminal and delete its worktree + branch. Unmerged work on it is lost'
                  : 'Remove the terminal and delete its now-merged worktree + branch'
              }
            >
              Remove &amp; clean up
            </button>
          </>
        ) : (
          <>
            <input
              className="review__msg"
              value={message}
              placeholder="Merge commit message"
              onChange={(e) => {
                messageEdited.current = true
                setMessage(e.target.value)
              }}
              disabled={busy || !hasChanges}
            />
            <button
              className={'review__btn review__btn--discard' + (confirmDiscard ? ' is-armed' : '')}
              title="Deletes this branch and worktree. Committed and uncommitted work on it is lost"
              onClick={doDiscard}
              disabled={busy}
            >
              {confirmDiscard
                ? `Really discard ${totals.files} file${totals.files === 1 ? '' : 's'}?`
                : 'Discard'}
            </button>
            <button
              className="review__btn review__btn--merge"
              onClick={allSelected ? doMerge : doApply}
              disabled={busy || !hasChanges || selCount === 0}
              title={
                allSelected
                  ? undefined
                  : 'Takes the agent’s version of the selected files onto the current branch as a normal commit, not a merge; the branch stays unmerged'
              }
            >
              {busy
                ? allSelected
                  ? 'Merging…'
                  : 'Applying…'
                : allSelected
                  ? 'Merge'
                  : `Apply ${selCount} file${selCount === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
