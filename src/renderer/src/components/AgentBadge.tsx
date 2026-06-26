/**
 * A small icon badge marking which agent a terminal runs. The glyphs are simple
 * original geometric marks (not brand logos) tinted with each agent's colour, so
 * agents are recognisable at a glance.
 */

const Asterisk = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
    <path
      d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"
      stroke="#fff"
      strokeWidth={2.6}
      strokeLinecap="round"
    />
  </svg>
)

const Sparkle = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
    <path d="M12 2c.5 5.4 1.6 6.5 7 7-5.4.5-6.5 1.6-7 7-.5-5.4-1.6-6.5-7-7 5.4-.5 6.5-1.6 7-7z" fill="#fff" />
  </svg>
)

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

type Meta = { color: string; glyph?: () => JSX.Element }

const AGENT_META: Record<string, Meta> = {
  claude: { color: '#CC785C', glyph: Asterisk },
  codex: { color: '#10A37F', glyph: Chevrons },
  gemini: { color: '#4F7CF7', glyph: Sparkle },
  opencode: { color: '#E0823D', glyph: Prompt },
  aider: { color: '#6E56CF' },
  cursor: { color: '#3a3a3a' },
  qwen: { color: '#7C5CFF' }
}

export default function AgentBadge({
  id,
  label
}: {
  id?: string
  label?: string
}): JSX.Element | null {
  if (!id && !label) return null
  const meta = id ? AGENT_META[id] : undefined
  const Glyph = meta?.glyph
  return (
    <span
      className="vec-pane__agent"
      style={{ background: meta?.color ?? 'var(--accent)' }}
      title={label ?? id}
    >
      {Glyph ? <Glyph /> : <span className="vec-pane__agent-mono">{(label ?? id ?? '?').charAt(0).toUpperCase()}</span>}
    </span>
  )
}
