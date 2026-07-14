import { app } from 'electron'

// Installers are published as GitHub Releases on this repo (Serhii-Leniv/Monad,
// public) — its releases/latest is the app's version feed. CI attaches them on
// every version tag; see RELEASING.md. The check runs in the main process so the
// renderer never talks to the network and the production CSP stays strict.
const RELEASES_API = 'https://api.github.com/repos/Serhii-Leniv/Monad/releases/latest'
// Send users to the download site, not the raw release: it picks the right
// installer per OS and explains the unsigned-build Gatekeeper/SmartScreen prompt.
// NOTE: must track the repo name — GitHub Pages URLs do NOT redirect on rename
// (the old /vectro-site page 404s), unlike the REST API.
const DOWNLOAD_URL = 'https://serhii-leniv.github.io/Monad'

export interface UpdateInfo {
  current: string
  latest: string
  url: string
}

/** "v0.1.9" | "0.1.9" → [0, 1, 9]; null when it isn't a dotted number. */
function parseVersion(v: string): number[] | null {
  const m = v.trim().replace(/^v/i, '')
  if (!/^\d+(\.\d+)*$/.test(m)) return null
  return m.split('.').map(Number)
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

/**
 * One-shot update check: resolves to the newer version if there is one, else
 * null (including on any network/API failure — an update check must never
 * surface an error). Dev runs report null; set MONAD_UPDATE_CHECK=1 to test.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // Dev-only harness for the update UI: `MONAD_FAKE_UPDATE=9.9.9 npm run dev`
  // reports a synthetic newer release so the reminder banner/toast can be seen
  // without cutting a real release. Ignored in packaged builds.
  if (!app.isPackaged && process.env.MONAD_FAKE_UPDATE) {
    return { current: app.getVersion(), latest: process.env.MONAD_FAKE_UPDATE, url: DOWNLOAD_URL }
  }
  if (!app.isPackaged && process.env.MONAD_UPDATE_CHECK !== '1') return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(RELEASES_API, {
      // GitHub's API rejects UA-less requests with 403 — don't rely on the
      // fetch implementation's default.
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Monad/${app.getVersion()}`
      },
      signal: ctrl.signal
    })
    if (!res.ok) {
      console.warn(`[monad] update check failed: HTTP ${res.status} from ${RELEASES_API}`)
      return null
    }
    const json = (await res.json()) as { tag_name?: unknown }
    const latest = typeof json.tag_name === 'string' ? json.tag_name.replace(/^v/i, '') : ''
    const current = app.getVersion()
    if (!parseVersion(latest)) {
      console.warn(`[monad] update check: unparsable tag_name ${JSON.stringify(json.tag_name)}`)
      return null
    }
    if (!isNewer(latest, current)) return null
    return { current, latest, url: DOWNLOAD_URL }
  } catch (e) {
    console.warn('[monad] update check failed:', e)
    return null
  } finally {
    clearTimeout(timer)
  }
}
