import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { broadcastToAgents, focusActiveTerminal } from '../terminalRegistry'
import { IconClose, IconSend } from './Icons'

/** Input height cap ≈ 4 lines — beyond that it scrolls instead of growing. */
const MAX_INPUT_PX = 84

/**
 * Floating input shown while 2+ terminals are selected: whatever you type here
 * is sent to EVERY selected agent's PTY at once (kick off the same task in
 * parallel, answer the same prompt everywhere). Mounted by Stage; it never
 * steals focus on appearance — the terminals keep it until the bar is clicked.
 */
export default function BroadcastBar(): JSX.Element {
  const selectedCount = useStore((s) => s.selectedIds.length)
  const setSelected = useStore((s) => s.setSelected)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Grow with the content (Shift+Enter adds lines) up to the cap, then scroll —
  // scrollHeight is only readable after render, so this runs as an effect.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(MAX_INPUT_PX, el.scrollHeight) + 'px'
  }, [text])

  const send = (): void => {
    const ids = useStore.getState().selectedIds
    if (!text || ids.length === 0) return
    // \r = Enter, so the line executes in every pane (agents and shells alike).
    broadcastToAgents(ids, text + '\r')
    setText('')
    // Quick confirmation on the cards themselves: a short accent ring pulse on
    // every pane the input just landed in. Imperative classes (not state) so
    // back-to-back sends restart the animation without re-rendering the panes.
    for (const id of ids) {
      const el = document.querySelector(`.vec-pane[data-id="${id}"]`)
      if (!el) continue
      el.classList.remove('is-broadcast-pulse')
      void (el as HTMLElement).offsetWidth // reflow → the animation restarts
      el.classList.add('is-broadcast-pulse')
      window.setTimeout(() => el.classList.remove('is-broadcast-pulse'), 520)
    }
  }

  // Collapse the multi-selection down to its first card — the bar unmounts and
  // the surviving sole selection takes keyboard focus (TerminalPane's effect).
  const dismiss = (): void => {
    const ids = useStore.getState().selectedIds
    setSelected(ids.length ? [ids[0]] : [])
  }

  return (
    <div className="broadcast" onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={inputRef}
        className="broadcast__input"
        rows={1}
        value={text}
        placeholder={`Send to ${selectedCount} terminals — Enter to send`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter falls through as a literal newline.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          } else if (e.key === 'Escape') {
            // Hand focus back to the active terminal. Its onFocus collapses the
            // multi-selection to that pane, which also dismisses this bar.
            // stopPropagation so App's window handler doesn't ALSO act on it.
            e.stopPropagation()
            e.currentTarget.blur()
            focusActiveTerminal()
          }
        }}
      />
      <button className="broadcast__send" title="Send to all selected (Enter)" onClick={send}>
        <IconSend />
      </button>
      <button className="broadcast__dismiss" title="Dismiss" onClick={dismiss}>
        <IconClose size={13} />
      </button>
    </div>
  )
}
