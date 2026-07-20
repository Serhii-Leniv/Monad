import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useEscape } from '../useEscape'

/** Everything the browser will hand focus to via Tab. `[tabindex="-1"]` is
 *  excluded on purpose: it's programmatically focusable but deliberately out of
 *  the tab order, and including it would trap the user on invisible stops. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface ModalProps {
  /** Class for the INNER panel — each call site keeps its own geometry/skin
   *  (`settings`, `palette`, `review`, `confirm`); the backdrop is always `modal`. */
  className: string
  /** Backdrop click. Not wired to Escape — see `onEscape`. */
  onClose: () => void
  /**
   * Opt-in capture-phase Escape. Most store-driven overlays leave this unset:
   * App.tsx's global handler closes them in a deliberate priority order (diff →
   * palette → feedback → settings) so ⌘K over Settings closes only the palette.
   * A per-modal capture handler would fire in MOUNT order instead, so the
   * bottom-most overlay would eat the Esc meant for the one on top. Surfaces
   * with no entry in that chain (the confirms) pass it and win outright.
   */
  onEscape?: () => void
  /** Announced name. Pass one of these — an unlabelled dialog reads as blank. */
  label?: string
  labelledBy?: string
  /** Selector, resolved inside the panel, for what should own focus on open.
   *  Without it the first focusable wins — which is a close ✕ on most of these
   *  panels, so anything with a real entry point (search box, message field)
   *  should say so rather than rely on `autoFocus` racing the effect below. */
  initialFocus?: string
  children: ReactNode
}

/**
 * The overlay primitive: backdrop + labelled dialog panel, focus trapped inside
 * and restored on close.
 *
 * Before this, overlays were bare `<div className="modal">` wrappers. Tab walked
 * straight out of them into the canvas behind the backdrop — landing on controls
 * the user can't see and can't reach back from — and with no role/aria-modal a
 * screen reader never announced that a dialog had opened at all, so the whole
 * surface was invisible to it.
 */
export default function Modal({
  className,
  onClose,
  onEscape,
  label,
  labelledBy,
  initialFocus,
  children
}: ModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  useEscape(!!onEscape, () => onEscape?.())

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // Snapshot BEFORE moving focus, or we'd "restore" onto the panel we're about
    // to unmount and leave focus on <body>.
    const prev = document.activeElement as HTMLElement | null
    const target = initialFocus ? panel.querySelector<HTMLElement>(initialFocus) : null
    // Panel itself (tabIndex -1) is the fallback: an overlay whose body is still
    // loading has no focusable child yet, and leaving focus outside would mean
    // the trap below never sees a keystroke.
    ;(target ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus()
    return () => {
      // Only if it's still in the document — the opener is often a card button
      // in a pane the modal's own action just removed.
      if (prev && prev.isConnected) prev.focus()
    }
  }, [initialFocus])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    // Re-queried per keystroke: these panels swap their controls as state changes
    // (Settings tabs, the review's merged/unmerged footers), so a cached list
    // would wrap onto elements that are no longer there.
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    )
    if (!items.length) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === first || at === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal" onPointerDown={onClose}>
      <div
        ref={panelRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
