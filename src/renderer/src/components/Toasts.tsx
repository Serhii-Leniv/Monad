import { useEffect } from 'react'
import { useStore, type Toast } from '../store'

function ToastItem({ id, text, kind, actionLabel, onAction }: Toast): JSX.Element {
  const dismiss = useStore((s) => s.dismissToast)
  // Errors (e.g. "isn't isolated — agent is editing the shared dir") carry a
  // warning the user must actually see, so they never auto-dismiss; nor do toasts
  // with an action button. Both stay until clicked/dismissed.
  const sticky = !!actionLabel || kind === 'error'
  useEffect(() => {
    // `dismiss` is a stable store action captured in the closure; keeping it out
    // of the deps avoids resetting the 3.4s timer on unrelated re-renders.
    if (sticky) return
    const t = setTimeout(() => dismiss(id), 3400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sticky])
  return (
    <div
      className={`toast toast--${kind}`}
      // A toast with an action (e.g. "Download") must NOT dismiss on a stray body
      // click — that silently throws away the only in-app path to the action. It
      // closes via its button or the explicit ✕. Plain toasts still click-to-close.
      onClick={actionLabel ? undefined : () => dismiss(id)}
    >
      {text}
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
