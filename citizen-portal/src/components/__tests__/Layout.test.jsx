import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Layout from '../Layout'
import en from '../../locales/en.json'
import te from '../../locales/te.json'

vi.mock('../../approvalsApi', () => ({
  fetchApprovalsSummary: vi.fn(),
}))

vi.mock('../../auth', () => ({
  loadCitizenProfile: () => ({ name: 'Rajender', aadhaarRef: 'XXXX-XXXX-2001' }),
  logoutCitizen: vi.fn(),
}))

vi.mock('../ChatWidget', () => ({ default: () => null }))
vi.mock('../NotificationBell', () => ({ default: () => null }))

import { fetchApprovalsSummary } from '../../approvalsApi'
import i18n from '../../i18n'

function renderLayout(path = '/approvals') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchApprovalsSummary.mockResolvedValue({ pending: 3 })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('citizen Layout nav', () => {
  it('puts Approvals first and My Applications second in the desktop menu', async () => {
    renderLayout()
    const nav = document.querySelector('.desktop-nav')
    const links = [...nav.querySelectorAll('a.nav-link')].map((a) => a.getAttribute('href'))
    expect(links[0]).toBe('/approvals')
    expect(links[1]).toBe('/home')
    await waitFor(() => expect(screen.getAllByLabelText('3 approvals waiting').length).toBeGreaterThan(0))
    expect(screen.getAllByLabelText('3 approvals waiting')[0]).toHaveTextContent('3')
  })

  it('puts Approvals first on the mobile tab bar with the badge', async () => {
    renderLayout()
    const tabs = document.querySelector('.mobile-tab-bar')
    const links = [...tabs.querySelectorAll('a.tab-item')].map((a) => a.getAttribute('href'))
    expect(links[0]).toBe('/approvals')
    expect(links[1]).toBe('/home')
    await waitFor(() => expect(tabs.querySelector('.bell-badge')).toHaveTextContent('3'))
  })

  it('keeps Telugu labels for Approvals and My Applications', async () => {
    await i18n.changeLanguage('te')
    renderLayout()
    expect(screen.getAllByText(te.nav.approvals).length).toBeGreaterThan(0)
    expect(screen.getAllByText(te.myApplications).length).toBeGreaterThan(0)
  })
})
