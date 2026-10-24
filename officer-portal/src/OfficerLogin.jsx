import { useState } from 'react'
import { TOKEN_URL, extractOfficerRole, decodeJwtPayload, persistOfficerSession, officerLandingPath } from './auth'
import './OfficerLogin.css'

function readPrefillUsername() {
  return new URLSearchParams(window.location.search).get('user') ?? ''
}

export default function OfficerLogin() {
  const [username, setUsername] = useState(readPrefillUsername)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function login(user, pass) {
    const u = user ?? username
    const p = pass ?? password
    setError(null)
    setLoading(true)
    try {
      const body = new URLSearchParams({
        grant_type: 'password',
        client_id: 'officer-portal',
        username: u,
        password: p,
      })
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      if (res.status === 401) {
        setError('Invalid credentials')
        return
      }
      if (!res.ok) throw new Error('login failed')
      const data = await res.json()
      const payload = decodeJwtPayload(data.access_token)
      const role = extractOfficerRole(payload)
      const displayName = payload?.given_name ?? u
      persistOfficerSession({
        token: data.access_token,
        role,
        name: displayName,
        username: payload?.preferred_username ?? u,
        sub: payload?.sub,
      })
      window.location.href = officerLandingPath(role)
    } catch {
      setError('Cannot reach authentication server')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    login()
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-hero-content">
          <div className="login-emblem">🏛</div>
          <h1 className="login-hero-title">Digital Gujarat 2.0</h1>
          <p className="login-hero-sub">Integrated Welfare Delivery Platform</p>
          <div className="login-hero-divider" />
          <ul className="login-hero-bullets">
            <li>✦ 6 citizen services · BPMN 2.0 workflows</li>
            <li>✦ AI-powered eligibility · LightGBM + Gemma 4</li>
            <li>✦ ~221,000 families · Gujarat-wide coverage</li>
          </ul>
        </div>
        <p className="login-hero-footer">Government of Gujarat · NIC · Digital India</p>
      </div>

      <div className="login-form-panel">
        <div className="login-form-inner">
          <div className="login-logo-row">
            <span className="login-logo-icon">🏛</span>
            <span className="login-logo-text">DG 2.0</span>
          </div>
          <h2 className="login-form-title">Officer Sign In</h2>
          <p className="login-form-sub">Authenticated via Keycloak IAM</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span className="login-label">Username</span>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="login-field">
              <span className="login-label">Password</span>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <details className="login-roles-hint">
            <summary>Demo credentials</summary>
            <div>talati / officer123 — Talati (queue, grievances, family registry)</div>
            <div>scheme.dept / officer123 — Department · Ahmedabad district</div>
            <div>senior.mgmt / officer123 — Senior management (analytics)</div>
            <div>data.entry / officer123 — Data entry review</div>
            <div>mamlatdar / officer123 — Talati queue (alias)</div>
            <div>revenue / officer123 — Revenue officer</div>
            <div>dept.admin / officer123 — All tasks</div>
            <div>it.admin / officer123 — IT Secretary</div>
          </details>
        </div>
      </div>
    </div>
  )
}
