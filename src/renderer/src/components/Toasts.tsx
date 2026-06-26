import { useEffect } from 'react'
import { useStore, type Toast } from '../store'

function ToastItem({ id, text, kind }: Toast): JSX.Element {
  const dismiss = useStore((s) => s.dismissToast)
  useEffect(() => {
    const t = setTimeout(() => dismiss(id), 3400)
    return () => clearTimeout(t)
  }, [id, dismiss])
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
