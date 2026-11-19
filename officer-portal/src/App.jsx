import { buildNav, hubTabs } from './navTree'
import { getCitizenLandingUrl } from './auth'
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
import MdmHub from './screens/mdm/MdmHub'
import DxEvents from './screens/dx/DxEvents'
import DxApprovals from './screens/dx/DxApprovals'
import DxWork from './screens/dx/DxWork'
import DxVerify from './screens/dx/DxVerify'
import DxConsent from './screens/dx/DxConsent'
import DxPolicy from './screens/dx/DxPolicy'
import DxNotices from './screens/dx/DxNotices'
import DxResponseTimes from './screens/dx/DxResponseTimes'
import DxControl from './screens/dx/DxControl'
import DxDiscrepancies from './screens/dx/DxDiscrepancies'
import DxChecks from './screens/dx/DxChecks'
import DxQuery from './screens/dx/DxQuery'
import DxLedger from './screens/dx/DxLedger'
import DxCatalogue from './screens/dx/DxCatalogue'
import DxStandards from './screens/dx/DxStandards'
import DxAudit from './screens/dx/DxAudit'
import DxRetention from './screens/dx/DxRetention'
import { DxRegistry } from './screens/dx/DxCatalogue'
import DxConnectors from './screens/dx/DxConnectors'
import DxKeys from './screens/dx/DxKeys'
import DxAccess from './screens/dx/DxAccess'
import DxApiExplorer from './screens/dx/DxApiExplorer'
import DxMyData, { DxMyConsents, DxReportWrong } from './screens/dx/DxCitizen'
import DxAssisted from './screens/dx/DxAssisted'
import DxScenarios, { DxInjector, DxEvidence } from './screens/dx/DxDemo'
import DxLineage from './screens/dx/DxLineage'
import DxQuality from './screens/dx/DxQuality'
import DxStory from './screens/dx/DxStory'
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
  departmentLabel,
  districtForOfficer,
  headerIdentity,
  isOfficerTokenValid,
  logoutOfficer,
  officerCanAccessPath,
  officerLandingPath,
  officerNavItems,
  persistOfficerSession,
} from './auth'
import { useLang, useTr, setLang } from './i18n/lang'
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
  const tr = useTr()
  const label = tr(
    mode === 'hidden'
      ? 'Show menu'
      : mode === 'collapsed'
        ? 'Hide menu'
        : 'Collapse menu')

  return (
    <button
      type="button"
      className={`sidebar-toggle-btn ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <MenuIcon />
      <span className="sidebar-toggle-label">{tr('Menu')}</span>
    </button>
  )
}

export function Header({ onArchClick, onWorkflowClick }) {
  const tr = useTr()
  const lang = useLang()
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const dept = departmentLabel(role)
  const { roleLabel, username } = headerIdentity(role, {
    name: localStorage.getItem('officer_name'),
    username: localStorage.getItem('officer_username'),
  })

  return (
    <header className="top-header">
      <div className="header-brand">
        <img src="/logodig.png" alt="Citizen Services" className="header-logo" />
        <span className="header-portal-label">{tr('Officer Services')}{dept ? ` · ${tr(dept)}` : ''}</span>
      </div>
      <div className="header-actions">
        <button type="button" className="header-action-btn" onClick={onWorkflowClick}>
          ⚙ {tr('Workflow')}
        </button>
        <button type="button" className="header-action-btn" onClick={onArchClick}>
          🏛 {tr('Architecture')}
        </button>
        <span className="header-lang" role="group" aria-label={tr('Language')}>
          <button type="button" className={`header-action-btn${lang === 'en' ? ' active' : ''}`} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          <button type="button" className={`header-action-btn${lang === 'te' ? ' active' : ''}`} aria-pressed={lang === 'te'} onClick={() => setLang('te')}>తెలుగు</button>
        </span>
        <span className="header-user">
          <span className="header-user-role">{tr(roleLabel)}</span>
          {username ? <span className="header-user-name"> · {username}</span> : null}
        </span>
        <button type="button" className="btn-logout" onClick={logoutOfficer}>
          {tr('Logout')}
        </button>
      </div>
    </header>
  )
}

export function PageNotFound() {
  const tr = useTr()
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const landing = officerLandingPath(role)
  return (
    <section className="builder-access-denied" data-testid="page-not-found">
      <h1>{tr('Page not found')}</h1>
      <p role="status">{tr('This address is not a page in the Officer Portal.')}</p>
      <p><NavLink to={landing}>{tr('Go to your home page')}</NavLink></p>
    </section>
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

const GROUPS_KEY = 'officer_nav_groups'

function useOpen(key, forced) {
  const [open, setOpen] = useState(() => {
    if (forced) return true
    try { return JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}')[key] === true } catch { return false }   // closed unless this person opened it since they signed in
  })
  // Open only on the route change into the group; a later click on the heading can still close it.
  useEffect(() => { if (forced) setOpen(true) }, [forced])
  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}')
      localStorage.setItem(GROUPS_KEY, JSON.stringify({ ...saved, [key]: next }))
    } catch { /* ignore */ }
  }
  return [open, toggle]
}

const isHere = (pathname, i) => (i.members || [i.to]).some((to) => !!to && (pathname === to || pathname.startsWith(`${to}/`)))

/** A link. Links inside a menu show text only; a lone top-level link keeps its icon. */
function NavItem({ item: l, sub = false, depth = 1 }) {
  const tr = useTr()
  const { icon, text: enText } = navParts(l.label)
  const text = tr(enText)
  const cls = sub ? `nav-link nav-sub${depth > 1 ? ' nav-sub-2' : ''}` : 'nav-link'
  const content = sub ? <span className="nav-text">{text || tr(l.label)}</span> : (
    <>
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      <span className="nav-text">{text}</span>
    </>
  )
  const { pathname } = useLocation()
  return l.external ? (
    <a href={l.href} target="_blank" rel="noopener noreferrer" className={cls} title={text || l.label}>{content}</a>
  ) : (
    <NavLink to={l.to} end={l.end} className={({ isActive }) => (isActive || (l.members && isHere(pathname, l)) ? `${cls} active` : cls)} title={text || l.label}>
      {content}
    </NavLink>
  )
}

/** A second-level heading inside a group. */
function NavSubGroup({ groupName, sub, pathname }) {
  const tr = useTr()
  const hasActive = sub.items.some((i) => isHere(pathname, i))
  const [open, toggle] = useOpen(`${groupName}/${sub.name}`, hasActive)
  const id = `nav-sub-${groupName}-${sub.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <div className="nav-subgroup">
      <button type="button" className={`nav-link nav-sub nav-subgroup-head${hasActive ? ' has-active' : ''}`} onClick={toggle} aria-expanded={open} aria-controls={id}>
        <span className="nav-text">{tr(sub.name)}</span>
        <span className="nav-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div id={id} className="nav-sub-list nav-sub-list-2">{sub.items.map((i) => <NavItem key={i.to} item={i} sub depth={2} />)}</div>}
    </div>
  )
}

/** One demo use case: the heading opens the scenario page; its steps open the page where each happens. */
function NavJourney({ journey }) {
  const tr = useTr()
  const { pathname, search } = useLocation()
  const here = `${pathname}${search}`
  // The scenario page is shared by every use case, so only this use case's own address (?uc=) counts as "here".
  const stepHere = (st) => !st.citizen && st.to !== '/dx/scenarios' && (st.to.includes('?') ? here === st.to : pathname === st.to)
  const onJourney = here === journey.to
  const hasActive = onJourney
  const [open, toggle] = useOpen(`Demo/${journey.id}`, hasActive)
  const id = `nav-journey-${journey.id}`
  const base = getCitizenLandingUrl()
  return (
    <div className="nav-subgroup">
      <div className="nav-journey-head">
        <NavLink to={journey.to} onClick={() => { if (!open || onJourney) toggle() }} className={`nav-link nav-sub nav-subgroup-head${hasActive ? ' has-active' : ''}`} title={journey.label}>
          <span className="nav-text">{tr(journey.label)}</span>
        </NavLink>
        <button type="button" className="nav-journey-toggle" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={journey.label}>{open ? '▾' : '▸'}</button>
      </div>
      {open && (
        <div id={id} className="nav-sub-list nav-sub-list-2">
          {journey.steps.map((st, i) => {
            const text = <span className="nav-text">{i + 1}. {tr(st.label)} <span className="nav-who">({st.who})</span>{st.citizen ? ' ↗' : ''}</span>
            return st.citizen
              ? <a key={i} href={`${base}${st.to}`} target="_blank" rel="noopener noreferrer" className="nav-link nav-sub nav-sub-2" title={st.label}>{text}</a>
              : <NavLink key={i} to={st.to} className={stepHere(st) ? 'nav-link nav-sub nav-sub-2 active' : 'nav-link nav-sub nav-sub-2'} title={st.label}>{text}</NavLink>
          })}
        </div>
      )}
    </div>
  )
}

/** A heading that opens and closes a list of related screens and sub-groups. */
function NavGroup({ entry, collapsed, pathname }) {
  const tr = useTr()
  const hasActive = entry.all.some((i) => isHere(pathname, i))
  const [open, toggle] = useOpen(entry.group, hasActive)
  if (collapsed) return entry.all.map((i) => <NavItem key={i.to} item={i} />)
  const id = `nav-group-${entry.group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="nav-group">
      <button type="button" className={`nav-link nav-group-head${hasActive ? ' has-active' : ''}`} onClick={toggle} aria-expanded={open} aria-controls={id}>
        <span className="nav-icon" aria-hidden="true">{entry.icon}</span>
        <span className="nav-text">{tr(entry.group)}</span>
        <span className="nav-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div id={id} className="nav-sub-list">
          {entry.items.map((i) => <NavItem key={i.to} item={i} sub />)}
          {(entry.journeys || []).map((j) => <NavJourney key={j.id} journey={j} />)}
          {entry.subs.map((s) => <NavSubGroup key={s.name} groupName={entry.group} sub={s} pathname={pathname} />)}
        </div>
      )}
    </div>
  )
}

/** The row of tabs for screens that share one menu entry. Each tab is a real address. */
export function HubTabs() {
  const tr = useTr()
  const { pathname, search } = useLocation()
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const set = hubTabs(pathname, officerNavItems(role))
  if (!set) return null
  return (
    <nav className="hub-tabs" aria-label={`${tr(set.hub.label.replace(/^\S+\s/, ''))} ${tr('sections')}`}>
      {set.tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={t.active ? 'hub-tab active' : 'hub-tab'} aria-current={t.active ? 'page' : undefined}>{tr(t.label)}</NavLink>
      ))}
    </nav>
  )
}

function Sidebar({ mode, onSidebarToggle }) {
  const tr = useTr()
  const { pathname } = useLocation()
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const showFormBuilder = officerHasBuilderUxAccess()
  const links = [...officerNavItems(role)]

  if (showFormBuilder) {
    const after = links.findIndex((l) => l.to === '/ops-dashboard' || l.to === '/tasks')
    const idx = after >= 0 ? after + 1 : 1
    links.splice(idx, 0, { to: '/form-builder', label: '🛠 Form Builder' })
  }

  if (mode === 'hidden') return null

  const entries = buildNav(links)

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
          aria-label={tr('Toggle navigation panel')}
          title="Collapse or hide menu"
        >
          ‹
        </button>
      </div>
      <nav>
        {entries.map((entry) =>
          entry.group ? (
            <NavGroup key={`group-${entry.group}`} entry={entry} collapsed={mode === 'collapsed'} pathname={pathname} />
          ) : (
            <NavItem key={entry.item.to || entry.item.href} item={entry.item} />
          ),
        )}
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
  const lang = useLang()          // the screens are redrawn from scratch when the language changes
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
        <main className="main-content" key={lang}>
          <HubTabs />
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
            <Route path="/mdm" element={<RoleRoute><MdmHub /></RoleRoute>} />
            <Route path="/dx/events" element={<RoleRoute><DxEvents /></RoleRoute>} />
            <Route path="/dx/work" element={<RoleRoute><DxWork /></RoleRoute>} />
            <Route path="/dx/work/:reason" element={<RoleRoute><DxWork /></RoleRoute>} />
            <Route path="/dx/approvals" element={<RoleRoute><DxApprovals /></RoleRoute>} />
            <Route path="/dx/verify" element={<RoleRoute><DxVerify /></RoleRoute>} />
            <Route path="/dx/consent" element={<RoleRoute><DxConsent /></RoleRoute>} />
            <Route path="/dx/policy" element={<RoleRoute><DxPolicy /></RoleRoute>} />
            <Route path="/dx/response-times" element={<RoleRoute><DxResponseTimes /></RoleRoute>} />
            <Route path="/dx/notices" element={<RoleRoute><DxNotices /></RoleRoute>} />
            <Route path="/dx/control" element={<RoleRoute><DxControl /></RoleRoute>} />
            <Route path="/dx/discrepancies" element={<RoleRoute><DxDiscrepancies /></RoleRoute>} />
            <Route path="/dx/household" element={<Navigate to="/mdm?tab=people" replace />} />
            <Route path="/dx/lineage" element={<RoleRoute><DxLineage /></RoleRoute>} />
            <Route path="/dx/quality" element={<RoleRoute><DxQuality /></RoleRoute>} />
            <Route path="/dx/story" element={<RoleRoute><DxStory /></RoleRoute>} />
            <Route path="/dx/query" element={<RoleRoute><DxQuery /></RoleRoute>} />
            <Route path="/dx/ledger" element={<RoleRoute><DxLedger /></RoleRoute>} />
            <Route path="/dx/catalogue" element={<RoleRoute><DxCatalogue /></RoleRoute>} />
            <Route path="/dx/standards" element={<RoleRoute><DxStandards /></RoleRoute>} />
            <Route path="/dx/audit" element={<RoleRoute><DxAudit /></RoleRoute>} />
            <Route path="/dx/retention" element={<RoleRoute><DxRetention /></RoleRoute>} />
            <Route path="/dx/registry" element={<RoleRoute><DxRegistry /></RoleRoute>} />
            <Route path="/dx/connectors" element={<RoleRoute><DxConnectors /></RoleRoute>} />
            <Route path="/dx/keys" element={<RoleRoute><DxKeys /></RoleRoute>} />
            <Route path="/dx/access" element={<RoleRoute><DxAccess /></RoleRoute>} />
            <Route path="/dx/api" element={<RoleRoute><DxApiExplorer /></RoleRoute>} />
            <Route path="/dx/citizen" element={<RoleRoute><DxMyData /></RoleRoute>} />
            <Route path="/dx/citizen/consents" element={<RoleRoute><DxMyConsents /></RoleRoute>} />
            <Route path="/dx/citizen/report" element={<RoleRoute><DxReportWrong /></RoleRoute>} />
            <Route path="/dx/assisted" element={<RoleRoute><DxAssisted /></RoleRoute>} />
            <Route path="/dx/checks" element={<RoleRoute><DxChecks /></RoleRoute>} />
            <Route path="/dx/scenarios" element={<RoleRoute><DxScenarios /></RoleRoute>} />
            <Route path="/dx/inject" element={<RoleRoute><DxInjector /></RoleRoute>} />
            <Route path="/dx/evidence" element={<RoleRoute><DxEvidence /></RoleRoute>} />
            <Route path="/families" element={<RoleRoute><FamilyRegistry /></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute><Reports /></RoleRoute>} />
            <Route path="/analytics" element={<RoleRoute><AnalyticsDashboard /></RoleRoute>} />
            <Route path="*" element={<PageNotFound />} />
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
