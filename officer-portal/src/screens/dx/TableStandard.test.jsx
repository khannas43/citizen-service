import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { DataTable, DateRange } from './dxKit'

afterEach(cleanup)
const rows = [{ id: 1, name: 'Ravi', n: 3 }, { id: 2, name: 'Anil', n: 9 }, { id: 3, name: 'Meena', n: 1 }]
const names = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => r.cells[0].textContent)

describe('Table standard', () => {
  it('sorts every labelled column of a client table without being told to, and leaves action columns alone', () => {
    render(<DataTable rows={rows} columns={[{ key: 'name', label: 'Person' }, { key: 'n', label: 'Count', align: 'num' }, { key: 'go', label: '', render: () => <button type="button">Open</button> }]} />)
    expect(screen.getByRole('button', { name: /Person/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Count/ })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')[2].querySelector('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Person/ }))
    expect(names()).toEqual(['Anil', 'Meena', 'Ravi'])
    fireEvent.click(screen.getByRole('button', { name: /Count/ }))
    fireEvent.click(screen.getByRole('button', { name: /Count/ }))
    expect(names()).toEqual(['Anil', 'Ravi', 'Meena'])
    expect(screen.getByLabelText(/Rows/)).toBeInTheDocument()
  })
  it('a server table hands the sort and the page size to the server', () => {
    const onSort = vi.fn(), onLimit = vi.fn()
    render(<DataTable rows={rows} server={{ total: 30, limit: 10, offset: 0, onPage: () => {}, onLimit, onSort, sort: { key: 'name', dir: 'asc' }, pageSizes: [10, 25] }}
      columns={[{ key: 'name', sortKey: 'name', label: 'Person' }, { key: 'n', label: 'Plain' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Person/ }))
    expect(onSort).toHaveBeenCalledWith('name', 'desc')
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } })
    expect(onLimit).toHaveBeenCalledWith(25)
  })
  it('a date range gives two dates', () => {
    const f = vi.fn()
    render(<DateRange label="Raised between" from="" to="" onFrom={f} onTo={() => {}} />)
    fireEvent.change(screen.getByLabelText('Raised between: from'), { target: { value: '2026-01-05' } })
    expect(f).toHaveBeenCalledWith('2026-01-05')
  })
})
