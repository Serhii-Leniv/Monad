import { siClaude, siGooglegemini, siCursor, siQwen } from 'simple-icons'

/**
 * A small icon badge marking which agent a terminal runs. Uses the official
 * brand marks (via simple-icons) where available, falling back to a simple
 * original glyph / colored monogram for agents that have no published icon.
 */

interface Brand {
  hex: string
  path: string
}

// Official brand icons (simple-icons). The white mark sits on the brand colour.
const BRAND: Record<string, Brand> = {
  claude: siClaude,
  gemini: siGooglegemini,
  cursor: siCursor,
  qwen: siQwen
}

// Fallback glyphs for agents with no published brand icon.
const Chevrons = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
    <path
      d="M9 8l-4 4 4 4M15 8l4 4-4 4"
      stroke="#fff"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
const Prompt = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
    <path
      d="M6 8l4 4-4 4M13 16h5"
      stroke="#fff"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const FALLBACK: Record<string, { color: string; glyph?: () => JSX.Element }> = {
  codex: { color: '#10A37F', glyph: Chevrons },
  opencode: { color: '#E0823D', glyph: Prompt },
  aider: { color: '#6E56CF' }
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
      <span className="vec-pane__agent" style={{ background: `#${brand.hex}` }} title={label ?? id}>
        <svg viewBox="0 0 24 24" width="12.5" height="12.5" aria-hidden="true">
          <path d={brand.path} fill="#fff" />
        </svg>
      </span>
    )
  }

  const fb = id ? FALLBACK[id] : undefined
  const Glyph = fb?.glyph
  return (
    <span
      className="vec-pane__agent"
      style={{ background: fb?.color ?? 'var(--accent)' }}
      title={label ?? id}
    >
      {Glyph ? (
        <Glyph />
      ) : (
        <span className="vec-pane__agent-mono">{(label ?? id ?? '?').charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}
