/** Slot geometry for drop targeting — the rectangle a card currently occupies
 *  in the tiled layout. The dragged card's slot is its `drop*` gap, not its
 *  live cursor-following position. */
export type Slot = { x: number; y: number; w: number; h: number }

/**
 * How much nearer a rival slot must be before the dragged card gives up its own.
 * Pure nearest-centre with no margin chatters on the boundary: the reorder moves
 * the cards, which moves the boundary, which flips the answer back. Requiring a
 * clear win (squared distance, so 0.8 ≈ 11% nearer in real distance) makes the
 * swap commit and stay committed.
 */
const HYSTERESIS = 0.8

/**
 * Which slot should the dragged card land in, given its centre at (cx, cy)?
 *
 * Returns `currentIndex` when the card should stay put — the caller MUST treat
 * that as "no reorder". The dragged card's own slot is deliberately a candidate:
 * excluding it meant the answer could never be "stay", so the caller reordered on
 * every pointer-move and the whole stage thrashed.
 */
export function nearestSlotIndex(
  slots: Slot[],
  cx: number,
  cy: number,
  currentIndex: number
): number {
  if (slots.length === 0) return currentIndex

  const d2 = (s: Slot): number => (s.x + s.w / 2 - cx) ** 2 + (s.y + s.h / 2 - cy) ** 2

  let best = currentIndex
  let bestD = Infinity
  slots.forEach((s, i) => {
    const d = d2(s)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })

  if (best === currentIndex) return currentIndex

  // Out-of-range currentIndex (card not in the list) has no slot to defend.
  const own = slots[currentIndex]
  if (!own) return best

  return bestD < d2(own) * HYSTERESIS ? best : currentIndex
}
