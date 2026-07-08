import { useEffect, useState } from 'react'
import { useStore, FONT_FAMILIES } from '../store'
import { ACCENT_PRESETS } from '../accent'
import { THEME_OPTIONS } from '../theme'
import { IconClose, IconTerminal, IconFolder, IconBell } from './Icons'
import { modLabel } from '../shortcuts'
import { previewCue } from '../sound'

type Tab = 'terminal' | 'appearance' | 'workspace' | 'notifications'

const IconAppearance = (): JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
  </svg>
)

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'terminal', label: 'Terminal', icon: <IconTerminal /> },
  { id: 'appearance', label: 'Appearance', icon: <IconAppearance /> },
  { id: 'workspace', label: 'Workspace', icon: <IconFolder /> },
  { id: 'notifications', label: 'Notifications', icon: <IconBell /> }
]

export default function Settings(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSetting = useStore((s) => s.setSetting)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
  const setFeedbackOpen = useStore((s) => s.setFeedbackOpen)
  const shells = useStore((s) => s.shells)
  const [tab, setTab] = useState<Tab>('terminal')
  // Fetched once per open — cheap IPC, and it can't change mid-session.
  const [version, setVersion] = useState('')
  useEffect(() => {
    let alive = true
    void window.api.app.version().then((v) => alive && setVersion(v))
    return () => {
      alive = false
    }
  }, [])

  const pickWallpaper = async (): Promise<void> => {
    const p = await window.api.wallpaper.pick()
    if (p) setSetting('wallpaper', p)
  }
  const wallpaperName = settings.wallpaper ? settings.wallpaper.split(/[\\/]/).pop() : 'None'

  return (
    <div className="modal" onPointerDown={() => setSettingsOpen(false)}>
      <div className="settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <span className="settings__title">Settings</span>
          <button className="settings__close" onClick={() => setSettingsOpen(false)}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="settings__main">
          <nav className="settings__nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={'settings__nav-item' + (tab === t.id ? ' is-active' : '')}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings__body">
            {tab === 'terminal' && (
              <>
                <label className="settings__row">
                  <span className="settings__label">Default shell</span>
                  <select
                    className="settings__select"
                    value={settings.defaultShellId ?? ''}
                    onChange={(e) => setSetting('defaultShellId', e.target.value)}
                  >
                    {shells.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings__row">
                  <span className="settings__label">Font family</span>
                  <select
                    className="settings__select"
                    value={settings.fontFamily}
                    onChange={(e) => setSetting('fontFamily', e.target.value)}
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f.id} value={f.stack}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings__row">
                  <span className="settings__label">Font size</span>
                  <div className="settings__slider">
                    <input
                      type="range"
                      min={9}
                      max={22}
                      step={1}
                      value={settings.fontSize}
                      onChange={(e) => setSetting('fontSize', Number(e.target.value))}
                    />
                    <span className="settings__value">{settings.fontSize}px</span>
                  </div>
                </label>

                <label className="settings__row">
                  <span className="settings__label">
                    Scrollback
                    <span className="settings__hint">lines of history kept per terminal</span>
                  </span>
                  <div className="settings__slider">
                    <input
                      type="range"
                      min={500}
                      max={20000}
                      step={500}
                      value={Math.min(20000, settings.scrollback)}
                      onChange={(e) => setSetting('scrollback', Number(e.target.value))}
                    />
                    <span className="settings__value">{settings.scrollback.toLocaleString()}</span>
                  </div>
                </label>

                <label className="settings__row settings__row--toggle">
                  <span className="settings__label">
                    Copy on select
                    <span className="settings__hint">selecting text with the mouse copies it immediately</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.copyOnSelect}
                    onChange={(e) => setSetting('copyOnSelect', e.target.checked)}
                  />
                </label>
              </>
            )}

            {tab === 'appearance' && (
              <>
                <div className="settings__row">
                  <span className="settings__label">
                    Theme
                    <span className="settings__hint">terminals stay dark either way</span>
                  </span>
                  <div className="settings__seg">
                    {THEME_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        className={
                          'settings__seg-btn' + (settings.theme === t.id ? ' is-active' : '')
                        }
                        onClick={() => setSetting('theme', t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings__row">
                  <span className="settings__label">Accent</span>
                  <div className="settings__swatches">
                    {ACCENT_PRESETS.map((a) => (
                      <button
                        key={a.hex}
                        className={
                          'settings__swatch' +
                          (settings.accent.toLowerCase() === a.hex.toLowerCase() ? ' is-active' : '')
                        }
                        style={{ background: a.hex }}
                        title={a.name}
                        onClick={() => setSetting('accent', a.hex)}
                      />
                    ))}
                    <label className="settings__swatch settings__swatch--custom" title="Custom colour">
                      <input
                        type="color"
                        value={settings.accent}
                        onChange={(e) => setSetting('accent', e.target.value)}
                      />
                    </label>
                  </div>
                </div>

                <div className="settings__row">
                  <span className="settings__label">
                    Wallpaper
                    <span className="settings__hint">{wallpaperName}</span>
                  </span>
                  <div className="settings__stepper">
                    <button className="settings__btn" onClick={pickWallpaper}>
                      Choose…
                    </button>
                    {settings.wallpaper && (
                      <button className="settings__btn" onClick={() => setSetting('wallpaper', null)}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <label className="settings__row">
                  <span className="settings__label">
                    Terminal opacity
                    <span className="settings__hint">lower reveals the wallpaper behind</span>
                  </span>
                  <div className="settings__slider">
                    <input
                      type="range"
                      min={40}
                      max={100}
                      step={5}
                      value={Math.round(settings.terminalOpacity * 100)}
                      onChange={(e) => setSetting('terminalOpacity', Number(e.target.value) / 100)}
                    />
                    <span className="settings__value">{Math.round(settings.terminalOpacity * 100)}%</span>
                  </div>
                </label>

                <label className="settings__row">
                  <span className="settings__label">
                    Interface scale
                    <span className="settings__hint">zoom the whole app (⌘/Ctrl +/−)</span>
                  </span>
                  <div className="settings__slider">
                    <input
                      type="range"
                      min={70}
                      max={180}
                      step={10}
                      value={Math.round(settings.zoomFactor * 100)}
                      onChange={(e) => setSetting('zoomFactor', Number(e.target.value) / 100)}
                    />
                    <span className="settings__value">{Math.round(settings.zoomFactor * 100)}%</span>
                  </div>
                </label>
              </>
            )}

            {tab === 'workspace' && (
              <>
                <label className="settings__row">
                  <span className="settings__label">
                    Default isolation
                    <span className="settings__hint">where a new terminal runs</span>
                  </span>
                  <select
                    className="settings__select"
                    value={settings.defaultIsolation}
                    onChange={(e) =>
                      setSetting('defaultIsolation', e.target.value as 'worktree' | 'shared')
                    }
                  >
                    <option value="shared">Shared project directory</option>
                    <option value="worktree">Worktree per terminal</option>
                  </select>
                </label>

                <label className="settings__row settings__row--toggle">
                  <span className="settings__label">Confirm before closing a terminal</span>
                  <input
                    type="checkbox"
                    checked={settings.confirmClose}
                    onChange={(e) => setSetting('confirmClose', e.target.checked)}
                  />
                </label>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <label className="settings__row settings__row--toggle">
                  <span className="settings__label">
                    Desktop notifications
                    <span className="settings__hint">alert me when a background agent needs input</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.notifications}
                    onChange={(e) => setSetting('notifications', e.target.checked)}
                  />
                </label>

                {/* Independent of the toggles around it: this decides WHETHER a
                   finish alerts at all; those decide the channel (popup / chime). */}
                <label className="settings__row settings__row--toggle">
                  <span className="settings__label">
                    Alert when an agent finishes
                    <span className="settings__hint">
                      when a long task settles back to idle — popup and/or chime per the toggles here
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.notifyOnDone}
                    onChange={(e) => setSetting('notifyOnDone', e.target.checked)}
                  />
                </label>

                <label className="settings__row settings__row--toggle">
                  <span className="settings__label">
                    Sound cues
                    <span className="settings__hint">soft chime when an agent needs you, finishes or errors</span>
                  </span>
                  <span className="settings__inline">
                    <button
                      type="button"
                      className="settings__btn"
                      // Always visible so the affordance is discoverable, but inert
                      // until sounds are on — previewing a cue you'd never hear lies.
                      disabled={!settings.sounds}
                      onClick={() => previewCue('done')}
                    >
                      Preview
                    </button>
                    <input
                      type="checkbox"
                      checked={settings.sounds}
                      onChange={(e) => setSetting('sounds', e.target.checked)}
                    />
                  </span>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Footer: a subtle text link, not another nav tab — the reference is a
           one-shot overlay, not a settings category. Swaps this modal for it. */}
        <div className="settings__foot">
          <button
            className="settings__link"
            onClick={() => {
              setSettingsOpen(false)
              setFeedbackOpen(true)
            }}
          >
            Send feedback
          </button>
          <button
            className="settings__link"
            onClick={() => {
              setSettingsOpen(false)
              setShortcutsOpen(true)
            }}
          >
            Keyboard shortcuts
            <kbd className="kbd">{modLabel('/')}</kbd>
          </button>
          {version && <span className="settings__version">Monad v{version}</span>}
        </div>
      </div>
    </div>
  )
}
