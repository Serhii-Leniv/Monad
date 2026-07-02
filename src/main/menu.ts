import { Menu, BrowserWindow, type MenuItemConstructorOptions } from 'electron'

/**
 * macOS application menu.
 *
 * WHY THIS EXISTS: without an explicit menu, macOS falls back to Electron's
 * default menu, whose Edit roles bind ⌘C/⌘V/⌘A as native key equivalents.
 * AppKit consumes those keystrokes at the menu level *before* they ever reach
 * the web content — so xterm's own copy/paste handler never runs, ⌘C copies the
 * (empty) hidden textarea instead of the terminal selection, and ⌘V pastes
 * flakily via the raw paste event. That's the "terminal copy/paste is broken on
 * Mac" bug that the renderer-side clipboard fix couldn't touch.
 *
 * The fix: own ⌘C/⌘V/⌘A ourselves and forward them to the renderer, which routes
 * by focus — terminal selection → xterm + main-process clipboard, normal inputs
 * (rename / search) → native editing. ⌘X stays a native role (cut only matters
 * in the plain inputs; it's a no-op in the terminal).
 *
 * Only installed on darwin. On Windows/Linux the terminal already receives
 * Ctrl+C (needed for SIGINT) and the default hidden menu is left untouched.
 */
export function installMacMenu(getWindow: () => BrowserWindow | null): void {
  if (process.platform !== 'darwin') return

  const sendEdit = (action: 'copy' | 'paste' | 'selectAll'): void => {
    const w = getWindow()
    if (w && !w.isDestroyed() && !w.webContents.isDestroyed()) {
      w.webContents.send('menu:edit', action)
    }
  }

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { label: 'Copy', accelerator: 'Cmd+C', click: () => sendEdit('copy') },
        { label: 'Paste', accelerator: 'Cmd+V', click: () => sendEdit('paste') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'Cmd+A', click: () => sendEdit('selectAll') }
      ]
    },
    // Dev only: reload/DevTools. Deliberately omitted in production — an accidental
    // ⌘R would reload the renderer and wipe every live terminal session.
    ...(process.env['ELECTRON_RENDERER_URL']
      ? ([{ role: 'viewMenu' } as MenuItemConstructorOptions])
      : []),
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
