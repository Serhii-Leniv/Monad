import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { StreamLanguage } from '@codemirror/language'
import type { Extension } from '@codemirror/state'

interface FileViewProps {
  /** Absolute scope root (same value FileTree got). */
  root: string
  /** Rel path of the file the store wants open, or null. */
  relPath: string | null
  /** Pushes this file's dirty (unsaved-edit) state up to the store. */
  onDirtyChange: (dirty: boolean) => void
  /** The store's `openFile` action — used to revert `openPath` when a
   *  dirty-guard switch is cancelled, or after a conflict "Reload". */
  requestOpen: (rel: string | null) => void
  /** Bumped by FilePanel's watcher — reconciles the buffer with disk on change. */
  refreshNonce: number
}

type Kind = 'none' | 'loading' | 'text' | 'image' | 'binary' | 'toolarge' | 'error'

/**
 * Extension → an async loader that dynamic-imports ONLY that language's
 * CodeMirror package. Each `import()` becomes its own tiny Vite chunk, so the
 * (already lazy) FileView chunk no longer bundles every language — a file's
 * grammar is fetched on demand the first time you open that file type. Unknown
 * extensions render as plain text rather than guessing.
 */
type LangLoader = () => Promise<Extension | null>

const LOADERS: Record<string, LangLoader> = {}
const reg = (exts: string[], loader: LangLoader): void => {
  for (const e of exts) LOADERS[e] = loader
}

reg(['ts', 'mts', 'cts'], async () =>
  (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
)
reg(['tsx'], async () =>
  (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true })
)
reg(['jsx'], async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }))
reg(['js', 'mjs', 'cjs'], async () => (await import('@codemirror/lang-javascript')).javascript())
reg(['json', 'jsonc'], async () => (await import('@codemirror/lang-json')).json())
reg(['css', 'scss', 'less'], async () => (await import('@codemirror/lang-css')).css())
reg(['html', 'htm'], async () => (await import('@codemirror/lang-html')).html())
reg(['xml', 'svg'], async () => (await import('@codemirror/lang-xml')).xml())
reg(['md', 'markdown'], async () => (await import('@codemirror/lang-markdown')).markdown())
reg(['py'], async () => (await import('@codemirror/lang-python')).python())
reg(['rs'], async () => (await import('@codemirror/lang-rust')).rust())
reg(['go'], async () => (await import('@codemirror/lang-go')).go())
reg(['java'], async () => (await import('@codemirror/lang-java')).java())
reg(['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh'], async () =>
  (await import('@codemirror/lang-cpp')).cpp()
)
reg(['php'], async () => (await import('@codemirror/lang-php')).php())
reg(['sql'], async () => (await import('@codemirror/lang-sql')).sql())
reg(['yml', 'yaml'], async () => (await import('@codemirror/lang-yaml')).yaml())
// Long tail via legacy stream parsers (one small shared package, per-mode subpaths).
reg(['sh', 'bash', 'zsh'], async () =>
  StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell)
)
reg(['toml'], async () =>
  StreamLanguage.define((await import('@codemirror/legacy-modes/mode/toml')).toml)
)
reg(['rb'], async () =>
  StreamLanguage.define((await import('@codemirror/legacy-modes/mode/ruby')).ruby)
)
reg(['lua'], async () =>
  StreamLanguage.define((await import('@codemirror/legacy-modes/mode/lua')).lua)
)

/** Builds a CodeMirror theme from the app's live CSS custom properties, so the
 *  editor matches whatever theme (dark/light, and any future accent) is active
 *  at mount time. Re-deriving on a live theme flip isn't required for v1. */
