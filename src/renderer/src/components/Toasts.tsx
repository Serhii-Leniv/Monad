import { useEffect } from 'react'
import { useStore, type Toast } from '../store'

function ToastItem({ id, text, kind }: Toast): JSX.Element {
  const dismiss = useStore((s) => s.dismissToast)
  useEffect(() => {
    // `dismiss` is a stable store action captured in the closure; keeping it out
    // of the deps avoids resetting the 3.4s timer on unrelated re-renders.
    const t = setTimeout(() => dismiss(id), 3400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return (
    <div className={`toast toast--${kind}`} onClick={() => dismiss(id)}>
      {text}
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
