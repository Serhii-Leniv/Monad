import { app } from 'electron'
import { cpSync, existsSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'

/* The app was renamed Vectro → Monad. Electron derives the userData directory
 * from the app name (productName packaged, package.json name in dev), so the
 * rename moves it — %APPDATA%\Vectro → %APPDATA%\Monad and the platform
 * equivalents — which would silently orphan window state and everything in
 * Chromium's Local Storage (settings, recent projects, dismissed updates).
 * This one-shot migration copies the old profile into the new location.
 *
 * MUST run at module top-level, before requestSingleInstanceLock() and any
 * BrowserWindow: the lock touches the userData dir, and a created window
 * initializes a fresh Local Storage that the copy must not race with. */

// Regenerable Chromium caches and per-run lock/singleton files — never copy.
const SKIP = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'GrShaderCache',
  'ShaderCache',
  'Crashpad',
  'blob_storage',
  'lockfile'
])

export function migrateUserDataFromVectro(): void {
  try {
    const newDir = app.getPath('userData') // .../Monad ('monad' in dev)
    const marker = join(newDir, '.migrated-from-vectro')
    if (existsSync(marker)) return // one-shot
    // The new profile already holds real data (user ran Monad before this
    // build, or it's simply established) — never clobber it.
    if (existsSync(join(newDir, 'window-state.json')) || existsSync(join(newDir, 'Local Storage'))) {
      writeFileSync(marker, 'skipped: existing profile\n')
      return
    }
    // Packaged uses productName casing; dev derives from package.json name.
    // (Case only matters on macOS/Linux; Windows paths are case-insensitive.)
    const oldName = app.isPackaged ? 'Vectro' : 'vectro'
    const oldDir = join(dirname(newDir), oldName)
    if (existsSync(oldDir)) {
      cpSync(oldDir, newDir, {
        recursive: true,
        force: false,
        errorOnExist: false,
        filter: (src) => {
          const name = basename(src)
          return !SKIP.has(name) && !name.startsWith('Singleton')
        }
      })
    }
    // Written even on a fresh install so we never scan again.
    writeFileSync(marker, new Date().toISOString() + '\n')
  } catch (e) {
    // Fail open: a botched copy must never block launch — start fresh instead.
    console.error('[monad] userData migration failed (starting fresh):', e)
  }
}
