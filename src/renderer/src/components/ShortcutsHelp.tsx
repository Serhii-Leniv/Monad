import { useStore } from '../store'
import { IconClose } from './Icons'
import { modLabel, altModLabel, plainModLabel, shiftModLabel } from '../shortcuts'

/** One row: an action label plus either a keycap chord or a plain-text note
 *  (for actions that live on a button rather than a key). */
interface Row {
  label: string
  keys?: string
  note?: string
}

interface Section {
  title: string
  rows: Row[]
}

/**
 * Keyboard-shortcuts reference (⌘/ / Ctrl+Shift+/). A static glass modal in
 * the palette/settings family. Labels come from the shortcuts.ts helpers so
 * they always match the real platform chords — three DIFFERENT modifiers are
 * in play (app chord, plain ⌘/Ctrl for terminal-local combos, ⌘⌥/Ctrl+Alt for
 * workspaces) and hardcoding any of them would lie on one platform.
 */
export default function ShortcutsHelp(): JSX.Element {
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
  const close = (): void => setShortcutsOpen(false)

  // Two explicit columns so the modal fits without scrolling at default size;
  // CSS multi-column would balance by height and could split a section.
  const columns: Section[][] = [
    [
      {
        title: 'Terminals',
        rows: [
          { label: 'New terminal', keys: modLabel('T') },
          { label: 'Close terminal', keys: modLabel('W') },
          { label: 'Cycle next / previous', keys: shiftModLabel(']') + ' / ' + shiftModLabel('[') },
          { label: 'Maximize / restore', keys: shiftModLabel('Enter') },
          { label: 'Move selection spatially', keys: modLabel('Arrows') },
          { label: 'Find in terminal', keys: plainModLabel('F') },
          { label: 'Copy selection', keys: plainModLabel('C') },
          { label: 'Paste', keys: plainModLabel('V') }
        ]
      },
      {
        title: 'Canvas',
        rows: [
          { label: 'Layout: Grid', keys: modLabel('1') },
          { label: 'Layout: Columns', keys: modLabel('2') },
          { label: 'Wide card on / off', note: 'card header button' },
          { label: 'Broadcast to terminals', note: 'select 2+ cards' }
        ]
      }
    ],
    [
      {
        title: 'Workspaces',
        rows: [
          { label: 'Switch workspace 1–9', keys: altModLabel('1…9') },
          { label: 'Open project', note: 'command palette' }
        ]
      },
      {
        title: 'App',
        rows: [
          { label: 'Command palette', keys: modLabel('K') },
          { label: 'Keyboard shortcuts', keys: modLabel('/') },
          { label: 'Settings', note: 'rail gear icon' },
          { label: 'Zoom interface in / out', keys: plainModLabel('+') + ' / ' + plainModLabel('−') },
          { label: 'Reset interface zoom', keys: plainModLabel('0') }
        ]
      }
    ]
  ]

  return (
    <div className="modal" onPointerDown={close}>
      <div className="shortcuts" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <span className="settings__title">Keyboard shortcuts</span>
          <button className="settings__close" onClick={close}>
            <IconClose size={16} />
          </button>
        </div>
        <div className="shortcuts__body">
          {columns.map((sections, ci) => (
            <div key={ci} className="shortcuts__col">
              {sections.map((sec) => (
                <section key={sec.title} className="shortcuts__section">
                  <h3 className="shortcuts__heading">{sec.title}</h3>
                  {sec.rows.map((row) => (
                    <div key={row.label} className="shortcuts__row">
                      <span className="shortcuts__label">{row.label}</span>
                      <span className="shortcuts__dots" aria-hidden="true" />
                      {row.keys ? (
                        <kbd className="kbd">{row.keys}</kbd>
                      ) : (
                        <span className="shortcuts__note">{row.note}</span>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
