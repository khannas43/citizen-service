import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxLineage from './DxLineage'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })
const src = { source: 'crs', name: 'Civil registration (CRS)', interface: 'REST API', records: 10, persons: 9, linked: 9, in_review: 1, latest: '2026-06-10', loaded_at: '2026-10-27T10:00:00Z', open_issues: 0, connector: 'ACTIVE' }
const mk = (focus) => ({ sources: [src], focus, core: { records: 10, persons: focus ? 9 : 50, golden_attributes: 1, relationships: 1, review_open: 1, last_load: null }, outputs: [], consumers: [] })

describe('Lineage overview: follow one source', () => {
  it('stays on the page, narrows columns 2 to 4, and goes back with Show all sources', async () => {
    const calls = []
    globalThis.fetch = vi.fn(async (url) => { const u = String(url); calls.push(u); return { ok: true, status: 200, json: async () => mk(u.includes('source=crs') ? 'crs' : null) } })
    render(<MemoryRouter initialEntries={['/?tab=overview']}><DxLineage /></MemoryRouter>)
    expect(await screen.findByText('Showing all source systems')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show all sources' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /follow this source/ }))
    expect(await screen.findByRole('button', { name: 'Show all sources' })).toBeTruthy()
    expect(calls.some((u) => u.includes('source=crs'))).toBe(true)
    expect(screen.getByText('Open feed quality →')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show all sources' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show all sources' })).toBeNull())
  })
})
