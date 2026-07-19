import { app, BrowserWindow, session, screen, nativeImage, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { registerIpc } from './ipc'
import { installMacMenu } from './menu'
import { migrateUserDataFromVectro } from './migrate-userdata'
import type { PtyManager } from './pty-manager'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// Last-resort guards: on a stranger's machine a stray native error (a dead pty,
// a quarantined .node, a flaky FS) must never take the whole app down silently.
// Log and keep running; the worst case degrades to a single broken pane.
process.on('uncaughtException', (err) => {
  console.error('[monad] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[monad] unhandledRejection:', reason)
})

// Optional profile override: `--user-data-dir=<abs path>` gives this instance
// its own userData AND its own single-instance lock (the lock is keyed to the
// dir), so a packaged test install can run beside the real one without fighting
// it or dirtying its profile. Must precede anything that touches userData.
const userDataArg = process.argv.find((a) => a.startsWith('--user-data-dir='))
if (userDataArg) {
  const dir = userDataArg.slice('--user-data-dir='.length).trim()
  if (dir) app.setPath('userData', dir)
}

// One-shot Vectro → Monad profile migration. Must precede the single-instance
// lock and window creation (both touch the userData dir). Skipped for an
// override profile — migrating the real Vectro data into a throwaway dir would
// duplicate it.
if (!userDataArg) migrateUserDataFromVectro()

// App emblem (Monad's spirograph mark on the brand off-white). build/icon.png is also what electron-builder
// uses to generate the packaged .icns / .ico icons.
const iconPng = join(__dirname, '../../build/icon.png')

// --- Window size/position persistence (survives restarts) ---
interface WinState {
  width: number
  height: number
  x?: number
  y?: number
}
const stateFile = (): string => join(app.getPath('userData'), 'window-state.json')

function loadWinState(): WinState {
  try {
    const s = JSON.parse(readFileSync(stateFile(), 'utf8')) as WinState
    if (typeof s.width === 'number' && typeof s.height === 'number') return s
  } catch {
    /* first run */
  }
  return { width: 1400, height: 900 }
}

/** True only if the saved position lands on a currently-connected display. */
function onScreen(s: WinState): boolean {
  if (s.x == null || s.y == null) return false
  return screen.getAllDisplays().some((d) => {
    const w = d.workArea
    return s.x! < w.x + w.width && s.x! + 40 > w.x && s.y! < w.y + w.height && s.y! + 40 > w.y
  })
}

function saveWinState(w: BrowserWindow): void {
  try {
    if (w.isMinimized() || w.isMaximized() || w.isDestroyed()) return
    const b = w.getBounds()
    writeFileSync(stateFile(), JSON.stringify({ width: b.width, height: b.height, x: b.x, y: b.y }))
  } catch {
    /* ignore */
  }
}

// Lock the renderer down in production. Skipped in dev so Vite HMR (which needs
// inline/eval) works; the dev server is local-only.
function applyProductionCsp(): void {
  if (isDev) return
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'"
        ]
      }
    })
  })
}

let win: BrowserWindow | null = null
let ptyManager: PtyManager

function createWindow(): void {
  const st = loadWinState()
  win = new BrowserWindow({
    width: st.width,
    height: st.height,
    ...(onScreen(st) ? { x: st.x, y: st.y } : {}),
    ...(process.platform !== 'darwin' && existsSync(iconPng) ? { icon: iconPng } : {}),
    minWidth: 720,
    minHeight: 480,
    // Transparent bg + Windows 11 backdrop material = frosted desktop behind the
    // app. 'mica' reads sharper/calmer than 'acrylic' (it tints from the wallpaper
    // instead of live-blurring the desktop) — swap back to 'acrylic' here to A/B.
    backgroundColor: '#00000000',
    backgroundMaterial: 'mica',
    vibrancy: 'under-window', // macOS equivalent (no-op on Windows)
    // Hide the native title bar so the glass runs edge-to-edge. Windows/Linux
    // draw min/max/close as an overlay (top-right); macOS keeps its native
    // traffic lights, nudged to sit centered in our 40px titlebar strip.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 13 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#e6e9f0', height: 40 } }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Nothing uses <webview>; leaving it on is needless attack surface (a guest
      // could ship its own nodeIntegration/preload).
      webviewTag: false
    }
  })

  // The renderer only ever shows this app's own local content. Block any attempt
  // to navigate the top frame off-origin or open a new window — otherwise a stray
  // link, dropped file, or injected navigation would load a page that inherits the
  // full preload `api` (pty.spawn, file read) = remote code execution. External
  // http(s) links still open in the real browser via shell.openExternal.
  win.webContents.on('will-navigate', (e, url) => {
    try {
      if (new URL(url).origin !== new URL(win!.webContents.getURL()).origin) e.preventDefault()
    } catch {
      e.preventDefault()
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const loadRenderer = (): void => {
    if (process.env['ELECTRON_RENDERER_URL']) {
      win?.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((e) =>
        console.error('[monad] loadURL failed:', e)
      )
    } else {
      win?.loadFile(join(__dirname, '../renderer/index.html')).catch((e) =>
        console.error('[monad] loadFile failed:', e)
      )
    }
  }
  loadRenderer()

  // If the renderer crashes or fails to load (corrupt/locked asset, GPU process
  // gone), reload once instead of leaving the user staring at a blank window.
  let recoveries = 0
  const recover = (why: string): void => {
    if (recoveries >= 3 || !win || win.isDestroyed()) return
    recoveries++
    console.error(`[monad] renderer ${why} — reloading (attempt ${recoveries})`)
    // The reloaded renderer respawns its terminals from canvas.json, so the old
    // ptys are orphaned — a hard reload/crash never runs React's unmount cleanup.
    // Kill them here or each crash-recovery leaks a whole set of live shells.
    ptyManager?.killAll()
    setTimeout(loadRenderer, 400)
  }
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    // -3 is ERR_ABORTED (a superseded in-flight nav) — not a real failure.
    if (code !== -3) recover(`did-fail-load (${code} ${desc})`)
  })
  win.webContents.on('render-process-gone', (_e, details) => recover(`gone (${details.reason})`))

  // Persist size/position (debounced) so the window reopens where you left it.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleSave = (): void => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => win && saveWinState(win), 400)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('close', () => win && saveWinState(win))

  // Returning to the window means the attention flash (attention:set in ipc.ts)
  // has done its job — stop it. macOS needs nothing here: the dock bounce
  // self-cancels on activation, and the badge is a passive count that should
  // survive focus until the agents are actually dealt with.
  win.on('focus', () => {
    if (win && !win.isDestroyed()) win.flashFrame(false)
  })
}

// Single-instance: a second launch focuses the existing window instead of running
// a rival main that races on window-state and the same repo's worktrees.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
  applyProductionCsp()
  ptyManager = registerIpc(() => win)
  // macOS needs an explicit menu so ⌘C/⌘V/⌘A reach the terminal instead of being
  // swallowed by the default Edit-menu key equivalents (see menu.ts).
  installMacMenu(() => win)

  // macOS dock icon (the running dev app otherwise shows the Electron icon).
  if (process.platform === 'darwin' && app.dock && existsSync(iconPng)) {
    app.dock.setIcon(nativeImage.createFromPath(iconPng))
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  }).catch((e) => {
    console.error('[monad] failed to start:', e)
    app.quit()
  })

  app.on('window-all-closed', () => {
    ptyManager?.killAll()
    if (process.platform !== 'darwin') app.quit()
  })
}
