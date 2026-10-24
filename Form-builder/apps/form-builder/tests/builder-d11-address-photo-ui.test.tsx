import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
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

describe('FB-D11 Builder UI — address-block and photo-capture', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
  })

  it('adds Address Block, edits defaultStateCode, isolates bilingual drafts', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Address block' }))
    expect(getCanvasRowByName(/address block/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/address block/i))
    const defaultState = screen.getByLabelText(/Default state code/i)
    await user.type(defaultState, 'GJ')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(screen.getByLabelText(/Default state code/i)).toHaveValue('GJ')

    await user.clear(screen.getByLabelText(/Default state code/i))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(screen.getByLabelText(/Default state code/i)).toHaveValue('')

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-address_block_1-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only EN')
    await user.click(getCanvasRowByName(/address block/i))
    await user.click(screen.getByLabelText('Required'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-bilingual-field-address_block_1-errorEn',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Only EN')
  }, 15_000)

  it('adds Photo Capture with locked policy copy and no fetch/storage', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Photo capture' }))
    expect(getCanvasRowByName(/photo capture/i)).toBeInTheDocument()
    await user.click(getCanvasRowByName(/photo capture/i))
    expect(screen.getByText(/CLEAN object-store reference/i)).toBeInTheDocument()
    expect(screen.getByText(/provisional/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/mime/i)).not.toBeInTheDocument()

    const preview = previewRoot()
    expect(preview.querySelector('[data-dg20-widget="photo-capture"]')).not.toBeNull()
    expect(preview.textContent).toMatch(/unavailable|અનુપલબ્ધ|photo|storage/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSetSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    storageSetSpy.mockRestore()
  })

  it('preview shows address unavailable without GeographyAdapter', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Address block' }))
    const preview = previewRoot()
    expect(preview.querySelector('[data-dg20-widget="address-block"]')).not.toBeNull()
    expect(preview.textContent).toMatch(/unavailable|અનુપલબ્ધ|address|geography/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('localizes photo policy in Gujarati and stays axe-clean', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Add Photo capture' }))
    await user.click(getCanvasRowByName(/photo capture|ફોટો/i))
    await user.click(document.querySelectorAll('.dg20-builder-locale-btn')[1]!)
    expect(screen.getByText(/CLEAN|JPEG|PNG|5 MiB|300/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Steps remain operable after adding address and photo', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Address block' }))
    await user.click(screen.getByRole('button', { name: 'Add Photo capture' }))
    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('heading', { name: /steps/i })).toBeInTheDocument()
  })
})
