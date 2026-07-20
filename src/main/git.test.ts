import { describe, it, expect } from 'vitest'
import { unquoteGitPath, worktreeInfo } from './git'

// git quotes any path with non-ASCII or control characters in C style. Decoding
// it wrong means the diff panel shows mojibake and, worse, "apply selected
// files" targets a path that doesn't exist.
describe('unquoteGitPath', () => {
  it('passes through an unquoted path unchanged', () => {
    expect(unquoteGitPath('src/main/git.ts')).toBe('src/main/git.ts')
    // A quote that isn't a wrapping pair is data, not quoting.
    expect(unquoteGitPath('say"hi".txt')).toBe('say"hi".txt')
  })

  it('decodes octal escapes as UTF-8 bytes, not characters', () => {
    // "é" is two bytes (C3 A9); decoding per-byte would yield "Ã©".
    expect(unquoteGitPath('"caf\\303\\251.txt"')).toBe('café.txt')
    expect(unquoteGitPath('"\\320\\237\\321\\200\\320\\270.md"')).toBe('При.md')
  })

  it('decodes the named escapes', () => {
    expect(unquoteGitPath('"a\\tb.txt"')).toBe('a\tb.txt')
    expect(unquoteGitPath('"a\\nb.txt"')).toBe('a\nb.txt')
    expect(unquoteGitPath('"say \\"hi\\".txt"')).toBe('say "hi".txt')
    expect(unquoteGitPath('"back\\\\slash.txt"')).toBe('back\\slash.txt')
  })

  it('stops cleanly on a malformed trailing backslash', () => {
    expect(() => unquoteGitPath('"broken\\"')).not.toThrow()
  })
})

// The worktree layout is a contract: change it and existing worktrees orphan.
describe('worktreeInfo', () => {
  it('places the worktree in a sibling container, never inside the repo', () => {
    const info = worktreeInfo('/home/u/proj', 'abcdef01-2345-6789-abcd-ef0123456789')
    // Nested worktrees would show up as untracked files to the agent itself.
    expect(info.path.startsWith('/home/u/proj')).toBe(false)
    expect(info.container.replace(/\\/g, '/')).toBe('/home/u/.monad-worktrees')
  })

  it('derives branch and path from the same 12-char id, stripped of dashes', () => {
    const info = worktreeInfo('/home/u/proj', 'abcdef01-2345-6789')
    expect(info.branch).toBe('canvas/abcdef012345')
    expect(info.path.replace(/\\/g, '/')).toBe('/home/u/.monad-worktrees/proj-abcdef012345')
  })

  it('is deterministic — the same agent always resolves to the same worktree', () => {
    const a = worktreeInfo('/home/u/proj', 'agent-1')
    const b = worktreeInfo('/home/u/proj', 'agent-1')
    expect(a).toEqual(b)
  })

  it('gives two agents in one repo distinct worktrees and branches', () => {
    const a = worktreeInfo('/home/u/proj', 'aaaaaaaaaaaaaa')
    const b = worktreeInfo('/home/u/proj', 'bbbbbbbbbbbbbb')
    expect(a.path).not.toBe(b.path)
    expect(a.branch).not.toBe(b.branch)
  })
})
