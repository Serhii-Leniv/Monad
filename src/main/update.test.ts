import { describe, it, expect } from 'vitest'
import { isNewer } from './update'

// Drives the update banner. A false positive nags forever on the current build;
// a false negative silently strands users on an old version.
describe('isNewer', () => {
  it('compares numerically, not lexically', () => {
    // The classic failure: "0.1.10" < "0.1.9" as strings.
    expect(isNewer('0.1.10', '0.1.9')).toBe(true)
    expect(isNewer('0.1.9', '0.1.10')).toBe(false)
    expect(isNewer('0.2.0', '0.1.25')).toBe(true)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
  })

  it('tolerates a leading v on either side', () => {
    expect(isNewer('v0.1.26', '0.1.25')).toBe(true)
    expect(isNewer('v0.1.25', 'v0.1.25')).toBe(false)
  })

  it('is false for equal versions', () => {
    expect(isNewer('0.1.25', '0.1.25')).toBe(false)
  })

  it('treats a missing trailing segment as zero', () => {
    expect(isNewer('0.2', '0.2.0')).toBe(false)
    expect(isNewer('0.2.1', '0.2')).toBe(true)
  })

  // A prerelease/garbage tag must not be read as an update — better to show no
  // banner than to point users at something that isn't a release.
  it('refuses to guess at non-numeric versions', () => {
    expect(isNewer('0.2.0-beta.1', '0.1.0')).toBe(false)
    expect(isNewer('nightly', '0.1.0')).toBe(false)
    expect(isNewer('0.2.0', '')).toBe(false)
  })
})
