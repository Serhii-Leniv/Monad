# Releasing Monad

Installers are built by [`.github/workflows/build.yml`](.github/workflows/build.yml) and
attached as a **GitHub Release on this repo** — that's what the download site
(https://serhii-leniv.github.io/Monad) links to. The site itself is GitHub Pages
serving this repo's `gh-pages` branch. Everything lives here; there is no
cross-repo publishing and no extra token: the workflow uses the automatic
`GITHUB_TOKEN`.

## Cutting a release

```bash
# 1. bump the version in package.json (e.g. 0.1.20), commit
# 2. tag and push — the tag triggers the build, which attaches the installers
#    to a Release on this repo
git tag v0.1.20
git push origin v0.1.20
```

The workflow builds macOS (Apple Silicon) and Windows and attaches these
fixed-name assets to the tag's release:

| Platform                | Asset                      |
| ----------------------- | -------------------------- |
| macOS · Apple Silicon   | `Monad-macOS-arm64.dmg`    |
| Windows · x64           | `Monad-Windows-Setup.exe`  |

The fixed names (set in [`electron-builder.yml`](electron-builder.yml)) are what make
the site's `releases/latest/download/<name>` links stable across versions. The site
also reads the GitHub Releases API to show the live version, date, and download size.

> Builds are unsigned (no paid signing certs yet), so users get a one-time
> Gatekeeper / SmartScreen prompt; the site explains the bypass. The release
> itself must be a **full release, not a prerelease** — the site's download
> buttons and the app's in-app update check both use GitHub's `releases/latest`
> API, which skips prereleases.

## Updating the download site

The site is the `gh-pages` branch of this repo (single static `index.html` +
assets). Edit, commit, push — GitHub Pages redeploys automatically.
