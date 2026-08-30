import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ExternalPluginOverlayRoot } from './components/ExternalPluginOverlayRoot'
import './styles.css'

const externalPluginOverlay = new URLSearchParams(window.location.search).has('pluginOverlay')
if (externalPluginOverlay) document.documentElement.classList.add('plugin-overlay-window-document')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {externalPluginOverlay ? <ExternalPluginOverlayRoot /> : <App />}
    </AppErrorBoundary>
  </React.StrictMode>
)
