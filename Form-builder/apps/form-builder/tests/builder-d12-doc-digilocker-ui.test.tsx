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

describe('FB-D12 Builder UI — doc-upload and digilocker-fetch', () => {
  it('reports 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
  })

  it('configures Document Upload with invalid then valid MIME/size', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<BuilderShell />)
    const beforeCount = canvasRoot().querySelectorAll('[data-field-id]').length

    await user.click(screen.getByRole('button', { name: 'Add Document upload' }))
    const mime = screen.getByTestId('configured-add-allowed-mime-types')
    expect(mime).toHaveFocus()
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() =>
      expect(screen.getByTestId('configured-add-allowed-mime-types')).toHaveFocus(),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(canvasRoot().querySelectorAll('[data-field-id]')).toHaveLength(beforeCount)

    await user.type(mime, 'application/pdf')
    await user.type(screen.getByTestId('configured-add-max-file-size-bytes'), '1048576')
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(screen.queryByTestId('configured-add-dialog')).not.toBeInTheDocument()
    expect(getCanvasRowByName(/document upload/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/document upload/i))
    const mimeEditor = screen.getByLabelText(/Allowed MIME types/i)
    await user.clear(mimeEditor)
    await user.type(mimeEditor, 'application/pdf{Enter}image/png')
    await user.clear(screen.getByLabelText(/Maximum file size/i))
    await user.type(screen.getByLabelText(/Maximum file size/i), '2097152')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(screen.getByLabelText(/Maximum file size/i)).toHaveValue('2097152')

    expect(previewRoot().textContent).toMatch(/temporarily unavailable/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 15_000)

  it('configures DigiLocker Fetch with invalid then valid document type', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add DigiLocker fetch' }))
    const code = screen.getByTestId('configured-add-digilocker-document-type-code')
    expect(code).toHaveFocus()
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() =>
      expect(screen.getByTestId('configured-add-digilocker-document-type-code')).toHaveFocus(),
    )

    await user.type(code, 'AADHAAR')
    await user.click(screen.getByTestId('configured-add-confirm'))
    expect(getCanvasRowByName(/digilocker fetch/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/digilocker fetch/i))
    const codeEditor = screen.getByLabelText(/DigiLocker document type code/i)
    await user.clear(codeEditor)
    await user.type(codeEditor, 'PAN')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(codeEditor).toHaveValue('PAN')
    expect(previewRoot().textContent).toMatch(/temporarily unavailable/i)
  })

  it('isolates Property and Bilingual drafts and keeps Steps usable', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Document upload' }))
    await user.type(screen.getByTestId('configured-add-allowed-mime-types'), 'application/pdf')
    await user.type(screen.getByTestId('configured-add-max-file-size-bytes'), '1048576')
    await user.click(screen.getByTestId('configured-add-confirm'))

    await user.click(getCanvasRowByName(/document upload/i))
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-doc_upload_1-errorEn',
    ) as HTMLTextAreaElement
    await user.type(errorEn, 'Only EN')
    await user.click(getCanvasRowByName(/document upload/i))
    await user.click(screen.getByLabelText('Required'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-bilingual-field-doc_upload_1-errorEn',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Only EN')

    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('heading', { name: /steps/i })).toBeInTheDocument()
  })

  it('localizes guidance in Gujarati and stays axe-clean', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(screen.getByRole('button', { name: /દસ્તાવેજ અપલોડ/i }))
    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('configured-add-allowed-mime-types')).toBeInTheDocument()
    await user.click(screen.getByTestId('configured-add-cancel'))
    expect(await axe(container)).toHaveNoViolations()
  })
})
