/** Curated accent presets (all read well on the dark UI). First = default brand red. */
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Brand', hex: '#ff453a' },
  { name: 'Navy', hex: '#3b5bd9' },
  { name: 'Blue', hex: '#2f6bff' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' }
]

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix each channel toward `target` (255 = lighten, 0 = darken) by amount t. */
function mix([r, g, b]: number[], t: number, target: number): string {
  const f = (c: number): number => Math.round(c + (target - c) * t)
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}

/**
 * Apply an accent colour to the whole UI by driving the CSS custom properties
 * the palette is built on. `--accent-rgb` feeds every translucent tint; we also
 * derive a lighter shade (gradients) and a darker one (pressed).
 */
export function applyAccent(hex: string): void {
  try {
    const [r, g, b] = hexToRgb(hex)
    const s = document.documentElement.style
    s.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
    s.setProperty('--accent-2', mix([r, g, b], 0.24, 255))
    s.setProperty('--accent-active', mix([r, g, b], 0.28, 0))
  } catch {
    /* bad hex — keep the current accent */
  }
}
