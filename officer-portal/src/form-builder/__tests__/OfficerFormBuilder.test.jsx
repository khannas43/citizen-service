import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'vitest-axe'

import OfficerFormBuilder from '../OfficerFormBuilder.jsx'
import { provideOfficerBuilderAccessToken } from '../provide-officer-builder-access-token.js'

const builderShellMock = vi.fn()

vi.mock('@citizen/form-builder-app/embed', () => ({
  BuilderShell: (props) => {
    builderShellMock(props)
    return <div data-testid="mock-builder-shell">BuilderShell</div>
  },
}))

vi.mock('@citizen/form-builder-app/styles/embed.css', () => ({}))

function b64url(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function syntheticToken(roles = ['FDS_DRAFT_CREATOR']) {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    sub: 'e543a-synthetic-officer',
    exp: Math.floor(Date.now() / 1000) + 3600,
    realm_access: { roles },
  })
  return `${header}.${payload}.sig`
}

describe('FB-E5.4.3A OfficerFormBuilder wrapper', () => {
  beforeEach(() => {
    localStorage.clear()
    builderShellMock.mockClear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('passes request-time provider and never lifecycleActorId', () => {
    const token = syntheticToken()
    localStorage.setItem('officer_token', token)
    render(<OfficerFormBuilder />)
    expect(screen.getByTestId('officer-form-builder')).toBeInTheDocument()
    expect(builderShellMock).toHaveBeenCalledTimes(1)
    const props = builderShellMock.mock.calls[0][0]
    expect(props.accessTokenProvider).toBe(provideOfficerBuilderAccessToken)
    expect(props.lifecycleActorId).toBeUndefined()
    expect(props.accessTokenProvider()).toBe(token)
  })

  it('provider reads the latest host token on each call', () => {
    localStorage.setItem('officer_token', syntheticToken(['FDS_DRAFT_CREATOR']))
    expect(provideOfficerBuilderAccessToken()).toContain('.')
    localStorage.setItem('officer_token', syntheticToken(['FDS_FORM_SUBMITTER']))
    const second = provideOfficerBuilderAccessToken()
    expect(second).toContain('.')
    localStorage.removeItem('officer_token')
    expect(provideOfficerBuilderAccessToken()).toBeNull()
  })

  it('does not render token text or write new storage keys', () => {
    const token = syntheticToken()
    localStorage.setItem('officer_token', token)
    const keysBefore = Object.keys(localStorage).sort()
    const { container } = render(<OfficerFormBuilder />)
    expect(container.textContent).not.toContain(token)
    expect(container.textContent).not.toMatch(/eyJ/)
    expect(Object.keys(localStorage).sort()).toEqual(keysBefore)
  })

  it('unmount leaves no Builder shell in the document', () => {
    localStorage.setItem('officer_token', syntheticToken())
    const { unmount } = render(<OfficerFormBuilder />)
    expect(screen.getByTestId('mock-builder-shell')).toBeInTheDocument()
    unmount()
    expect(screen.queryByTestId('mock-builder-shell')).not.toBeInTheDocument()
    expect(screen.queryByTestId('officer-form-builder')).not.toBeInTheDocument()
  })

  it('is axe-clean at a narrow viewport width', async () => {
    localStorage.setItem('officer_token', syntheticToken())
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const { container } = render(<OfficerFormBuilder />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
