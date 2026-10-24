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

function previewRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-preview')
  if (!(el instanceof HTMLElement)) throw new Error('preview root missing')
  return el
}

function editorStatus(): HTMLElement {
  const el = document.querySelector('.dg20-builder-editor__status')
  if (!(el instanceof HTMLElement)) throw new Error('editor status missing')
  return el
}

describe('FB-D14 Builder UI — eligibility-declaration', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
  })

  it('configures Eligibility Declaration with invalid then valid Confirm and Apply', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Eligibility declaration' }))
    const declarationId = screen.getByTestId('configured-add-declaration-id')
    expect(declarationId).toHaveFocus()
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(screen.getByTestId('configured-add-declaration-id')).toHaveFocus())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(declarationId, 'DECL_UI_V1')
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() =>
      expect(screen.getByTestId('configured-add-declaration-text-en')).toHaveFocus(),
    )
    await user.type(
      screen.getByTestId('configured-add-declaration-text-en'),
      'I confirm eligibility.',
    )
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() =>
      expect(screen.getByTestId('configured-add-declaration-text-gu')).toHaveFocus(),
    )
    await user.type(
      screen.getByTestId('configured-add-declaration-text-gu'),
      'હું પાત્રતા પુષ્ટિ કરું છું.',
    )
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(getCanvasRowByName(/eligibility declaration/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/eligibility declaration/i))
    const editor = screen.getByLabelText(/Declaration ID/i)
    await user.clear(editor)
    await user.type(editor, 'DECL_UI_V2')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(editor).toHaveValue('DECL_UI_V2')
    expect(document.querySelector('.dg20-builder-editor__hint')?.textContent).toMatch(
      /ConsentLoggingAdapter|receipt/i,
    )
    expect(previewRoot().textContent).toMatch(
      /Consent recording is temporarily unavailable|unavailable|અનુપલબ્ધ/i,
    )
    expect(previewRoot().innerHTML).not.toMatch(/receipt-|ETag|DECL_UI/)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSetSpy).not.toHaveBeenCalled()
  }, 15_000)

  it('Property/Bilingual drafts remain isolated; Steps operable', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Eligibility declaration' }))
    await user.type(screen.getByTestId('configured-add-declaration-id'), 'DECL_ISO')
    await user.type(screen.getByTestId('configured-add-declaration-text-en'), 'EN declaration')
    await user.type(screen.getByTestId('configured-add-declaration-text-gu'), 'GU declaration')
    await user.click(screen.getByTestId('configured-add-confirm'))

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-eligibility_declaration_1-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only EN')
    await user.click(getCanvasRowByName(/eligibility declaration/i))
    const declarationEditor = screen.getByLabelText(/Declaration ID/i)
    await user.clear(declarationEditor)
    await user.type(declarationEditor, 'DECL_ISO_2')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-bilingual-field-eligibility_declaration_1-errorEn',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Only EN')

    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('heading', { name: /steps/i })).toBeInTheDocument()
  }, 15_000)

  it('Cancel leaves zero mutation; Gujarati configured-add stays axe-clean', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    const beforeCount = within(canvasRoot()).queryAllByRole('button').length
    await user.click(screen.getByRole('button', { name: 'Add Eligibility declaration' }))
    await user.type(screen.getByTestId('configured-add-declaration-id'), 'DECL_CANCEL')
    await user.click(screen.getByTestId('configured-add-cancel'))
    expect(within(canvasRoot()).queryAllByRole('button')).toHaveLength(beforeCount)

    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(screen.getByRole('button', { name: 'પાત્રતા ઘોષણા ઉમેરો' }))
    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('configured-add-dialog')).getByText('ઘોષણા ID'),
    ).toBeInTheDocument()
    await user.click(screen.getByTestId('configured-add-cancel'))
    expect(await axe(container)).toHaveNoViolations()
  }, 15_000)
})
