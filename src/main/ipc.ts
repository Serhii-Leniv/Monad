import { ipcMain, dialog, BrowserWindow, Notification, shell, clipboard } from 'electron'
import { join, basename, isAbsolute } from 'path'
import { promises as fs } from 'fs'
import { PtyManager, type SpawnOptions } from './pty-manager'
import {
  getGitInfo,
  getRepoRootSafe,
  createWorktree,
  removeWorktree,
  pruneWorktrees,
  getAgentDiff,
  mergeAgent,
  friendlyGitError
} from './git'
import { detectShells, detectAgents } from './shells'
import { checkForUpdate } from './update'

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

  ipcMain.handle('shells:list', () => detectShells())
  ipcMain.handle('agents:list', () => detectAgents())

  // Newer-release check against the vectro-site release feed (null = up to date
  // or the check failed; the renderer surfaces a toast only on a real update).
  ipcMain.handle('update:check', () => checkForUpdate())

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
        console.error('[vectro] project:save failed:', e)
        return false
      }
    }
  )

  // --- Git / per-agent worktree isolation ---
  ipcMain.handle('git:info', (_e, projectPath: string) => getGitInfo(projectPath))

  ipcMain.handle('git:prune', async (_e, projectPath: string) => {
    const repoRoot = await getRepoRootSafe(projectPath)
    if (repoRoot) await pruneWorktrees(repoRoot)
    return true
  })

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
      const n = new Notification({ title: title || 'Vectro', body })
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

  return ptyManager
}
