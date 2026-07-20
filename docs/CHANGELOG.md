# Changelog

Notable changes per release. Installers for every version are on the
[releases page](https://github.com/Serhii-Leniv/Monad/releases).

This file was reconstructed from git history at v0.1.25; entries before then are summarised rather
than exhaustive.

## v0.1.25

- Top-bar tabs became real **workspaces** — renameable, no longer tied to a folder, with an agent
  count. Folder selection moved onto the individual agent.
- Workspace state moved to `workspaces.json` in the app's user-data folder, with one-time migration
  from the old per-project `.monad/canvas.json`.
- Adopted the new Monad spirograph logo for the app icon and emblem.
- README rewritten for a general audience; added the MIT `LICENSE` file and a current demo video.

## v0.1.24

- Added the right-side worktree **file explorer and editor**, with a CodeMirror-based editor and a
  path-traversal guard on all reads.
- File panel follow-ups: dropped the per-card Files button, scoped the tree to the project root,
  fixed editor scrolling.
- Added tile-free logo mark variants (white and black, SVG and PNG).

## v0.1.23

- Logo redesign.

## v0.1.22

- **Windows in-place auto-update** via `electron-updater`. Releases now must ship `latest*.yml` and
  blockmap files alongside installers.

## v0.1.21

- Power and thermal pass: pause rendering when the window is unwatched, and batch PTY output before
  crossing IPC instead of sending per-chunk. Idle aurora/blur effects were the other major draw.

## v0.1.20

- Moved releases and the download site into this repository; the separate site repo was retired.
- Pinned the toast close button.

## v0.1.17 – v0.1.19

- UX pass: keyboard shortcuts surfaced in Settings, quick-launcher command palette, `.monad`
  directory rename.
- Fixed broken download links left over from the rename (`Vectro-*` → `Monad-*`).

## v0.1.16

- Persistent, escalating update reminder plus an in-app feedback form.

## v0.1.15

- **Renamed Vectro → Monad.** Full rebrand: identity, migration for existing installs, Lora serif
  redesign, and a reworked dock. Local storage keys intentionally kept their old prefix so existing
  users didn't lose state.

## v0.1.0 – v0.1.14

Early development. Highlights:

- Core canvas of parallel PTY terminals with automatic tiling.
- Per-agent git worktree isolation, in-app diff, and merge.
- Agent relaunch on reopen rather than restoring a bare shell.
- In-app update notifications.
- Repeated terminal interaction work — focus reliability, copy/paste across platforms, selection,
  and screenshot/file paste.
- Release pipeline: installers published automatically on a version tag.
