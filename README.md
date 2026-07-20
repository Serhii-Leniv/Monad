<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="build/mark-knockout-light-1024.png">
    <img alt="Monad" src="build/mark-knockout-dark-1024.png" width="132">
  </picture>
</p>

<h1 align="center">Monad</h1>

<p align="center">
  <b>Run a whole team of coding agents at once.</b><br>
  The desktop space for parallel agentic coding — start five, keep them out of each
  other's way, ship the one that nailed it.
</p>

<p align="center">
  <a href="https://serhii-leniv.github.io/Monad/"><img alt="Download Monad" src="https://img.shields.io/badge/Download-Monad-ff453a?style=flat-square"></a>
  <a href="https://github.com/Serhii-Leniv/Monad/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Serhii-Leniv/Monad?style=flat-square&label=latest&color=ff453a"></a>
  <a href="https://github.com/Serhii-Leniv/Monad/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Serhii-Leniv/Monad/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="https://github.com/Serhii-Leniv/Monad/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Serhii-Leniv/Monad?style=flat-square&color=f0b429"></a>
  <img alt="macOS and Windows" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows-1f2430?style=flat-square">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-30d158?style=flat-square">
</p>

<p align="center">
  <img alt="Six AI coding agents running in parallel on the Monad canvas, each in its own git worktree" src="assets/demo.gif" width="880">
  <br>
  <sub><a href="https://github.com/Serhii-Leniv/Monad/blob/main/assets/demo.mp4">▶ Watch the full demo</a></sub>
</p>

---

**[Download](#download)** · **[Quick start](#quick-start)** · **[FAQ](docs/FAQ.md)** ·
**[Docs](#docs)**

---

## Why Monad

You already know the move: throw the same task at three agents, take the best answer. What
you don't have is a place to *do* it. Monad is that place.

## Bring your own agents

Monad drives the agent CLIs you already run — **Claude Code, Codex, Gemini, Cursor**, or any
terminal tool — spawned on your machine with your own keys. No middleman, no markup, no extra
subscription, and **no inference cost**: the intelligence is whatever you've already installed.

Which also means nothing leaves your computer. No account, no telemetry, no background
service — just the app and the tools you point it at.

## Download

| Platform | Download |
| --- | --- |
| **macOS** (Apple Silicon) | [Monad&#8209;macOS&#8209;arm64.dmg](https://github.com/Serhii-Leniv/Monad/releases/latest/download/Monad-macOS-arm64.dmg) |
| **Windows** (x64) | [Monad&#8209;Windows&#8209;Setup.exe](https://github.com/Serhii-Leniv/Monad/releases/latest/download/Monad-Windows-Setup.exe) |

> [!IMPORTANT]
> **macOS needs one extra command on first launch.** Monad isn't signed with a paid Apple
> Developer certificate yet, so macOS quarantines it and claims the app is *"damaged."* It
> isn't. After dragging Monad to Applications, clear the flag once:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/Monad.app
> ```
>
> Windows shows a comparable one-time SmartScreen prompt (**More info → Run anyway**).
> Signing and notarization are on the roadmap.

Older versions and install notes live on **[the download page](https://serhii-leniv.github.io/Monad/)**.
Monad checks for updates on launch and tells you when one's ready.

## Quick start

1. **Install an agent CLI** — [`claude`](https://docs.claude.com/en/docs/claude-code/overview),
   `codex`, `gemini`, or `cursor-agent` — and make sure it's on your `PATH`.
2. **Open a project.** Point Monad at any folder; a git repo is what unlocks per-agent isolation.
3. **Add agents** from the toolbar. Each card is a real terminal; up to nine tile automatically.
4. **Review & merge.** Open a card's **Diff** tab, then **Merge** into your base branch — or
   **Discard** and let the next agent take it.

## Docs

- **[FAQ](docs/FAQ.md)** — cost, git requirements, agent limits, where your data lives, how
  Monad compares to tmux and cloud agent platforms
- **[Architecture](docs/ARCHITECTURE.md)** — process split, isolation model, security posture, tests
- **[Contributing](CONTRIBUTING.md)** — building from source, the checks to run, PR guidelines
- **[Changelog](docs/CHANGELOG.md)** — what changed in each release

Monad is in active development and every report helps —
[open an issue](https://github.com/Serhii-Leniv/Monad/issues/new/choose) with bugs or feature
requests. Found a security problem? Report it privately via [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Serhii Leniv
