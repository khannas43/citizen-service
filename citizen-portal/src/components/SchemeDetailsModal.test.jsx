import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SchemeDetailsModal, { SchemeNameButton } from './SchemeDetailsModal'

vi.mock('../api', () => ({
  fetchSchemePublicDetails: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

import { fetchSchemePublicDetails } from '../api'

describe('SchemeDetailsModal', () => {
  beforeEach(() => {
    vi.mocked(fetchSchemePublicDetails).mockResolvedValue({
      id: 'a1000001-0000-0000-0000-000000000004',
      name: 'Widow Pension',
      description: 'Support for widows',
      department: 'Social Justice',
      category: 'Pension',
      benefitType: 'Cash',
      benefitValue: '₹1250/month',
      status: 'ACTIVE',
      validFrom: '2020-01-01',
      validTo: '2030-12-31',
      benefitComponents: [],
      eligibility: [
        { key: 'maritalStatus', label: 'Marital status', labelGu: null, value: 'WIDOWED', operator: 'must be', source: 'OVERLAY' },
      ],
    })
  })

  it('opens from scheme name button and shows criteria', async () => {
    function Harness() {
      const [openId, setOpenId] = useState(null)
      return (
        <>
          <SchemeNameButton schemeId="test-id" onOpen={(id) => setOpenId(id)}>
            Widow Pension
          </SchemeNameButton>
          {openId && (
            <SchemeDetailsModal
              schemeId={openId}
              guestShell
              onClose={() => setOpenId(null)}
            />
          )}
        </>
      )
    }
    render(<Harness />)

    const btn = screen.getByRole('button', { name: 'Widow Pension' })
    expect(btn).toHaveClass('scheme-name-link')
    fireEvent.click(btn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(await screen.findByText('Marital status')).toBeInTheDocument()
    expect(screen.getByText('Widowed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View full details' })).toHaveAttribute(
      'href',
      `/schemes/${encodeURIComponent('a1000001-0000-0000-0000-000000000004')}`,
    )
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(
      <SchemeDetailsModal
        schemeId="test-id"
        guestShell
        onClose={onClose}
      />,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
