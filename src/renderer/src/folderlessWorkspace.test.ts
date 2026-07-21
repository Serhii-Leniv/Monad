import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// HISTORY: a workspace created via "New workspace" had defaultPath === null,
// and the UI hid every launch affordance behind that path: Rail wrapped its whole tool
// block in `{projectPath && …}`, the command palette gated its "New" group the
// same way, and Stage rendered nothing at all with zero agents. The result was a
// tab you could create but not use — no terminal button, no way to attach a
// folder, and a blank rectangle where the stage should be. The store always
// allowed it (see store.test.ts, "starts with no folder but still accepts
// terminals"); the gates were the bug.
//
// These are source-text assertions for the same reason styles.test.ts is: the
// regression lives in JSX conditionals, vitest.config.ts only collects
// `src/**/*.test.ts` (a .tsx test would be silently skipped, not reported), and
// there is no component-test harness in this repo to render against. Nothing
// else would fail if these gates came back.
const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8')

// SINCE "one tab = one folder": the UI can no longer CREATE a folderless tab —
// the + opens a folder picker directly. These gates still matter anyway. The
// store keeps createWorkspace (the smokes drive it), a folder can go missing
// between sessions, and a tab whose path fails to resolve must degrade to a
// usable stage rather than the blank dead end this file was written for.
describe('a tab with no resolvable folder stays usable', () => {
  it('does not hide the rail’s new-terminal button behind a folder', () => {
    const src = read('src/renderer/src/components/Rail.tsx')
    const newButton = src.indexOf('className="rail__new"')
    expect(newButton, 'the rail__new block moved or was renamed').toBeGreaterThan(-1)

    // The file panel is legitimately folder-gated (it roots at the workspace
    // path), so `projectPath &&` may still appear — but only AFTER the terminal
    // button. A gate opening before it is the old dead-end wrapper coming back.
    const gate = src.indexOf('{projectPath && (')
    if (gate !== -1) expect(gate).toBeGreaterThan(newButton)
  })

  it('offers a way out on an empty stage', () => {
    const src = read('src/renderer/src/components/Stage.tsx')
    // Zero agents must render the empty card, not an empty div.
    expect(src).toMatch(/agentCount === 0 &&/)
    expect(src).toContain('className="empty__card"')
    // Both escape hatches: attach a folder, or launch a terminal anyway.
    expect(src).toContain('pickFolderForWorkspace(workspaceId)')
    expect(src).toContain('addAgent({ workspaceId })')
  })

  it('keeps the palette’s launch commands ungated by a folder', () => {
    const src = read('src/renderer/src/components/CommandPalette.tsx')
    // The "New" group is built under `if (!full)`. If that ever becomes
    // `if (projectPath)` again the palette stops being the keyboard escape
    // hatch when a tab's folder can't be resolved.
    const newGroup = src.indexOf("title: 'New terminal'")
    expect(newGroup).toBeGreaterThan(-1)
    const gated = /if \(projectPath\) \{[\s\S]{0,400}?title: 'New terminal'/.test(src)
    expect(gated, 'the New group is folder-gated again').toBe(false)
    // REMOVED with "one tab = one folder": this also asserted the palette
    // offered 'new-workspace' and 'set-folder'. Both created or repaired a tab
    // with no folder, which is no longer a thing that can exist — the + goes
    // straight to a folder picker. The assertion above (the New group is not
    // folder-gated) is the part that still protects something, and it is
    // unchanged.
  })

  it('styles both empty-state actions', () => {
    const css = read('src/renderer/src/styles.css')
    // The card shows two buttons side by side; without these the pair stacks
    // and both read as the primary action.
    expect(css).toContain('.empty__actions')
    expect(css).toContain('.empty__btn--ghost')
  })
})
