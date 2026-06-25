import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'

const pexec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexec('git', args, {
    cwd,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
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

function shortId(agentId: string): string {
  return agentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
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
}

/** An agent's changes (committed + uncommitted in its worktree) vs the base branch. */
export async function getAgentDiff(
  repoRoot: string,
  agentId: string,
  baseBranch: string | null
): Promise<DiffResult> {
  const { path, branch } = worktreeInfo(repoRoot, agentId)
  let diff = ''
  let untracked: string[] = []
  try {
    const args = ['--no-pager', 'diff']
    if (baseBranch) args.push(baseBranch)
    diff = await git(path, args)
  } catch {
    /* worktree gone or base missing */
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
  return { branch, base: baseBranch, diff, untracked, hasChanges: diff.trim() !== '' || untracked.length > 0 }
}

export interface MergeResult {
  ok: boolean
  error?: string
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
    return { ok: false, error: errText(e) }
  }
  try {
    await git(repoRoot, ['merge', '--no-ff', branch, '-m', `Merge ${branch}`])
    return { ok: true }
  } catch (e) {
    try {
      await git(repoRoot, ['merge', '--abort'])
    } catch {
      /* nothing to abort */
    }
    return { ok: false, error: errText(e) }
  }
}

function errText(e: unknown): string {
  const err = e as { stderr?: string; message?: string }
  return (err.stderr || err.message || String(e)).trim()
}
