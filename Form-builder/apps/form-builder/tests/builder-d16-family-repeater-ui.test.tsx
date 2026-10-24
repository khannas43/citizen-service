import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

function canvasRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-canvas')
  if (!(el instanceof HTMLElement)) throw new Error('canvas root missing')
  return el
}

describe('FB-D16 Builder UI — family-repeater', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Add Family repeater/i })).toBeInTheDocument()
    const pageBreak = screen.getByRole('button', {
      name: /Create boundary \(Page break\)/i,
    })
    expect(pageBreak).toBeEnabled()
    expect(pageBreak).not.toHaveClass('dg20-builder-palette__item--pending')
  })

  it('configures Family repeater with invalid then valid Confirm and opens editor', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: /Add Family repeater/i }))
    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    const maxItems = screen.getByTestId('configured-add-max-items')
    expect(maxItems).toHaveFocus()

    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(screen.getByTestId('configured-add-max-items')).toHaveFocus())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(maxItems, '5')
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() =>
      expect(screen.getByTestId('configured-add-initial-member-widget-type')).toHaveFocus(),
    )

    await user.selectOptions(
      screen.getByTestId('configured-add-initial-member-widget-type'),
      'text-short',
    )
    await user.type(screen.getByTestId('configured-add-initial-member-label-en'), 'Member name')
    await user.type(screen.getByTestId('configured-add-initial-member-label-gu'), 'સભ્યનું નામ')
    await user.click(screen.getByTestId('configured-add-confirm'))

    expect(screen.queryByTestId('configured-add-dialog')).not.toBeInTheDocument()
    expect(getCanvasRowByName(/family repeater/i)).toBeInTheDocument()
    expect(screen.getByTestId('family-repeater-editor')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  }, 15_000)

  it('adds a second member in the editor and Apply commits; last remove blocked', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: /Add Family repeater/i }))
    await user.type(screen.getByTestId('configured-add-max-items'), '5')
    await user.selectOptions(
      screen.getByTestId('configured-add-initial-member-widget-type'),
      'text-short',
    )
    await user.type(screen.getByTestId('configured-add-initial-member-label-en'), 'Name')
    await user.type(screen.getByTestId('configured-add-initial-member-label-gu'), 'નામ')
    await user.click(screen.getByTestId('configured-add-confirm'))

    const editor = screen.getByTestId('family-repeater-editor')
    await user.selectOptions(within(editor).getByLabelText(/Member widget type/i), 'email')
    const labelInputs = within(editor).getAllByLabelText(/Label \(English\)/i)
    const guInputs = within(editor).getAllByLabelText(/Label \(Gujarati\)/i)
    await user.type(labelInputs[labelInputs.length - 1]!, 'Email')
    await user.type(guInputs[guInputs.length - 1]!, 'ઈમેલ')
    await user.click(screen.getByTestId('family-repeater-add-member'))
    expect(screen.getByTestId('family-repeater-apply')).toBeEnabled()
    await user.click(screen.getByTestId('family-repeater-apply'))
    await waitFor(() => expect(screen.getByTestId('family-repeater-apply')).toBeDisabled())

    expect(within(canvasRoot()).getByText(/2 member fields/i)).toBeInTheDocument()
  }, 15_000)

  it('unsaved family draft blocks Validate; Bindings and Steps remain operable', async () => {
    const user = userEvent.setup()
    render(<BuilderShell persistenceAdapter={null} validationAdapter={null} />)

    await user.click(screen.getByRole('button', { name: /Add Family repeater/i }))
    await user.type(screen.getByTestId('configured-add-max-items'), '3')
    await user.selectOptions(
      screen.getByTestId('configured-add-initial-member-widget-type'),
      'yesno',
    )
    await user.type(screen.getByTestId('configured-add-initial-member-label-en'), 'Dependent')
    await user.type(screen.getByTestId('configured-add-initial-member-label-gu'), 'આશ્રિત')
    await user.click(screen.getByTestId('configured-add-confirm'))

    await user.clear(screen.getByLabelText(/Maximum items/i))
    await user.type(screen.getByLabelText(/Maximum items/i), '4')
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    expect(screen.getByTestId('save-draft-button')).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(screen.getByRole('heading', { name: /^Bindings$/i })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('heading', { name: /steps/i })).toBeInTheDocument()
  }, 15_000)

  it('axe: family configured-add dialog stays clean; EN/GU and 390px', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const { container } = render(
      <StrictMode>
        <div style={{ width: 390 }}>
          <BuilderShell />
        </div>
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: /Add Family repeater/i }))
    expect(await axe(container)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: /^GU$/i }))
    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390 + 8)
  }, 15_000)
})
