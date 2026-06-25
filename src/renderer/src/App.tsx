import { useEffect, useMemo, useRef, useState } from 'react'
import Titlebar from './components/Titlebar'
import Rail from './components/Rail'
import Stage from './components/Stage'
import Settings from './components/Settings'
import CommandPalette from './components/CommandPalette'
import DiffPanel from './components/DiffPanel'
import BroadcastBar from './components/BroadcastBar'
import Logo from './components/Logo'
import { useStore, toPersisted } from './store'
import { openProjectInteractive, restoreLastProject } from './openProject'
import { applyAccent } from './accent'

function EmptyState(): JSX.Element {
  return (
    <div className="empty">
      <div className="empty__card">
        <Logo size={64} />
        <h1>Vectro</h1>
        <p>Open a project folder, then add terminals to work with your agents in parallel.</p>
        <button className="empty__btn" onClick={openProjectInteractive}>
          Open project
        </button>
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const projectPath = useStore((s) => s.projectPath)
  const agents = useStore((s) => s.agents)
  const setShells = useStore((s) => s.setShells)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const diffAgentId = useStore((s) => s.diffAgentId)
  const zoomFactor = useStore((s) => s.settings.zoomFactor)
  const accent = useStore((s) => s.settings.accent)
  const wallpaper = useStore((s) => s.settings.wallpaper)
  const terminalOpacity = useStore((s) => s.settings.terminalOpacity)
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null)
  const saveTimer = useRef<number>()

  // Detect the shells installed on this machine, once on launch.
  useEffect(() => {
    void window.api.shells.list().then(setShells)
  }, [setShells])

  // Reopen the last project on launch (if its folder still exists).
  useEffect(() => {
    void restoreLastProject()
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
          st.removeAgent(sel)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Only the persisted fields drive autosave, so runtime churn (status/pty id)
  // doesn't trigger disk writes. The string key gates the effect; the object is
  // passed straight to save (no parse round-trip).
  const persisted = useMemo(() => toPersisted(agents), [agents])
  const persistedKey = useMemo(() => JSON.stringify(persisted), [persisted])
  const layoutMode = useStore((s) => s.layoutMode)

  useEffect(() => {
    if (!projectPath) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void window.api.project.save(projectPath, { agents: persisted, layoutMode })
    }, 400)
    return () => window.clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, persistedKey, layoutMode])

  return (
    <div className="app">
      {wallpaperUrl && (
        <div className="wallpaper" style={{ backgroundImage: `url(${wallpaperUrl})` }} />
      )}
      <Titlebar />
      <div className="app__main">
        <Rail />
        <div className="app__canvas">{projectPath ? <Stage /> : <EmptyState />}</div>
        {projectPath && <BroadcastBar />}
      </div>
      {paletteOpen && <CommandPalette />}
      {settingsOpen && <Settings />}
      {diffAgentId && <DiffPanel />}
    </div>
  )
}
