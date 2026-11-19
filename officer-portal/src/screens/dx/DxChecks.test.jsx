import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import DxChecks from './DxChecks'
import MdmHub from '../mdm/MdmHub'
import { tr } from '../../i18n/lang'

const T18 = {
  as_of: '2026-11-03', total: 2, stats: {
    turning_30: 1, already_18: 1, not_on_portal: 1, invited: 0, income_expired_or_none: 0,
  },
  items: [
    {
      id: 7, name: 'Asha Rao', district: 'Warangal', dob: '2008-12-01', turns_18: '2026-12-01', already_adult: false,
      has_identity: true, income_state: 'valid', has_caste: true, on_scholarship_portal: false,
      next_steps: ['Apply on the portal'], next_step: 'Apply on the portal', consent_status: 'none', invited: false,
    },
    {
      id: 8, name: 'Portal Person', district: 'Guntur', dob: '2008-01-01', turns_18: '2026-01-01', already_adult: true,
      has_identity: true, income_state: 'valid', has_caste: true, on_scholarship_portal: true, course: 'B.Sc',
      next_steps: ['Nothing outstanding'], next_step: 'Nothing outstanding', consent_status: 'student_allowed', invited: false,
    },
  ],
}

const HH = {
  duplicate_benefit: [{
    first: 'H1', second: 'H2', first_status: 'OPEN', second_status: 'OPEN',
    first_person: 1, second_person: 2, first_name: 'Ravi', second_name: 'Anil', same_person: false,
  }],
  dead_active: { total: 0, items: [] },
  multi_card: { total: 0, items: [] },
}

describe('Eligibility checks', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('turning-18') ? T18 : HH),
    }))
  })

  it('lists people about to turn 18 and the household overlaps on one page', async () => {
    render(<MemoryRouter><DxChecks /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Asha Rao')).toBeInTheDocument())
    expect(screen.getByText(tr('Turning 18 in the next 30 days'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Households' }))
    await waitFor(() => expect(screen.getByText('Ravi')).toBeInTheDocument())
    expect(screen.getAllByText(tr('Housing applications')).length).toBeGreaterThan(0)
  })

  it('search, filter, sort, page size, Clear and empty state', async () => {
    let lastUrl = ''
    globalThis.fetch = vi.fn(async (url) => {
      lastUrl = String(url)
      const empty = lastUrl.includes('q=zzz-nobody')
      return {
        ok: true, status: 200,
        json: async () => (empty
          ? { ...T18, total: 0, items: [], stats: { turning_30: 0, already_18: 0, not_on_portal: 0, invited: 0, income_expired_or_none: 0 } }
          : T18),
      }
    })
    render(<MemoryRouter><DxChecks /></MemoryRouter>)
    await screen.findByText('Asha Rao')
    const search = screen.getByPlaceholderText(tr('Search name, ministry id or district'))
    await userEvent.clear(search)
    await userEvent.type(search, 'zzz-nobody')
    await waitFor(() => expect(lastUrl).toMatch(/q=zzz-nobody/))
    await waitFor(() => expect(screen.getByText(tr('Nobody in this age band.'))).toBeInTheDocument())
    // Clear
    await userEvent.click(screen.getByRole('button', { name: tr('Clear filters') }))
    await waitFor(() => expect(screen.getByText('Asha Rao')).toBeInTheDocument())
    // District filter
    const district = screen.getByLabelText(tr('District'))
    fireEvent.change(district, { target: { value: 'Warangal' } })
    await waitFor(() => expect(lastUrl).toMatch(/district=Warangal/))
    // Sort by Person header (the column sort button, not the person name link)
    const personBtn = screen.getAllByRole('button', { name: /Person/ }).find((b) => b.classList.contains('dxk-sortbtn'))
    fireEvent.click(personBtn)
    await waitFor(() => expect(lastUrl).toMatch(/sort=person/))
    expect(personBtn.closest('th').getAttribute('aria-sort')).toMatch(/ascending|descending/)
    // Page size
    fireEvent.change(screen.getByLabelText(tr('Rows per page')), { target: { value: '10' } })
    await waitFor(() => expect(lastUrl).toMatch(/limit=10/))
  })

  it('greys the invite tick box for someone already on the portal', async () => {
    render(<MemoryRouter><DxChecks /></MemoryRouter>)
    await screen.findByText('Portal Person')
    expect(screen.getByLabelText(tr('Choose {name}', { name: 'Portal Person' }))).toBeDisabled()
    expect(screen.getByLabelText(tr('Choose {name}', { name: 'Asha Rao' }))).toBeEnabled()
  })

  it('the old use-cases address on Master Data leads here', async () => {
    render(<MemoryRouter initialEntries={['/mdm?tab=usecases']}><Routes><Route path="/mdm" element={<MdmHub />} /><Route path="/dx/checks" element={<DxChecks />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('Eligibility checks').length).toBeGreaterThan(0))
    expect(screen.queryByRole('tab', { name: 'People' })).toBeNull()
  })
})
