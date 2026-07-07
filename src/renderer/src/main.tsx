import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { useStore } from './store'
import { applyTheme } from './theme'
import '@xterm/xterm/css/xterm.css'
import './styles.css'

// Stamp data-theme BEFORE the first render/paint so a light-theme user never
// sees a dark flash (the store reads settings synchronously from localStorage).
// App.tsx re-applies it reactively when the setting changes.
applyTheme(useStore.getState().settings.theme)

// No StrictMode: it double-mounts components in dev, which would spawn each
// terminal's PTY twice (mount → unmount → remount).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
