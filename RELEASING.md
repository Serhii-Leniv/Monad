# Releasing Vectro

Installers are built by [`.github/workflows/build.yml`](.github/workflows/build.yml) and
published as a **GitHub Release on the public [`vectro-site`](https://github.com/Serhii-Leniv/vectro-site)
repo** — that's what the download site (https://serhii-leniv.github.io/vectro-site) links to.
This repo is private, so releases can't live here (anonymous users couldn't download them).

## One-time setup

The build runs here but publishes to a different repo, so the default `GITHUB_TOKEN`
isn't enough. Create a token with write access to `vectro-site`:

1. **Create a fine-grained PAT** — GitHub → Settings → Developer settings →
   Fine-grained tokens. Resource owner: your account; repository access: only
   `vectro-site`; permission: **Contents → Read and write**.
2. **Add it as a secret on this repo** — `vectro` → Settings → Secrets and
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
release on `vectro-site` tagged `v0.1.5` with these fixed-name assets:

| Platform                | Asset                       |
| ----------------------- | --------------------------- |
| macOS · Apple Silicon   | `Vectro-macOS-arm64.dmg`    |
| macOS · Intel           | `Vectro-macOS-x64.dmg`      |
| Windows · x64           | `Vectro-Windows-Setup.exe`  |

The fixed names (set in [`electron-builder.yml`](electron-builder.yml)) are what make
the site's `releases/latest/download/<name>` links stable across versions. The site
also reads the GitHub Releases API to show the live version, date, and download size.

> Builds are unsigned (no paid signing certs yet), so the release is marked
> **pre-release** and users get a one-time Gatekeeper / SmartScreen prompt. The
> site explains the bypass.
