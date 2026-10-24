import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DataReadiness from './DataReadiness'

vi.mock('../api', () => ({
  fetchIntegrityReadiness: vi.fn(),
}))

import { fetchIntegrityReadiness } from '../api'

const SAMPLE = {
  feeds: [
    {
      feed: 'payment_settlement',
      title: 'Payment settlements',
      freshness: '2025-03-31',
      checks: [
        {
          id: 'settlements-missing-bank',
          check: 'Bank reference on every settlement',
          affected: 5,
          total: 5,
          percentComplete: 0,
          whyItMatters: 'Bank checks need a token.',
          rulesWeakened: '804',
          askFor: 'Ask for bank references.',
          importName: 'settlements',
        },
        {
          id: 'ok-check',
          check: 'All good',
          affected: 0,
          total: 10,
          percentComplete: 100,
          whyItMatters: 'Fine.',
          rulesWeakened: '802',
        },
      ],
    },
  ],
}

describe('Data readiness screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchIntegrityReadiness.mockResolvedValue(SAMPLE)
  })

  it('renders a failing check with ask-for text and load-data link', async () => {
    render(<MemoryRouter><DataReadiness /></MemoryRouter>)
    expect(await screen.findByText('Data readiness')).toBeInTheDocument()
    expect(screen.getByText('0% complete')).toBeInTheDocument()
    expect(screen.getByText(/Ask for bank references/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Load data — settlements/i })).toHaveAttribute('href', '/data?tab=import#import-settlements')
  })

  it('renders a passing check without ask-for', async () => {
    render(<MemoryRouter><DataReadiness /></MemoryRouter>)
    const heading = await screen.findByRole('heading', { name: 'All good' })
    const article = heading.closest('article')
    expect(article).toHaveTextContent('100% complete')
    expect(article.textContent).not.toMatch(/What to ask for/)
  })
})
