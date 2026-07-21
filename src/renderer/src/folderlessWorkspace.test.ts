import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// A workspace created via "New workspace" has defaultPath === null. The UI used
// to hide every launch affordance behind that path: Rail wrapped its whole tool
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

describe('a folderless workspace stays usable', () => {
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

  it('keeps the palette’s launch commands available without a folder', () => {
    const src = read('src/renderer/src/components/CommandPalette.tsx')
    // The "New" group is built under `if (!full)`. If that ever becomes
    // `if (projectPath)` again the palette stops being the keyboard escape
    // hatch for a folderless tab.
    const newGroup = src.indexOf("title: 'New terminal'")
    expect(newGroup).toBeGreaterThan(-1)
    const gated = /if \(projectPath\) \{[\s\S]{0,400}?title: 'New terminal'/.test(src)
    expect(gated, 'the New group is folder-gated again').toBe(false)
    // And the workspace itself is reachable/closable without one.
    expect(src).toContain("id: 'new-workspace'")
    expect(src).toContain("id: 'set-folder'")
  })

  it('styles both empty-state actions', () => {
    const css = read('src/renderer/src/styles.css')
    // The card shows two buttons side by side; without these the pair stacks
    // and both read as the primary action.
    expect(css).toContain('.empty__actions')
    expect(css).toContain('.empty__btn--ghost')
  })
})
