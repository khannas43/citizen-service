import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { loadCitizenProfile, logoutCitizen } from '../auth'
import ChatWidget from './ChatWidget'
import NotificationBell from './NotificationBell'
import './NotificationBell.css'

const MORE_LINKS = [
  { to: '/payments',      icon: '💰', labelKey: 'nav.paymentsFull' },
  { to: '/certificates',  icon: '📄', labelKey: 'nav.certificatesFull' },
  { to: '/notifications', icon: '🔔', labelKey: 'nav.notificationsFull' },
  { to: '/contact',       icon: '📞', labelKey: 'nav.contactFull' },
  { to: '/my-consents',   icon: '🔐', labelKey: 'nav.myDataFull' },
]

function MoreDrawer({ onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ref = useRef(null)

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  return (
    <div className="more-drawer" ref={ref}>
      {MORE_LINKS.map((l) => (
        <button
          key={l.to}
          type="button"
          className="more-drawer-item"
          onClick={() => { navigate(l.to); onClose() }}
        >
          <span className="more-drawer-icon">{l.icon}</span>
          <span className="more-drawer-label">{t(l.labelKey)}</span>
        </button>
      ))}
    </div>
  )
}

export default function Layout() {
  const { t } = useTranslation()
  const location = useLocation()
  const profile = loadCitizenProfile()
  const [moreOpen, setMoreOpen] = useState(false)

  function toggleLang() {
    const next = i18n.language === 'en' ? 'gu' : 'en'
    localStorage.setItem('lang', next)
    i18n.changeLanguage(next)
  }

  const navLinks = [
    { to: '/',              label: '📋 ' + t('myApplications'), end: true },
    { to: '/eligibility-check', label: t('nav.eligibilityCheck') },
    { to: '/nearby-offices', label: t('nav.nearbyOffices') },
    { to: '/my-family',     label: t('myFamily') },
    { to: '/grievances',    label: t('complaints.nav') },
    { to: '/payments',      label: '💰 ' + t('nav.payments') },
    { to: '/certificates',  label: '📄 ' + t('nav.certificates') },
    { to: '/notifications', label: '🔔 ' + t('nav.notifications') },
    { to: '/contact',       label: '📞 ' + t('nav.contact') },
    { to: '/my-consents',   label: '🔐 ' + t('nav.myData') },
  ]

  const mobileTabs = [
    { to: '/',           label: '📋', text: t('nav.applications'), end: true },
    { to: '/my-family',  label: '👨‍👩‍👧', text: t('myFamily') },
    { to: '/grievances', label: '⚠️',  text: t('nav.grievances') },
  ]

  const moreActive = MORE_LINKS.some((l) => location.pathname === l.to)

  return (
    <div className="citizen-app">
      <header className="top-header">
        <div className="header-brand">
          <img src="/logodig.png" alt="Digital Gujarat" className="header-logo" />
          <span className="header-citizen-services">Citizen Services</span>
        </div>
        <div className="header-actions">
          {profile?.name && (
            <span className="header-user">
              <span className="header-user-name">{profile.name}</span>
            </span>
          )}
          <NotificationBell />
          <button type="button" className="lang-toggle" onClick={toggleLang}>
            {t('langToggle')}
          </button>
          {profile?.name && (
            <button type="button" className="btn-logout" onClick={logoutCitizen}>
              {t('login.logout')}
            </button>
          )}
        </div>
      </header>

      <nav className="desktop-nav">
        {navLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            {l.label}
          </NavLink>
        ))}
        <span className="nav-link nav-link-static" aria-disabled="true">
          📚 {t('nav.tutorials')}
        </span>
      </nav>

      <main className="page-content">
        <Outlet key={location.pathname} />
      </main>

      <nav className="mobile-tab-bar">
        {mobileTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
          >
            <span className="tab-icon">{tab.label}</span>
            <span className="tab-text">{tab.text}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className={`tab-item${moreActive ? ' active' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="tab-icon">⋯</span>
          <span className="tab-text">{t('nav.more')}</span>
        </button>

        {moreOpen && <MoreDrawer onClose={() => setMoreOpen(false)} />}
      </nav>

      <ChatWidget />
    </div>
  )
}
