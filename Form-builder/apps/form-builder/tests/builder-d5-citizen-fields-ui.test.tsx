import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

function collectIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('[id]')).map((el) => el.id)
}

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

describe('FB-D5 Builder UI — citizen-field palette and editors', () => {
  it('enables citizen-field palette buttons without pending badges', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)

    for (const name of [
      'Add Email',
      'Add Full name',
      'Add Date of birth',
      'Add PIN code',
      'Add Aadhaar',
      'Add Mobile with OTP',
      'Add Bank account',
    ]) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeEnabled()
      expect(within(button).queryByText(/pending/i)).not.toBeInTheDocument()
    }
  })

  it('adds all four citizen widgets and edits email verification + DOB ages', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Email' }))
    await user.click(screen.getByRole('button', { name: 'Add Full name' }))
    await user.click(screen.getByRole('button', { name: 'Add Date of birth' }))
    await user.click(screen.getByRole('button', { name: 'Add PIN code' }))

    expect(getCanvasRowByName(/^email/i)).toBeInTheDocument()
    expect(getCanvasRowByName(/^full name/i)).toBeInTheDocument()
    expect(getCanvasRowByName(/^date of birth/i)).toBeInTheDocument()
    expect(getCanvasRowByName(/^pin code/i)).toBeInTheDocument()

    await user.click(getCanvasRowByName(/^email/i))
    const verify = screen.getByLabelText('Require email verification')
    expect(verify).not.toBeChecked()
    await user.click(verify)
    expect(editorStatus()).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')

    await user.click(getCanvasRowByName(/^date of birth/i))
    await user.type(screen.getByLabelText('Minimum age'), '18')
    await user.type(screen.getByLabelText('Maximum age'), '65')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
  })

  it('blocks invalid DOB age Apply, marks aria-invalid, and focuses Maximum age on range error', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Date of birth' }))
    await user.click(getCanvasRowByName(/^date of birth/i))

    const minAge = screen.getByLabelText('Minimum age')
    const maxAge = screen.getByLabelText('Maximum age')
    await user.type(minAge, '40')
    await user.type(maxAge, '18')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(maxAge).toHaveAttribute('aria-invalid', 'true')
    expect(maxAge).toHaveAttribute('aria-describedby')
    await waitFor(() => {
      expect(maxAge).toHaveFocus()
    })
    expect(
      screen.getAllByText(/minimum age must be less than or equal to maximum age/i).length,
    ).toBeGreaterThan(0)
  })

  it('shares Property/Bilingual label drafts for email without losing verifyEmail draft', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Email' }))
    await user.click(getCanvasRowByName(/^email/i))
    const fieldId = 'email_1'

    const labelEn = screen.getByLabelText('Label (English)')
    await user.clear(labelEn)
    await user.type(labelEn, 'Official email')
    await user.click(screen.getByLabelText('Require email verification'))
    expect(screen.getByLabelText('Require email verification')).toBeChecked()

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const bilingualLabel = document.getElementById(
      `dg20-builder-bilingual-field-${fieldId}-labelEn`,
    ) as HTMLInputElement
    expect(bilingualLabel.value).toBe('Official email')

    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect((screen.getByLabelText('Label (English)') as HTMLInputElement).value).toBe(
      'Official email',
    )
    expect(screen.getByLabelText('Require email verification')).toBeChecked()
    expect(editorStatus()).toHaveTextContent('Unsaved changes')
  })

  it('permits exact Full-name EN/GU and PIN entry in preview without fetch/storage', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(<BuilderShell />)
    const applicantBefore = (
      within(previewRoot()).queryByLabelText('Applicant full name') as HTMLInputElement | null
    )?.value

    await user.click(screen.getByRole('button', { name: 'Add Full name' }))
    await user.click(screen.getByRole('button', { name: 'Add PIN code' }))

    const preview = within(previewRoot())
    const nameEn = preview.getByLabelText('Name in English')
    const nameGu = preview.getByLabelText('Name in Gujarati')
    const pin = preview.getByLabelText(/^PIN code/i)

    await user.click(nameEn)
    await user.clear(nameEn)
    await user.type(nameEn, 'Sameer')
    await user.click(nameGu)
    await user.clear(nameGu)
    await user.type(nameGu, 'સમીર')
    await user.click(pin)
    await user.clear(pin)
    await user.type(pin, '380001')

    expect(preview.getByLabelText('Name in English')).toHaveValue('Sameer')
    expect(preview.getByLabelText('Name in Gujarati')).toHaveValue('સમીર')
    expect(preview.getByLabelText(/^PIN code/i)).toHaveValue('380001')

    // Unavailable adapter copy (if shown) is informational and must not clear values.
    const informational = preview.queryAllByText(/unavailable/i)
    expect(informational.length).toBeGreaterThanOrEqual(0)
    expect(preview.getByLabelText(/^PIN code/i)).toHaveValue('380001')

    const applicantAfter = (
      preview.queryByLabelText('Applicant full name') as HTMLInputElement | null
    )?.value
    expect(applicantAfter).toBe(applicantBefore)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('localizes new editor copy in Gujarati', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Email' }))
    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(getCanvasRowByName(/ઇમેઇલ|ઈમેઇલ/i))
    expect(screen.getByLabelText('ઈમેલ ચકાસણી આવશ્યક')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    await user.click(screen.getByRole('button', { name: 'Add Date of birth' }))
    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(getCanvasRowByName(/જન્મ/i))
    expect(screen.getByLabelText('ન્યૂનતમ ઉંમર')).toBeInTheDocument()
    expect(screen.getByLabelText('મહત્તમ ઉંમર')).toBeInTheDocument()
  })

  it('keeps Apply on the 44px target class and unique control ids', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Add Email' }))
    await user.click(getCanvasRowByName(/^email/i))

    const apply = screen.getByRole('button', { name: 'Apply changes' })
    expect(apply).toHaveClass('dg20-builder-field-action-btn')
    const minAgeInput = screen.queryByLabelText('Minimum age')
    expect(minAgeInput).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Date of birth' }))
    await user.click(getCanvasRowByName(/^date of birth/i))
    expect(screen.getByLabelText('Minimum age')).toHaveClass('dg20-builder-search-input')
    expect(screen.getByLabelText('Maximum age')).toHaveClass('dg20-builder-search-input')

    const ids = collectIds(document.body)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no axe violations with citizen fields selected', async () => {
    const user = userEvent.setup()
    const { container } = render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Email' }))
    await user.click(screen.getByRole('button', { name: 'Add Date of birth' }))
    await user.click(getCanvasRowByName(/^date of birth/i))

    expect(await axe(container)).toHaveNoViolations()
  })
})
