import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

function editorStatus(): HTMLElement {
  const el = document.querySelector('.dg20-builder-editor__status')
  if (!(el instanceof HTMLElement)) throw new Error('editor status missing')
  return el
}

describe('FB-D13 Builder UI — fee-field and signature-esign', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
  })

  it('configures Fee Field with invalid then valid feeRuleId and Apply', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Fee field' }))
    const feeRule = screen.getByTestId('configured-add-fee-rule-id')
    expect(feeRule).toHaveFocus()
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(screen.getByTestId('configured-add-fee-rule-id')).toHaveFocus())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(feeRule, 'service-fee-v1')
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(getCanvasRowByName(/fee field/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/fee field/i))
    const editor = screen.getByLabelText(/Fee rule ID/i)
    await user.clear(editor)
    await user.type(editor, 'service-fee-v2')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(editor).toHaveValue('service-fee-v2')
    expect(document.querySelector('.dg20-builder-editor__hint')?.textContent).toMatch(
      /FeeComputationAdapter|paise/i,
    )
    expect(previewRoot().textContent).toMatch(
      /Fee not available|waiting for form context|unavailable|અનુપલબ્ધ/i,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 15_000)

  it('adds Signature/eSign, toggles required, isolates bilingual drafts', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add eSign signature' }))
    expect(getCanvasRowByName(/esign signature/i)).toBeInTheDocument()
    await user.click(getCanvasRowByName(/esign signature/i))
    expect(document.querySelector('.dg20-builder-editor__hint')?.textContent).toMatch(
      /signed artefact reference/i,
    )
    await user.click(screen.getByLabelText('Required'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(screen.getByLabelText('Required')).toBeChecked()

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-signature_esign_1-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only EN')
    await user.click(getCanvasRowByName(/esign signature/i))
    await user.click(screen.getByLabelText('Required'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-bilingual-field-signature_esign_1-errorEn',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Only EN')
  })

  it('Steps remain operable; Gujarati fee guidance stays axe-clean', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Add Fee field' }))
    await user.type(screen.getByTestId('configured-add-fee-rule-id'), 'fee-1')
    await user.click(screen.getByTestId('configured-add-confirm'))
    await user.click(screen.getByRole('button', { name: 'Add eSign signature' }))
    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('heading', { name: /steps/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(screen.getByRole('button', { name: 'ફી ક્ષેત્ર ઉમેરો' }))
    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('configured-add-cancel'))
    expect(await axe(container)).toHaveNoViolations()
  })
})
