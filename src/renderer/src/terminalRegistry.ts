import type { Terminal } from '@xterm/xterm'
import { useStore } from './store'

/**
 * Live xterm instances keyed by agent id. TerminalPane (un)registers on
 * mount/unmount so the macOS Edit-menu handler can reach whichever terminal
 * currently holds focus without threading refs through the component tree.
 */
export const terminals = new Map<string, Terminal>()

/**
 * Hand keyboard focus back to the active terminal (the maximized one, else the
 * sole selected one). Called after an overlay closes or a click lands off a pane,
 * so typing never dead-ends on `<body>` when no selection *transition* occurred
 * to trigger TerminalPane's own focus effect.
 */
export function focusActiveTerminal(): void {
  const st = useStore.getState()
  const id = st.focusedId ?? st.selectedIds[0]
  if (id) terminals.get(id)?.focus()
}

/** Paths → one shell-ready string: quoted when they contain tricky chars. */
export function quotePaths(paths: string[]): string {
  return paths.map((p) => (/[\s"'`$&;()[\]{}]/.test(p) ? `"${p}"` : p)).join(' ')
}

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

  const applyToTerm = async (term: Terminal): Promise<void> => {
    if (action === 'copy') {
      if (term.hasSelection()) window.api.clipboard.write(term.getSelection())
    } else if (action === 'paste') {
      const t = await window.api.clipboard.read()
      if (t) term.paste(t)
      else {
        // No text: copied files paste as quoted paths (like any terminal);
        // an image-only clipboard forwards the raw Ctrl+V byte so TUIs that
        // read the OS clipboard themselves (Claude Code) handle it.
        const files = await window.api.clipboard.readFiles()
        if (files.length) term.paste(quotePaths(files))
        else if (await window.api.clipboard.hasImage()) term.input('\x16', true)
      }
      term.focus()
    } else {
      term.selectAll()
    }
  }

  const termHost = el?.closest?.('.vec-pane__term') as HTMLElement | null
  if (termHost) {
    const paneId = (termHost.closest('.vec-pane') as HTMLElement | null)?.dataset.id
    const term = paneId ? terminals.get(paneId) : undefined
    if (term) await applyToTerm(term)
    return
  }

  // Plain input / textarea (rename field, search box).
  const input = el as HTMLInputElement | HTMLTextAreaElement | null
  if (!input || typeof input.value !== 'string') {
    // Nothing has DOM focus (e.g. the user clicked a pane header, then hit ⌘V).
    // Route to the terminal they mean: the focused pane, or the single selected
    // one — so paste "just works" instead of silently going nowhere.
    const st = useStore.getState()
    const targetId = st.focusedId ?? (st.selectedIds.length === 1 ? st.selectedIds[0] : null)
    const term = targetId ? terminals.get(targetId) : undefined
    if (term) await applyToTerm(term)
    return
  }
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
