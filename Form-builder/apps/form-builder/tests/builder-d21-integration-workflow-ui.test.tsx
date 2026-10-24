import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

function bindingsRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-bindings')
  if (!(el instanceof HTMLElement)) throw new Error('bindings root missing')
  return el
}

async function openBindings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Bindings' }))
  expect(screen.getByRole('heading', { name: /^Bindings$/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Integration Hub/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Workflow stages/i })).toBeInTheDocument()
}

describe('FB-D21 Builder UI — Integration Hub + Workflow bindings', () => {
  it('add/apply/duplicate reject/cancel integration and workflow independently', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell validationAdapter={{ validateDefinition }} />)

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    await waitFor(() => expect(getCanvasRowByName(/short text/i)).toBeInTheDocument())
    await openBindings(user)

    await user.click(screen.getByRole('button', { name: 'Add integration binding' }))
    const integrationSection = screen
      .getByRole('heading', { name: /Integration Hub/i })
      .closest('section')!
    const fieldSelects = within(integrationSection).getAllByLabelText(/^Field$/i)
    const adapterInputs = within(integrationSection).getAllByLabelText(/Adapter ID/i)
    const paramInputs = within(integrationSection).getAllByLabelText(/^Parameter$/i)
    const directionSelects = within(integrationSection).getAllByLabelText(/^Direction$/i)

    await user.selectOptions(fieldSelects[0]!, 'text_short_1')
    await user.type(adapterInputs[0]!, 'adapter-a')
    await user.type(paramInputs[0]!, 'param-a')
    await user.selectOptions(directionSelects[0]!, 'in')

    await user.click(screen.getByRole('button', { name: 'Add integration binding' }))
    const fieldSelects2 = within(integrationSection).getAllByLabelText(/^Field$/i)
    const adapterInputs2 = within(integrationSection).getAllByLabelText(/Adapter ID/i)
    const paramInputs2 = within(integrationSection).getAllByLabelText(/^Parameter$/i)
    const directionSelects2 = within(integrationSection).getAllByLabelText(/^Direction$/i)
    await user.selectOptions(fieldSelects2[1]!, 'text_short_1')
    await user.type(adapterInputs2[1]!, 'adapter-a')
    await user.type(paramInputs2[1]!, 'param-a')
    await user.selectOptions(directionSelects2[1]!, 'in')

    const applyButtons = within(integrationSection).getAllByRole('button', { name: /^Apply$/i })
    await user.click(applyButtons[0]!)
    await waitFor(() => expect(within(integrationSection).getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    expect(fetchSpy).not.toHaveBeenCalled()

    await user.click(within(integrationSection).getAllByRole('button', { name: /Remove row/i })[1]!)
    await user.click(applyButtons[0]!)
    await waitFor(() =>
      expect(within(integrationSection).queryByRole('alert')).not.toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Add workflow binding' }))
    const workflowSection = screen
      .getByRole('heading', { name: /Workflow stages/i })
      .closest('section')!
    const workflowFields = within(workflowSection).getAllByLabelText(/^Field$/i)
    const stageInputs = within(workflowSection).getAllByLabelText(/^Stage$/i)
    await user.selectOptions(workflowFields[0]!, 'text_short_1')
    await user.type(stageInputs[0]!, 'review')
    await user.click(within(workflowSection).getByRole('button', { name: /^Apply$/i }))
    await waitFor(() =>
      expect(within(workflowSection).getByText(/No unsaved changes/i)).toBeInTheDocument(),
    )

    // CAF section still present and independent.
    expect(screen.getByRole('heading', { name: /^CAF Prefill$/i })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 20_000)

  it('unsaved integration draft blocks Validate/Save; cancel clears gate', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    render(<BuilderShell validationAdapter={{ validateDefinition }} />)

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    await openBindings(user)
    await user.click(screen.getByRole('button', { name: 'Add integration binding' }))
    const integrationSection = screen
      .getByRole('heading', { name: /Integration Hub/i })
      .closest('section')!
    await user.selectOptions(within(integrationSection).getByLabelText(/^Field$/i), 'text_short_1')
    await user.type(within(integrationSection).getByLabelText(/Adapter ID/i), 'adapter-x')
    await user.type(within(integrationSection).getByLabelText(/^Parameter$/i), 'param-x')
    await user.selectOptions(within(integrationSection).getByLabelText(/^Direction$/i), 'out')

    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    expect(screen.getByTestId('save-draft-button')).toBeDisabled()

    await user.click(within(integrationSection).getByRole('button', { name: /^Cancel$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Validate$/i })).toBeEnabled())
  }, 15_000)

  it('axe + EN/GU + 390px bindings workspace', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 390,
    })
    const { container } = render(
      <StrictMode>
        <div style={{ width: 390 }}>
          <BuilderShell />
        </div>
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    await openBindings(user)
    expect(await axe(bindingsRoot())).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(screen.getByRole('heading', { name: /^બાઇન્ડિંગ્સ$/i })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390 + 1)
  }, 15_000)
})