function buildTheme(): Extension {
  const css = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback
  const bg = get('--term-bg', '#0a0c10')
  const text = get('--text', 'rgba(237, 241, 248, 0.92)')
  const muted = get('--muted', 'rgba(235, 235, 245, 0.52)')
  const border = get('--glass-border', 'rgba(255, 255, 255, 0.14)')
  const accentRgb = get('--accent-rgb', '255, 69, 58')
  const fontMono = get('--font-mono', "'Cascadia Code', monospace")
  const isDark = document.documentElement.dataset.theme !== 'light'

  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: text,
        height: '100%',
        fontSize: '12.5px'
      },
      '.cm-content': {
        fontFamily: fontMono,
        caretColor: text
      },
      '.cm-scroller': {
        fontFamily: fontMono
      },
      '.cm-gutters': {
        backgroundColor: bg,
        color: muted,
        border: 'none',
        borderRight: `1px solid ${border}`
      },
      '.cm-activeLine': {
        backgroundColor: `rgba(${accentRgb}, 0.06)`
      },
      '.cm-activeLineGutter': {
        backgroundColor: `rgba(${accentRgb}, 0.12)`,
        color: text
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: `rgba(${accentRgb}, 0.25) !important`
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: text
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: `rgba(${accentRgb}, 0.3) !important`
      }
    },
    { dark: isDark }
  )
}

/** Loaded-file identity: which (root, rel) the editor buffer currently reflects. */
interface LoadedKey {
  root: string
  rel: string | null
}

/**
 * File viewer/editor — CodeMirror for text, an <img> for images, placeholders
 * for binary/too-large/no-selection. Lazy-loaded by FilePanel (heavy CM chunk).
 *
 * Switching `relPath` while the current buffer is dirty runs a guard
 * (Save/Discard/Cancel) before the new file loads; saving always races the
 * on-disk mtime and surfaces a conflict banner (Override/Reload/Cancel) on
 * mismatch, per the main-process file API's optimistic-concurrency contract.
 */
