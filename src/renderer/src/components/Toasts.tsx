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
  refresh
}: Toast): JSX.Element {
  const dismiss = useStore((s) => s.dismissToast)
  // Errors (e.g. "isn't isolated — agent is editing the shared dir") carry a
  // warning the user must actually see, so they never auto-dismiss; nor do toasts
  // with an action button. Both stay until clicked/dismissed.
  const sticky = toastIsSticky({ kind, actionLabel, secondaryLabel })
  useEffect(() => {
    // `dismiss` is a stable store action captured in the closure; keeping it out
    // of the deps avoids resetting the 3.4s timer on unrelated re-renders.
    // `refresh` IS a dep on purpose: a de-duped push bumps it so the surviving
    // toast gets a fresh 3.4s from the latest trigger.
    if (sticky) return
    const t = setTimeout(() => dismiss(id), 3400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sticky, refresh])
  return (
    <div
      className={`toast toast--${kind}`}
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
export default function Toasts(): JSX.Element | null {
  const toasts = useStore((s) => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  )
}
