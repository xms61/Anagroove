import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Self-hosted fonts (Latin subsets; CJK text falls back to system fonts). A browser downloads a
// display face only when the active theme uses it.
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/zen-kaku-gothic-new/latin-900.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/fraunces/latin-600-italic.css'
import './themes.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
