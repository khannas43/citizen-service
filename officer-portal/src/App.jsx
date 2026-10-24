import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import TaskQueue from './screens/TaskQueue'
import SchemeManagement from './screens/SchemeManagement'
import BeneficiaryDashboard from './screens/BeneficiaryDashboard'
import FamilyRegistry from './screens/FamilyRegistry'
import SchemeCoverage from './screens/SchemeCoverage'
import Grievances from './screens/Grievances'
import FraudSignals from './screens/FraudSignals'
import ExpenditureIntegrity from './screens/ExpenditureIntegrity'
import MoneyOverview from './screens/MoneyOverview'
import StoryMode from './screens/StoryMode'
import DataHub from './screens/DataHub'
import SchemeSimulator from './screens/SchemeSimulator'
import OpsDashboard from './screens/OpsDashboard'
import Reports from './screens/Reports'
import AnalyticsDashboard from './screens/AnalyticsDashboard'
import OfficerLogin from './OfficerLogin'
import ArchPanel from './ArchPanel'
import WorkflowPanel from './WorkflowPanel'
import OfficerHome from './screens/OfficerHome'
import FormDefinitionGovernance from './screens/FormDefinitionGovernance'
import SchemeContentEditor from './screens/SchemeContentEditor'
import OfficerFormBuilder from './form-builder/OfficerFormBuilder'
import BuilderAccessDenied from './form-builder/BuilderAccessDenied'
import { officerHasBuilderUxAccess } from './form-builder/builder-roles'
import {
  districtForOfficer,
  isOfficerTokenValid,
  logoutOfficer,
  officerCanAccessPath,
  officerLandingPath,
  officerNavItems,
  persistOfficerSession,
} from './auth'
import './App.css'
import './ArchPanel.css'
import './OfficerLogin.css'
import './form-builder/BuilderAccessDenied.css'

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  )
}

