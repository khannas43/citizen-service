import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ImportData from './ImportData'
import { INTEGRITY_IMPORTS, INTEGRITY_MAX_UPLOAD_BYTES, integrityImportTemplateHeader } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    uploadIntegrityImport: vi.fn(),
    fetchVerificationEventsLastLoaded: vi.fn().mockResolvedValue({ lastLoadedAt: null }),
  }
})

import { uploadIntegrityImport, fetchVerificationEventsLastLoaded } from '../api'

function renderPage() {
  return render(
    <MemoryRouter>
      <ImportData />
    </MemoryRouter>,
  )
}

function cardFor(name) {
  const imp = INTEGRITY_IMPORTS.find((i) => i.name === name)
  const title = screen.getByRole('heading', { name: imp.label, level: 3 })
  return title.closest('article')
}

function pickCsv(card, file) {
  const input = within(card).getByLabelText(/choose csv/i)
  fireEvent.change(input, { target: { files: [file] } })
}

describe('Load data (CSV imports)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists all eight imports with columns and needs', () => {
    renderPage()
    for (const imp of INTEGRITY_IMPORTS) {
      expect(screen.getByRole('heading', { name: imp.label, level: 3 })).toBeInTheDocument()
      const card = cardFor(imp.name)
      expect(within(card).getByText(/Columns:/)).toHaveTextContent(imp.columns)
      expect(within(card).getByText(/Needs first:/)).toHaveTextContent(imp.needs)
    }
  })

  it('keeps Upload disabled until a CSV is chosen', () => {
    renderPage()
    const card = cardFor('employees')
    expect(within(card).getByRole('button', { name: 'Upload' })).toBeDisabled()
    pickCsv(card, new File(['x'], 'staff.csv', { type: 'text/csv' }))
    expect(within(card).getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('refuses non-CSV and oversized files on the client', async () => {
    renderPage()
    const card = cardFor('employees')
    pickCsv(card, new File(['x'], 'staff.txt', { type: 'text/plain' }))
    expect(uploadIntegrityImport).not.toHaveBeenCalled()
    expect(within(card).getByRole('alert')).toHaveTextContent(/\.csv/)
    expect(within(card).getByRole('alert')).toHaveTextContent(/Nothing was loaded/)

    const big = new File([new Uint8Array(INTEGRITY_MAX_UPLOAD_BYTES + 1)], 'big.csv', { type: 'text/csv' })
    pickCsv(card, big)
    expect(uploadIntegrityImport).not.toHaveBeenCalled()
    expect(within(card).getByRole('alert')).toHaveTextContent(/20 MB/)
  })

  it('shows last loaded on the verification-events card', async () => {
    fetchVerificationEventsLastLoaded.mockResolvedValue({ lastLoadedAt: '2026-10-01T12:00:00Z' })
    renderPage()
    const card = cardFor('verification-events')
    await waitFor(() => {
      expect(within(card).getByText(/Last loaded:/)).toBeInTheDocument()
    })
  })

  it('shows newlyAtRisk after verification-events upload', async () => {
    uploadIntegrityImport.mockResolvedValue({ imported: 1, updated: 0, skipped: 0, newlyAtRisk: 3 })
    renderPage()
    const card = cardFor('verification-events')
    pickCsv(card, new File(['h\n'], 'deaths.csv', { type: 'text/csv' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Upload' }))
    await waitFor(() => {
      expect(within(card).getByText(/3 people have payments after a recorded death/)).toBeInTheDocument()
    })
  })

  it('shows success counts and the detection hint', async () => {
    uploadIntegrityImport.mockResolvedValue({ imported: 2, updated: 1, skipped: 0 })
    renderPage()
    const card = cardFor('employees')
    pickCsv(card, new File(['h\n'], 'staff.csv', { type: 'text/csv' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Upload' }))
    await waitFor(() => {
      expect(within(card).getByRole('status')).toHaveTextContent(
        'Loaded: 2 new, 1 updated, 0 already there (skipped)',
      )
    })
    expect(screen.getByRole('link', { name: /expenditure integrity/i })).toHaveAttribute(
      'href',
      '/expenditure-integrity',
    )
  })

  it('shows a refused line message and nothing loaded', async () => {
    uploadIntegrityImport.mockRejectedValue(new Error("Line 3: effective_date 'bad' is not a date (use YYYY-MM-DD)"))
    renderPage()
    const card = cardFor('service-events')
    pickCsv(card, new File(['h\n'], 'events.csv', { type: 'text/csv' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Upload' }))
    await waitFor(() => {
      const alert = within(card).getByRole('alert')
      expect(alert).toHaveTextContent("Line 3: effective_date 'bad' is not a date (use YYYY-MM-DD)")
      expect(alert).toHaveTextContent('Nothing was loaded.')
    })
  })

  it('builds the employees template header row', () => {
    expect(integrityImportTemplateHeader('employees')).toBe(
      'employee_code,person_name,ddo_code,post_title,pay_level,status,status_since,district,taluka,person_id',
    )
  })

  it('replaces the previous result when uploading again in the same card', async () => {
    uploadIntegrityImport
      .mockResolvedValueOnce({ imported: 1, updated: 0, skipped: 0 })
      .mockResolvedValueOnce({ imported: 0, updated: 0, skipped: 1 })
    renderPage()
    const card = cardFor('employees')
    pickCsv(card, new File(['a'], 'a.csv', { type: 'text/csv' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Upload' }))
    await waitFor(() => expect(within(card).getByRole('status')).toHaveTextContent('1 new'))
    pickCsv(card, new File(['b'], 'b.csv', { type: 'text/csv' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Upload' }))
    await waitFor(() => {
      expect(within(card).getByRole('status')).toHaveTextContent('0 new, 0 updated, 1 already there')
      expect(within(card).queryByText(/1 new, 0 updated, 0 already/)).not.toBeInTheDocument()
    })
  })
})
