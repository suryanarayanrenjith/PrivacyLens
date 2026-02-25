import { render } from 'preact'
import { ErrorBoundary } from './components/ErrorBoundary'
import { App } from './components/App'
import './styles/main.css'

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById('app')!,
)
