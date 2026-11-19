import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxApprovals from './DxApprovals'
import DxNotices from './DxNotices'
import { setLang } from '../../i18n/lang'

afterEach(() => { cleanup(); setLang('en') })

const json = (data) => ({ ok: true, status: 200, json: async () => data })

describe('Decisions screens in Telugu', () => {
  it('shows the Approvals page and its empty state in Telugu', async () => {
    localStorage.setItem('officer_token', 'tok')
    setLang('te')
    globalThis.fetch = vi.fn(async () => json({ total: 0, items: [], by_system: [], rationale_min_chars: 10 }))
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    expect(await screen.findByText('ఇక్కడ చర్యలు ఏవీ లేవు')).toBeInTheDocument()
    expect(screen.getByText(/నిర్ణయం కోసం ఏదీ వేచి లేదు/)).toBeInTheDocument()
  })

  it('shows the notice counts in Telugu', async () => {
    localStorage.setItem('officer_token', 'tok')
    setLang('te')
    globalThis.fetch = vi.fn(async () => json({ total: 0, items: [], counts: { waiting: 1, overdue: 0, answered: 0, rejected: 0 }, systems: [] }))
    render(<MemoryRouter><DxNotices /></MemoryRouter>)
    expect(await screen.findByText('శాఖ కోసం వేచి ఉన్నవి')).toBeInTheDocument()
  })
})
