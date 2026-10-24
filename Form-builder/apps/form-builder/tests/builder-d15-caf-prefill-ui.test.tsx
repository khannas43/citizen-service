import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

function previewRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-preview')
  if (!(el instanceof HTMLElement)) throw new Error('preview root missing')
  return el
}

function bindingsRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-bindings')
  if (!(el instanceof HTMLElement)) throw new Error('bindings root missing')
  return el
}

function cafBindingCard(fieldId = 'caf_prefill_1'): HTMLElement {
  const card = document.querySelector(`[data-binding-field="${fieldId}"]`)
  if (!(card instanceof HTMLElement)) throw new Error('CAF binding card missing')
  return card
}

async function addValidCaf(
  user: ReturnType<typeof userEvent.setup>,
  cafAttribute = 'citizen.fullName',
  confidenceMin = '0.8',
) {
  await user.click(screen.getByRole('button', { name: 'Add CAF pre-fill' }))
  await user.type(screen.getByTestId('configured-add-caf-attribute'), cafAttribute)
  await user.type(screen.getByTestId('configured-add-confidence-min'), confidenceMin)
  await user.click(screen.getByTestId('configured-add-confirm'))
  await waitFor(() => expect(getCanvasRowByName(/caf pre-fill/i)).toBeInTheDocument())
}

describe('FB-D15 Builder UI — caf-prefill + Bindings', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
  })

  it('invalid Confirm focuses cafAttribute then confidenceMin; valid Confirm binds', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add CAF pre-fill' }))
    expect(screen.getByTestId('configured-add-caf-attribute')).toHaveFocus()
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(screen.getByTestId('configured-add-caf-attribute')).toHaveFocus())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(screen.getByTestId('configured-add-caf-attribute'), 'citizen.fullName')
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(screen.getByTestId('configured-add-confidence-min')).toHaveFocus())

    await user.type(screen.getByTestId('configured-add-confidence-min'), '0.8')
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(getCanvasRowByName(/caf pre-fill/i)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(screen.getByRole('heading', { name: /^Bindings$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^CAF Prefill$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Integration Hub/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Workflow stages/i })).toBeInTheDocument()
    expect(document.querySelector('[data-binding-field="caf_prefill_1"]')).not.toBeNull()
    expect(within(cafBindingCard()).getByText(/bound/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 15_000)

  it('edit/apply/cancel/remove/recreate binding; unsaved blocks Validate', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    render(<BuilderShell validationAdapter={{ validateDefinition }} />)

    await addValidCaf(user)
    await user.click(screen.getByRole('tab', { name: 'Bindings' }))

    const attr = document.getElementById(
      'dg20-builder-binding-caf_prefill_1-cafAttribute',
    ) as HTMLInputElement
    const conf = document.getElementById(
      'dg20-builder-binding-caf_prefill_1-confidenceMin',
    ) as HTMLInputElement
    await user.clear(attr)
    await user.type(attr, 'citizen.motherName')
    await user.clear(conf)
    await user.type(conf, '0.9')

    expect(
      screen.getByText(/apply or cancel unsaved changes before validating/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    expect(validateDefinition).not.toHaveBeenCalled()

    await user.click(within(cafBindingCard()).getByRole('button', { name: /^Apply$/i }))
    expect(attr).toHaveValue('citizen.motherName')
    expect(conf).toHaveValue('0.9')
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeEnabled()

    await user.clear(conf)
    await user.type(conf, '0.4')
    await user.click(within(cafBindingCard()).getByRole('button', { name: /^Cancel$/i }))
    expect(conf).toHaveValue('0.9')

    await user.click(within(cafBindingCard()).getByRole('button', { name: /Remove binding/i }))
    expect(within(cafBindingCard()).getByText(/unbound/i)).toBeInTheDocument()
    expect(
      within(cafBindingCard()).queryByRole('button', { name: /Remove binding/i }),
    ).not.toBeInTheDocument()

    await user.type(attr, 'citizen.fatherName')
    await user.clear(conf)
    await user.type(conf, '0.7')
    await user.click(within(cafBindingCard()).getByRole('button', { name: /^Apply$/i }))
    expect(within(cafBindingCard()).getByText(/bound/i)).toBeInTheDocument()
  }, 15_000)

  it('Property and Bilingual drafts remain isolated; Steps operable', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await addValidCaf(user, 'citizen.iso', '0.6')
    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    const conf = document.getElementById(
      'dg20-builder-binding-caf_prefill_1-confidenceMin',
    ) as HTMLInputElement
    await user.clear(conf)
    await user.type(conf, '0.55')

    await user.click(getCanvasRowByName(/caf pre-fill/i))
    const labelEn = screen.getByLabelText(/Label \(English\)/i)
    await user.clear(labelEn)
    await user.type(labelEn, 'CAF renamed')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-binding-caf_prefill_1-confidenceMin',
        ) as HTMLInputElement
      ).value,
    ).toBe('0.55')

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-caf_prefill_1-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only EN')
    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-binding-caf_prefill_1-confidenceMin',
        ) as HTMLInputElement
      ).value,
    ).toBe('0.55')

    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('heading', { name: /steps/i })).toBeInTheDocument()
  }, 15_000)

  it('EN/GU smoke for bindings heading; axe on Bindings workspace', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await addValidCaf(user)
    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(screen.getByRole('heading', { name: 'Bindings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'CAF Prefill' })).toBeInTheDocument()
    expect(await axe(bindingsRoot())).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(screen.getByRole('heading', { name: /^બાઇન્ડિંગ્સ$/i })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  }, 15_000)

  it('390px layout has no horizontal overflow on bindings panel', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 390,
    })
    render(<BuilderShell />)
    await addValidCaf(user)
    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
  }, 15_000)

  it('keyboard path for Apply; preview does not invent CAF values or leak internals', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(<BuilderShell />)

    await addValidCaf(user, 'citizen.kb', '0.5')
    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    const conf = document.getElementById(
      'dg20-builder-binding-caf_prefill_1-confidenceMin',
    ) as HTMLInputElement
    await user.clear(conf)
    await user.type(conf, '0.65')
    const apply = within(cafBindingCard()).getByRole('button', { name: /^Apply$/i })
    apply.focus()
    expect(apply).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(conf).toHaveValue('0.65')

    const preview = previewRoot()
    expect(preview.querySelector('[data-dg20-widget="caf-prefill"]')).not.toBeNull()
    expect(preview.innerHTML).not.toMatch(/confidenceMin|showValidation|ETag|adapter error/i)
    expect(preview.textContent).not.toMatch(/citizen\.kb/)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSetSpy).not.toHaveBeenCalled()
  }, 15_000)
})
