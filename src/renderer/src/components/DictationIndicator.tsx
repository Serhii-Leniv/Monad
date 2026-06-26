import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { useDictation, dictation } from '../voice/useDictation'
import { keyName } from '../voice/keyName'

/** Number of bars in the waveform. */
const BARS = 28

/**
 * Floating status pill for keyboard-triggered dictation. While listening it
 * draws a live, voice-reactive waveform (Wispr Flow-style) straight from the mic
 * spectrum; while loading/transcribing it shows a pulsing dot.
 */
export default function DictationIndicator(): JSX.Element | null {
  const { status } = useDictation()
  const voiceKey = useStore((s) => s.settings.voiceKey)
  const activation = useStore((s) => s.settings.voiceActivation)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const listening = status === 'listening'

  // Live waveform render loop — runs only while listening; mutates the canvas
  // directly so it never triggers React re-renders.
  useEffect(() => {
    if (!listening) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3b5bd9'

    let raf = 0
    const draw = (): void => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const bars = dictation.getBars(BARS)
      const slot = w / BARS
      const bw = slot * 0.55
      const min = bw // pill-shaped minimum (a dot when silent)
      ctx.fillStyle = accent
      ctx.shadowColor = accent
      ctx.shadowBlur = 6 * dpr
      for (let i = 0; i < BARS; i++) {
        // Gentle center-weighted envelope so the ends taper like Wispr Flow.
        const env = 0.55 + 0.45 * Math.sin((Math.PI * i) / (BARS - 1))
        const bh = Math.max(min, bars[i] * env * h)
        const x = i * slot + (slot - bw) / 2
        const y = (h - bh) / 2
        ctx.beginPath()
        ctx.roundRect(x, y, bw, bh, bw / 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [listening])

  if (status !== 'listening' && status !== 'transcribing' && status !== 'loading') return null

  const label =
    status === 'loading'
      ? 'Loading speech model…'
      : status === 'transcribing'
        ? 'Transcribing…'
        : activation === 'ptt'
          ? `Release ${keyName(voiceKey)}`
          : `Tap ${keyName(voiceKey)} to stop`

  return (
    <div className={'dictation-pill dictation-pill--' + status} role="status" aria-live="polite">
      {listening ? (
        <canvas ref={canvasRef} className="dictation-pill__wave" width={120} height={26} />
      ) : (
        <span className="dictation-pill__dot" />
      )}
      <span className="dictation-pill__label">{label}</span>
    </div>
  )
}
