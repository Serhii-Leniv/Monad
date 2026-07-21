/**
 * Window-level focus tint.
 *
 * Native applications desaturate when their window is not the key window — it
 * is how the OS tells you, at a glance and without reading anything, which
 * window your keystrokes are going to. Almost no Electron app does it, and its
 * absence is a large part of why they read as web pages in a frame.
 *
 * This is the window-scale version of what unfocused panes do inside the app:
 * signal inactivity by receding, never by marking the active thing. Receding
 * adds no ink to an already dense interface.
 *
 * Deliberately separate from powerIdle.ts. That module answers "is anybody
 * watching?" and pauses work to save power; this one answers "is this window
 * in front?" and is purely presentational. They observe the same events for
 * unrelated reasons, and merging them would couple a battery concern to a
 * visual one.
 */

const BLURRED = 'is-window-blurred'

/** Stamps `is-window-blurred` on <body> while the window is not focused. */
export function initWindowFocus(): () => void {
  const apply = (focused: boolean): void => {
    document.body.classList.toggle(BLURRED, !focused)
  }

  const onFocus = (): void => apply(true)
  const onBlur = (): void => apply(false)

  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)

  // Seed from the current state rather than assuming focused: the renderer can
  // finish booting while the user is already in another window, and starting on
  // the wrong assumption leaves the tint stuck until the next focus change.
  apply(document.hasFocus())

  return () => {
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
    document.body.classList.remove(BLURRED)
  }
}
