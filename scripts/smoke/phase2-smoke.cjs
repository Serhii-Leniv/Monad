// Phase 2 integration test: drives the real IPC against a real temp git repo.
//   1. git:info detects the repo + base branch
//   2. worktree:create makes an isolated worktree+branch; an agent PTY runs IN it
//   3. `git worktree list` reflects the new worktree
//   4. worktree:remove tears the worktree+branch back down
const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const os = require('os')
const fs = require('fs')
const { execFileSync } = require('child_process')
const { registerIpc } = require(join(__dirname, '..', '..', 'out', 'main', 'ipc.js'))

app.disableHardwareAcceleration()

const REPO = join(os.tmpdir(), 'monad-p2-' + process.pid)
const errors = []

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' })
}
function worktreeCount() {
  return execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.startsWith('worktree ')).length
}

function setupRepo() {
  fs.mkdirSync(REPO, { recursive: true })
  git(['init'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test'])
  fs.writeFileSync(join(REPO, 'README.md'), '# test\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
}

const AGENT_ID = 'agent-aaaaaaaa'

app.whenReady().then(async () => {
  setupRepo()

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', '..', 'out', 'preload', 'index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message)
  })
  registerIpc(() => win)
  await win.loadFile(join(__dirname, '..', '..', 'out', 'renderer', 'index.html'))

  const createScript = `(async () => {
    // Non-interactive spawn => no PSReadLine echo/ANSI; clean cwd proof.
    const runArgs = (cwd, psCommand, marker, t=15000) => new Promise((resolve) => {
      let buf = ''
      window.api.pty.spawn({ shell: 'powershell.exe', args: ['-NoProfile','-NoLogo','-Command', psCommand], cwd, cols: 120, rows: 30 }).then((pid) => {
        const off = window.api.pty.onData(pid, (d) => {
          buf += d
          if (buf.includes(marker)) { off(); window.api.pty.kill(pid); resolve({ seen: true, buf }) }
        })
        setTimeout(() => { off(); window.api.pty.kill(pid); resolve({ seen: buf.includes(marker), buf }) }, t)
      })
    })
    const info = await window.api.git.info(${JSON.stringify(REPO)})
    const wt = await window.api.worktree.create(${JSON.stringify(REPO)}, ${JSON.stringify(AGENT_ID)}, 'worktree')
    const wtRun = await runArgs(wt.cwd, 'Write-Output ("CWD=" + (Get-Location).Path); New-Item -ItemType File marker.txt -Force > $null; Write-Output DONE_WT', 'DONE_WT', 20000)
    // Product mechanism: INTERACTIVE shell + Set-Location enforcement. Detect
    // via the filesystem only (interactive PSReadLine echoes the command, which
    // would race any stdout marker). Fire, wait, then main checks marker2.
    const fireAndWait = (cwd, cmd, ms=7000) => new Promise((resolve) => {
      window.api.pty.spawn({ cwd, cols: 120, rows: 30 }).then((pid) => {
        window.api.pty.write(pid, cmd + '\\r')
        setTimeout(() => { window.api.pty.kill(pid); resolve(true) }, ms)
      })
    })
    const cdCmd = "Set-Location -LiteralPath '" + wt.cwd.replace(/'/g, "''") + "'"
    await fireAndWait(wt.cwd, cdCmd + '; New-Item -ItemType File marker2.txt -Force > $null')
    const cwdLine = (wtRun.buf.match(/CWD=([^\\r\\n]+)/) || [])[1] || ''
    return { info, wt, ranInWorktree: wtRun.seen, reportedCwd: cwdLine.trim() }
  })()`

  let r
  try {
    r = await win.webContents.executeJavaScript(createScript, true)
  } catch (e) {
    console.log('[p2] executeJavaScript failed:', e.message)
    cleanup()
    app.exit(5)
  }

  const wtCountAfterCreate = worktreeCount()
  const markerExists = fs.existsSync(join(r.wt.cwd, 'marker.txt'))
  const marker2Exists = fs.existsSync(join(r.wt.cwd, 'marker2.txt'))

  // Now remove the worktree via the real IPC.
  await win.webContents.executeJavaScript(
    `window.api.worktree.remove(${JSON.stringify(REPO)}, ${JSON.stringify(AGENT_ID)})`,
    true
  )
  const wtCountAfterRemove = worktreeCount()
  const branchGone =
    git(['branch', '--list', r.wt.branch]).trim() === '' // empty => branch deleted

  console.log('[p2] git detected         : ' + r.info.isGit + ' (branch ' + r.info.branch + ')')
  console.log('[p2] worktree isolated    : ' + r.wt.isolated + ' branch=' + r.wt.branch)
  console.log('[p2] agent cmd completed   : ' + r.ranInWorktree)
  console.log('[p2] expected worktree cwd : ' + r.wt.cwd)
  console.log('[p2] shell reported cwd    : ' + r.reportedCwd)
  console.log('[p2] marker file in worktree: ' + markerExists)
  console.log('[p2] interactive+cd lands  : ' + marker2Exists)
  console.log('[p2] worktree list = 2    : ' + (wtCountAfterCreate === 2) + ' (' + wtCountAfterCreate + ')')
  console.log('[p2] worktree removed     : ' + (wtCountAfterRemove === 1) + ' (' + wtCountAfterRemove + ')')
  console.log('[p2] branch deleted       : ' + branchGone)
  console.log('[p2] console errors       : ' + (errors.length ? errors.join(' | ') : 'none'))

  const pass =
    r.info.isGit &&
    r.wt.isolated &&
    r.wt.branch.startsWith('canvas/') &&
    r.ranInWorktree &&
    markerExists &&
    marker2Exists &&
    wtCountAfterCreate === 2 &&
    wtCountAfterRemove === 1 &&
    branchGone &&
    errors.length === 0
  console.log('[p2] RESULT: ' + (pass ? 'PASS' : 'FAIL'))
  cleanup()
  clearTimeout(timer)
  // Exit via app.exit, and give teardown a beat first.
  //
  // process.exit raced Electron's own shutdown: on a loaded runner (two CI jobs
  // on one box) the process could die with code 1 BEFORE the requested code
  // landed, reporting a passing smoke as a CI failure.
  //
  // The delay matters where a PTY is live — exiting straight into node-pty's
  // native teardown segfaults (139) or hangs. 250ms lets it settle. app.exit
  // also closes every window, so the old win.destroy() beforehand isn't needed.
  setTimeout(() => app.exit(pass ? 0 : 2), 250)
})

function cleanup() {
  try {
    fs.rmSync(REPO, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(join(os.tmpdir(), '.monad-worktrees'), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

const timer = setTimeout(() => {
  console.log('[p2] TIMEOUT')
  cleanup()
  app.exit(3)
}, 40000)
