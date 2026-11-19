import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Header, PageNotFound } from './App'
import { headerIdentity, persistOfficerSession, ROLE_DISPLAY } from './auth'
import { tr, setLang } from './i18n/lang'
import te from './i18n/te'

describe('header identity', () => {
  beforeEach(() => {
    localStorage.clear()
    setLang('en')
  })

  it('shows the role label and username once each, not the duplicated given name', () => {
    // Login stores given_name as officer_name; for pds.officer that equals the role label.
    persistOfficerSession({
      token: 'x',
      role: 'PDS_OFFICER',
      name: 'Civil supplies officer',
      username: 'pds.officer',
    })
    const id = headerIdentity('PDS_OFFICER', {
      name: localStorage.getItem('officer_name'),
      username: localStorage.getItem('officer_username'),
    })
    expect(id.roleLabel).toBe('Civil supplies officer')
    expect(id.username).toBe('pds.officer')
    render(
      <MemoryRouter>
        <Header onArchClick={() => {}} onWorkflowClick={() => {}} />
      </MemoryRouter>,
    )
    const user = screen.getByText((_, el) => el?.classList?.contains('header-user'))
    expect(user.textContent.replace(/\s+/g, ' ').trim()).toBe('Civil supplies officer · pds.officer')
  })

  it('shows role label and username for every display role', () => {
    for (const [role, label] of Object.entries(ROLE_DISPLAY)) {
      const id = headerIdentity(role, { name: label, username: `${role.toLowerCase()}.user` })
      expect(id.roleLabel).toBe(label)
      expect(id.username).toBe(`${role.toLowerCase()}.user`)
    }
  })

  it('department header uses Officer Services and the department name', () => {
    persistOfficerSession({
      token: 'x', role: 'PDS_OFFICER', name: 'Civil supplies officer', username: 'pds.officer',
    })
    render(
      <MemoryRouter>
        <Header onArchClick={() => {}} onWorkflowClick={() => {}} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Officer Services/)).toBeInTheDocument()
    expect(screen.getByText(/Civil supplies \(PDS\)/)).toBeInTheDocument()
  })
})

describe('Page not found', () => {
  beforeEach(() => {
    localStorage.clear()
    setLang('en')
    localStorage.setItem('officer_role', 'PDS_OFFICER')
  })

  it('shows Page not found with a link to the department landing page', () => {
    render(
      <MemoryRouter initialEntries={['/dx/master']}>
        <Routes>
          <Route path="/dx/work" element={<div>work home</div>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('page-not-found')).toBeInTheDocument()
    expect(screen.getByText('Page not found')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Go to your home page' })
    expect(link.getAttribute('href')).toBe('/dx/work')
  })

  it('Telugu strings for Page not found and role or department labels are present', () => {
    expect(te['Page not found']).toBeTruthy()
    expect(te['This address is not a page in the Officer Portal.']).toBeTruthy()
    expect(te['Go to your home page']).toBeTruthy()
    expect(te['Officer Services']).toBeTruthy()
    expect(te['Civil supplies (PDS)']).toBeTruthy()
    expect(te['Civil supplies officer']).toBeTruthy()
    expect(te['Health officer']).toBeTruthy()
    setLang('te')
    expect(tr('Page not found')).toBe(te['Page not found'])
    expect(tr('Civil supplies officer')).toBe(te['Civil supplies officer'])
  })
})
