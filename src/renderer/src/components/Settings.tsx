import { useStore, FONT_FAMILIES } from '../store'
import { IconClose } from './Icons'

export default function Settings(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSetting = useStore((s) => s.setSetting)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const shells = useStore((s) => s.shells)

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
