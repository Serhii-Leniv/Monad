import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/**
 * macOS/Linux GUI apps inherit launchd's minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin)
 * and never source the user's rc files. Homebrew, nvm/fnm/volta shims, ~/.local/bin
 * and ~/.claude/local are all invisible, so agent CLIs look "not installed" when
 * Monad is opened from Finder/Dock but work fine when opened from a terminal.
 *
 * We recover the real PATH by asking the login shell for it, then union in the
 * well-known install dirs as a backstop for when that fails or times out.
 */

const SENTINEL = '__MONAD_PATH__'

/** Well-known agent-CLI install dirs, used when the shell harvest comes up short. */
function fallbackDirs(): string[] {
  const home = homedir()
  return [
    '/opt/homebrew/bin', // Homebrew on Apple Silicon
    '/opt/homebrew/sbin',
    '/usr/local/bin', // Homebrew on Intel, and most installer scripts
    '/usr/local/sbin',
    join(home, '.local', 'bin'),
    join(home, 'bin'),
    join(home, '.claude', 'local'), // Claude Code's own local installer
    join(home, '.bun', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, '.deno', 'bin'),
    join(home, '.volta', 'bin'),
    '/usr/local/opt/node/bin'
  ]
}

/**
 * Ask the user's login shell what PATH it sets. Runs interactively (-i) because
 * zsh users overwhelmingly put PATH in .zshrc, which a non-interactive login
 * shell would skip. The sentinel lets us ignore anything the rc files print.
 */
function harvestFromLoginShell(): string | null {
  const shell = process.env.SHELL
  if (!shell || !existsSync(shell)) return null

  // fish doesn't accept a bundled -ilc; it also has no need for -i to see PATH.
  const isFish = shell.endsWith('/fish')
  const args = isFish ? ['-l', '-c', `echo ${SENTINEL}$PATH`] : ['-ilc', `echo ${SENTINEL}"$PATH"`]

  try {
    const out = execFileSync(shell, args, {
      encoding: 'utf8',
      timeout: 3000,
      // A shell that decides it's interactive can block forever on stdin.
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const line = out.split('\n').find((l) => l.includes(SENTINEL))
    if (!line) return null
    const path = line.slice(line.indexOf(SENTINEL) + SENTINEL.length).trim()
    return path || null
  } catch {
    // Timed out, shell missing, rc file exited non-zero — fall back silently.
    return null
  }
}

let cached: string | null = null

/**
 * The PATH agent detection and PTY spawns should use. Computed once per run;
 * on Windows this is just process.env.PATH, which is already correct there.
 */
/**
 * Union the three PATH sources into one, preserving precedence and dropping
 * duplicates/empties. Pure and separated from the shell + filesystem probing
 * above so it can be tested on any platform.
 */
export function mergePath(shellPath: string | null, envPath: string, fallbacks: string[]): string {
  const seen = new Set<string>()
  const dirs: string[] = []
  const add = (dir: string): void => {
    // Trailing slashes would otherwise let /usr/bin and /usr/bin/ both survive.
    const d = dir.trim().replace(/\/+$/, '')
    if (!d || seen.has(d)) return
    seen.add(d)
    dirs.push(d)
  }

  // Order matters: shell entries first, so a user's own PATH ordering decides
  // which of two installed copies of a binary wins. Fallbacks are last resort.
  for (const d of (shellPath || '').split(':')) add(d)
  for (const d of envPath.split(':')) add(d)
  for (const d of fallbacks) add(d)

  return dirs.join(':')
}

export function resolvedPath(): string {
  if (cached !== null) return cached
  if (process.platform === 'win32') {
    cached = process.env.PATH || ''
    return cached
  }

  cached = mergePath(
    harvestFromLoginShell(),
    process.env.PATH || '',
    fallbackDirs().filter((d) => existsSync(d))
  )
  return cached
}

/**
 * Apply the resolved PATH to this process, so every child (PTYs, execFile)
 * inherits it without each call site having to remember.
 */
export function applyResolvedPath(): void {
  if (process.platform === 'win32') return
  process.env.PATH = resolvedPath()
}
