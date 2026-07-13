# Releasing Monad

Installers are built by [`.github/workflows/build.yml`](.github/workflows/build.yml) and
published as a **GitHub Release on the public [`Monad-site`](https://github.com/Serhii-Leniv/Monad-site)
repo** — that's what the download site (https://serhii-leniv.github.io/Monad-site) links to.
This repo is private, so releases can't live here (anonymous users couldn't download them).

> The site repo was renamed **vectro-site → Monad-site**. The GitHub REST API and
> repo URLs redirect from the old name, but the **GitHub Pages URL does not** —
> `serhii-leniv.github.io/vectro-site` 404s. Apps at v0.1.18 and older carry that
> dead download URL baked into their update banner; the API feed they check still
> works via the redirect, so they will still see new releases.

## One-time setup

The build runs here but publishes to a different repo, so the default `GITHUB_TOKEN`
isn't enough. Create a token with write access to `Monad-site`:

1. **Create a fine-grained PAT** — GitHub → Settings → Developer settings →
   Fine-grained tokens. Resource owner: your account; repository access: only
   `Monad-site`; permission: **Contents → Read and write**.
2. **Add it as a secret on this repo** — Settings → Secrets and
   variables → Actions → New repository secret → name `SITE_RELEASE_TOKEN`,
   value = the PAT.

## Cutting a release

```bash
# 1. bump the version in package.json (e.g. 0.1.5), commit
# 2. tag and push — the tag triggers the build + publish
git tag v0.1.5
git push origin v0.1.5
```

The workflow builds macOS (Apple Silicon + Intel) and Windows, then publishes a
release on `Monad-site` tagged `v0.1.5` with these fixed-name assets:

| Platform                | Asset                      |
| ----------------------- | -------------------------- |
| macOS · Apple Silicon   | `Monad-macOS-arm64.dmg`    |
| macOS · Intel           | `Monad-macOS-x64.dmg`      |
| Windows · x64           | `Monad-Windows-Setup.exe`  |

The fixed names (set in [`electron-builder.yml`](electron-builder.yml)) are what make
the site's `releases/latest/download/<name>` links stable across versions. The site
also reads the GitHub Releases API to show the live version, date, and download size.

> Builds are unsigned (no paid signing certs yet), so users get a one-time
> Gatekeeper / SmartScreen prompt; the site explains the bypass. The release
> itself must be a **full release, not a prerelease** — the site's download
> buttons and the app's in-app update check both use GitHub's `releases/latest`
> API, which skips prereleases.

## Rename follow-ups (Vectro → Monad)

- **Release-blocking:** the first Monad release changes the asset filenames from
  `Vectro-*` to `Monad-*`, so the download site's fixed
  `releases/latest/download/<name>` links will 404 until the site's links (and
  branding text) are updated to the new names. Update the site repo in the same
  sitting as the first Monad release.
- The new `appId`/`productName` means the Windows installer installs **alongside**
  an existing Vectro install rather than upgrading it — old Start-menu/taskbar
  shortcuts keep pointing at the old exe until the user uninstalls Vectro.
  Worth a note on the download page. User data carries over automatically
  (one-shot migration in `src/main/migrate-userdata.ts`).
- ~~Optional, later: rename the `vectro-site` repo~~ **Done** — the repo is now
  `Monad-site`, and `RELEASES_API`/`DOWNLOAD_URL` in `src/main/update.ts` point at
  it (shipped after v0.1.18; older installs keep the dead Pages link in their
  banner but still detect updates via the API redirect).
