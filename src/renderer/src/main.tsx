import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import '@xterm/xterm/css/xterm.css'
import './styles.css'

// No StrictMode: it double-mounts components in dev, which would spawn each
// terminal's PTY twice (mount → unmount → remount).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
