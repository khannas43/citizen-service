import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LANDING_LOCALES } from '../landingLocales'
import '../LandingPage.css'

function HeaderNavLink({ item }) {
  const cls = item.active ? 'active' : ''
  if (item.to.startsWith('#')) {
    return <a href={item.to} className={cls}>{item.label}</a>
  }
  return <Link to={item.to} className={cls}>{item.label}</Link>
}

/**
 * Same chrome as the public landing page (goi bar + main header), for guest flows.
 */
export default function LandingChromeHeader({
  lang = 'en',
  onToggleLang,
  activeRoute = '/eligibility-check',
}) {
  const navigate = useNavigate()
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const headerMenuRef = useRef(null)
  const t = LANDING_LOCALES[lang] || LANDING_LOCALES.en

  const headerNav = useMemo(() => t.headerNav.map((item) => {
    if (item.label === 'Home' || item.to === '#main-content') {
      return { ...item, to: '/', active: false }
    }
    if (item.label === 'Eligibility Check' || item.to === '/eligibility-check') {
      return { ...item, to: '/eligibility-check', active: activeRoute === '/eligibility-check' }
    }
    if (item.to === '/nearby-offices') {
      return { ...item, active: activeRoute === '/nearby-offices' }
    }
    return { ...item, active: false }
  }), [t.headerNav, activeRoute])

  return (
    <>
      <div className="goi-bar">
        <div className="goi-bar-left">
          <span>Government of India</span>
          <span>Government of Gujarat</span>
          <span>Department of Science &amp; Technology</span>
        </div>
        <div className="goi-bar-right">
          <button type="button" className="landing-lang-toggle" onClick={onToggleLang}>
            {t.langToggle}
          </button>
        </div>
      </div>

      <header className="dg-header">
        <div className="wrap header-inner">
          <div className="header-left">
            <Link to="/" className="emblem-wrap" aria-label="Citizen Services home">
              <img src="/emblem-of-india.png" alt={t.emblemAlt} className="india-emblem" />
              <img src="/logodig.png" alt={t.logoAlt} className="header-logo" />
            </Link>
            <nav className="header-nav" aria-label="Main navigation">
              <ul>
                {headerNav.map((item) => (
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
                <button type="button" role="menuitem" onClick={() => navigate('/#login-panel')}>
                  <span className="ic citizen"><i className="ti ti-user-circle" aria-hidden="true" /></span>
                  <span>{t.citizenPortal}<span className="sub">{t.citizenLoginSub}</span></span>
                </button>
                <button type="button" role="menuitem" onClick={() => navigate('/#login-panel')}>
                  <span className="ic officer"><i className="ti ti-shield-lock" aria-hidden="true" /></span>
                  <span>{t.officerPortal}<span className="sub">{t.officerLoginSub}</span></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
