import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './i18n'
import './index.css'
import App from './App.jsx'

class BootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-boot">
          <p>The citizen portal failed to load. Try http://127.0.0.1:30074/ or refresh.</p>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </BootErrorBoundary>
  </StrictMode>,
)
