import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/noto-sans-telugu/400.css'
import '@fontsource/noto-sans-telugu/600.css'
import '@fontsource/noto-sans-telugu/700.css'
import './index.css'
import App from './App.jsx'

// Form-builder and some deps emit classic JSX (React.createElement).
globalThis.React = React

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
