import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useStore, activeWs, agentPath, FILE_PANEL_MIN, FILE_PANEL_MAX } from '../store'
import { IconClose } from './Icons'
import FileTree from './FileTree'
import Modal from './Modal'

/** Last segment of a folder path — labels the panel with the folder on screen. */
function baseName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || p
}

// CodeMirror is heavy — its own lazy boundary keeps the tree responsive even
// while the editor chunk is still loading (FilePanel itself is already lazy
// from Phase 2; this nests a second boundary specifically around CM).
const FileView = lazy(() => import('./FileView'))

/**
 * Right-docked file explorer / editor panel: a lazy directory tree on top, a
 * CodeMirror view/edit pane filling the rest. Every entry point drives it
 * through the store rather than through props — the rail's Explorer toggle and
 * a pane's Files button call openFilePanel, terminal path links call openFile —
 * so this component owns no opening logic and stays a pure view of
 * `activeWs(s).filePanel`. It also owns the single main-process watcher's
 * lifecycle (see below), which is why it's mounted only while the panel is open.
 */
export default function FilePanel(): JSX.Element {
  const filePanelWidth = useStore((s) => s.filePanelWidth)
  const setFilePanelWidth = useStore((s) => s.setFilePanelWidth)
  const closeFilePanel = useStore((s) => s.closeFilePanel)
  const openPath = useStore((s) => activeWs(s)?.filePanel.openPath ?? null)
  const openFile = useStore((s) => s.openFile)
  const setFileDirty = useStore((s) => s.setFileDirty)
  const dirty = useStore((s) => activeWs(s)?.filePanel.dirty ?? false)
  // Follows the SELECTED agent's folder, falling back to the workspace default.
  // Agents in one workspace can now point at different repos, so "the project
  // root" is only meaningful relative to whichever agent you're looking at.
  const projectPath = useStore((s) => {
    const ws = activeWs(s)
    if (!ws) return null
    const sel = ws.agents.find((a) => a.id === ws.selectedIds[0])
    return agentPath(ws, sel)
  })

  // The panel always browses that folder's ROOT — the human edits the real
  // project files, never an agent's isolated worktree copy (which wouldn't show
  // up in their working tree until merged). agentPath returns the repo root, not
  // the agent's worktree cwd, so that rule still holds.
  const root = projectPath
  // Name the folder on screen, not the tab — with per-agent folders the
  // workspace name says nothing about which repo you're browsing.
  const projectName = useStore((s) => {
    const ws = activeWs(s)
    if (!ws) return null
    return root && root !== ws.defaultPath ? baseName(root) : ws.name
  })

  // Live-update: while the panel is open with a resolved root, run THE single
  // main-process watcher on it. This effect owns the whole watcher lifecycle —
  // it only runs while FilePanel is mounted (App.tsx mounts it only when the
  // panel is open), and re-runs when `root` changes (scope switch). So the
  // watcher is started on open, torn down on close (unmount → cleanup) and on
  // scope change (cleanup old → watch new) — never running while closed
  // (important for the M1-heat posture). A change event (filtered to THIS root)
  // is debounced and bumped into `refreshNonce`, which the tree and view read.
  const [refreshNonce, setRefreshNonce] = useState(0)
  useEffect(() => {
    if (!root) return
    window.api.file.watch(root)
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = window.api.file.onChanged((p) => {
      if (p.root !== root) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        setRefreshNonce((n) => n + 1)
      }, 150)
    })
    return () => {
      if (timer) clearTimeout(timer)
      off()
      window.api.file.unwatch()
    }
  }, [root])

  // Dirty-guard on close: closing unmounts FileView and would silently drop
  // unsaved edits, so an explicit close while dirty asks first (Discard/Cancel).
  const [confirmClose, setConfirmClose] = useState(false)
  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true)
    else closeFilePanel()
  }, [dirty, closeFilePanel])

  // Left-edge resize: the panel is anchored to the window's right edge, so the
  // width is simply (window right edge − pointer X). Pointer capture keeps the
  // drag alive even if the cursor outruns the 6px handle; the setter clamps.
  const dragging = useRef(false)
  const onResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  },
  []
)
  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      setFilePanelWidth(window.innerWidth - e.clientX)
    },
    [setFilePanelWidth]
  )
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <aside className="filepanel" style={{ width: filePanelWidth }}>
      <div
        className="filepanel__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file panel"
        aria-valuemin={FILE_PANEL_MIN}
        aria-valuemax={FILE_PANEL_MAX}
        aria-valuenow={filePanelWidth}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
      />
      <div className="filepanel__head">
        <div className="filepanel__title">
          <span className="filepanel__scope">Files</span>
          {projectName && <span className="filepanel__branch">{projectName}</span>}
        </div>
        <button className="settings__close filepanel__close" onClick={requestClose} title="Close">
          <IconClose size={16} />
        </button>
      </div>
      <div className="filepanel__body">
        {!root ? (
          <div className="filepanel__placeholder">No project folder is open.</div>
        ) : (
          <>
            <FileTree root={root} selectedPath={openPath} onOpen={openFile} refreshNonce={refreshNonce} />
            <Suspense fallback={<div className="filepanel__placeholder">Loading editor…</div>}>
              <FileView
                root={root}
                relPath={openPath}
                onDirtyChange={setFileDirty}
                requestOpen={openFile}
                refreshNonce={refreshNonce}
              />
            </Suspense>
          </>
        )}
      </div>

      {confirmClose && (
        <Modal
          className="confirm"
          labelledBy="filepanel-discard-title"
          onClose={() => setConfirmClose(false)}
          onEscape={() => setConfirmClose(false)}
        >
          <div className="confirm__title" id="filepanel-discard-title">Discard unsaved changes?</div>
          <div className="confirm__body">
            {openPath ? `“${openPath}” has unsaved edits. ` : 'This file has unsaved edits. '}
            Closing the panel will lose them.
          </div>
          <div className="confirm__actions">
            <button className="confirm__btn" onClick={() => setConfirmClose(false)}>
              Cancel
            </button>
            <button
              className="confirm__btn confirm__btn--danger"
              onClick={() => {
                setConfirmClose(false)
                closeFilePanel()
              }}
            >
              Discard
            </button>
          </div>
        </Modal>
      )}
    </aside>
  )
}