export default function FileView({
  root,
  relPath,
  onDirtyChange,
  requestOpen,
  refreshNonce
}: FileViewProps): JSX.Element {
  const [loadedRoot, setLoadedRoot] = useState(root)
  const [loadedRel, setLoadedRel] = useState<string | null>(null)
  const [loadedContent, setLoadedContent] = useState('')
  const [local, setLocal] = useState('')
  const [mtimeMs, setMtimeMs] = useState(0)
  const [kind, setKind] = useState<Kind>('none')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ mtimeMs: number } | null>(null)
  const [guardTarget, setGuardTarget] = useState<LoadedKey | null>(null)
  // Set when the watcher reports the open file changed on disk while the buffer
  // has unsaved edits — a subtle toolbar hint (we never clobber the user's work;
  // saving from here goes through the existing mtime-conflict flow).
  const [diskChanged, setDiskChanged] = useState(false)

  const dirty = kind === 'text' && local !== loadedContent

  // Report dirty state up to the store (which is what FilePanel/Phase 4 read).
  useEffect(() => {
    onDirtyChange(dirty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  // Tracks the (root, rel) the buffer reflects RIGHT NOW, readable from async
  // callbacks/effects without becoming an effect dependency (which would fire
  // the switch-effect on every keystroke, since `dirty` changes constantly).
  const loadedKeyRef = useRef<LoadedKey>({ root: '__init__', rel: null })
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  async function loadFile(nextRoot: string, rel: string | null): Promise<void> {
    loadedKeyRef.current = { root: nextRoot, rel }
    setLoadedRoot(nextRoot)
    setLoadedRel(rel)
    setConflict(null)
    setSaveError(null)
    setLoadError(null)
    setDiskChanged(false)
    if (rel === null || !nextRoot) {
      setKind('none')
      setLocal('')
      setLoadedContent('')
      setDataUrl(null)
      setMtimeMs(0)
      return
    }
    setKind('loading')
    try {
      const r = await window.api.file.read(nextRoot, rel)
      // A newer switch may have started while this read was in flight.
      if (loadedKeyRef.current.root !== nextRoot || loadedKeyRef.current.rel !== rel) return
      setMtimeMs(r.mtimeMs)
      if (r.tooLarge) {
        setKind('toolarge')
        return
      }
      if (r.dataUrl) {
        setDataUrl(r.dataUrl)
        setKind('image')
        return
      }
      if (r.isBinary) {
        setKind('binary')
        return
      }
      const content = r.content ?? ''
      setLocal(content)
      setLoadedContent(content)
      setDataUrl(null)
      setKind('text')
    } catch (e) {
      if (loadedKeyRef.current.root !== nextRoot || loadedKeyRef.current.rel !== rel) return
      setKind('error')
      setLoadError(e instanceof Error ? e.message : 'Failed to read file')
    }
  }

  // The switch effect: fires whenever the store's (root, relPath) diverges
  // from what's actually loaded. First run always "switches" (loadedKeyRef
  // starts at a sentinel), so the initial file (panel reopened with a
  // remembered openPath) loads on mount too.
  useEffect(() => {
    const prev = loadedKeyRef.current
    if (prev.root === root && prev.rel === relPath) return
    if (dirtyRef.current && prev.rel !== null) {
      setGuardTarget({ root, rel: relPath })
      return
    }
    void loadFile(root, relPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, relPath])

  // Live reconcile: on a watcher bump, re-stat the open file's mtime. If it
  // changed AND the buffer is clean, silently reload the content; if the buffer
  // is dirty, just flag "changed on disk" — never overwrite unsaved edits. Keyed
  // on refreshNonce only (mtime/kind read via closure, current on the bump).
  useEffect(() => {
    if (refreshNonce === 0) return
    const { root: lr, rel } = loadedKeyRef.current
    if (!lr || !rel || kind !== 'text') return
    let cancelled = false
    void window.api.file.read(lr, rel).then((r) => {
      if (cancelled) return
      // A switch may have landed since this stat was requested — ignore stale.
      if (loadedKeyRef.current.root !== lr || loadedKeyRef.current.rel !== rel) return
      if (r.mtimeMs === mtimeMs) return // no real on-disk change
      if (dirtyRef.current) setDiskChanged(true)
      else void loadFile(lr, rel)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce])

  async function performSave(expectedMtime: number): Promise<FileSaveResult | null> {
    if (!loadedRel) return null
    setSaving(true)
    setSaveError(null)
    try {
      return await window.api.file.save(loadedRoot, loadedRel, local, expectedMtime)
    } catch (e) {
      // A rejected invoke used to skip setSaving(false) entirely, leaving the
      // button stuck on "Saving…" with the editor unsavable until remount.
      setSaveError(e instanceof Error ? e.message : 'Save failed')
      return null
    } finally {
      setSaving(false)
    }
  }

  /** @returns true when the save fully succeeded (no conflict/error left to show). */
  function applySaveResult(r: FileSaveResult): boolean {
    if (r.ok) {
      setMtimeMs(r.mtimeMs ?? mtimeMs)
      setLoadedContent(local)
      setDiskChanged(false)
      return true
    }
    if (r.conflict) {
      setConflict({ mtimeMs: r.mtimeMs ?? mtimeMs })
      return false
    }
    setSaveError(r.error || 'Save failed')
    return false
  }

  const toolbarSave = async (): Promise<void> => {
    const r = await performSave(mtimeMs)
    if (r) applySaveResult(r)
  }

  const guardSave = async (): Promise<void> => {
    if (!guardTarget) return
    const r = await performSave(mtimeMs)
    if (!r) return
    if (applySaveResult(r)) {
      const t = guardTarget
      setGuardTarget(null)
      void loadFile(t.root, t.rel)
    }
    // Conflict/error: stay put — guardTarget remains pending, and if it was a
    // conflict the banner below offers Override (which resumes the switch).
  }

  const guardDiscard = (): void => {
    const t = guardTarget
    setGuardTarget(null)
    if (t) void loadFile(t.root, t.rel)
  }

  const guardCancel = (): void => {
    setGuardTarget(null)
    requestOpen(loadedRel)
  }

  const conflictOverride = async (): Promise<void> => {
    const r = await performSave(0)
    if (!r) return
    setConflict(null)
    if (r.ok) {
      setMtimeMs(r.mtimeMs ?? 0)
      setLoadedContent(local)
      if (guardTarget) {
        const t = guardTarget
        setGuardTarget(null)
        void loadFile(t.root, t.rel)
      }
    } else {
      setSaveError(r.error || 'Save failed')
    }
  }

  const conflictReload = async (): Promise<void> => {
    if (!loadedRel) return
    await loadFile(loadedRoot, loadedRel)
    setConflict(null)
    if (guardTarget) {
      // The user chose to look at the disk version, not to proceed with the
      // switch — cancel the pending switch and tell the store to stay put.
      setGuardTarget(null)
      requestOpen(loadedRel)
    }
  }

  const conflictCancel = (): void => setConflict(null)

  const onKeyDownCapture = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (kind === 'text' && dirty && !saving) void toolbarSave()
    }
  }

  const themeExtension = useMemo(buildTheme, [])
  // The language extension resolves asynchronously (dynamic import per file
  // type). Highlighting appears a frame after the text — acceptable, and the
  // buffer is readable as plain text meanwhile. Stale resolves are dropped.
  const [langExtension, setLangExtension] = useState<Extension | null>(null)
  useEffect(() => {
    const ext = loadedRel?.split('.').pop()?.toLowerCase()
    const loader = ext ? LOADERS[ext] : undefined
    if (!loader) {
      setLangExtension(null)
      return
    }
    let cancelled = false
    loader()
      .then((e) => {
        if (!cancelled) setLangExtension(e)
      })
      .catch(() => {
        if (!cancelled) setLangExtension(null)
      })
    return () => {
      cancelled = true
    }
  }, [loadedRel])
  const extensions = useMemo(() => {
    const exts: Extension[] = [themeExtension]
    if (langExtension) exts.push(langExtension)
    return exts
  }, [themeExtension, langExtension])

  return (
    <div className="fileview" onKeyDownCapture={onKeyDownCapture}>
      <div className="fileview__toolbar">
        <span className="fileview__path" title={loadedRel ?? ''}>
          {loadedRel ?? 'No file open'}
        </span>
        {diskChanged && (
          <span className="fileview__disk" title="This file changed on disk since you started editing">
            changed on disk
          </span>
        )}
        <button
          className="fileview__save"
          onClick={() => void toolbarSave()}
          disabled={!dirty || saving || kind !== 'text'}
          title="Save (Ctrl/Cmd+S)"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {guardTarget && !conflict && (
        <div className="fileview__guard">
          <div className="fileview__guard-text">Unsaved changes in {loadedRel}</div>
          <div className="fileview__guard-actions">
            <button onClick={() => void guardSave()} disabled={saving}>
              Save
            </button>
            <button onClick={guardDiscard} disabled={saving}>
              Discard
            </button>
            <button onClick={guardCancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {conflict && (
        <div className="fileview__conflict">
          <div className="fileview__conflict-text">File changed on disk</div>
          <div className="fileview__conflict-actions">
            <button onClick={() => void conflictOverride()} disabled={saving}>
              Override
            </button>
            <button onClick={() => void conflictReload()} disabled={saving}>
              Reload
            </button>
            <button onClick={conflictCancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {saveError && <div className="fileview__error">{saveError}</div>}

      <div className="fileview__content">
        {kind === 'none' && <div className="fileview__placeholder">Select a file to view it here.</div>}
        {kind === 'loading' && <div className="fileview__placeholder">Loading…</div>}
        {kind === 'error' && (
          <div className="fileview__placeholder">{loadError ?? 'Failed to read file.'}</div>
        )}
        {kind === 'toolarge' && (
          <div className="fileview__placeholder">File too large to preview (&gt;2 MB)</div>
        )}
        {kind === 'binary' && <div className="fileview__placeholder">Binary file — not shown</div>}
        {kind === 'image' && dataUrl && (
          <img className="fileview__img" src={dataUrl} alt={loadedRel ?? ''} />
        )}
        {kind === 'text' && (
          <CodeMirror
            className="fileview__cm"
            value={local}
            height="100%"
            theme="none"
            extensions={extensions}
            basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: true }}
            onChange={(v) => setLocal(v)}
          />
        )}
      </div>
    </div>
  )
}
