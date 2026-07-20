import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Spawn args per platform. A macOS pane that isn't a LOGIN shell never sources
// ~/.zprofile — where Homebrew's own install docs put `eval "$(brew shellenv)"`,
// and where most nvm/conda setups live. The pane then has no /opt/homebrew/bin,
// so `claude` is missing inside Monad while working fine in iTerm/Ghostty/
// Terminal.app, all of which spawn login shells. That was the reported bug.

// Pretend every candidate shell exists, so the POSIX branch is exercisable from
// a Windows dev machine and from CI. Injected rather than mocked: vitest
// externalizes node builtins, so vi.mock('fs') never reaches shells.ts.
const allExist = (): boolean => true

const setPlatform = (value: string): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

const realPlatform = process.platform

describe('detectShells spawn args', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    setPlatform(realPlatform)
  })

  it('gives every macOS shell the login flag', async () => {
    setPlatform('darwin')
    process.env.SHELL = '/bin/zsh'
    const { detectShells } = await import('./shells')

    const shells = detectShells(allExist)
    expect(shells.length).toBeGreaterThan(0)
    for (const sh of shells) {
      expect(sh.args, `${sh.id} must be a login shell`).toContain('-l')
    }
  })

  it('gives Linux shells the login flag too', async () => {
    setPlatform('linux')
    process.env.SHELL = '/bin/bash'
    const { detectShells } = await import('./shells')

    const shells = detectShells(allExist)
    // Length guard first: .every() on an empty array is vacuously true, which
    // would turn a detection failure into a passing test.
    expect(shells.length).toBeGreaterThan(0)
    expect(shells.every((s) => s.args.includes('-l'))).toBe(true)
  })

  it('does not add -l on Windows, where it is meaningless', async () => {
    setPlatform('win32')
    const { detectShells } = await import('./shells')

    const shells = detectShells(allExist)
    const ps = shells.find((s) => s.id === 'powershell')
    expect(ps?.args).toEqual([])
    // Git Bash is the exception that already worked: it is a POSIX shell on
    // Windows and has always been spawned login+interactive.
    const gitBash = shells.find((s) => s.id === 'gitbash')
    if (gitBash) expect(gitBash.args).toEqual(['-l', '-i'])
  })

  it('still labels the default shell from $SHELL', async () => {
    setPlatform('darwin')
    process.env.SHELL = '/opt/homebrew/bin/fish'
    const { detectShells } = await import('./shells')

    const def = detectShells(allExist).find((s) => s.id === 'default')
    expect(def?.label).toBe('Default (fish)')
    // fish accepts -l as well; the flag is uniform across POSIX shells.
    expect(def?.args).toEqual(['-l'])
  })
})
