import './landscapeState'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import App from './App.tsx'
import './index.css'
import { applyTheme, watchSystemTheme } from './theme'
import { registerSW } from 'virtual:pwa-register'

applyTheme()
watchSystemTheme()

// Register service worker for PWA support
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
