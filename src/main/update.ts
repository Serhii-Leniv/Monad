import { app } from 'electron'

// Installers are published as GitHub Releases on the public vectro-site repo
// (see RELEASING.md) — its releases/latest is the app's version feed. The check
// runs in the main process so the renderer never talks to the network and the
// production CSP stays strict.
const RELEASES_API = 'https://api.github.com/repos/Serhii-Leniv/vectro-site/releases/latest'
// Send users to the download site, not the raw release: it picks the right
// installer per OS and explains the unsigned-build Gatekeeper/SmartScreen prompt.
const DOWNLOAD_URL = 'https://serhii-leniv.github.io/vectro-site'

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
  if (!app.isPackaged && process.env.MONAD_UPDATE_CHECK !== '1') return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal
    })
    if (!res.ok) return null
    const json = (await res.json()) as { tag_name?: unknown }
    const latest = typeof json.tag_name === 'string' ? json.tag_name.replace(/^v/i, '') : ''
    const current = app.getVersion()
    if (!isNewer(latest, current)) return null
    return { current, latest, url: DOWNLOAD_URL }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
