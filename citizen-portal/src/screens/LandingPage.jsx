import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AUTH_API, OFFICER_TOKEN_URL } from '../auth'
import { APIs, buildCitizenSessionProfile } from '../api'
import { getOfficerPortalUrl } from '../portalUrls'
import {
  LANDING_LOCALES,
  SERVICE_ICONS,
  NOTICE_TAG_STYLES,
  SCHEME_DATE_STYLES,
  SCHEME_TAG_STYLES,
} from '../landingLocales'
import '../LandingPage.css'

const STEP_ICONS = ['ti-fingerprint', 'ti-apps', 'ti-file-upload', 'ti-truck-delivery']
const AI_FEATURE_ICONS = ['ti-message-chatbot', 'ti-target-arrow', 'ti-shield-check', 'ti-bell-ringing', 'ti-bulb', 'ti-bolt']

const DEMO_USERS = [
  { label: 'Priya Patel', aadhaar: 'XXXX-XXXX-1001' },
  { label: 'Rajan Nair', aadhaar: 'XXXX-XXXX-2001' },
  { label: 'Kavita Rathod', aadhaar: 'XXXX-XXXX-5001' },
  { label: 'Meera Rathod', aadhaar: 'XXXX-XXXX-5005' },
]

const APPLICATION_CARDS = [
  { emoji: '🧑', title: 'Income Certificate', appId: 'DG-2026-114402', pct: 80, statusLabel: 'In review', ready: 'Certificate ready within a day' },
  { emoji: '👵', title: 'Senior Citizen Card', appId: 'DG-2026-114899', pct: 100, statusLabel: 'Approved', ready: 'Certificate ready within a day', variant: 'green' },
  { emoji: '🏠', title: 'Domicile Certificate', appId: 'DG-2026-114633', pct: 45, statusLabel: 'Processing', ready: 'Certificate ready within a day', variant: 'blue' },
  { emoji: '🎓', title: 'OBC Scholarship', appId: 'DG-2026-114788', pct: 60, statusLabel: 'Under verification', ready: 'Certificate ready within a day' },
  { emoji: '📜', title: 'Caste Certificate', appId: 'DG-2026-114521', pct: 100, statusLabel: 'Approved', ready: 'Certificate ready within a day', variant: 'green' },
]
const CAROUSEL_CARDS = [...APPLICATION_CARDS, ...APPLICATION_CARDS]

const OFFICER_ROLES = [
  'DATA_ENTRY_OFFICER',
  'TALATI',
  'REVENUE_OFFICER',
  'SCHEME_DEPT',
  'DEPT_ADMIN',
  'IT_ADMIN',
  'SENIOR_MGMT',
]

