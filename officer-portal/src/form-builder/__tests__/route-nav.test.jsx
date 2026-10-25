import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@citizen/form-builder-app/embed', () => ({
  BuilderShell: () => <div data-testid="mock-builder-shell">BuilderShell</div>,
}))
vi.mock('@citizen/form-builder-app/styles/embed.css', () => ({}))
vi.mock('../../screens/FormDefinitionGovernance', () => ({
  default: () => <div data-testid="governance-screen">Governance</div>,
}))
vi.mock('../../screens/TaskQueue', () => ({
  default: () => <div data-testid="tasks-screen">Tasks</div>,
}))
vi.mock('../../screens/OfficerHome', () => ({
  default: () => <div>Home</div>,
}))
vi.mock('../../screens/OpsDashboard', () => ({ default: () => null }))
vi.mock('../../screens/Grievances', () => ({ default: () => null }))
vi.mock('../../screens/SchemeManagement', () => ({ default: () => null }))
vi.mock('../../screens/BeneficiaryDashboard', () => ({ default: () => null }))
vi.mock('../../screens/SchemeCoverage', () => ({
  default: () => <div data-testid="coverage-screen">Coverage</div>,
}))
vi.mock('../../screens/FraudSignals', () => ({ default: () => null }))
vi.mock('../../screens/SchemeSimulator', () => ({ default: () => null }))
vi.mock('../../screens/FamilyRegistry', () => ({
  default: () => <div data-testid="families-screen">Families</div>,
}))
vi.mock('../../screens/Reports', () => ({ default: () => null }))
vi.mock('../../screens/AnalyticsDashboard', () => ({
  default: () => <div data-testid="analytics-screen">Analytics</div>,
}))
vi.mock('../../ArchPanel', () => ({ default: () => null }))
vi.mock('../../WorkflowPanel', () => ({ default: () => null }))
vi.mock('../../OfficerLogin', () => ({
  default: () => <div data-testid="officer-login">Login</div>,
}))

import App from '../../App.jsx'

function b64url(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function syntheticToken(roles) {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    sub: 'e543a-synthetic-officer',
    exp: Math.floor(Date.now() / 1000) + 3600,
    realm_access: { roles },
  })
  return `${header}.${payload}.sig`
}

function seedSession({ roles, portalRole = 'DATA_ENTRY_OFFICER' }) {
  localStorage.setItem('officer_token', syntheticToken(roles))
  localStorage.setItem('officer_role', portalRole)
  localStorage.setItem('officer_name', 'Synthetic Officer')
}

describe('FB-E5.4.3A Form Builder route and navigation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows Form Builder nav and route for a Builder role', async () => {
    seedSession({ roles: ['FDS_DRAFT_CREATOR'] })
    render(
      <MemoryRouter initialEntries={['/form-builder']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /form builder/i })).toBeInTheDocument()
    expect(screen.getByTestId('officer-form-builder')).toBeInTheDocument()
    expect(screen.getByTestId('mock-builder-shell')).toBeInTheDocument()
  })

  it('hides nav and shows forbidden guidance for governance-only roles', () => {
    seedSession({
      roles: ['FDS_GOVERNANCE_READER', 'FDS_FORM_APPROVER'],
      portalRole: 'IT_ADMIN',
    })
    render(
      <MemoryRouter initialEntries={['/form-builder']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /form builder/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('builder-access-denied')).toBeInTheDocument()
    expect(screen.queryByTestId('officer-form-builder')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/FDS_GOVERNANCE_READER|eyJ/)
  })

  it('hides Builder for IT_ADMIN without Builder roles', () => {
    seedSession({ roles: ['IT_ADMIN'], portalRole: 'IT_ADMIN' })
    render(
      <MemoryRouter initialEntries={['/form-builder']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /form builder/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('builder-access-denied')).toBeInTheDocument()
  })

  it('unauthenticated direct /form-builder follows existing auth guard', () => {
    render(
      <MemoryRouter initialEntries={['/form-builder']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('officer-login')).toBeInTheDocument()
    expect(screen.queryByTestId('officer-form-builder')).not.toBeInTheDocument()
  })

  it('preserves /tasks and /form-definitions routes', () => {
    seedSession({ roles: ['FDS_DEFINITION_READER'], portalRole: 'TALATI' })
    const { unmount } = render(
      <MemoryRouter initialEntries={['/tasks']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('tasks-screen')).toBeInTheDocument()
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: /task queue/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /form definitions/i })).not.toBeInTheDocument()
    unmount()

    render(
      <MemoryRouter initialEntries={['/form-definitions']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('governance-screen')).toBeInTheDocument()
  })
})

describe('realistic officer menus', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows talati nav without coverage or scheme tools', () => {
    seedSession({ roles: ['TALATI'], portalRole: 'TALATI' })
    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <App />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: /task queue/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /grievances/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /family registry/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /scheme coverage/i })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /scheme management/i })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /reports/i })).not.toBeInTheDocument()
  })

  it('blocks talati from opening scheme coverage by URL', () => {
    seedSession({ roles: ['TALATI'], portalRole: 'TALATI' })
    render(
      <MemoryRouter initialEntries={['/coverage']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('officer-access-denied')).toBeInTheDocument()
    expect(screen.queryByTestId('coverage-screen')).not.toBeInTheDocument()
  })

  it('shows department nav with coverage and family registry', () => {
    seedSession({ roles: ['SCHEME_DEPT'], portalRole: 'SCHEME_DEPT' })
    render(
      <MemoryRouter initialEntries={['/coverage']}>
        <App />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: /scheme coverage/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /scheme management/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /reports/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /family registry/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /fraud signals/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('coverage-screen')).toBeInTheDocument()
  })

  it('allows scheme dept to open family registry', () => {
    seedSession({ roles: ['SCHEME_DEPT'], portalRole: 'SCHEME_DEPT' })
    render(
      <MemoryRouter initialEntries={['/families']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('families-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('officer-access-denied')).not.toBeInTheDocument()
  })

  it('shows senior management nav without tasks or family registry', () => {
    seedSession({ roles: ['SENIOR_MGMT'], portalRole: 'SENIOR_MGMT' })
    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <App />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: /platform analytics/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /scheme coverage/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /reports/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /task queue/i })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /family registry/i })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('analytics-screen')).toBeInTheDocument()
  })
})
