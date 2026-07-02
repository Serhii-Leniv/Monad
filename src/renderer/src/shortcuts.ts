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
