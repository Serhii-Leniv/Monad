import type { Terminal } from '@xterm/xterm'

/**
 * Live xterm instances keyed by agent id. TerminalPane (un)registers on
 * mount/unmount so the macOS Edit-menu handler can reach whichever terminal
 * currently holds focus without threading refs through the component tree.
 */
export const terminals = new Map<string, Terminal>()

/**
 * Route a macOS Edit-menu command (⌘C/⌘V/⌘A) by focus.
 *
 * A focused terminal → xterm selection + the main-process clipboard (same path
 * as Ctrl/Cmd handling on Windows). A focused plain input (rename / search) →
 * native editing so those fields still copy/paste normally. The distinction is
 * the DOM: xterm's textarea lives inside `.vec-pane__term`; the inputs don't.
 */
export async function handleMenuEdit(action: 'copy' | 'paste' | 'selectAll'): Promise<void> {
  const el = document.activeElement as HTMLElement | null

  const termHost = el?.closest?.('.vec-pane__term') as HTMLElement | null
  if (termHost) {
    const paneId = (termHost.closest('.vec-pane') as HTMLElement | null)?.dataset.id
    const term = paneId ? terminals.get(paneId) : undefined
    if (!term) return
    if (action === 'copy') {
      if (term.hasSelection()) window.api.clipboard.write(term.getSelection())
    } else if (action === 'paste') {
      const t = await window.api.clipboard.read()
      if (t) term.paste(t)
    } else {
      term.selectAll()
    }
    return
  }

  // Plain input / textarea (rename field, search box).
  const input = el as HTMLInputElement | HTMLTextAreaElement | null
  if (!input || typeof input.value !== 'string') return
  if (action === 'selectAll') {
    input.select?.()
    return
  }
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  if (action === 'copy') {
    const sel = input.value.slice(start, end)
    if (sel) window.api.clipboard.write(sel)
    return
  }
  // paste — splice clipboard text in at the cursor, then fire a native input
  // event so React's controlled value stays in sync.
  const t = await window.api.clipboard.read()
  if (!t) return
  const next = input.value.slice(0, start) + t + input.value.slice(end)
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set
  setter?.call(input, next)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const pos = start + t.length
  input.setSelectionRange?.(pos, pos)
}
