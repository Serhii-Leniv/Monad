import { describe, it, expect } from 'vitest'
import { laidOut, RAIL_INSET, PAD, type AgentInstance, type LayoutMode } from './store'

// The tiling engine. Its invariants are load-bearing and easy to break silently:
// fractional geometry softens every glyph, a row that doesn't fill the width
// leaves a visible hole, and losing object identity re-renders every xterm on
// each drag tick.

const W = 1400
const H = 900

function makeAgents(n: number, wide: number[] = []): AgentInstance[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    label: `Agent ${i}`,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    isolation: 'shared',
    wide: wide.includes(i)
  })) as unknown as AgentInstance[]
}

const tile = (n: number, mode: LayoutMode = 'grid', wide: number[] = []): AgentInstance[] =>
  laidOut(makeAgents(n, wide), mode, W, H)

describe('laidOut', () => {
  it('returns the input untouched for an empty stage', () => {
    const empty = makeAgents(0)
    expect(laidOut(empty, 'grid', W, H)).toBe(empty)
  })

  it('keeps every coordinate an integer', () => {
    // Fractional tile coords land the terminal between device pixels and the
    // compositor resamples it — text and borders go soft.
    for (let n = 1; n <= 9; n++) {
      for (const a of tile(n)) {
        for (const v of [a.x, a.y, a.w, a.h]) {
          expect(Number.isInteger(v)).toBe(true)
        }
      }
    }
  })

  it('fills each row to exactly the full available width', () => {
    const availW = W - RAIL_INSET - PAD
    for (let n = 1; n <= 9; n++) {
      const out = tile(n)
      // Group by row (shared y), then check the row spans the full width.
      const rows = new Map<number, AgentInstance[]>()
      for (const a of out) rows.set(a.y, [...(rows.get(a.y) ?? []), a])
      for (const row of rows.values()) {
        const left = Math.min(...row.map((a) => a.x))
        const right = Math.max(...row.map((a) => a.x + a.w))
        expect(left).toBe(RAIL_INSET)
        expect(right - left).toBe(availW)
      }
    }
  })

  it('never overlaps two panes', () => {
    for (let n = 1; n <= 9; n++) {
      const out = tile(n)
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i]
          const b = out[j]
          const disjoint =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
          expect(disjoint).toBe(true)
        }
      }
    }
  })

  it('uses round(sqrt(n)) rows, so 3 is a row of 2 over a full-width row of 1', () => {
    const rowCount = (n: number): number => new Set(tile(n).map((a) => a.y)).size
    expect(rowCount(1)).toBe(1)
    expect(rowCount(2)).toBe(1)
    expect(rowCount(3)).toBe(2)
    expect(rowCount(5)).toBe(2)
    expect(rowCount(9)).toBe(3)

    // 3 → 2 on top, 1 below, and the lone card spans the whole width.
    const three = tile(3)
    const ys = [...new Set(three.map((a) => a.y))].sort((p, q) => p - q)
    expect(three.filter((a) => a.y === ys[0])).toHaveLength(2)
    const last = three.filter((a) => a.y === ys[1])
    expect(last).toHaveLength(1)
    expect(last[0].w).toBe(W - RAIL_INSET - PAD)
  })

  it('lays columns mode out as a single full-height row', () => {
    const out = tile(4, 'columns')
    expect(new Set(out.map((a) => a.y)).size).toBe(1)
    expect(new Set(out.map((a) => a.h)).size).toBe(1)
  })

  it('gives a wide card roughly double the width of a normal one in its row', () => {
    const [wide, normal] = tile(2, 'grid', [0])
    // Not exact: the last card in a row absorbs the rounding remainder.
    expect(wide.w / normal.w).toBeGreaterThan(1.8)
    expect(wide.w / normal.w).toBeLessThan(2.2)
  })

  it('reuses the same object when a slot is unchanged', () => {
    // A fresh {...a} every relayout gives each pane a new identity and defeats
    // TerminalPane's memo — every xterm re-renders on each drag-cross tick.
    const first = laidOut(makeAgents(4), 'grid', W, H)
    const second = laidOut(first, 'grid', W, H)
    for (let i = 0; i < first.length; i++) expect(second[i]).toBe(first[i])
  })

  it('parks the dragged card in drop* and leaves its live position alone', () => {
    const placed = laidOut(makeAgents(3), 'grid', W, H)
    const dragged = laidOut(placed, 'grid', W, H, placed[1].id)
    const it1 = dragged[1]
    expect(it1.dropX).toBeTypeOf('number')
    expect(it1.dropW).toBeTypeOf('number')
    // Its own x/y must not move — React would otherwise fight Moveable for the
    // transform while the card follows the cursor.
    expect(it1.x).toBe(placed[1].x)
    expect(it1.y).toBe(placed[1].y)
  })

  it('clears stale drop* markers once the drag ends', () => {
    const placed = laidOut(makeAgents(3), 'grid', W, H)
    const dragging = laidOut(placed, 'grid', W, H, placed[1].id)
    const dropped = laidOut(dragging, 'grid', W, H)
    for (const a of dropped) {
      expect(a.dropX).toBeUndefined()
      expect(a.dropY).toBeUndefined()
    }
  })

  it('survives a degenerate viewport without producing negative geometry', () => {
    // The stage is measured async; a pane can be tiled before the first real
    // measurement lands.
    for (const a of laidOut(makeAgents(4), 'grid', 0, 0)) {
      expect(a.w).toBeGreaterThan(0)
      expect(a.h).toBeGreaterThan(0)
    }
  })
})
