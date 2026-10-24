import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import DataHub from './DataHub'

vi.mock('./ImportData', () => ({ default: () => <p>load-data-page</p> }))
vi.mock('./DataReadiness', () => ({ default: () => <p>readiness-page</p> }))

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p> }
function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/data" element={<><DataHub /><Where /></>} /></Routes>
    </MemoryRouter>,
  )
}

describe('Data hub', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on Load data by default, with both tabs offered', () => {
    renderAt('/data')
    expect(screen.getByText('load-data-page')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Load data' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Data readiness' })).toHaveAttribute('aria-selected', 'false')
  })

  it('opens straight on Data readiness from a link, and switches between the two in the same address', () => {
    renderAt('/data?tab=readiness')
    expect(screen.getByText('readiness-page')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Load data' }))
    expect(screen.getByText('load-data-page')).toBeInTheDocument()
    expect(screen.getByTestId('where').textContent).toBe('/data?tab=import')
  })

  it('treats an unknown tab as Load data', () => {
    renderAt('/data?tab=nonsense')
    expect(screen.getByText('load-data-page')).toBeInTheDocument()
  })
})
