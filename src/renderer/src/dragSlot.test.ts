import { describe, it, expect } from 'vitest'
import { nearestSlotIndex, type Slot } from './dragSlot'

// A 2×1 row, the layout that thrashed worst: with only one rival slot, the old
// "skip the dragged card" hit test always answered "the other one".
const TWO: Slot[] = [
  { x: 0, y: 0, w: 100, h: 100 },
  { x: 120, y: 0, w: 100, h: 100 }
]

// 2×2 grid.
const FOUR: Slot[] = [
  { x: 0, y: 0, w: 100, h: 100 },
  { x: 120, y: 0, w: 100, h: 100 },
  { x: 0, y: 120, w: 100, h: 100 },
  { x: 120, y: 120, w: 100, h: 100 }
]

describe('nearestSlotIndex', () => {
  // THE regression: this is the bug. Hovering your own slot must be a no-op, or
  // the caller reorders on every pointer-move and the stage vibrates.
  it('stays put while the card is over its own slot', () => {
    expect(nearestSlotIndex(TWO, 50, 50, 0)).toBe(0)
    expect(nearestSlotIndex(TWO, 170, 50, 1)).toBe(1)
    expect(nearestSlotIndex(FOUR, 170, 170, 3)).toBe(3)
  })

  it('swaps once the card is clearly over another slot', () => {
    expect(nearestSlotIndex(TWO, 170, 50, 0)).toBe(1)
    expect(nearestSlotIndex(TWO, 50, 50, 1)).toBe(0)
    expect(nearestSlotIndex(FOUR, 50, 170, 1)).toBe(2)
  })

  // Without hysteresis the answer flips on the exact midpoint and the resulting
  // re-tile moves the boundary, flipping it back — the visible back-and-forth.
  it('holds its slot on the boundary between two slots', () => {
    expect(nearestSlotIndex(TWO, 110, 50, 0)).toBe(0)
    expect(nearestSlotIndex(TWO, 110, 50, 1)).toBe(1)
  })

  it('is stable: re-asking after a swap gives the same answer', () => {
    const first = nearestSlotIndex(TWO, 170, 50, 0)
    expect(first).toBe(1)
    // After the reorder the card owns slot 1; the same cursor must not flip back.
    expect(nearestSlotIndex(TWO, 170, 50, first)).toBe(first)
  })

  it('handles an empty layout and an unknown current index', () => {
    expect(nearestSlotIndex([], 10, 10, 0)).toBe(0)
    expect(nearestSlotIndex(TWO, 170, 50, 9)).toBe(1)
  })
})
