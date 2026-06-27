# Agent Canvas

An infinite canvas for running and steering multiple AI coding agents in parallel.
Each agent is a draggable live-terminal card, isolated in its own git worktree + branch,
with in-app diff/merge. Bring-your-own CLIs (Claude Code, Codex, Gemini, Cursor) — the app
just spawns the agents you already have installed, so there's no inference cost.

> Original product. Built from scratch; not affiliated with or derived from any other app.

## Requirements

- Node.js + npm
- git
- The agent CLIs you want to use, on your PATH (`claude`, `codex`, `gemini`, `cursor-agent`)

No Rust/C++ toolchain needed: the app is Electron, and `node-pty` installs a prebuilt binary
(see `.npmrc`, which pins the Electron-29 ABI).

## Run

```bash
npm install
npm run dev          # dev with HMR
# or a production-like run:
npm run build
npm run preview
```

In the app: **Open Project…** → pick a folder (a git repo enables worktree isolation) →
add agents from the toolbar. Each card is a real terminal. On a git repo, each agent runs in
its own worktree/branch — use the card's **Diff** tab to review and **Merge** or **Discard**
its work.

## Architecture

```
src/
  main/        Electron main process
    index.ts       window + production CSP
    ipc.ts         all IPC handlers (pty / project / git / worktree / diff-merge)
    pty-manager.ts node-pty session manager
    git.ts         git + worktree + diff/merge (shells out to `git`)
  preload/     contextBridge API (window.api.{pty,project,git,worktree,platform})
  renderer/    React + @xyflow/react canvas
    components/  Stage (canvas), TerminalPane, Rail, CommandPalette, DiffPanel, Settings
    store.ts     Zustand state
```

- **Terminals:** xterm.js ↔ `node-pty` (prebuilt) over IPC.
- **Isolation:** `git worktree add` per agent (branch `canvas/<id>`), kept in a sibling
  `.agent-canvas-worktrees/` folder. Agents are cwd-pinned via `Set-Location` after spawn so a
  shell profile can't move them out of their worktree.
- **Persistence:** one canvas per project in `<project>/.agent-canvas/canvas.json`.

## Tests

Integration smoke tests drive the real built bundles + IPC under Electron:

```bash
npm run smoke:pty   # PTY loads under Electron ABI + shell echo
npm run smoke:p1    # preload bridge, project save/load, renderer PTY
npm run smoke:p2    # git detect, worktree isolation, pty fan-out, teardown
npm run smoke:p3    # diff sees changes, merge lands work on base branch
```

## Deferred (Phase 4)

Productization — original branding/name, Stripe subscription + license validation,
auto-update, and signed cross-platform packaging.
