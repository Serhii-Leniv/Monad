import { useRef, useState } from 'react'
import { useStore } from '../store'

/**
 * The command bar: type a task and send it to ALL terminals (broadcast) or to a
 * single chosen agent. Up/Down recalls history.
 */
export default function BroadcastBar(): JSX.Element | null {
  const agents = useStore((s) => s.agents)
  const broadcast = useStore((s) => s.broadcast)
  const sendTo = useStore((s) => s.sendTo)
  const [text, setText] = useState('')
  const [target, setTarget] = useState<string>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const history = useRef<string[]>([])
  const histIdx = useRef(-1)

  if (!agents.length) return null

  // Resolve the effective target (the chosen agent may have been closed).
  const targetAgent = target !== 'all' ? agents.find((a) => a.id === target) : null
  const isAll = target === 'all' || !targetAgent
  const targetLabel = isAll ? `All · ${agents.length}` : targetAgent!.label

  const send = (): void => {
    const t = text.trim()
    if (!t) return
    if (isAll) broadcast(t)
    else sendTo(targetAgent!.id, t)
    history.current = [t, ...history.current].slice(0, 50)
    histIdx.current = -1
    setText('')
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const h = history.current
    if (e.key === 'Enter') send()
    else if (e.key === 'ArrowUp' && h.length) {
      e.preventDefault()
      histIdx.current = Math.min(histIdx.current + 1, h.length - 1)
      setText(h[histIdx.current])
    } else if (e.key === 'ArrowDown' && histIdx.current >= 0) {
      e.preventDefault()
      histIdx.current -= 1
      setText(histIdx.current < 0 ? '' : h[histIdx.current])
    }
  }

  return (
    <div className="broadcast">
      <div className="broadcast__target">
        <button
          className={'broadcast__chip' + (isAll ? ' broadcast__chip--all' : '')}
          onClick={() => setMenuOpen((v) => !v)}
          title="Choose where this goes"
        >
          {targetLabel}
          <span className="broadcast__caret">▾</span>
        </button>
        {menuOpen && (
          <>
            <div className="broadcast__backdrop" onClick={() => setMenuOpen(false)} />
            <div className="broadcast__menu">
              <button
                className={'rail__menu-item' + (isAll ? ' is-active' : '')}
                onClick={() => {
                  setTarget('all')
                  setMenuOpen(false)
                }}
              >
                All agents · {agents.length}
              </button>
              {agents.length > 0 && <div className="rail__menu-sep" />}
              {agents.map((a) => (
                <button
                  key={a.id}
                  className={'rail__menu-item' + (a.id === target ? ' is-active' : '')}
                  onClick={() => {
                    setTarget(a.id)
                    setMenuOpen(false)
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <input
        className="broadcast__input"
        value={text}
        placeholder={isAll ? 'Send a command to every terminal…' : `Send to ${targetLabel}…`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button className="broadcast__btn" disabled={!text.trim()} onClick={send}>
        Send
      </button>
    </div>
  )
}
