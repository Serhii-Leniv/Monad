import { describe, it, expect } from 'vitest'
import { normPath, samePath } from './pathUtil'

// These back the workspace dedupe checks. When they were `===`, D:\repo and
// D:/repo opened as two tabs whose agents fought over one worktree container.
describe('samePath', () => {
  it('treats separator variants as the same folder', () => {
    expect(samePath('D:\\repo', 'D:/repo')).toBe(true)
    expect(samePath('D:\\a\\b', 'D:/a/b')).toBe(true)
  })

  it('ignores a trailing separator', () => {
    expect(samePath('D:\\repo\\', 'D:\\repo')).toBe(true)
    expect(samePath('/home/x/', '/home/x')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(samePath('D:\\Repo', 'd:\\repo')).toBe(true)
  })

  it('still distinguishes genuinely different folders', () => {
    expect(samePath('D:\\repo', 'D:\\repo2')).toBe(false)
    expect(samePath('D:\\a\\b', 'D:\\a')).toBe(false)
  })

  // A folder-less workspace has defaultPath null; two of them must never be
  // considered "the same folder" and collapse into one tab.
  it('never matches when either side is missing', () => {
    expect(samePath(null, null)).toBe(false)
    expect(samePath(undefined, undefined)).toBe(false)
    expect(samePath('', '')).toBe(false)
    expect(samePath('D:\\repo', null)).toBe(false)
  })
})

describe('normPath', () => {
  it('collapses repeated trailing separators', () => {
    expect(normPath('D:\\repo\\\\')).toBe('d:/repo')
  })

  it('leaves an interior separator run alone', () => {
    // Only trailing separators are trimmed — this is a comparison key, not a
    // path canonicaliser, and must not rewrite UNC-ish or doubled interiors.
    expect(normPath('D:\\a\\\\b')).toBe('d:/a//b')
  })
})
