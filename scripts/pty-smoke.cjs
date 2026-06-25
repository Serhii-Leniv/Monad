// Headless smoke test: runs under Electron (npm run smoke:pty) to prove the
// node-pty prebuilt loads under Electron's ABI and a real shell echoes back.
const { app } = require('electron')
const pty = require('@homebridge/node-pty-prebuilt-multiarch')

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const isWin = process.platform === 'win32'
  const shell = isWin ? 'powershell.exe' : 'bash'
  const args = isWin
    ? ['-NoLogo', '-NoProfile', '-Command', 'Write-Output PTY_OK_123; exit']
    : ['-c', 'echo PTY_OK_123']

  const proc = pty.spawn(shell, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env
  })

  let buf = ''
  proc.onData((d) => {
    buf += d
  })

  proc.onExit(({ exitCode }) => {
    const ok = buf.includes('PTY_OK_123')
    console.log('[smoke] pty module loaded : true')
    console.log('[smoke] echo round-trip  : ' + ok)
    console.log('[smoke] shell exit code  : ' + exitCode)
    app.exit(ok ? 0 : 2)
  })

  setTimeout(() => {
    console.log('[smoke] TIMEOUT — no exit within 15s')
    app.exit(3)
  }, 15000)
})