function SidebarToggleButton({ mode, onClick, className = '' }) {
  const label =
    mode === 'hidden'
      ? 'Show menu'
      : mode === 'collapsed'
        ? 'Hide menu'
        : 'Collapse menu'

  return (
    <button
      type="button"
      className={`sidebar-toggle-btn ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <MenuIcon />
      <span className="sidebar-toggle-label">Menu</span>
    </button>
  )
}

function Header({ onArchClick, onWorkflowClick }) {
  const name = localStorage.getItem('officer_name') ?? 'Officer'

  return (
    <header className="top-header">
      <div className="header-brand">
        <img src="/logodig.png" alt="Digital Gujarat" className="header-logo" />
        <span className="header-portal-label">Officer Services</span>
      </div>
      <div className="header-actions">
        <button type="button" className="header-action-btn" onClick={onWorkflowClick}>
          ⚙ Workflow
        </button>
        <button type="button" className="header-action-btn" onClick={onArchClick}>
          🏛 Architecture
        </button>
        {name && (
          <span className="header-user">
            <span className="header-user-name">{name}</span>
          </span>
        )}
        <button type="button" className="btn-logout" onClick={logoutOfficer}>
          Logout
        </button>
      </div>
    </header>
  )
}

function navParts(label) {
  const space = label.indexOf(' ')
  if (space <= 0) return { icon: label, text: '' }
  return { icon: label.slice(0, space), text: label.slice(space + 1) }
}

function OfficerFeatureDenied() {
  return (
    <section className="builder-access-denied" data-testid="officer-access-denied">
      <h1>Page unavailable</h1>
      <p role="status">
        You are signed in, but your account is not permitted to open this page.
      </p>
    </section>
  )
}

function HomeLanding() {
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const landing = officerLandingPath(role)
  if (landing !== '/') return <Navigate to={landing} replace />
  return <OfficerHome />
}

/** An older address that now lives on a tab: same page, hash kept so deep links to a load card still land. */
function RedirectKeepingHash({ to }) {
  const { hash } = useLocation()
  return <Navigate to={`${to}${hash}`} replace />
}

function RoleRoute({ children }) {
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const { pathname } = useLocation()
  if (!officerCanAccessPath(role, pathname)) {
    return <OfficerFeatureDenied />
  }
  return children
}

function Sidebar({ mode, onSidebarToggle }) {
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const showFormBuilder = officerHasBuilderUxAccess()
  const links = [...officerNavItems(role)]

  if (showFormBuilder) {
    const after = links.findIndex((l) => l.to === '/ops-dashboard' || l.to === '/tasks')
    const idx = after >= 0 ? after + 1 : 1
    links.splice(idx, 0, { to: '/form-builder', label: '🛠 Form Builder' })
  }

  if (mode === 'hidden') return null

  return (
    <aside className={`sidebar${mode === 'collapsed' ? ' sidebar-collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-title">Officer Portal</div>
        </div>
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={onSidebarToggle}
          aria-label="Toggle navigation panel"
          title="Collapse or hide menu"
        >
          ‹
        </button>
      </div>
      <nav>
        {links.map((l) => {
          const { icon, text } = navParts(l.label)
          const content = (
            <>
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              <span className="nav-text">{text}</span>
            </>
          )
          return l.external ? (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
              title={text || l.label}
            >
              {content}
            </a>
          ) : (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              title={text || l.label}
            >
              {content}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

const SIDEBAR_MODE_KEY = 'officer_sidebar_mode'
const SIDEBAR_MODES = ['expanded', 'collapsed', 'hidden']

function nextSidebarMode(mode) {
  const index = SIDEBAR_MODES.indexOf(mode)
  return SIDEBAR_MODES[(index + 1) % SIDEBAR_MODES.length]
}

function MainApp() {
  const [archOpen, setArchOpen] = useState(false)
  const [wfOpen, setWfOpen] = useState(false)
  const [sidebarMode, setSidebarMode] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_MODE_KEY)
    return SIDEBAR_MODES.includes(saved) ? saved : 'expanded'
  })
  const canOpenFormBuilder = officerHasBuilderUxAccess()

  useEffect(() => {
    localStorage.setItem(SIDEBAR_MODE_KEY, sidebarMode)
  }, [sidebarMode])

  return (
    <div className={`app-shell sidebar-mode-${sidebarMode}`}>
      <Header
        onArchClick={() => setArchOpen(true)}
        onWorkflowClick={() => setWfOpen(true)}
      />
      <div className="body-row">
        {sidebarMode === 'hidden' && (
          <SidebarToggleButton
            mode={sidebarMode}
            onClick={() => setSidebarMode((m) => nextSidebarMode(m))}
            className="sidebar-toggle-floating"
          />
        )}
        <Sidebar
          mode={sidebarMode}
          onSidebarToggle={() => setSidebarMode((m) => nextSidebarMode(m))}
        />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomeLanding />} />
            <Route path="/tasks" element={<RoleRoute><TaskQueue /></RoleRoute>} />
            <Route path="/form-definitions" element={<FormDefinitionGovernance />} />
            <Route
              path="/form-builder"
              element={canOpenFormBuilder ? <OfficerFormBuilder /> : <BuilderAccessDenied />}
            />
            <Route path="/ops-dashboard" element={<RoleRoute><OpsDashboard /></RoleRoute>} />
            <Route path="/grievances" element={<RoleRoute><Grievances /></RoleRoute>} />
            <Route path="/schemes" element={<RoleRoute><SchemeManagement /></RoleRoute>} />
            <Route path="/scheme-content" element={<RoleRoute><SchemeContentEditor /></RoleRoute>} />
            <Route path="/beneficiaries" element={<RoleRoute><BeneficiaryDashboard /></RoleRoute>} />
            <Route path="/coverage" element={<RoleRoute><SchemeCoverage /></RoleRoute>} />
            <Route path="/story" element={<RoleRoute><StoryMode /></RoleRoute>} />
            <Route path="/money-overview" element={<RoleRoute><MoneyOverview /></RoleRoute>} />
            <Route path="/expenditure-integrity" element={<RoleRoute><ExpenditureIntegrity /></RoleRoute>} />
            <Route path="/data" element={<RoleRoute><DataHub /></RoleRoute>} />
            {/* the two older addresses keep working and land on the matching tab */}
            <Route path="/data-import" element={<RedirectKeepingHash to="/data?tab=import" />} />
            <Route path="/data-readiness" element={<RedirectKeepingHash to="/data?tab=readiness" />} />
            <Route path="/fraud-signals" element={<Navigate to="/expenditure-integrity?domain=beneficiary" replace />} />
            <Route path="/fraud-signals/legacy" element={<RoleRoute><FraudSignals /></RoleRoute>} />
            <Route path="/scheme-simulator" element={<RoleRoute><SchemeSimulator /></RoleRoute>} />
            <Route path="/families" element={<RoleRoute><FamilyRegistry /></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute><Reports /></RoleRoute>} />
            <Route path="/analytics" element={<RoleRoute><AnalyticsDashboard /></RoleRoute>} />
          </Routes>
        </main>
      </div>
      <ArchPanel open={archOpen} onClose={() => setArchOpen(false)} />
      <WorkflowPanel open={wfOpen} onClose={() => setWfOpen(false)} />
    </div>
  )
}

/** Consume landing-page SSO hash before first paint. Returns true if a session was stored. */
function consumeLandingSsoHandoff() {
  const hash = window.location.hash || ''
  if (!hash.startsWith('#dg_sso=')) return false

  let accepted = false
  try {
    let raw = hash.slice('#dg_sso='.length)
    try {
      raw = decodeURIComponent(raw)
    } catch {
      /* hash may already be decoded by the browser */
    }
    const handoff = JSON.parse(raw)
    if (handoff?.token && isOfficerTokenValid(handoff.token)) {
      persistOfficerSession({
        token: handoff.token,
        role: handoff.role || 'UNKNOWN',
        name: handoff.name || 'Officer',
        username: handoff.username,
        district: handoff.district,
      })
      accepted = true
    }
  } catch {
    /* ignore malformed handoff */
  }

  history.replaceState(null, '', window.location.pathname + window.location.search)
  return accepted
}

export default function App() {
  const [authState] = useState(() => {
    consumeLandingSsoHandoff()
    const token = localStorage.getItem('officer_token')
    if (!isOfficerTokenValid(token)) return 'unauthenticated'
    try {
      if (!localStorage.getItem('officer_district')) {
        const scoped = districtForOfficer(null, localStorage.getItem('officer_role'))
        if (scoped) localStorage.setItem('officer_district', scoped)
      }
    } catch { /* ignore */ }
    return 'authenticated'
  })

  if (authState === 'unauthenticated') {
    return <OfficerLogin />
  }

  return <MainApp />
}
