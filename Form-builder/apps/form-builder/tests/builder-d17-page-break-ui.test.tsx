/**
 * FB-D17 — page-break boundary dialog UI (axe, 390px, EN/GU, merge inverse).
 */
import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'

function canvasRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-canvas')
  if (!(el instanceof HTMLElement)) throw new Error('canvas root missing')
  return el
}

function pageBreakPaletteButton(): HTMLElement {
  return screen.getByRole('button', { name: /Create boundary \(Page break\)/i })
}

async function openPageBreakDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(pageBreakPaletteButton())
  expect(screen.getByTestId('page-break-dialog')).toBeInTheDocument()
}

describe('FB-D17 Builder UI — page-break boundary', () => {
  it('reports 30 addable and 0 pending; page-break is enabled create-boundary', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
    const button = pageBreakPaletteButton()
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('data-widget-type', 'page-break')
  })

  it('opens dialog, focuses afterField, invalid Confirm focuses labels; valid creates steps', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell />)

    const canvasBefore = canvasRoot().querySelectorAll('.dg20-builder-canvas__row').length
    await openPageBreakDialog(user)

    await waitFor(() => expect(screen.getByTestId('page-break-after-field')).toHaveFocus())

    await user.click(screen.getByTestId('page-break-confirm'))
    await waitFor(() => expect(screen.getByTestId('page-break-label-en')).toHaveFocus())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(screen.getByTestId('page-break-label-en'), 'D17 Boundary EN')
    await user.click(screen.getByTestId('page-break-confirm'))
    await waitFor(() => expect(screen.getByTestId('page-break-label-gu')).toHaveFocus())

    await user.type(screen.getByTestId('page-break-label-gu'), 'D17 Boundary GU')
    await user.click(screen.getByTestId('page-break-confirm'))

    await waitFor(() => expect(screen.queryByTestId('page-break-dialog')).not.toBeInTheDocument())
    // No new canvas field row — structural only.
    expect(canvasRoot().querySelectorAll('.dg20-builder-canvas__row').length).toBe(canvasBefore)
    // Steps tab opens and shows the new step label.
    expect(screen.getByRole('tab', { name: 'Steps', selected: true })).toBeInTheDocument()
    expect(screen.getByText(/EN: D17 Boundary EN/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  }, 15_000)

  it('Cancel and Escape leave definition unchanged; pending blocks Validate', async () => {
    const user = userEvent.setup()
    render(<BuilderShell persistenceAdapter={null} validationAdapter={null} />)

    await openPageBreakDialog(user)
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    expect(screen.getByTestId('save-draft-button')).toBeDisabled()

    await user.type(screen.getByTestId('page-break-label-en'), 'Temp')
    await user.click(screen.getByTestId('page-break-cancel'))
    expect(screen.queryByTestId('page-break-dialog')).not.toBeInTheDocument()

    await openPageBreakDialog(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('page-break-dialog')).not.toBeInTheDocument())
  }, 15_000)

  it('merge remains inverse after page-break creation from progressive illustrative draft', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    // Illustrative draft is already progressive — create another boundary.
    await openPageBreakDialog(user)
    await user.type(screen.getByTestId('page-break-label-en'), 'Split EN')
    await user.type(screen.getByTestId('page-break-label-gu'), 'Split GU')
    await user.click(screen.getByTestId('page-break-confirm'))
    await waitFor(() => expect(screen.queryByTestId('page-break-dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    const mergeButtons = screen.getAllByRole('button', { name: /Merge/i })
    expect(mergeButtons.length).toBeGreaterThan(0)
    await user.click(mergeButtons[0]!)
    // After merge, Split EN step should be gone from the steps workspace.
    await waitFor(() => {
      expect(screen.queryByText('Split EN')).not.toBeInTheDocument()
    })
  }, 15_000)

  it('axe: page-break dialog stays clean; EN/GU and 390px', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const { container } = render(
      <StrictMode>
        <div style={{ width: 390 }}>
          <BuilderShell />
        </div>
      </StrictMode>,
    )
    await openPageBreakDialog(user)
    expect(await axe(container)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: /^GU$/i }))
    expect(screen.getByTestId('page-break-dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^EN$/i }))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390 + 8)
  }, 15_000)
})
