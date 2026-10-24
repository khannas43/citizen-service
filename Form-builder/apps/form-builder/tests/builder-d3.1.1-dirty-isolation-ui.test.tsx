import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

function canvasRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-canvas')
  if (!(el instanceof HTMLElement)) {
    throw new Error('canvas root missing')
  }
  return el
}

function editorStatus(): HTMLElement {
  const el = document.querySelector('.dg20-builder-editor__status')
  if (!(el instanceof HTMLElement)) {
    throw new Error('editor status missing')
  }
  return el
}

describe('FB-D3.1.1 Builder UI — dirty-state isolation', () => {
  it('Property becomes clean after Apply while Bilingual error draft remains dirty', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only English error')

    await user.click(getCanvasRowByName(/Applicant full name/i))
    const maxLength = screen.getByLabelText('Maximum length')
    await user.clear(maxLength)
    await user.type(maxLength, '77')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => {
      expect(within(editorStatus()).getByText('No unsaved changes')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled()
    expect(
      screen.getByText('This field has unsaved changes in the Bilingual tab.'),
    ).toBeInTheDocument()
    expect(within(canvasRoot()).getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const card = document.querySelector('[data-bilingual-field="applicant_name"]')
    if (!(card instanceof HTMLElement)) throw new Error('field card missing')
    expect(within(card).getByText('Dirty')).toBeInTheDocument()
    expect(within(card).getByText('Incomplete')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Apply' })).toBeEnabled()

    const errorGu = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-errorGu',
    ) as HTMLTextAreaElement
    await user.type(errorGu, 'ગુજરાતી ભૂલ')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(within(card).queryByText('Dirty')).not.toBeInTheDocument()
    })
    expect(within(card).getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('constraint-only draft does not enable Bilingual Apply', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(getCanvasRowByName(/Applicant full name/i))
    const maxLength = screen.getByLabelText('Maximum length')
    await user.clear(maxLength)
    await user.type(maxLength, '55')
    expect(within(editorStatus()).getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled()

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const card = document.querySelector('[data-bilingual-field="applicant_name"]')
    if (!(card instanceof HTMLElement)) throw new Error('field card missing')
    expect(within(card).queryByText('Dirty')).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(within(card).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(canvasRoot()).getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('localizes bilingual-pending guidance in GU and stays axe-clean', async () => {
    const user = userEvent.setup()
    const { container } = render(<BuilderShell />)

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    await user.type(
      document.getElementById(
        'dg20-builder-bilingual-field-applicant_name-errorEn',
      ) as HTMLTextAreaElement,
      'Only EN',
    )
    await user.click(getCanvasRowByName(/Applicant full name/i))
    await user.click(screen.getByRole('button', { name: 'GU', exact: true }))
    expect(
      screen.getByText('આ ક્ષેત્રમાં દ્વિભાષી ટૅબમાં ન સાચવેલા ફેરફારો છે.'),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})
