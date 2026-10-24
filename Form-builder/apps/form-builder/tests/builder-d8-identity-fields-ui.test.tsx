import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

function previewRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-preview')
  if (!(el instanceof HTMLElement)) {
    throw new Error('preview root missing')
  }
  return el
}

function editorStatus(): HTMLElement {
  const el = document.querySelector('.dg20-builder-editor__status')
  if (!(el instanceof HTMLElement)) {
    throw new Error('editor status region missing')
  }
  return el
}

describe('FB-D8 Builder UI — identity fields', () => {
  it('enables Aadhaar, Mobile OTP, and Bank account palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)

    for (const name of ['Add Aadhaar', 'Add Mobile with OTP', 'Add Bank account']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeEnabled()
      expect(within(button).queryByText(/pending/i)).not.toBeInTheDocument()
    }
  })

  it('adds identity widgets and isolates Property Apply from Bilingual error drafts', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Aadhaar' }))
    await user.click(screen.getByRole('button', { name: 'Add Mobile with OTP' }))
    await user.click(screen.getByRole('button', { name: 'Add Bank account' }))

    expect(getCanvasRowByName(/^aadhaar/i)).toBeInTheDocument()
    expect(getCanvasRowByName(/^mobile with otp/i)).toBeInTheDocument()
    expect(getCanvasRowByName(/^bank account/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/^mobile with otp/i))
    expect(screen.getByText(/SMS only in v1/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const errorEn = document.getElementById(
      'dg20-builder-bilingual-field-mobile_otp_1-errorEn',
    ) as HTMLTextAreaElement
    expect(errorEn).toBeTruthy()
    await user.type(errorEn, 'Only EN')

    await user.click(getCanvasRowByName(/^mobile with otp/i))
    await user.click(screen.getByLabelText('Required'))
    expect(editorStatus()).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(
      (
        document.getElementById(
          'dg20-builder-bilingual-field-mobile_otp_1-errorEn',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Only EN')
  }, 15_000)

  it('preview with missing adapters does not crash and stays bilingual', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Aadhaar' }))
    await user.click(screen.getByRole('button', { name: 'Add Mobile with OTP' }))
    await user.click(screen.getByRole('button', { name: 'Add Bank account' }))

    const preview = within(previewRoot())
    expect(preview.getByText(/Aadhaar|આધાર/i)).toBeInTheDocument()
    expect(previewRoot().textContent).toMatch(/unavailable|અનુપલબ્ધ|OTP|મોબાઇલ|Bank|બેંક/i)

    const previewHtml = previewRoot().innerHTML
    expect(previewHtml).not.toMatch(/challengeId|rawAadhaar|If-Match/i)
    expect(previewHtml).not.toMatch(/\bETag\b/)
    // Governed unavailable copy is allowed; no synthetic tokens/OTP values.
    expect(previewHtml).not.toMatch(/tok_[a-z0-9]+|challenge-[a-z0-9]+/i)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('localizes SMS-only hint in Gujarati', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Mobile with OTP' }))
    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(getCanvasRowByName(/મોબાઇલ|OTP/i))
    expect(screen.getByText(/ફક્ત SMS/i)).toBeInTheDocument()
  })

  it('has no axe violations with identity fields selected', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Add Aadhaar' }))
    await user.click(screen.getByRole('button', { name: 'Add Mobile with OTP' }))
    await user.click(getCanvasRowByName(/^mobile with otp/i))

    expect(await axe(container)).toHaveNoViolations()
  })
})
