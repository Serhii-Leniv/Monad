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

/** True when the tail of recent output looks like a blocking prompt. */
export function needsAttention(tail: string): boolean {
  const text = stripAnsi(tail)
  return ATTENTION_PATTERNS.some((re) => re.test(text))
}

/** Keep only the last `max` chars of a growing buffer (cheap ring buffer). */
export function clampTail(buf: string, max = 600): string {
  return buf.length > max ? buf.slice(buf.length - max) : buf
}
