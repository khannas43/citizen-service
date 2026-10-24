import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('FB-D10 Builder UI — multiselect and cascading configured-add', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
  })

  it('configures multiselect with invalid then valid bounds', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const beforeCount = canvasRoot().querySelectorAll('[data-field-id]').length

    await user.click(screen.getByRole('button', { name: 'Add Multi-select' }))
    const master = screen.getByTestId('configured-add-master-list-id')
    expect(master).toHaveFocus()
    await user.type(master, 'status-list')
    await user.type(screen.getByTestId('configured-add-min-items'), '5')
    await user.type(screen.getByTestId('configured-add-max-items'), '2')
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(screen.getByTestId('configured-add-max-items')).toHaveFocus())
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(canvasRoot().querySelectorAll('[data-field-id]')).toHaveLength(beforeCount)

    await user.clear(screen.getByTestId('configured-add-max-items'))
    await user.type(screen.getByTestId('configured-add-max-items'), '6')
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(screen.queryByTestId('configured-add-dialog')).not.toBeInTheDocument()
    expect(getCanvasRowByName(/multi-select/i)).toBeInTheDocument()
  }, 15_000)

  it('wraps Tab across all multiselect configured-add controls', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Multi-select' }))
    const master = screen.getByTestId('configured-add-master-list-id')
    const minItems = screen.getByTestId('configured-add-min-items')
    const maxItems = screen.getByTestId('configured-add-max-items')
    const confirm = screen.getByTestId('configured-add-confirm')
    const cancel = screen.getByTestId('configured-add-cancel')
    expect(master).toHaveFocus()

    await user.tab()
    expect(minItems).toHaveFocus()
    await user.tab()
    expect(maxItems).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(master).toHaveFocus()

    await user.tab({ shift: true })
    expect(cancel).toHaveFocus()
  }, 15_000)

  it('wraps Tab across cascading parent/child controls', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Cascading dropdown' }))
    const parent = screen.getByTestId('configured-add-parent-master-list-id')
    const child = screen.getByTestId('configured-add-child-master-list-id')
    const confirm = screen.getByTestId('configured-add-confirm')
    const cancel = screen.getByTestId('configured-add-cancel')
    expect(parent).toHaveFocus()

    await user.tab()
    expect(child).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(parent).toHaveFocus()
  }, 15_000)

  it('Escape cancels cascading and restores palette focus', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Cascading dropdown' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('configured-add-dialog')).not.toBeInTheDocument()
    expect(
      document.querySelector('.dg20-builder-palette__item[data-widget-type="cascading-dropdown"]'),
    ).toHaveFocus()
  }, 15_000)

  it('adds cascading, edits list IDs, isolates bilingual drafts', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Cascading dropdown' }))
    await user.type(screen.getByTestId('configured-add-parent-master-list-id'), 'parent-list')
    await user.type(screen.getByTestId('configured-add-child-master-list-id'), 'child-list')
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(getCanvasRowByName(/cascading dropdown/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/cascading dropdown/i))
    const parent = screen.getByLabelText('Parent master list ID')
    await user.clear(parent)
    await user.type(parent, 'parent-list-v2')
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(screen.getByLabelText('Parent master list ID')).toHaveValue('parent-list-v2')

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-cascading_dropdown_1-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only EN')
    await user.click(getCanvasRowByName(/cascading dropdown/i))
    await user.click(screen.getByLabelText('Required'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-bilingual-field-cascading_dropdown_1-errorEn',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Only EN')
  }, 15_000)

  it('blocks Validate while multiselect configured-add is pending', async () => {
    const user = userEvent.setup()
    render(<BuilderShell persistenceAdapter={null} validationAdapter={null} />)
    await user.click(screen.getByRole('button', { name: 'Add Multi-select' }))
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    expect(screen.getByTestId('save-draft-button')).toBeDisabled()
  }, 15_000)

  it('preview with missing MasterDataAdapter does not crash or fetch for both widgets', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Multi-select' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), 'status-list')
    await user.click(screen.getByTestId('configured-add-confirm'))

    await user.click(screen.getByRole('button', { name: 'Add Cascading dropdown' }))
    await user.type(screen.getByTestId('configured-add-parent-master-list-id'), 'p-list')
    await user.type(screen.getByTestId('configured-add-child-master-list-id'), 'c-list')
    await user.click(screen.getByTestId('configured-add-confirm'))

    const preview = previewRoot()
    expect(preview.querySelector('[data-dg20-widget="multiselect"]')).not.toBeNull()
    expect(preview.querySelector('[data-dg20-widget="cascading-dropdown"]')).not.toBeNull()
    expect(preview.textContent).toMatch(/unavailable|અનુપલબ્ધ|Master-data|options/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSetSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    storageSetSpy.mockRestore()
  }, 15_000)

  it('locale switch preserves multiselect pending drafts and stays axe-clean', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Add Multi-select' }))
    const master = screen.getByTestId('configured-add-master-list-id')
    await user.type(master, 'keep-list')
    await user.type(screen.getByTestId('configured-add-min-items'), '1')
    fireEvent.click(document.querySelectorAll('.dg20-builder-locale-btn')[1]!)
    expect(screen.getByTestId('configured-add-master-list-id')).toHaveValue('keep-list')
    expect(screen.getByTestId('configured-add-min-items')).toHaveValue('1')
    expect(screen.getByLabelText(/માસ્ટર યાદી ID/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  }, 15_000)

  it('keeps Steps operable after adding multiselect (D5/D9 regression surface)', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Multi-select' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), 'ms-list')
    await user.click(screen.getByTestId('configured-add-confirm'))
    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('heading', { name: /steps/i })).toBeInTheDocument()
  }, 15_000)
})
