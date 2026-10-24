import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

describe('FB-D9 Builder UI — configured-add master-list widgets', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
  })

  it('opens configured-add without definition mutation; Cancel restores palette focus', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const beforeCount = canvasRoot().querySelectorAll('[data-field-id]').length

    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    const dialog = screen.getByTestId('configured-add-dialog')
    expect(dialog).toBeInTheDocument()
    expect(canvasRoot().querySelectorAll('[data-field-id]')).toHaveLength(beforeCount)

    await user.click(screen.getByTestId('configured-add-cancel'))
    expect(screen.queryByTestId('configured-add-dialog')).not.toBeInTheDocument()
    expect(canvasRoot().querySelectorAll('[data-field-id]')).toHaveLength(beforeCount)
    expect(
      document.querySelector('.dg20-builder-palette__item[data-widget-type="dropdown-master"]'),
    ).toHaveFocus()
  })

  it('invalid Confirm focuses masterListId and keeps definition unchanged', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const beforeCount = canvasRoot().querySelectorAll('[data-field-id]').length

    await user.click(screen.getByRole('button', { name: 'Add Radio group' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), ' padded ')
    await user.click(screen.getByTestId('configured-add-confirm'))

    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('configured-add-master-list-id')).toHaveFocus())
    expect(screen.getByRole('alert')).toHaveTextContent(/Master list ID/i)
    expect(canvasRoot().querySelectorAll('[data-field-id]')).toHaveLength(beforeCount)
  })

  it('adds dropdown and radio, edits masterListId, isolates bilingual drafts', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), 'status-list')
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(getCanvasRowByName(/master-data dropdown/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Radio group' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), 'choice-list')
    await user.click(screen.getByTestId('configured-add-confirm'))

    await user.click(getCanvasRowByName(/radio group/i))
    const masterListId = screen.getByLabelText('Master list ID')
    await user.clear(masterListId)
    await user.type(masterListId, 'choice-list-v2')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-radio_1-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only EN')
    await user.click(getCanvasRowByName(/radio group/i))
    await user.click(screen.getByLabelText('Required'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-bilingual-field-radio_1-errorEn',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Only EN')
  }, 15_000)

  it('blocks Validate while configured-add is pending', async () => {
    const user = userEvent.setup()
    render(<BuilderShell persistenceAdapter={null} validationAdapter={null} />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    expect(screen.getByTestId('save-draft-button')).toBeDisabled()
  })

  it('preview with missing MasterDataAdapter does not crash or fetch', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), 'status-list')
    await user.click(screen.getByTestId('configured-add-confirm'))

    const preview = previewRoot()
    expect(preview.querySelector('[data-dg20-widget="dropdown-master"]')).not.toBeNull()
    expect(preview.textContent).toMatch(/unavailable|અનુપલબ્ધ|Master-data|options/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('localizes configured-add copy in Gujarati and stays axe-clean', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(document.querySelectorAll('.dg20-builder-locale-btn')[1]!)
    await user.click(
      document.querySelector(
        '.dg20-builder-palette__item[data-widget-type="dropdown-master"]',
      ) as HTMLElement,
    )
    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/માસ્ટર યાદી ID/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})
