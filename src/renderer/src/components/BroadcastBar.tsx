import { useEffect, useRef, useState } from 'react'
import { useStore, activeWs } from '../store'
import { broadcastToAgents, focusActiveTerminal } from '../terminalRegistry'
import { IconClose, IconSend } from './Icons'

/** Input height cap ≈ 4 lines — beyond that it scrolls instead of growing. */
const MAX_INPUT_PX = 84

// Broadcast prompt history — the "same task to five agents" flow is repeated
// constantly, so sent messages are recallable with ↑/↓ like a shell.
// (Legacy 'vectro.' prefix kept for consistency with the other persisted keys.)
const HISTORY_KEY = 'vectro.broadcastHistory'
const HISTORY_MAX = 50

function loadHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Floating input shown while 2+ terminals are selected: whatever you type here
 * is sent to EVERY selected agent's PTY at once (kick off the same task in
 * parallel, answer the same prompt everywhere). Mounted by Stage; it never
 * steals focus on appearance — the terminals keep it until the bar is clicked.
 */
export default function BroadcastBar(): JSX.Element {
  const selectedCount = useStore((s) => activeWs(s)?.selectedIds.length ?? 0)
  const setSelected = useStore((s) => s.setSelected)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // History recall: histIdx -1 = the live draft; 0..n walks newest → oldest.
  const historyRef = useRef<string[]>(loadHistory())
  const histIdxRef = useRef(-1)
  const draftRef = useRef('')

  // Grow with the content (Shift+Enter adds lines) up to the cap, then scroll —
  // scrollHeight is only readable after render, so this runs as an effect.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(MAX_INPUT_PX, el.scrollHeight) + 'px'
  }, [text])

  const recall = (dir: -1 | 1): boolean => {
    const hist = historyRef.current
    if (!hist.length) return false
    const cur = histIdxRef.current
    if (dir === -1) {
      // older
      if (cur + 1 >= hist.length) return false
      if (cur === -1) draftRef.current = text
      histIdxRef.current = cur + 1
      setText(hist[hist.length - 1 - histIdxRef.current])
      return true
    }
    // newer
    if (cur === -1) return false
    histIdxRef.current = cur - 1
    setText(histIdxRef.current === -1 ? draftRef.current : hist[hist.length - 1 - histIdxRef.current])
    return true
  }

  const send = (): void => {
    const ids = activeWs(useStore.getState())?.selectedIds ?? []
    if (!text || ids.length === 0) return
    // \r = Enter, so the line executes in every pane (agents and shells alike).
    broadcastToAgents(ids, text + '\r')
    // Remember it (skip consecutive duplicates), newest last, capped.
    const hist = historyRef.current
    if (hist[hist.length - 1] !== text) {
      hist.push(text)
      if (hist.length > HISTORY_MAX) hist.splice(0, hist.length - HISTORY_MAX)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(hist))
      } catch {
        /* ignore */
      }
    }
    histIdxRef.current = -1
    draftRef.current = ''
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
    const ids = activeWs(useStore.getState())?.selectedIds ?? []
    setSelected(ids.length ? [ids[0]] : [])
  }

  return (
    <div className="broadcast" onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={inputRef}
        className="broadcast__input"
        rows={1}
        value={text}
        placeholder={`Send to ${selectedCount} terminals — Enter to send, ↑ history`}
        onChange={(e) => {
          setText(e.target.value)
          // Editing detaches from history — what's in the box is the draft now.
          histIdxRef.current = -1
        }}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter falls through as a literal newline.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          } else if (e.key === 'ArrowUp') {
            // Shell-style history — only when the caret is on the FIRST line,
            // so arrowing around a multi-line draft still works normally.
            const el = e.currentTarget
            if (!el.value.slice(0, el.selectionStart ?? 0).includes('\n')) {
              if (recall(-1)) e.preventDefault()
            }
          } else if (e.key === 'ArrowDown') {
            const el = e.currentTarget
            if (!el.value.slice(el.selectionEnd ?? el.value.length).includes('\n')) {
              if (recall(1)) e.preventDefault()
            }
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
