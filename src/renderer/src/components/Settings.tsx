import { useStore, FONT_FAMILIES } from '../store'
import { ACCENT_PRESETS } from '../accent'
import { IconClose } from './Icons'

export default function Settings(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSetting = useStore((s) => s.setSetting)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const shells = useStore((s) => s.shells)

  const pickWallpaper = async (): Promise<void> => {
    const p = await window.api.wallpaper.pick()
    if (p) setSetting('wallpaper', p)
  }
  const wallpaperName = settings.wallpaper ? settings.wallpaper.split(/[\\/]/).pop() : 'None'
  const clampOpacity = (v: number): number =>
    Math.max(0.4, Math.min(1, Math.round(v * 100) / 100))

  return (
    <div className="modal" onPointerDown={() => setSettingsOpen(false)}>
      <div className="settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <span className="settings__title">Settings</span>
          <button className="settings__close" onClick={() => setSettingsOpen(false)}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="settings__body">
          <div className="settings__section">Terminal</div>

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
            <div className="settings__stepper">
              <button
                className="settings__step"
                onClick={() => setSetting('fontSize', Math.max(9, settings.fontSize - 1))}
              >
                −
              </button>
              <span className="settings__value">{settings.fontSize}</span>
              <button
                className="settings__step"
                onClick={() => setSetting('fontSize', Math.min(22, settings.fontSize + 1))}
              >
                +
              </button>
            </div>
          </label>

          <label className="settings__row">
            <span className="settings__label">
              Scrollback
              <span className="settings__hint">lines of history kept per terminal</span>
            </span>
            <div className="settings__stepper">
              <button
                className="settings__step"
                onClick={() => setSetting('scrollback', Math.max(500, settings.scrollback - 500))}
              >
                −
              </button>
              <span className="settings__value">{settings.scrollback}</span>
              <button
                className="settings__step"
                onClick={() => setSetting('scrollback', Math.min(50000, settings.scrollback + 500))}
              >
                +
              </button>
            </div>
          </label>

          <label className="settings__row">
            <span className="settings__label">
              Interface scale
              <span className="settings__hint">zoom the whole app (⌘/Ctrl +/−)</span>
            </span>
            <div className="settings__stepper">
              <button
                className="settings__step"
                onClick={() =>
                  setSetting('zoomFactor', Math.max(0.7, Math.round((settings.zoomFactor - 0.1) * 10) / 10))
                }
              >
                −
              </button>
              <span className="settings__value">{Math.round(settings.zoomFactor * 100)}%</span>
              <button
                className="settings__step"
                onClick={() =>
                  setSetting('zoomFactor', Math.min(1.8, Math.round((settings.zoomFactor + 0.1) * 10) / 10))
                }
              >
                +
              </button>
            </div>
          </label>

          <div className="settings__section">Appearance</div>

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
            <div className="settings__stepper">
              <button
                className="settings__step"
                onClick={() => setSetting('terminalOpacity', clampOpacity(settings.terminalOpacity - 0.05))}
              >
                −
              </button>
              <span className="settings__value">{Math.round(settings.terminalOpacity * 100)}%</span>
              <button
                className="settings__step"
                onClick={() => setSetting('terminalOpacity', clampOpacity(settings.terminalOpacity + 0.05))}
              >
                +
              </button>
            </div>
          </label>

          <div className="settings__section">Workspace</div>

          <label className="settings__row">
            <span className="settings__label">
              Default isolation
              <span className="settings__hint">new terminals in their own git worktree</span>
            </span>
            <select
              className="settings__select"
              value={settings.defaultIsolation}
              onChange={(e) =>
                setSetting('defaultIsolation', e.target.value as 'worktree' | 'shared')
              }
            >
              <option value="worktree">Worktree per terminal</option>
              <option value="shared">Shared directory</option>
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

          <label className="settings__row settings__row--toggle">
            <span className="settings__label">
              Notify when an agent finishes
              <span className="settings__hint">ping me when a long task settles back to idle</span>
            </span>
            <input
              type="checkbox"
              checked={settings.notifyOnDone}
              disabled={!settings.notifications}
              onChange={(e) => setSetting('notifyOnDone', e.target.checked)}
            />
          </label>

          <div className="settings__section settings__section--muted">Coming soon</div>
          <div className="settings__soon">
            Theme &amp; accent · Agent command presets · Keybindings · Live-preview browser ·
            Auto-update
          </div>
        </div>
      </div>
    </div>
  )
}
