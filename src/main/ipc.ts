import { app, ipcMain, dialog, BrowserWindow, Notification, shell, clipboard } from 'electron'
import { join, basename, isAbsolute } from 'path'
import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

const pexecFile = promisify(execFile)

// Terminal output is untrusted: a printed path renders as a clickable "file link",
// so opening one must never one-click-execute a binary/script. These extensions
// get revealed in the file manager instead of run.
const UNSAFE_OPEN =
  /\.(exe|bat|cmd|com|scr|ps1|psm1|vbs|vbe|js|jse|jar|msi|msix|lnk|app|command|sh|bash|zsh|desktop|reg|hta|wsf|pif|gadget)$/i
import { PtyManager, type SpawnOptions } from './pty-manager'
import {
  getGitInfo,
  getRepoRootSafe,
  initRepo,
  createWorktree,
  removeWorktree,
  pruneWorktrees,
  findOrphanWorktrees,
  cleanOrphanWorktrees,
  getAgentDiff,
  mergeAgent,
  applyAgentFiles,
  friendlyGitError
} from './git'
import { detectShells, detectAgents } from './shells'
import { checkForUpdate } from './update'
import { sendFeedback, FEEDBACK_EMAIL, type FeedbackInput, type FeedbackCategory } from './feedback'

/**
 * Registers every main-process IPC handler against a window accessor.
 * Extracted from index.ts so the same wiring can be driven by integration
 * tests, and so Phase 2's git/worktree handlers slot in alongside these.
 * Returns the PtyManager so the caller can kill sessions on quit.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): PtyManager {
  // Guard against a destroyed window: a PTY can still emit during teardown,
  // and webContents.send on a destroyed object throws "Object has been destroyed".
  const send = (channel: string, payload: unknown): void => {
    const w = getWindow()
    if (w && !w.isDestroyed() && !w.webContents.isDestroyed()) {
      w.webContents.send(channel, payload)
    }
  }
  const ptyManager = new PtyManager(
    (id, data) => send('pty:data', { id, data }),
    (id, code, signal) => send('pty:exit', { id, code, signal })
  )

  ipcMain.handle('pty:spawn', (_e, opts: SpawnOptions) => ptyManager.spawn(opts ?? {}))
  ipcMain.on('pty:input', (_e, { id, data }: { id: string; data: string }) =>
    ptyManager.write(id, data)
  )
  ipcMain.on('pty:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) =>
    ptyManager.resize(id, cols, rows)
  )
  ipcMain.on('pty:kill', (_e, { id }: { id: string }) => ptyManager.kill(id))

  // Clipboard via the main process: the renderer's navigator.clipboard.* is
  // gated on window focus and permissions and rejects intermittently ("Document
  // is not focused"), which surfaced as paste silently failing. The main-process
  // clipboard module is synchronous and has no such gating.
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.on('clipboard:write', (_e, { text }: { text: string }) => clipboard.writeText(text))
  // Whether the clipboard holds an image (e.g. a screenshot). Paste can't
  // transmit pixels through a pty — instead the renderer forwards the raw
  // Ctrl+V byte so TUIs that read the OS clipboard themselves (Claude Code
  // image paste) still get their keystroke.
  ipcMain.handle('clipboard:hasImage', () =>
    clipboard.availableFormats().some((f) => f.startsWith('image/'))
  )
  // Files copied in Explorer/Finder: a normal terminal pastes their paths.
  // Formats are per-platform; every read is defensive (formats lie, buffers
  // vary) and failure just means "no files".
  ipcMain.handle('clipboard:readFiles', async (): Promise<string[]> => {
    if (process.platform === 'darwin') {
      try {
        // XML plist with every copied path.
        const plist = clipboard.read('NSFilenamesPboardType')
        const paths = [...plist.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) =>
          m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        )
        if (paths.length) return paths
      } catch {
        /* fall through */
      }
      try {
        const url = clipboard.read('public.file-url')
        if (url) return [decodeURIComponent(url.replace(/^file:\/\/(localhost)?/, ''))]
      } catch {
        /* no files */
      }
      return []
    }
    if (process.platform === 'win32') {
      // Electron can't read the predefined CF_HDROP format directly (only
      // registered format names). FileNameW is the cheap presence probe (it
      // yields just the FIRST file, in short 8.3 form); when it hits, ask the
      // OS for the full long-path list via PowerShell. The spawn (~200ms) only
      // happens when files are actually on the clipboard.
      let first = ''
      try {
        first = clipboard.readBuffer('FileNameW').toString('ucs2').replace(/\0+$/, '')
      } catch {
        /* no files */
      }
      if (!first) return []
      try {
        // FileDropList yields FileInfo objects (a formatted table if printed
        // raw) — emit one FullName per line. Async so the ~200ms PowerShell spawn
        // never blocks the main process (all IPC + pty forwarding) on a paste.
        const { stdout } = await pexecFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            'Get-Clipboard -Format FileDropList | ForEach-Object { if ($_.FullName) { $_.FullName } else { [string]$_ } }'
          ],
          { encoding: 'utf8', timeout: 3000, windowsHide: true }
        )
        const paths = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        if (paths.length) return paths
      } catch {
        /* fall back to the single short-form path */
      }
      return [first]
    }
    try {
      const uris = clipboard.read('text/uri-list')
      return uris
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('file://'))
        .map((s) => decodeURIComponent(s.replace(/^file:\/\//, '')))
    } catch {
      return []
    }
  })

  ipcMain.handle('shells:list', () => detectShells())
  ipcMain.handle('agents:list', () => detectAgents())

  // App version for display (Settings). app.getVersion() reads package.json in
  // dev and the packaged app metadata in production — same source the update
  // check compares against, so the two can never disagree.
  ipcMain.handle('app:version', () => app.getVersion())

  // Newer-release check against the vectro-site release feed (null = up to date
  // or the check failed; the renderer surfaces a toast only on a real update).
  ipcMain.handle('update:check', () => checkForUpdate())

  // --- Feedback (bugs / ideas / comments) → maintainer inbox ---
  // The POST runs here (strict renderer CSP can't reach the relay); version and
  // platform are stamped in feedback.ts, not trusted from the renderer.
  ipcMain.handle('feedback:send', (_e, input: FeedbackInput) => sendFeedback(input))

  // Offline fallback: compose a prefilled message in the user's mail client,
  // addressed to the fixed maintainer inbox. Built in main so the mailto target
  // can never be redirected from the renderer.
  ipcMain.handle('feedback:mailto', (_e, input: FeedbackInput) => {
    const cat: FeedbackCategory =
      input?.category === 'bug' || input?.category === 'idea' ? input.category : 'other'
    const label = cat === 'bug' ? 'Bug' : cat === 'idea' ? 'Idea' : 'Comment'
    const version = app.getVersion()
    const bodyLines = [
      (input?.message ?? '').trim(),
      '',
      `— app: Monad v${version}`,
      `— platform: ${process.platform} ${process.arch}`
    ]
    if (input?.email) bodyLines.splice(1, 0, `— from: ${input.email}`)
    const url =
      `mailto:${FEEDBACK_EMAIL}` +
      `?subject=${encodeURIComponent(`Monad feedback — ${label} (v${version})`)}` +
      `&body=${encodeURIComponent(bodyLines.join('\n'))}`
    void shell.openExternal(url)
    return true
  })

  // --- Wallpaper: pick an image, and read it as a data URL (CSP-safe) ---
  ipcMain.handle('wallpaper:pick', async () => {
    const win = getWindow()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
    })
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })

  ipcMain.handle('wallpaper:read', async (_e, p: string) => {
    try {
      const st = await fs.stat(p)
      // Cap so a huge or non-image file can't OOM the main process — the whole
      // file is buffered and base64-inflated (~1.33×) into a data URL.
      if (!st.isFile() || st.size > 40 * 1024 * 1024) return null
      const ext = p.split('.').pop()?.toLowerCase()
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
              ? 'image/gif'
              : ext === 'avif'
                ? 'image/avif'
                : 'image/png'
      const buf = await fs.readFile(p)
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  // Open a URL from a terminal (web-links addon) in the user's real browser.
  ipcMain.handle('open:external', (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false
    void shell.openExternal(url)
    return true
  })

  // --- File links in terminal output ---
  // Agents constantly print paths ("edited src/foo.ts:42"). The renderer's link
  // provider asks here whether a path-looking token resolves to a real file
  // (relative to the pane's cwd) and opens it in the default editor on click.
  const resolveFileTarget = async (base: string, raw: string): Promise<string | null> => {
    try {
      const cleaned = raw
        .replace(/(?::\d+){1,2}$/, '') // trailing :line(:col)
        .replace(/^['"(<[]+|['")>\],.;]+$/g, '')
      if (!cleaned) return null
      const abs = isAbsolute(cleaned) ? cleaned : join(base, cleaned)
      const st = await fs.stat(abs)
      return st.isFile() ? abs : null
    } catch {
      return null
    }
  }
  ipcMain.handle('path:exists', async (_e, { base, raw }: { base: string; raw: string }) => {
    return (await resolveFileTarget(base, raw)) !== null
  })
  ipcMain.handle('path:open', async (_e, { base, raw }: { base: string; raw: string }) => {
    const abs = await resolveFileTarget(base, raw)
    if (!abs) return false
    // A clickable path from untrusted agent output must not launch an executable
    // or script — reveal it in the file manager instead of running it.
    if (UNSAFE_OPEN.test(abs)) {
      shell.showItemInFolder(abs)
      return true
    }
    void shell.openPath(abs)
    return true
  })

  // --- Project / canvas persistence (one canvas per project) ---
  ipcMain.handle('project:pick', async () => {
    const win = getWindow()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return { path: r.filePaths[0], name: basename(r.filePaths[0]) }
  })

  ipcMain.handle('project:exists', async (_e, projectPath: string) => {
    try {
      const st = await fs.stat(projectPath)
      return st.isDirectory()
    } catch {
      return false
    }
  })

  ipcMain.handle('project:load', async (_e, projectPath: string) => {
    try {
      const txt = await fs.readFile(join(projectPath, '.agent-canvas', 'canvas.json'), 'utf8')
      return JSON.parse(txt)
    } catch {
      return null
    }
  })

  ipcMain.handle(
    'project:save',
    async (_e, { projectPath, data }: { projectPath: string; data: unknown }) => {
      // Read-only folder / network share / disk full must not become an
      // unhandled rejection in the renderer — report failure instead.
      try {
        const dir = join(projectPath, '.agent-canvas')
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(join(dir, 'canvas.json'), JSON.stringify(data, null, 2), 'utf8')
        return true
      } catch (e) {
        console.error('[monad] project:save failed:', e)
        return false
      }
    }
  )

  // --- Git / per-agent worktree isolation ---
  ipcMain.handle('git:info', (_e, projectPath: string) => getGitInfo(projectPath))

  // `git init` only (see initRepo) — offered when a non-git folder is opened so
  // the user can unlock worktree isolation without leaving the app.
  ipcMain.handle('git:init', (_e, projectPath: string) => initRepo(projectPath))

  ipcMain.handle('git:prune', async (_e, projectPath: string) => {
    const repoRoot = await getRepoRootSafe(projectPath)
    if (repoRoot) await pruneWorktrees(repoRoot)
    return true
  })

  // Leftover canvas/* worktrees from crashed or force-quit sessions — prune
  // can't remove them (still registered), so the renderer offers a cleanup.
  ipcMain.handle(
    'git:orphans',
    async (
      _e,
      { projectPath, ownedAgentIds }: { projectPath: string; ownedAgentIds: string[] }
    ) => {
      const repoRoot = await getRepoRootSafe(projectPath)
      if (!repoRoot) return []
      return findOrphanWorktrees(repoRoot, Array.isArray(ownedAgentIds) ? ownedAgentIds : [])
    }
  )

  // List→filter→remove happens atomically in here (reusing findOrphanWorktrees):
  // the renderer only ever sends its OWN agent ids, never a path list to act on —
  // nothing untrusted to re-validate, no TOCTOU between listing and removing.
  // Orphans whose removal could lose work (hasWork) are never deleted.
  ipcMain.handle(
    'git:cleanOrphans',
    async (
      _e,
      { projectPath, ownedAgentIds }: { projectPath: string; ownedAgentIds: string[] }
    ) => {
      const repoRoot = await getRepoRootSafe(projectPath)
      if (!repoRoot) return { removed: 0, keptWithWork: 0 }
      return cleanOrphanWorktrees(repoRoot, Array.isArray(ownedAgentIds) ? ownedAgentIds : [])
    }
  )

  // Resolve an agent's working dir: a git worktree when isolated, else the
  // shared project dir. Falls back to shared on any git failure.
  ipcMain.handle(
    'worktree:create',
    async (
      _e,
      { projectPath, agentId, isolation }: { projectPath: string; agentId: string; isolation: string }
    ) => {
      if (isolation !== 'worktree') {
        return { cwd: projectPath, branch: null, isolated: false }
      }
      const repoRoot = await getRepoRootSafe(projectPath)
      if (!repoRoot) {
        return { cwd: projectPath, branch: null, isolated: false, reason: 'Not a git repository' }
      }
      try {
        const wt = await createWorktree(repoRoot, agentId)
        return { cwd: wt.path, branch: wt.branch, isolated: true }
      } catch (e) {
        return {
          cwd: projectPath,
          branch: null,
          isolated: false,
          reason: friendlyGitError(e)
        }
      }
    }
  )

  // Desktop notification when a backgrounded agent needs the user. Clicking it
  // surfaces the window and tells the renderer which terminal to focus.
  ipcMain.handle(
    'notify:agent',
    (_e, { id, title, body }: { id: string; title: string; body: string }) => {
      if (!Notification.isSupported()) return false
      const n = new Notification({ title: title || 'Monad', body })
      n.on('click', () => {
        const w = getWindow()
        if (w && !w.isDestroyed()) {
          if (w.isMinimized()) w.restore()
          w.show()
          w.focus()
        }
        send('notify:click', { id })
      })
      n.show()
      return true
    }
  )

  // OS-level "agents need you" indicator. The renderer reports how many agents
  // are waiting (attention/error/exited); while the window is unfocused the
  // taskbar flashes (Windows/Linux) or the dock badges + bounces (macOS).
  // Flash/bounce only on a rising edge — re-triggering on every report would
  // restart the blink forever while the count sits unchanged. The window's
  // 'focus' handler (index.ts) stops the flash; the dock badge stays until the
  // count actually returns to 0, since it's a passive count, not a nag.
  let attentionCount = 0
  ipcMain.on('attention:set', (_e, { count }: { count: number }) => {
    const prev = attentionCount
    attentionCount = Math.max(0, Math.floor(count) || 0)
    const w = getWindow()
    if (!w || w.isDestroyed()) return
    if (process.platform === 'darwin') {
      app.dock?.setBadge(attentionCount > 0 ? String(attentionCount) : '')
      if (attentionCount > prev && !w.isFocused()) app.dock?.bounce('informational')
    } else if (attentionCount === 0) {
      w.flashFrame(false)
    } else if (attentionCount > prev && !w.isFocused()) {
      w.flashFrame(true)
    }
  })

  ipcMain.handle(
    'worktree:remove',
    async (_e, { projectPath, agentId }: { projectPath: string; agentId: string }) => {
      const repoRoot = await getRepoRootSafe(projectPath)
      if (repoRoot) await removeWorktree(repoRoot, agentId)
      return true
    }
  )

  // --- Diff / merge (review an agent's work) ---
  ipcMain.handle(
    'git:diff',
    async (_e, { projectPath, agentId }: { projectPath: string; agentId: string }) => {
      const info = await getGitInfo(projectPath)
      if (!info.repoRoot) return { branch: '', base: null, diff: '', untracked: [], hasChanges: false }
      return getAgentDiff(info.repoRoot, agentId, info.branch)
    }
  )

  ipcMain.handle(
    'git:merge',
    async (
      _e,
      { projectPath, agentId, message }: { projectPath: string; agentId: string; message: string }
    ) => {
      const info = await getGitInfo(projectPath)
      if (!info.repoRoot) return { ok: false, error: 'Not a git repository' }
      return mergeAgent(info.repoRoot, agentId, message)
    }
  )

  // Partial apply: take the agent's version of selected files onto the current
  // branch as a plain commit (no merge — the branch stays unmerged).
  ipcMain.handle(
    'git:applyFiles',
    async (
      _e,
      {
        projectPath,
        agentId,
        paths,
        deletedPaths,
        message
      }: {
        projectPath: string
        agentId: string
        paths: string[]
        deletedPaths: string[]
        message: string
      }
    ) => {
      const info = await getGitInfo(projectPath)
      if (!info.repoRoot) return { ok: false, error: 'Not a git repository' }
      return applyAgentFiles(info.repoRoot, agentId, paths, deletedPaths, message)
    }
  )

  return ptyManager
}
