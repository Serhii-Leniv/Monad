/** The user's theme preference — 'system' follows the OS light/dark setting live. */
export type ThemePreference = 'dark' | 'light' | 'system'

export const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' }
]

/** Coerce an untrusted persisted value (hand-edited localStorage) to a valid preference. */
export function sanitizeTheme(v: unknown): ThemePreference {
  return v === 'light' || v === 'system' ? v : 'dark'
}

// The active 'system' subscription, so switching to an explicit theme (or
// re-applying 'system') never stacks duplicate matchMedia listeners.
let systemQuery: MediaQueryList | null = null
let systemListener: ((e: MediaQueryListEvent) => void) | null = null

function setDomTheme(theme: 'dark' | 'light'): void {
  // styles.css keys every light override off :root[data-theme='light'];
  // 'dark' is the base :root palette, so the attribute is informational there.
  document.documentElement.dataset.theme = theme
}

/**
 * Apply the theme preference by stamping `data-theme` on <html>. For 'system'
 * we resolve against prefers-color-scheme AND subscribe to its change event so
 * a live OS switch re-themes the app without a restart.
 */
export function applyTheme(pref: ThemePreference): void {
  if (systemQuery && systemListener) {
    systemQuery.removeEventListener('change', systemListener)
    systemQuery = null
    systemListener = null
  }
  if (pref === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    setDomTheme(mq.matches ? 'light' : 'dark')
    systemListener = (e) => setDomTheme(e.matches ? 'light' : 'dark')
    mq.addEventListener('change', systemListener)
    systemQuery = mq
  } else {
    setDomTheme(pref)
  }
}
