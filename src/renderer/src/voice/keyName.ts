/** Friendly, platform-aware label for a KeyboardEvent.code used as the voice trigger. */
export function keyName(code: string): string {
  const mac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
  const map: Record<string, string> = {
    ShiftRight: 'Right Shift',
    ShiftLeft: 'Left Shift',
    AltRight: mac ? 'Right Option' : 'Right Alt',
    AltLeft: mac ? 'Left Option' : 'Left Alt',
    ControlRight: 'Right Ctrl',
    ControlLeft: 'Left Ctrl',
    MetaRight: mac ? 'Right ⌘' : 'Right Win',
    MetaLeft: mac ? 'Left ⌘' : 'Left Win',
    Space: 'Space'
  }
  if (map[code]) return map[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}
