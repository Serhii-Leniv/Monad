/**
 * Tiny WebAudio cue tones — no audio assets, no network. A soft two-note rise
 * when an agent needs you or finishes, a lower fall on error. Rate-limited so a
 * burst of status flips across many agents can't turn into a stutter.
 */
let ctx: AudioContext | null = null
let last = 0

function audio(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!ctx) ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

export type Cue = 'attention' | 'done' | 'error'

// Two notes per cue (Hz): a gentle rising third for the good news, a falling
// minor for an error.
const NOTES: Record<Cue, [number, number]> = {
  attention: [659.25, 880],
  done: [587.33, 880],
  error: [392, 261.63]
}

export function playCue(cue: Cue): void {
  const now = Date.now()
  if (now - last < 1200) return
  last = now
  play(cue)
}

/**
 * Settings "Preview" button — bypasses ONLY the rate limiter (clicking Preview
 * must always sound, even right after a real cue), same tone and volume.
 */
export function previewCue(cue: Cue): void {
  play(cue)
}

function play(cue: Cue): void {
  const ac = audio()
  if (!ac) return
  try {
    if (ac.state === 'suspended') void ac.resume()
    const t0 = ac.currentTime
    NOTES[cue].forEach((freq, i) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.1
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.06, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26)
      osc.connect(gain).connect(ac.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    })
  } catch {
    /* audio blocked / unavailable — silently skip */
  }
}
