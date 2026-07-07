/**
 * Human-readable label for the app's keyboard chords, per platform.
 *
 * The keymap in App.tsx treats the modifier as `metaKey || (ctrlKey && shiftKey)`,
 * so a chord shown as `⌘T` on macOS is actually `Ctrl+Shift+T` on Windows/Linux.
 * UI hints must reflect that or they advertise a combo that doesn't exist.
 */
export function modLabel(key: string): string {
  const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
  return (isMac ? '⌘' : 'Ctrl+Shift+') + key
}

/** Label for the workspace-switch chord (⌘⌥N on macOS, Ctrl+Alt+N elsewhere). */
export function altModLabel(key: string | number): string {
  const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
  return (isMac ? '⌘⌥' : 'Ctrl+Alt+') + key
}

/**
 * Label for chords on the PLAIN primary modifier (⌘ on macOS, bare Ctrl on
 * Windows/Linux). Terminal-local combos (copy/paste/find in TerminalPane) and
 * the interface zoom use this modifier, NOT the app chord — labelling them with
 * modLabel would advertise Ctrl+Shift combos that don't exist.
 */
export function plainModLabel(key: string): string {
  const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
  return (isMac ? '⌘' : 'Ctrl+') + key
}

/**
 * Label for app chords that carry Shift on BOTH platforms (maximize toggle,
 * pane cycling). On Windows/Linux Shift is already part of the base chord so
 * this reads the same as modLabel; on macOS it must show ⌘⇧, which modLabel
 * alone would drop.
 */
export function shiftModLabel(key: string): string {
  const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
  return (isMac ? '⌘⇧' : 'Ctrl+Shift+') + key
}
