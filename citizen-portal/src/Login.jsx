import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { AUTH_API } from './auth'
import { APIs, buildCitizenSessionProfile } from './api'
import './Login.css'

const DEMO_USERS = [
  { label: 'Priya Patel', aadhaar: 'XXXX-XXXX-1001' },
  { label: 'Rajan Nair', aadhaar: 'XXXX-XXXX-2001' },
  { label: 'Kavita Rathod', aadhaar: 'XXXX-XXXX-5001' },
  { label: 'Meera Rathod', aadhaar: 'XXXX-XXXX-5005' },
]

export default function Login() {
  const { t } = useTranslation()
  const location = useLocation()
  const [screen, setScreen] = useState('aadhaar')
  const [aadhaarRef, setAadhaarRef] = useState(location.state?.aadhaarRef ?? '')
  const [maskedMobile, setMaskedMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const LANG_CYCLE = ['en', 'gu', 'hi']

  function toggleLang() {
    const next = LANG_CYCLE[(LANG_CYCLE.indexOf(i18n.language) + 1) % LANG_CYCLE.length]
    localStorage.setItem('lang', next)
    i18n.changeLanguage(next)
  }

  async function sendOtp(ref) {
    const value = (ref ?? aadhaarRef).trim()
    if (!value) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_API}/v1/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarRef: value }),
      })
      if (res.status === 404) {
        setError(t('login.aadhaarNotFound'))
        return
      }
      if (!res.ok) throw new Error('send failed')
      const data = await res.json()
      setAadhaarRef(value)
      setMaskedMobile(data.maskedMobile)
      setScreen('otp')
    } catch {
      setError(t('login.genericError'))
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_API}/v1/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarRef, otp }),
      })
      if (res.status === 401) {
        setError(t('login.invalidOtp'))
        return
      }
      if (!res.ok) throw new Error('verify failed')
      const data = await res.json()
      // Enrich profile with full person details from family registry
      let person = {}
      try {
        const pr = await fetch(`${APIs.family}/v1/persons/search?aadhaar=${encodeURIComponent(data.aadhaarRef)}`)
        if (pr.ok) {
          const payload = await pr.json()
          const persons = payload.results ?? payload
          if (Array.isArray(persons) && persons.length > 0) {
            person = persons.find((p) => p.aadhaarRef === data.aadhaarRef) ?? persons[0]
          }
        }
      } catch { /* registry may not have this person — continue anyway */ }

      localStorage.setItem('citizen_token', data.token)
      const sessionProfile = await buildCitizenSessionProfile(data, person)
      localStorage.setItem('citizen_profile', JSON.stringify(sessionProfile))
      window.location.href = sessionProfile.onboardingCompleted ? '/' : '/onboarding'
    } catch {
      setError(t('login.genericError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <header className="top-header">
        <span className="top-header-left">{t('appTitle')}</span>
        <span className="top-header-center">{t('portalName')}</span>
        <button type="button" className="lang-toggle" onClick={toggleLang}>
          {t('langToggle')}
        </button>
      </header>

      <div className="login-wrap">
        <p style={{ marginBottom: 12 }}>
          <Link to="/" className="link-btn">← Back to Citizen Services home</Link>
        </p>
        <div className="card login-card">
          {screen === 'aadhaar' ? (
            <>
              <h1 className="login-title">{t('login.title')}</h1>
              <p className="muted">{t('login.subtitle')}</p>
              <label className="field">
                {t('form.aadhaarRef')}
                <input
                  type="text"
                  placeholder="XXXX-XXXX-NNNN"
                  value={aadhaarRef}
                  onChange={(e) => setAadhaarRef(e.target.value)}
                />
              </label>
              {error && <div className="error-banner">{error}</div>}
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={() => sendOtp()}
              >
                {loading ? t('form.submitting') : t('login.sendOtp')}
              </button>
              <div className="demo-hint">
                {t('login.demoHint')}
              </div>
              <div className="demo-chips">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.aadhaar}
                    type="button"
                    className="demo-chip"
                    onClick={() => {
                      setAadhaarRef(u.aadhaar)
                      sendOtp(u.aadhaar)
                    }}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 className="login-title">{t('login.enterOtp')}</h1>
              <p className="muted">{t('login.otpSent', { mobile: maskedMobile })}</p>
              <div className="demo-hint">{t('login.demoOtp')}</div>
              <label className="field">
                OTP
                <input
                  type="tel"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </label>
              {error && <div className="error-banner">{error}</div>}
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={verifyOtp}
              >
                {loading ? t('form.submitting') : t('login.verify')}
              </button>
              <button type="button" className="link-btn" onClick={() => setScreen('aadhaar')}>
                {t('login.changeAadhaar')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
