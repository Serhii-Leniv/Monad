import { siClaude, siGooglegemini, siCursor, siQwen, siOpencode } from 'simple-icons'

/**
 * A small transparent icon marking which agent a terminal runs. Uses the official
 * brand mark (via simple-icons) in its brand colour where available, with a
 * contrast guard so near-black logos stay visible on the dark header. Agents with
 * no published icon fall back to a simple original glyph / colored monogram.
 */

interface Brand {
  hex: string
  path: string
}

const BRAND: Record<string, Brand> = {
  claude: siClaude,
  gemini: siGooglegemini,
  cursor: siCursor,
  qwen: siQwen,
  opencode: siOpencode
}

/** Brand colour, lightened when it's too dark to read on the header. */
function markColor(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum < 0.34 ? '#e2e6ee' : `#${hex}`
}

// Fallback glyphs for agents with no published brand icon.
const Chevrons = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
    <path
      d="M9 8l-4 4 4 4M15 8l4 4-4 4"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const FALLBACK: Record<string, { color: string; glyph?: () => JSX.Element }> = {
  codex: { color: '#10A37F', glyph: Chevrons },
  aider: { color: '#9b8cff' }
}

export default function AgentBadge({
  id,
  label
}: {
  id?: string
  label?: string
}): JSX.Element | null {
  if (!id && !label) return null

  const brand = id ? BRAND[id] : undefined
  if (brand) {
    return (
      <span className="vec-pane__agent" title={label ?? id}>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d={brand.path} fill={markColor(brand.hex)} />
        </svg>
      </span>
    )
  }

  const fb = id ? FALLBACK[id] : undefined
  const Glyph = fb?.glyph
  const color = fb?.color ?? 'var(--accent)'
  return (
    <span className="vec-pane__agent" title={label ?? id} style={{ color }}>
      {Glyph ? (
        <Glyph />
      ) : (
        <span className="vec-pane__agent-mono" style={{ color }}>
          {(label ?? id ?? '?').charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}
