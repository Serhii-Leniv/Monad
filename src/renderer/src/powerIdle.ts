/**
 * Pause decorative animation when nobody is watching.
 *
 * The ambient aurora orbs animate forever behind a dozen backdrop-filtered
 * glass surfaces, so every animation frame forces the compositor to re-sample
 * every blur — a constant GPU draw even when the app sits idle. Stamping these
 * body classes lets CSS (`animation-play-state: paused`, see the "power" block
 * in styles.css) freeze purely decorative motion the moment it can't be seen:
 *
 *  - is-blurred  the window lost focus
 *  - is-hidden   the document isn't visible (minimized, fully occluded,
 *                another Space) — relies on Electron's default background
 *                throttling flipping document.visibilityState
 *  - is-idle     no keyboard/pointer input for IDLE_MS
 *
 * Paused animations resume from the exact frame they stopped on, so coming
 * back is seamless — no jump, no restart. PTY output deliberately does NOT
 * reset the idle timer: agents streaming while the user is away should leave
 * the decoration paused.
 */

const IDLE_MS = 60_000
/** Skip idle-timer re-arms closer together than this (pointermove churn). */
const RESET_THROTTLE_MS = 1_000

export function installPowerIdle(): () => void {
  const cls = document.body.classList

  const onFocus = (): void => cls.remove('is-blurred')
  const onBlur = (): void => cls.add('is-blurred')
  const onVisibility = (): void => {
    cls.toggle('is-hidden', document.visibilityState !== 'visible')
  }

  let idleTimer = 0
  let lastReset = 0
  const armIdle = (): void => {
    idleTimer = window.setTimeout(() => cls.add('is-idle'), IDLE_MS)
  }
  const onInput = (): void => {
    const now = Date.now()
    if (now - lastReset < RESET_THROTTLE_MS && !cls.contains('is-idle')) return
    lastReset = now
    cls.remove('is-idle')
    window.clearTimeout(idleTimer)
    armIdle()
  }

  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
  const inputEvents = ['keydown', 'pointerdown', 'wheel', 'pointermove'] as const
  for (const ev of inputEvents) {
    window.addEventListener(ev, onInput, { passive: true, capture: true })
  }

  // Initialize from the current state (the window may mount unfocused).
  if (!document.hasFocus()) cls.add('is-blurred')
  onVisibility()
  armIdle()

  return () => {
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onVisibility)
    for (const ev of inputEvents) {
      window.removeEventListener(ev, onInput, { capture: true })
    }
    window.clearTimeout(idleTimer)
    cls.remove('is-blurred', 'is-hidden', 'is-idle')
  }
}
