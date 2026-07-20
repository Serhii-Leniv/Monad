import { useEffect } from 'react'
import { useStore, toastIsSticky, type Toast } from '../store'

function ToastItem({
  id,
  text,
  kind,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  sticky: stickyOverride,
  timeoutMs,
  refresh
}: Toast): JSX.Element {
  const dismiss = useStore((s) => s.dismissToast)
  // Errors (e.g. "isn't isolated — agent is editing the shared dir") carry a
  // warning the user must actually see, so they never auto-dismiss; nor do toasts
  // with an action button. Both stay until clicked/dismissed — unless the pusher
  // explicitly opted out (sticky: false) because a persistent surface elsewhere
  // carries the same affordance.
  const sticky = toastIsSticky({ kind, actionLabel, secondaryLabel, sticky: stickyOverride })
  useEffect(() => {
    // `dismiss` is a stable store action captured in the closure; keeping it out
    // of the deps avoids resetting the auto-dismiss timer on unrelated
    // re-renders. `refresh` IS a dep on purpose: a de-duped push bumps it so the
    // surviving toast gets a fresh timeout from the latest trigger.
    if (sticky) return
    const t = setTimeout(() => dismiss(id), timeoutMs ?? 3400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sticky, timeoutMs, refresh])
  return (
    <div
      className={`toast toast--${kind}${sticky ? ' toast--sticky' : ''}`}
      // Per-toast politeness, because the container's is fixed for its lifetime:
      // an error ("worktree is dirty — merge refused") is a consequence the user
      // has to hear now, while a routine "Merged into main" interrupting whatever
      // the screen reader is mid-sentence on would be pure noise. The live region
      // that wins is the innermost one, so this overrides the container below.
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      // A toast with an action (e.g. "Download") must NOT dismiss on a stray body
      // click — that silently throws away the only in-app path to the action. It
      // closes via its button or the explicit ✕. Plain toasts still click-to-close.
      onClick={actionLabel || secondaryLabel ? undefined : () => dismiss(id)}
    >
      {text}
      {(actionLabel || secondaryLabel) && (
        <div className="toast__actions">
          {actionLabel && (
            <button
              className="toast__action"
              onClick={(e) => {
                e.stopPropagation()
                onAction?.()
                dismiss(id)
              }}
            >
              {actionLabel}
            </button>
          )}
          {secondaryLabel && (
            <button
              className="toast__action toast__action--secondary"
              onClick={(e) => {
                e.stopPropagation()
                onSecondary?.()
                dismiss(id)
              }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
      {sticky && (
        <button
          className="toast__close"
          title="Dismiss"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation()
            dismiss(id)
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

/** Transient feedback (merged, discarded, errors). Auto-dismiss, click to close. */
export default function Toasts(): JSX.Element {
  const toasts = useStore((s) => s.toasts)
  return (
    // Live region on the container, and the container is now rendered even when
    // empty (it used to return null): assistive tech only announces changes to a
    // region it was already observing, so a wrapper that appears in the same
    // commit as its first toast reads as nothing at all. Rendering it empty is
    // free — .toasts is pointer-events:none with no box of its own.
    // role="status" supplies the polite default; ToastItem overrides per kind.
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  )
}
