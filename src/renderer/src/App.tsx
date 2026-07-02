import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Titlebar from './components/Titlebar'
import Rail from './components/Rail'
import Stage from './components/Stage'
import Toasts from './components/Toasts'
import Home from './components/Home'
import ProjectBar from './components/ProjectBar'

// On-demand overlays — split out of the initial chunk. They're never the first
// view, and fallback={null} means no visible loading state.
const Settings = lazy(() => import('./components/Settings'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const DiffPanel = lazy(() => import('./components/DiffPanel'))
import { useStore, toPersisted } from './store'
import { openProjectByPath, restoreLastProject, saveCanvas } from './openProject'
import { applyAccent } from './accent'
import { handleMenuEdit } from './terminalRegistry'

export default function App(): JSX.Element {
  const projectPath = useStore((s) => s.projectPath)
  const agents = useStore((s) => s.agents)
  const setShells = useStore((s) => s.setShells)
  const setAgentClis = useStore((s) => s.setAgentClis)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const diffAgentId = useStore((s) => s.diffAgentId)
  const zoomFactor = useStore((s) => s.settings.zoomFactor)
  const accent = useStore((s) => s.settings.accent)
  const wallpaper = useStore((s) => s.settings.wallpaper)
  const terminalOpacity = useStore((s) => s.settings.terminalOpacity)
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null)
  const saveTimer = useRef<number>()

  // Detect the shells + agent CLIs installed on this machine, once on launch.
  useEffect(() => {
    void window.api.shells.list().then(setShells)
    void window.api.agents.list().then(setAgentClis)
  }, [setShells, setAgentClis])

  // Tag the platform so CSS can adapt mac chrome (traffic lights, notch safe-area).
  useEffect(() => {
    document.body.classList.toggle('is-mac', window.api.platform === 'darwin')
  }, [])

  // Reopen the last project on launch (if its folder still exists).
  useEffect(() => {
    void restoreLastProject()
  }, [])

  // One-shot update check (main process reads the vectro-site release feed).
  // Delayed so it never competes with startup; on a newer release a sticky
  // toast offers the download page. Silent on failure and when up to date.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void window.api.update.check().then((u) => {
        if (!u) return
        useStore.getState().pushToast(`Vectro ${u.latest} is available`, 'info', {
          actionLabel: 'Download',
          onAction: () => void window.api.openExternal(u.url)
        })
      })
    }, 5000)
    return () => window.clearTimeout(t)
  }, [])

  // Apply the interface zoom (scales the whole app for high-DPI displays).
  useEffect(() => {
    window.api.zoom.set(zoomFactor)
  }, [zoomFactor])

  // Clicking a desktop notification focuses the agent that raised it.
  useEffect(() => {
    return window.api.notify.onClick((agentId) => {
      useStore.getState().focusTerminal(agentId)
    })
  }, [])

  // macOS Edit-menu (⌘C/⌘V/⌘A) → routed by focus (terminal vs. plain input).
  // No-op on Windows/Linux, where the main process never sends these.
  useEffect(() => {
    return window.api.menu.onEdit((action) => void handleMenuEdit(action))
  }, [])

  // Load the chosen wallpaper (read in main → data URL so CSP stays strict).
  useEffect(() => {
    if (!wallpaper) {
      setWallpaperUrl(null)
      return
    }
    let cancelled = false
    void window.api.wallpaper.read(wallpaper).then((url) => {
      if (!cancelled) setWallpaperUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [wallpaper])

  // Terminal background opacity (lower reveals the wallpaper behind).
  useEffect(() => {
    document.documentElement.style.setProperty('--term-alpha', String(terminalOpacity))
  }, [terminalOpacity])

  // Frosted-glass blur on terminals is only enabled with a wallpaper (it's the
  // most expensive thing to animate; off otherwise for max smoothness).
  useEffect(() => {
    document.body.classList.toggle('has-wallpaper', !!wallpaperUrl)
  }, [wallpaperUrl])

  // Accent colour drives the whole palette.
  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  // Keyboard shortcuts: ⌘ on macOS, Ctrl+Shift on Windows/Linux (avoids the
  // shell's own Ctrl-key readline bindings).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useStore.getState()
      if (e.key === 'Escape') {
        if (st.diffAgentId) st.setDiffAgentId(null)
        else if (st.paletteOpen) st.setPaletteOpen(false)
        else if (st.settingsOpen) st.setSettingsOpen(false)
        else if (st.focusedId) st.clearFocus()
        return
      }
      // Switch workspace — ⌘⌥1…9 (Ctrl+Alt on Win/Linux). Saves the current
      // canvas first; no-op if that slot is already open or empty.
      if ((e.metaKey || e.ctrlKey) && e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const ws = st.workspaces[Number(e.key) - 1]
        if (ws) void openProjectByPath(ws)
        return
      }
      // Interface zoom — plain ⌘/Ctrl with +/−/0 (like browsers / VS Code).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const round = (v: number): number => Math.round(v * 10) / 10
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          st.setSetting('zoomFactor', Math.min(1.8, round(st.settings.zoomFactor + 0.1)))
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          st.setSetting('zoomFactor', Math.max(0.7, round(st.settings.zoomFactor - 0.1)))
          return
        }
        if (e.key === '0') {
          e.preventDefault()
          st.setSetting('zoomFactor', 1)
          return
        }
      }

      const mod = e.metaKey || (e.ctrlKey && e.shiftKey)
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        st.setPaletteOpen(!st.paletteOpen)
        return
      }
      if (!st.projectPath) return
      if (k === 't') {
        e.preventDefault()
        st.addAgent()
      } else if (k === '1') {
        e.preventDefault()
        st.setLayoutMode('grid')
      } else if (k === '2') {
        e.preventDefault()
        st.setLayoutMode('columns')
      } else if (k === 'w') {
        const sel = st.selectedIds[0]
        if (sel) {
          e.preventDefault()
          // Guarded close (worktree dirty-check + confirm) — never force-delete.
          st.requestClose(sel)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Only the persisted fields drive autosave, so runtime churn (status/pty id)
  // doesn't trigger disk writes. The compact key gates the effect (a flat join of
  // just the persisted fields — no JSON pass on every status flip); the object is
  // passed straight to save.
  const persisted = useMemo(() => toPersisted(agents), [agents])
  const persistedKey = useMemo(
    () =>
      persisted
        .map((p) => `${p.id}:${p.x},${p.y},${p.w},${p.h}:${p.isolation}:${p.shellId ?? ''}:${p.label}`)
        .join('|'),
    [persisted]
  )
  const layoutMode = useStore((s) => s.layoutMode)

  useEffect(() => {
    if (!projectPath) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveCanvas(projectPath, persisted, layoutMode)
    }, 400)
    return () => window.clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, persistedKey, layoutMode])

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true">
        <span className="aurora__orb aurora__orb--1" />
        <span className="aurora__orb aurora__orb--2" />
        <span className="aurora__orb aurora__orb--3" />
      </div>
      {wallpaperUrl && (
        <div className="wallpaper" style={{ backgroundImage: `url(${wallpaperUrl})` }} />
      )}
      <div className="grain" aria-hidden="true" />
      <Titlebar />
      <ProjectBar />
      <div className="app__main">
        <Rail />
        <div className="app__canvas">{projectPath ? <Stage /> : <Home />}</div>
      </div>
      <Suspense fallback={null}>
        {paletteOpen && <CommandPalette />}
        {settingsOpen && <Settings />}
        {diffAgentId && <DiffPanel />}
      </Suspense>
      <Toasts />
    </div>
  )
}
