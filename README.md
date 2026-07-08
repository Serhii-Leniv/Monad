# Monad

A canvas for running and steering multiple AI coding agents in parallel.
Each agent is a live-terminal card on an auto-tiling stage, isolated in its own
git worktree + branch, with in-app diff/merge. Bring-your-own CLIs (Claude Code,
Codex, Gemini, Cursor) — the app just spawns the agents you already have
installed, so there's no inference cost.

> Original product. Built from scratch; not affiliated with or derived from any other app.
> Download: https://serhii-leniv.github.io/vectro-site
> (The download site keeps the pre-rename `vectro-site` name — see `RELEASING.md`.)

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
    ipc.ts         all IPC handlers (pty / project / git / worktree / diff-merge / update)
    pty-manager.ts node-pty session manager
    git.ts         git + worktree + diff/merge (shells out to `git`)
    update.ts      newer-release check against the vectro-site release feed
  preload/     contextBridge API (window.api.{pty,project,git,worktree,update,platform})
  renderer/    React + zustand; xterm.js terminals on an auto-tiling stage
               (react-moveable drag-to-reorder + react-selecto marquee selection)
    components/  Stage, TerminalPane, Rail, CommandPalette, DiffPanel, Settings
    store.ts     Zustand state
```

- **Terminals:** xterm.js ↔ `node-pty` (prebuilt) over IPC.
- **Isolation:** `git worktree add` per agent (branch `canvas/<id>`), kept in a sibling
  `.agent-canvas-worktrees/` folder. Agents are cwd-pinned via `Set-Location` after spawn so a
  shell profile can't move them out of their worktree.
- **Persistence:** one canvas per project in `<project>/.agent-canvas/canvas.json`.
- **Updates:** on launch the main process checks the
  [vectro-site](https://github.com/Serhii-Leniv/vectro-site) release feed and, on a newer
  version, shows an in-app toast linking to the download site. No auto-download, no
  background service, no telemetry.

## Tests

Integration smoke tests drive the real built bundles + IPC under Electron
(run in CI on every push — see `.github/workflows/ci.yml`):

```bash
npm run typecheck
npm run smoke:pty   # PTY loads under Electron ABI + shell echo
npm run smoke:p1    # preload bridge, project save/load, renderer PTY
npm run smoke:p2    # git detect, worktree isolation, pty fan-out, teardown
npm run smoke:p3    # diff sees changes, merge lands work on base branch
```

## Releasing

See [`RELEASING.md`](RELEASING.md) — tag `v*` builds installers and publishes them
as a GitHub Release on the public `vectro-site` repo.

## Deferred

Signed packaging (paid certs), full in-place auto-update (`electron-updater`),
Stripe subscription + license validation.
