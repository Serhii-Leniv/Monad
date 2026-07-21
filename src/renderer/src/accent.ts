/**
 * Accent presets.
 *
 * These are all lightness-and-hue steps INSIDE the substrate's warm family, not
 * a spectrum of saturated fills. The previous set ran Navy, Blue, Indigo,
 * Violet and Teal — cool, fully saturated hues on a warm ink ground, which is
 * both the worst case for fringing and a direct contradiction of the palette:
 * the accent is supposed to be the same material, lit, rather than a different
 * colour laid on top of it.
 *
 * The range is still real — ember through moss covers warm-to-cool WITHIN the
 * family — so the setting remains a genuine choice rather than a token one.
 *
 * First entry is the default and must match `--accent-rgb` in styles.css, since
 * applyAccent() overwrites that token at runtime.
 */
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Ember', hex: '#d97a68' },
  { name: 'Rust', hex: '#c2664a' },
  { name: 'Clay', hex: '#b8705c' },
  { name: 'Ochre', hex: '#c9924e' },
  { name: 'Sand', hex: '#b9a184' },
  { name: 'Moss', hex: '#7d9b6a' },
  { name: 'Sage', hex: '#8a9b8c' },
  { name: 'Plum', hex: '#a06a72' },
  { name: 'Ash', hex: '#8f8580' }
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
