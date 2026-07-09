/**
 * Heuristics for deciding when a quiet terminal is actually *waiting on the
 * user* rather than just idle at a prompt. Kept deliberately conservative —
 * better to miss an ambiguous prompt than to cry "attention" on every shell
 * prompt. Adapters can extend ATTENTION_PATTERNS later as we learn each CLI.
 */

/** Strip ANSI escape / control sequences so patterns match the visible text.
 *  OSC accepts both terminators (BEL and ST `ESC \`) and an unterminated OSC at
 *  the end of the buffer — the tail is a raw stream clamp, so a sequence can be
 *  cut mid-way. */
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)|[\x00-\x08\x0b\x0c\x0e-\x1f]/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
}

/** Phrases that strongly imply the program is blocked waiting for input. */
export const ATTENTION_PATTERNS: RegExp[] = [
  /\((?:y\/n|yes\/no|y\/N|Y\/n)\)/i,
  /\[(?:y\/n|yes\/no)\]/i,
  /\b(?:proceed|continue|overwrite|replace|delete this|are you sure)\??\s*$/im,
  // Broad: covers every Claude Code / Codex permission prompt ("Do you want to
  // make this edit?", "…create this file?", "…run this command?", …).
  /\bdo you want to\b/i,
  /\b(?:password|passphrase|otp|verification code)\s*:?\s*$/im,
  /\bpress (?:enter|any key|return) to\b/i,
  /\bwaiting for (?:your )?(?:input|confirmation|approval)\b/i,
  /\benter (?:a )?(?:value|choice|selection)\b/i,
  // Interactive arrow-menus (Claude Code / Codex / gum): a "❯" cursor pointing at
  // a numbered choice, or numbered yes/no options laid out below a question.
  /❯\s*\d/,
  /\b\d\.\s+(?:yes|no)\b/i,
  /\bselect (?:an?\s+)?(?:option|choice|item)\b/i,
  // Generic permission asks an agent emits before touching the system.
  /\ballow this (?:command|tool|action|edit)\b/i,
]

/** How many trailing non-empty lines of output a blocking prompt is allowed to
 *  span. A boxed CLI menu (title + question + a few options + box borders) is
 *  the widest real case; beyond that we're looking at earlier output, not the
 *  live prompt. */
const ATTENTION_LINE_WINDOW = 8

/** True when the tail of recent output looks like a blocking prompt.
 *
 *  A program that is actually waiting on you printed its prompt and then STOPPED
 *  — so the prompt is the last thing in the buffer. We therefore match only the
 *  final few non-empty lines, not the whole 1200-char tail. This is what keeps
 *  the attention alert honest: it won't fire on a prompt-like phrase buried in
 *  earlier narration (agents write "Do you want to…" in prose all the time), nor
 *  on a STALE prompt that was already answered but still lingers in the tail
 *  while the next, shorter burst settles. A prompt can't scroll above this
 *  window while still blocking — nothing prints after it — so nothing real is
 *  missed. */
export function needsAttention(tail: string): boolean {
  const text = stripAnsi(tail)
  const recent = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .slice(-ATTENTION_LINE_WINDOW)
    .join('\n')
  return ATTENTION_PATTERNS.some((re) => re.test(recent))
}

/** Keep only the last `max` chars of a growing buffer (cheap ring buffer). */
export function clampTail(buf: string, max = 600): string {
  return buf.length > max ? buf.slice(buf.length - max) : buf
}
