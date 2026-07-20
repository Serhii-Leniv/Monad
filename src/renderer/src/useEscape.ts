import { useEffect, useRef } from 'react'

/**
 * Capture-phase Escape that SWALLOWS the event (stopImmediatePropagation).
 *
 * Every transient surface here (close confirms, menus) sits above the app-wide
 * keydown handler in App.tsx, which also acts on Escape — clearing pane focus,
 * closing an overlay. Without capture + stopImmediatePropagation a single Esc
 * dismisses the confirm AND does the thing underneath it, which reads as the
 * app skipping a step. Registering on `window` in the capture phase is what
 * gets us ahead of that handler; the identical block was copy-pasted into
 * App.tsx twice and TerminalPane once before this hook existed.
 *
 * `fn` rides in a ref so a re-render with a fresh closure doesn't tear down and
 * re-register the listener — the re-registration would move this handler to the
 * BACK of the capture queue, silently losing the priority the hook exists for.
 */
export function useEscape(active: boolean, fn: () => void): void {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      latest.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active])
}
