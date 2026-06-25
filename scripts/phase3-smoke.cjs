// Phase 3 integration test: diff + merge of an agent's worktree work.
//   1. create an isolated worktree for an agent
//   2. simulate agent edits in the worktree (modify a tracked file + add a new file)
//   3. git:diff reports the changes (tracked diff + untracked file)
//   4. git:merge commits the work and merges it into the base branch
//   5. the base branch now contains the agent's changes
const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const os = require('os')
const fs = require('fs')
const { execFileSync } = require('child_process')
const { registerIpc } = require(join(__dirname, '..', 'out', 'main', 'ipc.js'))

app.disableHardwareAcceleration()

const REPO = join(os.tmpdir(), 'agent-canvas-p3-' + process.pid)
const AGENT_ID = 'agent-bbbbbbbb'
const errors = []

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' })
}

function setupRepo() {
  fs.mkdirSync(REPO, { recursive: true })
  git(['init'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test'])
  fs.writeFileSync(join(REPO, 'README.md'), '# test\nline\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
}

function cleanup() {
  for (const p of [REPO, join(os.tmpdir(), '.agent-canvas-worktrees')]) {
    try {
      fs.rmSync(p, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

app.whenReady().then(async () => {
  setupRepo()

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message)
  })
  registerIpc(() => win)
  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html'))

  const wt = await win.webContents.executeJavaScript(
    `window.api.worktree.create(${JSON.stringify(REPO)}, ${JSON.stringify(AGENT_ID)}, 'worktree')`,
    true
  )

  // Simulate the agent editing inside its worktree.
  fs.appendFileSync(join(wt.cwd, 'README.md'), 'AGENT_EDIT_LINE\n')
  fs.writeFileSync(join(wt.cwd, 'feature.txt'), 'new feature from agent\n')

  const diff = await win.webContents.executeJavaScript(
    `window.api.git.diff(${JSON.stringify(REPO)}, ${JSON.stringify(AGENT_ID)})`,
    true
  )

  const diffSeesTracked = diff.hasChanges && diff.diff.includes('AGENT_EDIT_LINE')
  const diffSeesUntracked = diff.untracked.includes('feature.txt')

  const merge = await win.webContents.executeJavaScript(
    `window.api.git.merge(${JSON.stringify(REPO)}, ${JSON.stringify(AGENT_ID)}, 'agent work')`,
    true
  )

  // Base branch (repo root working tree) should now contain the agent's work.
  const baseHasEdit = fs.readFileSync(join(REPO, 'README.md'), 'utf8').includes('AGENT_EDIT_LINE')
  const baseHasFile = fs.existsSync(join(REPO, 'feature.txt'))
  const logHasMerge = git(['log', '--oneline']).includes('Merge canvas/')

  console.log('[p3] worktree created     : ' + (wt.isolated === true))
  console.log('[p3] diff sees tracked    : ' + diffSeesTracked)
  console.log('[p3] diff sees untracked  : ' + diffSeesUntracked)
  console.log('[p3] merge ok             : ' + merge.ok + (merge.error ? ' (' + merge.error + ')' : ''))
  console.log('[p3] base has edit        : ' + baseHasEdit)
  console.log('[p3] base has new file    : ' + baseHasFile)
  console.log('[p3] merge commit in log  : ' + logHasMerge)
  console.log('[p3] console errors       : ' + (errors.length ? errors.join(' | ') : 'none'))

  const pass =
    wt.isolated &&
    diffSeesTracked &&
    diffSeesUntracked &&
    merge.ok &&
    baseHasEdit &&
    baseHasFile &&
    logHasMerge &&
    errors.length === 0
  console.log('[p3] RESULT: ' + (pass ? 'PASS' : 'FAIL'))
  cleanup()
  clearTimeout(timer)
  win.destroy()
  process.exit(pass ? 0 : 2)
})

const timer = setTimeout(() => {
  console.log('[p3] TIMEOUT')
  cleanup()
  process.exit(3)
}, 30000)
