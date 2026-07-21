import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// styles.css is the whole design system, and a custom property that references
// itself is invalid at computed-value time — the browser drops it silently, and
// takes the ENTIRE declaration with it. `--shadow-pop: var(--shadow-pop)` shipped
// that way: every modal, menu, palette, confirm and the review panel lost both its
// drop shadow AND the `--glass-specular` highlight sharing the same box-shadow,
// so they rendered as flat rectangles in the default dark theme. Light was fine,
// which is why it survived. There is no build error for this — only these tests.
// Read from disk rather than importing: the point is to inspect the authored CSS
// text, and under jsdom `import.meta.url` is not a file: URL. vitest runs from the
// repo root.
const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/styles.css'), 'utf8')

/** Every `--name: value` declaration in the sheet, in source order. */
function declarations(): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = []
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) out.push({ name: m[1], value: m[2].trim() })
  return out
}

/** The base (dark) `:root` block — not the `:root[data-theme=…]` overrides. */
function baseRoot(): string {
  const m = css.match(/:root\s*\{([\s\S]*?)\n\}/)
  if (!m) throw new Error('could not locate the base :root block in styles.css')
  return m[1]
}

describe('design tokens', () => {
  it('never defines a custom property in terms of itself', () => {
    // The lookahead matters: `\b` would let `--accent` match its own longer
    // sibling `--accent-rgb`, since a hyphen counts as a word boundary.
    const cycles = declarations()
      .filter((d) => new RegExp(`var\\(\\s*${d.name}(?![\\w-])`).test(d.value))
      .map((d) => `${d.name}: ${d.value}`)
    expect(cycles).toEqual([])
  })

  // The + dropdown carries BOTH classes (`rail__menu tabbar__menu`). They were
  // equally specific, so source order picked the winner — and .rail__menu sits
  // ~1300 lines later, which meant every anchoring override in .tabbar__menu was
  // silently dropped. The menu took the rail's `left` (opening beside the dock
  // instead of under the +) and its `bottom: 0`, pinning both edges of an
  // absolutely positioned box so it was sized by the gap between them rather
  // than by its content — it rendered as a collapsed black slab over the stage.
  // Nothing else catches this: the CSS is valid and the build is silent.
  it('lets the tabbar dropdown out-specify the rail menu chrome it reuses', () => {
    const tabbar = css.match(/^([^\n{]*tabbar__menu[^\n{]*)\{/m)
    expect(tabbar, 'no rule targets .tabbar__menu any more').toBeTruthy()
    const selector = tabbar![1]
    const shared = ['bottom', 'left', 'min-width']

    // Either it out-specifies .rail__menu, or it is authored after it. Anything
    // else and these declarations lose again.
    const qualified = /\.rail__menu\s*\.?tabbar__menu|\.rail__menu\.tabbar__menu/.test(selector)
    const later = css.indexOf(selector) > css.indexOf('\n.rail__menu {')
    expect(
      qualified || later,
      `"${selector.trim()}" ties with .rail__menu but is authored before it, so ${shared.join('/')} are ignored`
    ).toBe(true)
  })

  // The dark theme is the default, so a token missing here is what users see.
  it('gives the floating-chrome shadows a real value in the dark base', () => {
    const root = baseRoot()
    for (const token of ['--shadow-pop', '--shadow-menu']) {
      const m = root.match(new RegExp(`${token}\\s*:\\s*([^;]+);`))
      expect(m, `${token} is not defined in the base :root`).toBeTruthy()
      // A shadow, not a var() indirection that could go stale again.
      expect(m![1]).toMatch(/^\d/)
    }
  })
})
