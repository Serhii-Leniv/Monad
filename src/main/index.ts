import { app, BrowserWindow, session, screen, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { registerIpc } from './ipc'
import type { PtyManager } from './pty-manager'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// Last-resort guards: on a stranger's machine a stray native error (a dead pty,
// a quarantined .node, a flaky FS) must never take the whole app down silently.
// Log and keep running; the worst case degrades to a single broken pane.
process.on('uncaughtException', (err) => {
  console.error('[vectro] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[vectro] unhandledRejection:', reason)
})

// App emblem (the liquid-glass mark). build/icon.png is also what electron-builder
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
    // Transparent bg + Windows 11 acrylic = frosted desktop behind the app.
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    vibrancy: 'under-window', // macOS equivalent (no-op on Windows)
    // Hide the native title bar so the glass runs edge-to-edge; keep the
    // native min/max/close as an overlay.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e6e9f0', height: 40 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  const loadRenderer = (): void => {
    if (process.env['ELECTRON_RENDERER_URL']) {
      win?.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((e) =>
        console.error('[vectro] loadURL failed:', e)
      )
    } else {
      win?.loadFile(join(__dirname, '../renderer/index.html')).catch((e) =>
        console.error('[vectro] loadFile failed:', e)
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
    console.error(`[vectro] renderer ${why} — reloading (attempt ${recoveries})`)
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
}

app.whenReady().then(() => {
  applyProductionCsp()
  ptyManager = registerIpc(() => win)

  // macOS dock icon (the running dev app otherwise shows the Electron icon).
  if (process.platform === 'darwin' && app.dock && existsSync(iconPng)) {
    app.dock.setIcon(nativeImage.createFromPath(iconPng))
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((e) => {
  console.error('[vectro] failed to start:', e)
  app.quit()
})

app.on('window-all-closed', () => {
  ptyManager?.killAll()
  if (process.platform !== 'darwin') app.quit()
})
