import { useStore } from '../store'

/**
 * "ProFlow"-style routing: drop a finished transcript wherever focus currently
 * is, without ever executing anything.
 *
 *  1. A normal editable text field (broadcast bar, rename, search, settings):
 *     insert at the caret and let React's controlled inputs update.
 *  2. The active terminal (xterm's hidden helper textarea is focused, or nothing
 *     editable is): write to that terminal's pty WITHOUT a carriage return, so
 *     the text lands at the shell cursor for the user to review and press Enter.
 *  3. Nothing suitable focused: fall back to the broadcast bar input.
 */

const XTERM_HELPER = 'xterm-helper-textarea'

function isEditableField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false
  if (el.classList.contains(XTERM_HELPER)) return false // that's a terminal, not a field
  const tag = el.tagName
  if (tag === 'TEXTAREA') {
    const t = el as HTMLTextAreaElement
    return !t.disabled && !t.readOnly
  }
  if (tag === 'INPUT') {
    const t = el as HTMLInputElement
    if (t.disabled || t.readOnly) return false
    // Only free-text inputs accept dictation.
    return /^(text|search|url|email|tel|password|)$/i.test(t.type || 'text')
  }
  return false
}

/** Insert at the caret of a controlled input and notify React via an input event. */
function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const before = el.value.slice(0, start)
  // Smart spacing: separate from an existing word, but don't double-space.
  const needsSpace = before.length > 0 && !/\s$/.test(before) && !/^\s/.test(text)
  const insert = (needsSpace ? ' ' : '') + text
  el.setRangeText(insert, start, end, 'end')
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: insert }))
}

/**
 * ptyId of the terminal that actually owns keyboard focus — resolved from the
 * pane (`.vec-pane[data-id]`) containing `document.activeElement`, so dictation
 * lands in the focused terminal even with several terminals selected. Falls back
 * to the selected card when focus isn't inside a pane.
 */
function focusedTerminalPty(): string | null {
  const s = useStore.getState()
  const pane = document.activeElement?.closest<HTMLElement>('.vec-pane[data-id]')
  const id = pane?.dataset.id ?? s.selectedIds[0]
  if (!id) return null
  return s.agents.find((a) => a.id === id)?.ptyId ?? null
}

/**
 * Route a final transcript to the right place. Returns where it went, so the UI
 * can give feedback (and so callers can choose to no-op on 'none').
 */
export function insertTranscript(text: string): 'field' | 'terminal' | 'broadcast' | 'none' {
  const t = text.trim()
  if (!t) return 'none'

  const active = document.activeElement

  // 1. A normal editable field has focus → insert at its caret.
  if (isEditableField(active)) {
    insertAtCaret(active, t)
    return 'field'
  }

  // 2. A terminal is focused (or nothing editable is) → write to its pty.
  const isTerminalFocused = !!active?.classList.contains(XTERM_HELPER)
  if (isTerminalFocused) {
    const pty = focusedTerminalPty()
    if (pty) {
      window.api.pty.write(pty, t)
      return 'terminal'
    }
  }

  // 3. Fallback: drop it into the broadcast bar for review.
  const bar = document.querySelector<HTMLInputElement>('.broadcast__input')
  if (bar) {
    bar.focus()
    insertAtCaret(bar, t)
    return 'broadcast'
  }

  // No broadcast bar (no agents yet) but a terminal is selected → write to it.
  const pty = focusedTerminalPty()
  if (pty) {
    window.api.pty.write(pty, t)
    return 'terminal'
  }
  return 'none'
}
