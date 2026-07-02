import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'

const pexec = promisify(execFile)

async function git(cwd: string, args: string[], opts?: { maxBuffer?: number }): Promise<string> {
  const { stdout } = await pexec('git', args, {
    cwd,
    windowsHide: true,
    maxBuffer: opts?.maxBuffer ?? 16 * 1024 * 1024
  })
  return stdout
}

export interface GitInfo {
  isGit: boolean
  repoRoot: string | null
  branch: string | null
}

export async function getGitInfo(dir: string): Promise<GitInfo> {
  try {
    const inside = (await git(dir, ['rev-parse', '--is-inside-work-tree'])).trim()
    if (inside !== 'true') return { isGit: false, repoRoot: null, branch: null }
    const repoRoot = (await git(dir, ['rev-parse', '--show-toplevel'])).trim()
    let branch: string | null = null
    try {
      branch = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    } catch {
      /* repo with no commits yet */
    }
    return { isGit: true, repoRoot, branch }
  } catch {
    return { isGit: false, repoRoot: null, branch: null }
  }
}

export async function getRepoRootSafe(dir: string): Promise<string | null> {
  return (await getGitInfo(dir)).repoRoot
}

// 12 chars of the (already-unique) agent UUID — long enough that two agents in a
// session can't collide onto the same branch/worktree, short enough to stay readable.
function shortId(agentId: string): string {
  return agentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
}

/** Deterministic worktree location/branch for an agent, kept OUTSIDE the repo
 *  (sibling folder) so the agent never sees nested worktrees as untracked. */
export function worktreeInfo(
  repoRoot: string,
  agentId: string
): { path: string; branch: string; container: string } {
  const short = shortId(agentId)
  const container = join(dirname(repoRoot), '.agent-canvas-worktrees')
  return {
    container,
    path: join(container, `${basename(repoRoot)}-${short}`),
    branch: `canvas/${short}`
  }
}

export interface WorktreeResult {
  path: string
  branch: string
  created: boolean
}

/** Create (or reuse) a git worktree + branch for an agent. Branches off the
 *  repo's current HEAD. Throws if the repo has no commits yet. */
export async function createWorktree(repoRoot: string, agentId: string): Promise<WorktreeResult> {
  const { path, branch } = worktreeInfo(repoRoot, agentId)
  if (existsSync(path)) return { path, branch, created: false }
  try {
    await git(repoRoot, ['worktree', 'add', path, '-b', branch])
  } catch {
    // Branch already exists from a previous session — attach to it.
    await git(repoRoot, ['worktree', 'add', path, branch])
  }
  return { path, branch, created: true }
}

export async function removeWorktree(repoRoot: string, agentId: string): Promise<void> {
  const { path, branch } = worktreeInfo(repoRoot, agentId)
  try {
    await git(repoRoot, ['worktree', 'remove', '--force', path])
  } catch {
    /* not registered / already gone */
  }
  try {
    await git(repoRoot, ['branch', '-D', branch])
  } catch {
    /* branch already deleted */
  }
  try {
    await git(repoRoot, ['worktree', 'prune'])
  } catch {
    /* ignore */
  }
}

export async function listWorktrees(repoRoot: string): Promise<string[]> {
  try {
    const out = await git(repoRoot, ['worktree', 'list', '--porcelain'])
    return out
      .split('\n')
      .filter((l) => l.startsWith('worktree '))
      .map((l) => l.slice('worktree '.length).trim())
  } catch {
    return []
  }
}

export async function pruneWorktrees(repoRoot: string): Promise<void> {
  try {
    await git(repoRoot, ['worktree', 'prune'])
  } catch {
    /* ignore */
  }
}

export interface DiffResult {
  branch: string
  base: string | null
  diff: string
  untracked: string[]
  hasChanges: boolean
  /** Set when the diff couldn't be produced (e.g. too large to buffer), so the
   *  UI can say so instead of silently showing "No changes". */
  error?: string
}

