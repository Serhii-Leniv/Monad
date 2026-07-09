import type { Terminal } from '@xterm/xterm'
import { useStore, activeWs } from './store'

/**
 * Live xterm instances keyed by agent id. TerminalPane (un)registers on
 * mount/unmount so the macOS Edit-menu handler can reach whichever terminal
 * currently holds focus without threading refs through the component tree.
 */
export const terminals = new Map<string, Terminal>()

/**
 * Each pane's FitAddon-driven refit, keyed by agent id. Registered on mount so a
 * workspace's terminals can be re-measured when it's brought to the foreground —
 * background workspaces are laid out while hidden, and a refit on show settles
 * any viewport drift from the visibility flip.
 */
export const fits = new Map<string, () => void>()

/** Refit a set of agents' terminals (the workspace being activated). */
export function refitAgents(ids: string[]): void {
  for (const id of ids) fits.get(id)?.()
}

/**
 * Hand keyboard focus back to the active terminal (the maximized one, else the
 * sole selected one). Called after an overlay closes or a click lands off a pane,
 * so typing never dead-ends on `<body>` when no selection *transition* occurred
 * to trigger TerminalPane's own focus effect.
 */
export function focusActiveTerminal(): void {
  const ws = activeWs(useStore.getState())
  const id = ws?.focusedId ?? ws?.selectedIds[0]
  if (id) terminals.get(id)?.focus()
}

/**
 * Write the same input to several agents' PTYs at once (the broadcast bar).
 * Each agent's live ptyId comes from the store (TerminalPane publishes it via
 * setAgentRuntime the moment its shell spawns); an agent whose shell hasn't
 * spawned yet — or failed to — is skipped rather than erroring the whole send.
 */
export function broadcastToAgents(ids: string[], data: string): void {
  const agents = activeWs(useStore.getState())?.agents ?? []
  for (const id of ids) {
    const ptyId = agents.find((a) => a.id === id)?.ptyId
    if (ptyId) window.api.pty.write(ptyId, data)
  }
}

/** Paths → one shell-ready string: quoted when they contain tricky chars. */
export function quotePaths(paths: string[]): string {
  return paths.map((p) => (/[\s"'`$&;()[\]{}]/.test(p) ? `"${p}"` : p)).join(' ')
}

/**
 * Paste the OS clipboard into a terminal — the single source of truth for every
 * paste path (xterm Ctrl/⌘+V, context menu, mac Edit menu, the app-level Windows
 * fallback). Reads via the main process (window.api.clipboard) because
 * navigator.clipboard.readText() rejects intermittently in Electron when the
 * window isn't focused, which made paste silently no-op. term.paste() applies
 * bracketed-paste + \r\n cleanup so TUIs/agents receive the text correctly.
 */
export async function pasteIntoTerminal(term: Terminal): Promise<void> {
  try {
    const t = await window.api.clipboard.read()
    if (t) {
      term.paste(t)
      return
    }
    // No text — copied files paste as quoted paths, like any terminal.
    const files = await window.api.clipboard.readFiles()
    if (files.length) {
      term.paste(quotePaths(files))
      return
    }
    // A screenshot: a pty can't carry pixels, so forward the raw Ctrl+V byte so
    // TUIs that read the OS clipboard themselves (Claude Code image paste) get it.
    if (await window.api.clipboard.hasImage()) term.input('\x16', true)
  } catch {
    /* clipboard unavailable — nothing to paste */
  }
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
      await pasteIntoTerminal(term)
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
    const ws = activeWs(useStore.getState())
    // Only an unambiguous target — the maximized pane or the sole selection; under a
    // multi-select, paste stays suppressed rather than landing in an arbitrary pane.
    const targetId = ws?.focusedId ?? (ws?.selectedIds.length === 1 ? ws.selectedIds[0] : null)
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
