import { useState } from 'react'
import { useStore } from '../store'

/** One instruction to every terminal at once (e.g. broadcast a prompt). */
export default function BroadcastBar(): JSX.Element | null {
  const broadcast = useStore((s) => s.broadcast)
  const count = useStore((s) => s.agents.length)
  const [text, setText] = useState('')
  if (!count) return null

  const send = (): void => {
    const t = text.trim()
    if (!t) return
    broadcast(t)
    setText('')
  }

  return (
    <div className="broadcast">
      <span className="broadcast__label">Broadcast → {count}</span>
      <input
        className="broadcast__input"
        value={text}
        placeholder="Send a command to every terminal…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send()
        }}
      />
      <button className="broadcast__btn" disabled={!text.trim()} onClick={send}>
        Send
      </button>
    </div>
  )
}
