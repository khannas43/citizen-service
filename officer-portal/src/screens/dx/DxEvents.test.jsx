import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DxEvents from './DxEvents'
import { tr } from '../../i18n/lang'

vi.mock('../../mdmApi', () => ({
  mdm: vi.fn().mockResolvedValue({}),
  MDM_API: '',
}))

vi.mock('../mdm/shared', async () => {
  const actual = await vi.importActual('../mdm/shared')
  return { ...actual, useMdm: vi.fn() }
})

import { useMdm } from '../mdm/shared'

function flow(proposals) {
  return {
    event: {
      id: 41,
      event_type: 'BIRTH_REGISTERED',
      event_key: 'CRS-TEST-41',
      status: 'MATCHED',
      received_at: '2026-11-01T10:00:00Z',
      note: null,
      parents: [],
      people: [],
    },
    person: { id: 7, name: 'Demo Child', mdm_id: 'MDM-7' },
    proposals,
    deliveries: [],
    consents: [],
    timeline: [{ what: 'Event received', ts: '2026-11-01T10:00:00Z', detail: null }],
  }
}

function renderCase(proposals) {
  vi.mocked(useMdm).mockImplementation((path) => {
    if (String(path).endsWith('/flow')) {
      return { data: flow(proposals), error: null, loading: false, reload: vi.fn() }
    }
    if (String(path).endsWith('/notices')) {
      return { data: { notices: [] }, error: null, loading: false, reload: vi.fn() }
    }
    return { data: null, error: null, loading: false, reload: vi.fn() }
  })
  return render(
    <MemoryRouter initialEntries={['/dx/events?case=41']}>
      <Routes>
        <Route path="/dx/events" element={<DxEvents />} />
      </Routes>
    </MemoryRouter>,
  )
}

function toDecideTile() {
  const label = screen.getByText(tr('To decide'))
  return label.closest('.dxk-stat')
}

beforeEach(() => {
  vi.mocked(useMdm).mockReset()
})

describe('DxEvents case To decide tile', () => {
  it('counts only PROPOSED proposals: two APPROVED show 0 with no warn tone', () => {
    renderCase([
      { id: 1, parent_id: null, status: 'APPROVED', kind: 'LINK_PERSON' },
      { id: 2, parent_id: 1, status: 'APPROVED', kind: 'NOTIFY_PDS' },
    ])
    const tile = toDecideTile()
    expect(within(tile).getByText('0')).toBeInTheDocument()
    expect(tile.className).not.toMatch(/tone-warn/)
  })

  it('shows 1 with warn tone when one proposal is still PROPOSED', () => {
    renderCase([
      { id: 1, parent_id: null, status: 'APPROVED', kind: 'LINK_PERSON' },
      { id: 2, parent_id: 1, status: 'PROPOSED', kind: 'NOTIFY_PDS' },
    ])
    const tile = toDecideTile()
    expect(within(tile).getByText('1')).toBeInTheDocument()
    expect(tile.className).toMatch(/tone-warn/)
  })
})
