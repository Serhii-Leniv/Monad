import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contrast floors for the ink ramp.
 *
 * Measured with APCA rather than WCAG 2 ratios. WCAG 2's formula is documented
 * to degrade badly once the lighter colour falls below #a0a0a0, and on dark
 * grounds it wrongly passes a majority of pairs — which makes it the wrong
 * instrument for a dark-first app. APCA is perceptually uniform and its
 * thresholds are stated in terms of what the text is for.
 *
 * This test exists because every one of these pairs failed at least once. The
 * ramp had been de-emphasised past the point of being readable: --muted sat at
 * Lc 31-33 (below even the floor for large text), --text-2 at Lc 54-56, and
 * --accent — a value tuned to work as a FILL — was being used as the colour of
 * active tab labels and dock glyphs at Lc 42.
 */

const CSS = readFileSync(join(__dirname, 'styles.css'), 'utf8')

/** Pull the `#rrggbb` custom properties out of the first :root block. */
function tokens(): Record<string, string> {
  const start = CSS.indexOf(':root {')
  const block = CSS.slice(start, CSS.indexOf('\n}\n', start))
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2]
  }
  return out
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ]
}

/** APCA screen luminance, with the black soft-clamp. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex)
  const y = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y
}

/** APCA-W3 lightness contrast. Sign carries polarity; callers compare |Lc|. */
export function apcaLc(text: string, background: string): number {
  const yt = luminance(text)
  const yb = luminance(background)
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14
    return s < 0.1 ? 0 : (s - 0.027) * 100
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14
  return s > -0.1 ? 0 : (s + 0.027) * 100
}

const SURFACES = ['sub-1', 'sub-2', 'sub-3', 'sub-4']

// Lc floors, per APCA's own guidance: 75 for body text, 60 for secondary and
// other non-body content text.
const FLOORS: Record<string, number> = {
  text: 75,
  'text-2': 75,
  muted: 60,
  'accent-ink': 60
}

describe('ink ramp contrast', () => {
  const tok = tokens()

  it('defines every ink and surface token as a literal hex', () => {
    for (const name of [...Object.keys(FLOORS), ...SURFACES]) {
      expect(tok[name], `--${name} missing or not a hex literal`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  for (const [ink, floor] of Object.entries(FLOORS)) {
    for (const surface of SURFACES) {
      it(`--${ink} clears Lc ${floor} on --${surface}`, () => {
        const lc = Math.abs(apcaLc(tok[ink], tok[surface]))
        expect(lc, `--${ink} on --${surface} scored Lc ${lc.toFixed(1)}`).toBeGreaterThanOrEqual(
          floor
        )
      })
    }
  }

  it('keeps the ramp ordered, so the hierarchy survives the contrast floors', () => {
    // Raising the lower steps to clear their floors compresses the ramp. It must
    // still read as three distinct steps, or the hierarchy is gone.
    const onCanvas = (k: string): number => Math.abs(apcaLc(tok[k], tok['sub-1']))
    expect(onCanvas('text')).toBeGreaterThan(onCanvas('text-2'))
    expect(onCanvas('text-2')).toBeGreaterThan(onCanvas('muted'))
    expect(onCanvas('text') - onCanvas('muted')).toBeGreaterThan(20)
  })

  it('uses the ink accent, not the fill accent, for text and icons', () => {
    // --accent is tuned as a fill and measures below the floor as text.
    expect(CSS).not.toMatch(/color:\s*var\(--accent\)\s*;/)
  })
})
