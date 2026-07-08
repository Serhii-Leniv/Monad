// Phase 1 integration smoke test. Loads the BUILT renderer in a hidden window
// and drives the real preload bridge:
//   1. window.api.{pty,project} exist and React mounted (#root has children)
//   2. project.save -> project.load roundtrip writes/reads .monad/canvas.json
//   3. a PTY spawned from the renderer echoes through a real shell
const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const os = require('os')
const fs = require('fs')
const { registerIpc } = require(join(__dirname, '..', 'out', 'main', 'ipc.js'))

app.disableHardwareAcceleration()

const TMP = join(os.tmpdir(), 'monad-smoke-' + process.pid)
fs.mkdirSync(TMP, { recursive: true })

const errors = []

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message) // 3=error only
  })
  win.webContents.on('render-process-gone', (_e, d) => errors.push('render-gone: ' + d.reason))

  // Register the REAL main-process handlers against this hidden window.
  registerIpc(() => win)

  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html'))

  const script = `(async () => {
    const hasApi = !!(window.api && window.api.pty && window.api.project)
    const rootChildren = document.getElementById('root')?.childElementCount ?? 0
    const sample = { agents: [{ id: 't1', agentType: 'claude', label: 'Claude Code 1', x: 11, y: 22, w: 480, h: 340 }] }
    const saved = await window.api.project.save(${JSON.stringify(TMP)}, sample)
    const loaded = await window.api.project.load(${JSON.stringify(TMP)})
    const roundtrip = !!loaded && loaded.agents?.[0]?.id === 't1' && loaded.agents[0].x === 11
    const ptyEcho = await new Promise((resolve) => {
      let buf = ''
      window.api.pty.spawn({ cwd: ${JSON.stringify(TMP)}, cols: 80, rows: 24 }).then((pid) => {
        const off = window.api.pty.onData(pid, (d) => {
          buf += d
          if (buf.includes('HELLO_P1')) { off(); window.api.pty.kill(pid); resolve(true) }
        })
        setTimeout(() => { off(); window.api.pty.kill(pid); resolve(buf.includes('HELLO_P1')) }, 8000)
        window.api.pty.write(pid, 'echo HELLO_P1\\r')
      })
    })
    return { hasApi, rootChildren, saved, roundtrip, ptyEcho }
  })()`

  let result
  try {
    result = await win.webContents.executeJavaScript(script, true)
  } catch (e) {
    console.log('[p1] executeJavaScript failed:', e.message)
    app.exit(5)
    return
  }

  // Confirm the file actually exists on disk where we expect it.
  const fileExists = fs.existsSync(join(TMP, '.monad', 'canvas.json'))

  console.log('[p1] preload api present : ' + result.hasApi)
  console.log('[p1] react mounted (#root): ' + (result.rootChildren > 0) + ' (' + result.rootChildren + ' children)')
  console.log('[p1] project save ok      : ' + result.saved)
  console.log('[p1] canvas.json on disk  : ' + fileExists)
  console.log('[p1] save/load roundtrip  : ' + result.roundtrip)
  console.log('[p1] renderer pty echo    : ' + result.ptyEcho)
  console.log('[p1] console errors       : ' + (errors.length ? errors.join(' | ') : 'none'))

  try {
    fs.rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* ignore */
  }

  const pass =
    result.hasApi &&
    result.rootChildren > 0 &&
    result.saved &&
    fileExists &&
    result.roundtrip &&
    result.ptyEcho &&
    errors.length === 0
  console.log('[p1] RESULT: ' + (pass ? 'PASS' : 'FAIL'))
  clearTimeout(timer)
  win.destroy()
  process.exit(pass ? 0 : 2)
})

const timer = setTimeout(() => {
  console.log('[p1] TIMEOUT')
  process.exit(3)
}, 30000)