function readLandingLang() {
  return localStorage.getItem('landing_lang') === 'gu' ? 'gu' : 'en'
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

function extractOfficerRole(payload) {
  const roles = payload?.realm_access?.roles ?? []
  return roles.find((r) => OFFICER_ROLES.includes(r)) ?? 'UNKNOWN'
}

function HeaderNavLink({ item }) {
  const cls = item.active ? 'active' : ''
  if (item.to.startsWith('#')) {
    return <a href={item.to} className={cls}>{item.label}</a>
  }
  return <Link to={item.to} className={cls}>{item.label}</Link>
}

function ApplicationCard({ card }) {
  const fillClass = card.pct === 100 ? 'status-done' : card.variant === 'blue' ? 'status-blue' : ''
  const dotClass = card.variant === 'green' || card.pct === 100 ? 'dot-green' : card.variant === 'blue' ? 'dot-blue' : ''
  return (
    <div className={`hero-center-card${card.variant ? ` card-${card.variant}` : ''}`}>
      <div className="top-row">
        <div className="avatar">{card.emoji}</div>
        <span className="verified"><i className="ti ti-circle-check" aria-hidden="true" /> e-KYC verified</span>
      </div>
      <h4>{card.title}</h4>
      <div className="id">Application #{card.appId}</div>
      <div className="progress-track"><div className={`progress-fill ${fillClass}`} style={{ width: `${card.pct}%` }} /></div>
      <div className="progress-label"><span>{card.statusLabel}</span><span>{card.pct}%</span></div>
      <div className="status-line"><span className={`dot ${dotClass}`} />{card.ready}</div>
    </div>
  )
}

export default function LandingPage() {
  const [lang, setLang] = useState(readLandingLang)
  const [a11y, setA11y] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [loginType, setLoginType] = useState('citizen')
  const [citizenStep, setCitizenStep] = useState('aadhaar')
  const [citizenRef, setCitizenRef] = useState('')
  const [maskedMobile, setMaskedMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [officerUser, setOfficerUser] = useState('')
  const [officerPass, setOfficerPass] = useState('')
  const [showOfficerPass, setShowOfficerPass] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [serviceQuery, setServiceQuery] = useState('')
  const [tickerIndex, setTickerIndex] = useState(0)
  const headerMenuRef = useRef(null)
  const loginPanelRef = useRef(null)

  const t = LANDING_LOCALES[lang]
  const officerUrl = getOfficerPortalUrl()
  const filteredServices = t.services.filter((svc) => {
    if (!serviceQuery) return true
    const haystack = `${svc.title} ${svc.sub}`.toLowerCase()
    return haystack.includes(serviceQuery.toLowerCase())
  })

  useEffect(() => {
    function onDocClick(e) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setHeaderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTickerIndex((i) => (i + 1) % t.marquee.length)
    }, 4000)
    return () => clearInterval(id)
  }, [t.marquee.length])

  function toggleLang() {
    const next = lang === 'en' ? 'gu' : 'en'
    localStorage.setItem('landing_lang', next)
    setLang(next)
    document.documentElement.lang = next
  }

  function focusLoginPanel(type) {
    setHeaderMenuOpen(false)
    setLoginError(null)
    setLoginType(type)
    if (type === 'citizen') {
      setCitizenStep('aadhaar')
      setOtp('')
    }
    requestAnimationFrame(() => {
      loginPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      document.getElementById(type === 'citizen' ? 'c-user' : 'o-user')?.focus({ preventScroll: true })
    })
  }

  async function sendCitizenOtp(ref) {
    const value = (ref ?? citizenRef).trim()
    if (!value) return
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch(`${AUTH_API}/v1/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarRef: value }),
      })
      if (res.status === 404) {
        setLoginError(t.loginErrorAadhaar)
        return
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        setLoginError(t.loginErrorAuthDown)
        return
      }
      if (!res.ok) throw new Error('send failed')
      const data = await res.json()
      setCitizenRef(value)
      setMaskedMobile(data.maskedMobile || '******')
      setCitizenStep('otp')
      setOtp('')
    } catch {
      setLoginError(t.loginErrorAuthDown)
    } finally {
      setLoginLoading(false)
    }
  }

  async function verifyCitizenOtp() {
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch(`${AUTH_API}/v1/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarRef: citizenRef, otp }),
      })
      if (res.status === 401) {
        setLoginError(t.loginErrorOtp)
        return
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        setLoginError(t.loginErrorAuthDown)
        return
      }
      if (!res.ok) throw new Error('verify failed')
      const data = await res.json()

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
      } catch { /* optional enrichment */ }

      localStorage.setItem('citizen_token', data.token)
      const sessionProfile = await buildCitizenSessionProfile(data, person)
      localStorage.setItem('citizen_profile', JSON.stringify(sessionProfile))
      window.location.href = sessionProfile.onboardingCompleted ? '/' : '/onboarding'
    } catch {
      setLoginError(t.loginErrorGeneric)
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleCitizenSubmit(e) {
    e.preventDefault()
    if (citizenStep === 'aadhaar') {
      await sendCitizenOtp()
      return
    }
    await verifyCitizenOtp()
  }

  async function handleOfficerSubmit(e) {
    e.preventDefault()
    if (!officerUser.trim() || !officerPass) return
    setLoginError(null)
    setLoginLoading(true)
    try {
      const body = new URLSearchParams({
        grant_type: 'password',
        client_id: 'officer-portal',
        username: officerUser.trim(),
        password: officerPass,
      })
      const res = await fetch(OFFICER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      if (res.status === 401) {
        setLoginError(t.loginErrorOfficer)
        return
      }
      if (!res.ok) throw new Error('login failed')
      const data = await res.json()
      const payload = decodeJwtPayload(data.access_token)
      const role = extractOfficerRole(payload)
      const displayName = payload?.given_name ?? officerUser.trim()
      const handoff = encodeURIComponent(JSON.stringify({
        token: data.access_token,
        role,
        name: displayName,
        username: payload?.preferred_username ?? officerUser.trim(),
        district: role === 'SCHEME_DEPT' ? 'Ahmedabad' : null,
      }))
      window.location.href = `${officerUrl}${role === 'SENIOR_MGMT' ? '/analytics' : ''}/#dg_sso=${handoff}`
    } catch {
      setLoginError(t.loginErrorOfficer)
    } finally {
      setLoginLoading(false)
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    setServiceQuery(searchInput.trim())
    document.getElementById('services')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`dg-landing${lang === 'gu' ? ' dg-landing-gu' : ''}${a11y ? ' dg-a11y' : ''}`}>
      <a href="#main-content" className="skip-link">{t.skipToContent}</a>

      <div className="goi-bar">
        <div className="goi-bar-left">
          <span>Government of India</span>
          <span>Government of Gujarat</span>
          <span>Department of Science &amp; Technology</span>
        </div>
        <div className="goi-bar-right">
          <button
            type="button"
            className={`a11y-toggle${a11y ? ' active' : ''}`}
            aria-pressed={a11y}
            onClick={() => setA11y((v) => !v)}
          >
            <i className="ti ti-accessible" aria-hidden="true" /> {t.accessibilityLabel}
          </button>
          <button type="button" className="landing-lang-toggle" onClick={toggleLang}>
            {t.langToggle}
          </button>
        </div>
      </div>

      <header className="dg-header">
        <div className="wrap header-inner">
          <div className="header-left">
            <div className="emblem-wrap">
              <img src="/emblem-of-india.png" alt={t.emblemAlt} className="india-emblem" />
              <img src="/logodig.png" alt={t.logoAlt} className="header-logo" />
            </div>
            <nav className="header-nav" aria-label="Main navigation">
              <ul>
                {t.headerNav.map((item) => (
                  <li key={item.label}>
                    <HeaderNavLink item={item} />
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="header-right">
            <div className={`login-wrap${headerMenuOpen ? ' open' : ''}`} ref={headerMenuRef}>
              <button
                type="button"
                className="login-btn"
                onClick={() => setHeaderMenuOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={headerMenuOpen}
              >
                <i className="ti ti-login" aria-hidden="true" />
                {t.loginButtonLabel}
                <i className="ti ti-chevron-down" aria-hidden="true" />
              </button>
              <div className="login-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => focusLoginPanel('citizen')}>
                  <span className="ic citizen"><i className="ti ti-user-circle" aria-hidden="true" /></span>
                  <span>{t.citizenPortal}<span className="sub">{t.citizenLoginSub}</span></span>
                </button>
                <button type="button" role="menuitem" onClick={() => focusLoginPanel('officer')}>
                  <span className="ic officer"><i className="ti ti-shield-lock" aria-hidden="true" /></span>
                  <span>{t.officerPortal}<span className="sub">{t.officerLoginSub}</span></span>
                </button>
              </div>
            </div>
            <button className="icon-btn menu-toggle" aria-label="Open menu">
              <i className="ti ti-menu-2" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="hero">
          <div className="hero-wrap">
            <div className="hero-left">
              <div className="hero-gu-wrap">
                <p className="hero-gu-heading" lang="gu">સરકારી સેવાઓ, તમારી સેવામાં!</p>
              </div>

              <div className="hero-login-panel" id="login-panel" ref={loginPanelRef}>
                <div className="login-tabs" role="tablist">
                  <button
                    type="button"
                    className={`login-tab${loginType === 'citizen' ? ' active' : ''}`}
                    role="tab"
                    aria-selected={loginType === 'citizen'}
                    onClick={() => { setLoginType('citizen'); setLoginError(null) }}
                  >
                    <span className="tab-ic"><i className="ti ti-user-circle" aria-hidden="true" /></span> {t.citizenPortal}
                  </button>
                  <button
                    type="button"
                    className={`login-tab officer-tab${loginType === 'officer' ? ' active' : ''}`}
                    role="tab"
                    aria-selected={loginType === 'officer'}
                    onClick={() => { setLoginType('officer'); setLoginError(null) }}
                  >
                    <span className="tab-ic"><i className="ti ti-shield-lock" aria-hidden="true" /></span> {t.officerPortal}
                  </button>
                </div>

                {loginType === 'citizen' ? (
                  <form className="login-pane" onSubmit={handleCitizenSubmit}>
                    <div className="login-pane-head">
                      <h3>{t.loginCitizenTitle}</h3>
                      <p>{t.loginCitizenDesc}</p>
                    </div>
                    {citizenStep === 'aadhaar' ? (
                      <>
                        <div className="login-field">
                          <label htmlFor="c-user">{t.fieldCitizenLabel}</label>
                          <input
                            type="text"
                            id="c-user"
                            placeholder={t.fieldCitizenPlaceholder}
                            autoComplete="username"
                            value={citizenRef}
                            onChange={(e) => setCitizenRef(e.target.value)}
                          />
                        </div>
                        {loginError && <div className="login-error">{loginError}</div>}
                        <div className="login-btn-row">
                          <button className="login-submit citizen-submit" type="submit" disabled={loginLoading}>
                            <i className="ti ti-send-2" aria-hidden="true" />
                            {loginLoading ? t.signingInLabel : t.sendOtpLabel}
                          </button>
                        </div>
                        <div className="login-demo-block">
                          <div className="login-demo-label">{t.demoUsersLabel}</div>
                          <div className="login-demo-chips">
                            {DEMO_USERS.map((u) => (
                              <button
                                key={u.aadhaar}
                                type="button"
                                className="login-demo-chip"
                                disabled={loginLoading}
                                onClick={() => {
                                  setCitizenRef(u.aadhaar)
                                  sendCitizenOtp(u.aadhaar)
                                }}
                              >
                                {u.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="login-otp-sent">
                          {t.otpSentHint.replace('{mobile}', maskedMobile)}
                        </p>
                        <div className="login-demo-hint">{t.demoOtpHint}</div>
                        <div className="login-field">
                          <label htmlFor="c-otp">{t.otpLabel}</label>
                          <input
                            type="tel"
                            id="c-otp"
                            maxLength={6}
                            autoComplete="one-time-code"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                          />
                        </div>
                        {loginError && <div className="login-error">{loginError}</div>}
                        <div className="login-btn-row">
                          <button className="login-submit citizen-submit" type="submit" disabled={loginLoading}>
                            <i className="ti ti-login-2" aria-hidden="true" />
                            {loginLoading ? t.signingInLabel : t.verifyOtpLabel}
                          </button>
                          <button
                            type="button"
                            className="login-change-link"
                            onClick={() => {
                              setCitizenStep('aadhaar')
                              setOtp('')
                              setLoginError(null)
                            }}
                          >
                            {t.changeAadhaarLabel}
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                ) : (
                  <form className="login-pane" onSubmit={handleOfficerSubmit}>
                    <div className="login-pane-head">
                      <h3>{t.loginOfficerTitle}</h3>
                      <p>{t.loginOfficerDesc}</p>
                    </div>
                    <div className="login-field">
                      <label htmlFor="o-user">{t.fieldOfficerUserLabel}</label>
                      <input
                        type="text"
                        id="o-user"
                        placeholder={t.fieldOfficerUserPlaceholder}
                        autoComplete="username"
                        value={officerUser}
                        onChange={(e) => setOfficerUser(e.target.value)}
                      />
                    </div>
                    <div className="login-field">
                      <label htmlFor="o-pass">{t.fieldOfficerPassLabel}</label>
                      <div className="login-pass-wrap">
                        <input
                          type={showOfficerPass ? 'text' : 'password'}
                          id="o-pass"
                          placeholder={t.fieldOfficerPassPlaceholder}
                          autoComplete="current-password"
                          value={officerPass}
                          onChange={(e) => setOfficerPass(e.target.value)}
                        />
                        <button
                          type="button"
                          className="login-pass-toggle"
                          onClick={() => setShowOfficerPass((v) => !v)}
                          aria-label={showOfficerPass ? t.hidePasswordLabel : t.showPasswordLabel}
                          title={showOfficerPass ? t.hidePasswordLabel : t.showPasswordLabel}
                        >
                          <i className={showOfficerPass ? 'ti ti-eye-off' : 'ti ti-eye'} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {loginError && <div className="login-error">{loginError}</div>}
                    <div className="login-btn-row">
                      <button className="login-submit officer-submit" type="submit" disabled={loginLoading}>
                        <i className="ti ti-login-2" aria-hidden="true" />
                        {loginLoading ? t.signingInLabel : t.loginButtonLabel}
                      </button>
                    </div>
                    <details className="login-roles-hint">
                      <summary>Demo credentials</summary>
                      <div>talati / officer123 — Talati (queue, grievances, family registry)</div>
                      <div>scheme.dept / officer123 — Department · Ahmedabad district</div>
                      <div>senior.mgmt / officer123 — Senior management (analytics)</div>
                      <div>data.entry / officer123 — Data entry review</div>
                      <div>revenue / officer123 — Revenue officer</div>
                      <div>dept.admin / officer123 — All tasks</div>
                      <div>it.admin / officer123 — IT Secretary</div>
                    </details>
                  </form>
                )}
              </div>
            </div>

            <div className="hero-right">
              <div className="hero-badge">{t.heroBadge}</div>

              <div className="hero-float-search">
                <form className="search-box search-box-compact" onSubmit={handleSearchSubmit}>
                  <i className="ti ti-search" style={{ marginLeft: 4, flexShrink: 0, color: '#8892A6' }} aria-hidden="true" />
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button type="submit" aria-label={t.searchButtonLabel}>
                    <i className="ti ti-arrow-right" aria-hidden="true" />
                  </button>
                </form>
              </div>

              <div className="hero-float-ticker">
                <div className="ticker-card" role="status" aria-live="polite">
                  <span className="ticker-card-tag">
                    <i className="ti ti-point-filled" aria-hidden="true" /> {t.liveUpdates}
                  </span>
                  <p key={tickerIndex} className="ticker-card-text">{t.marquee[tickerIndex]}</p>
                </div>
              </div>

              <h1>
                {t.heroTitle1}<br /><span>{t.heroTitle2}</span><br />{t.heroTitle3}
              </h1>

              <p className="lede">{t.heroDesc}</p>

              <div className="hero-visual" aria-hidden="true">
                <div className="hero-carousel">
                  <div className="hero-carousel-track">
                    {CAROUSEL_CARDS.map((card, i) => (
                      <ApplicationCard key={`${card.appId}-${i}`} card={card} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="stat-strip" role="region" aria-label="Platform statistics">
          <div className="stat-row">
            {t.stats.map((stat) => (
              <div key={stat.l} className="stat-card">
                <div className="num">{stat.n}</div>
                <div className="label">{stat.l}</div>
              </div>
            ))}
          </div>
        </div>

        <section id="services" className="section-alt" aria-label="Top citizen services">
          <div className="wrap">
            <div className="sec-hdr">
              <div>
                <span className="tag">Quick access</span>
                <h2>{t.topServices}</h2>
              </div>
              <button type="button" className="see-all" onClick={() => focusLoginPanel('citizen')}>{t.browseAll}</button>
            </div>
            <div className="svc-grid">
              {filteredServices.map((svc) => {
                const i = t.services.indexOf(svc)
                return (
                  <button key={svc.title} type="button" className="svc-card" onClick={() => focusLoginPanel('citizen')}>
                    <div className="svc-ic" style={{ background: SERVICE_ICONS[i].bg }}>
                      <i className={`ti ${SERVICE_ICONS[i].icon}`} style={{ color: SERVICE_ICONS[i].color }} aria-hidden="true" />
                    </div>
                    <h3>{svc.title}</h3>
                    <p>{svc.sub}</p>
                  </button>
                )
              })}
              {filteredServices.length === 0 && (
                <div className="no-results">No services match "{serviceQuery}".</div>
              )}
            </div>
          </div>
        </section>

        <div className="steps-band">
          <div className="wrap">
            <div className="sec-hdr">
              <div>
                <span className="tag">How it works</span>
                <h2>{t.stepsTitle}</h2>
              </div>
            </div>
            <div className="journey">
              {t.steps.map((step, i) => (
                <div key={step.title} className="jstep">
                  <div className="jnum"><i className={`ti ${STEP_ICONS[i]}`} aria-hidden="true" /></div>
                  <div className="jtitle">{step.title}</div>
                  <p className="jdesc">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section aria-label="AI-powered platform features">
          <div className="wrap">
            <div className="ai-banner">
              <div className="ai-banner-head">
                <span className="tag">
                  <i className="ti ti-sparkles" aria-hidden="true" /> Powered by Sarvam 30B, GSDC Gandhinagar
                </span>
                <h2>{t.aiTitle}</h2>
                <p>{t.aiDesc}</p>
              </div>
              <div className="ai-feature-grid">
                {t.aiFeatures.map((feature, i) => (
                  <div key={feature.title} className="ai-feature">
                    <div className="ic"><i className={`ti ${AI_FEATURE_ICONS[i]}`} aria-hidden="true" /></div>
                    <h4>{feature.title}</h4>
                    <p>{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="updates" aria-label="Notices and schemes">
          <div className="wrap">
            <div className="two-col">
              <div className="panel">
                <div className="panel-hdr"><span className="ph-dot" />{t.noticesTitle}</div>
                {t.notices.map((n) => {
                  const tagStyle = NOTICE_TAG_STYLES[n.tag]
                  return (
                    <div key={n.date + n.tag} className="ni">
                      <div className="ni-date">{n.date}<br />{n.year}</div>
                      <div>
                        <p className="ni-text">{n.text}</p>
                        <span className="ni-tag" style={tagStyle}>{n.tag}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="panel">
                <div className="panel-hdr"><span className="ph-dot" />{t.schemesTitle}</div>
                {t.schemeItems.map((item, i) => {
                  const tagStyle = SCHEME_TAG_STYLES[item.tag] ?? { background: 'var(--blue-light)', color: 'var(--blue)' }
                  const dateLines = item.date.split('\n')
                  return (
                    <div key={item.tag + i} className="ni">
                      <div className="scheme-cat" style={{ background: SCHEME_DATE_STYLES[i] }}>
                        {dateLines.map((line, j) => (
                          <span key={j}>{line}{j < dateLines.length - 1 && <br />}</span>
                        ))}
                      </div>
                      <div>
                        <p className="ni-text">{item.text}</p>
                        <span className="ni-tag" style={tagStyle}>{item.tag}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="dg-footer" id="about" role="contentinfo">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <div className="footer-gov-label">{t.footerGov}</div>
              <div className="fb-name">{t.footerName}</div>
              <p className="footer-desc">{t.footerDesc}</p>
            </div>
            <div className="footer-col">
              <h4>{t.footerPortals}</h4>
              <ul>
                <li><button type="button" className="footer-link-btn" onClick={() => focusLoginPanel('citizen')}>{t.citizenPortal}</button></li>
                <li><button type="button" className="footer-link-btn" onClick={() => focusLoginPanel('officer')}>{t.officerPortal}</button></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>{t.footerHelp}</h4>
              <ul>
                {t.footerHelpLinks.map((label) => (
                  <li key={label}><button type="button" className="footer-link-btn" onClick={() => focusLoginPanel('citizen')}>{label}</button></li>
                ))}
              </ul>
            </div>
            <div className="footer-col">
              <h4>{t.footerAbout}</h4>
              <ul>
                {t.footerAboutLinks.map((label) => (
                  <li key={label}><a href="#about">{label}</a></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t.footerCopy}</span>
          <span>{t.footerUpdated}</span>
        </div>
      </footer>
    </div>
  )
}
