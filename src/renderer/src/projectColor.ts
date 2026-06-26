/**
 * A stable, distinct emblem colour per project so they're recognisable at a
 * glance (instead of every project sharing the accent colour). Derived from the
 * folder path, so the same project always gets the same hue.
 */
function hashHue(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 360
}

/**
 * Inline style for a project emblem keyed by its path — a soft pastel gradient
 * with a darker same-hue letter for a calm, legible "chip" look.
 */
export function emblemStyle(key: string): { background: string; color: string } {
  const hue = hashHue(key)
  return {
    background: `linear-gradient(150deg, hsl(${hue} 56% 83%), hsl(${(hue + 18) % 360} 50% 75%))`,
    color: `hsl(${hue} 42% 34%)`
  }
}