/** An agent's changes (committed + uncommitted in its worktree) vs the base branch. */
export async function getAgentDiff(
  repoRoot: string,
  agentId: string,
  baseBranch: string | null
): Promise<DiffResult> {
  const { path, branch } = worktreeInfo(repoRoot, agentId)
  let diff = ''
  let error: string | undefined
  let untracked: string[] = []
  try {
    const args = ['--no-pager', 'diff']
    if (baseBranch) {
      // Diff from where this branch FORKED (merge-base), not the moving base tip.
      // Plain `git diff <base>` (two-dot) turns any commits the user later adds to
      // base into spurious reverse-deletions — inflating the close/merge change
      // count and making the review unreadable. merge-base..worktree shows only
      // this branch's own work (committed AND uncommitted).
      let from = baseBranch
      try {
        const mb = (await git(path, ['merge-base', baseBranch, 'HEAD'])).trim()
        if (mb) from = mb
      } catch {
        /* no common ancestor (fresh/unborn branch) — fall back to the base ref */
      }
      args.push(from)
    }
    // 64MB — a generous ceiling so normal feature-sized diffs always render;
    // beyond it we surface a clear message rather than a false "No changes".
    diff = await git(path, args, { maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    // Only a buffer overflow is actionable to the user; other failures (base
    // ref missing on a fresh repo, worktree gone) stay quiet and fall through
    // to the untracked-file listing below.
    if (/maxBuffer/i.test(errText(e))) {
      error = 'This change set is too large to display here — review it in your editor or terminal.'
    }
  }
  try {
    const status = await git(path, ['status', '--porcelain'])
    untracked = status
      .split('\n')
      .filter((l) => l.startsWith('??'))
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
  } catch {
    /* ignore */
  }
  return {
    branch,
    base: baseBranch,
    diff,
    untracked,
    hasChanges: diff.trim() !== '' || untracked.length > 0,
    error
  }
}

export interface MergeResult {
  ok: boolean
  error?: string
  /** The branch actually merged into — the main worktree's HEAD at merge time. */
  mergedInto?: string
}

/** Commit any pending work in the agent's worktree, then merge its branch into
 *  the base branch in the main worktree. Aborts cleanly on conflict. */
export async function mergeAgent(
  repoRoot: string,
  agentId: string,
  message: string
): Promise<MergeResult> {
  const { path, branch } = worktreeInfo(repoRoot, agentId)
  try {
    await git(path, ['add', '-A'])
    const staged = await git(path, ['status', '--porcelain'])
    if (staged.trim() !== '') {
      await git(path, ['commit', '-m', message || `Work from ${branch}`])
    }
  } catch (e) {
    return { ok: false, error: friendlyGitError(e) }
  }
  try {
    await git(repoRoot, ['merge', '--no-ff', branch, '-m', `Merge ${branch}`])
    // Report the branch we actually merged into. `git merge` targets whatever is
    // checked out in the main worktree NOW, which may differ from the base the UI
    // captured at project open (the user could have switched branches since).
    let mergedInto: string | undefined
    try {
      mergedInto = (await git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || undefined
    } catch {
      /* detached HEAD / unusual state — leave undefined */
    }
    return { ok: true, mergedInto }
  } catch (e) {
    try {
      await git(repoRoot, ['merge', '--abort'])
    } catch {
      /* nothing to abort */
    }
    return { ok: false, error: friendlyGitError(e) }
  }
}

function errText(e: unknown): string {
  const err = e as { stderr?: string; message?: string }
  return (err.stderr || err.message || String(e)).trim()
}

/** Map a raw git failure to a message a non-expert can act on. Falls back to the
 *  first line of git's own output. */
export function friendlyGitError(e: unknown): string {
  const err = e as { code?: string; stderr?: string; message?: string }
  const raw = errText(e)
  // execFile couldn't find the git binary at all.
  if (err.code === 'ENOENT' || /\bENOENT\b/.test(raw) || /is not recognized|not found/i.test(raw)) {
    return 'Git isn’t installed or isn’t on your PATH. Install Git, then reopen this project.'
  }
  if (/does not have any commits yet|ambiguous argument 'HEAD'|invalid reference: HEAD|unknown revision/i.test(raw)) {
    return 'This repository has no commits yet — make an initial commit, then add an isolated agent.'
  }
  if (/is already checked out|already used by worktree/i.test(raw)) {
    return 'That branch is already checked out in another worktree.'
  }
  if (/your local changes|would be overwritten|not something we can merge/i.test(raw)) {
    return 'Couldn’t merge cleanly into your working tree — commit or stash your changes first.'
  }
  // Otherwise surface git's own first line, trimmed of the noisy "fatal: " prefix.
  return raw.split('\n')[0].replace(/^fatal:\s*/i, '').trim() || 'Git command failed.'
}
