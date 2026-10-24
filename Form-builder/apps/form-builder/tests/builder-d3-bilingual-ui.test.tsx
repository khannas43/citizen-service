import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName, queryCanvasRowByName } from './canvas-test-utils.js'

function collectIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('[id]')).map((el) => el.id)
}

async function openBilingualTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
  expect(screen.getByRole('tabpanel', { name: 'Bilingual' })).toBeInTheDocument()
}

describe('FB-D3 Builder UI — Bilingual workspace', () => {
  it('shares Inspector label drafts with Bilingual and back', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(getCanvasRowByName(/Applicant full name/i))
    const inspectorLabel = screen.getByLabelText('Label (English)')
    await user.clear(inspectorLabel)
    await user.type(inspectorLabel, 'Inspector draft name')

    await openBilingualTab(user)
    const bilingualLabel = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-labelEn',
    ) as HTMLInputElement
    expect(bilingualLabel.value).toBe('Inspector draft name')

    await user.clear(bilingualLabel)
    await user.type(bilingualLabel, 'Bilingual draft name')

    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect((screen.getByLabelText('Label (English)') as HTMLInputElement).value).toBe(
      'Bilingual draft name',
    )
  })

  it('applies bilingual field copy to canvas/preview only after Apply; Cancel restores', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await openBilingualTab(user)

    const labelEn = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-labelEn',
    ) as HTMLInputElement
    await user.clear(labelEn)
    await user.type(labelEn, 'Applied bilingual name')

    expect(queryCanvasRowByName(/Applied bilingual name/i)).not.toBeInTheDocument()

    const card = document.querySelector('[data-bilingual-field="applicant_name"]')
    if (!(card instanceof HTMLElement)) throw new Error('field card missing')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(getCanvasRowByName(/Applied bilingual name/i)).toBeInTheDocument()
    })

    await user.clear(labelEn)
    await user.type(labelEn, 'Temp cancel name')
    await user.click(within(card).getByRole('button', { name: 'Cancel' }))
    expect(labelEn.value).toBe('Applied bilingual name')
  })

  it('blocks Apply when Gujarati label is incomplete and focuses the control', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await openBilingualTab(user)

    const labelGu = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-labelGu',
    ) as HTMLInputElement
    await user.clear(labelGu)

    const card = document.querySelector('[data-bilingual-field="applicant_name"]')
    if (!(card instanceof HTMLElement)) throw new Error('field card missing')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(within(card).getByRole('alert')).toBeInTheDocument()
    })
    expect(labelGu).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => {
      expect(document.activeElement).toBe(labelGu)
    })
    expect(getCanvasRowByName(/Applicant full name/i)).toBeInTheDocument()
  })

  it('applies progressive step labels used by canvas navigation chips', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await openBilingualTab(user)

    const stepLabel = document.getElementById(
      'dg20-builder-bilingual-step-identity-labelEn',
    ) as HTMLInputElement
    expect(stepLabel).toBeTruthy()
    await user.clear(stepLabel)
    await user.type(stepLabel, 'Identity workspace')
    expect(stepLabel.value).toBe('Identity workspace')

    const card = document.querySelector('[data-bilingual-step="identity"]')
    if (!(card instanceof HTMLElement)) throw new Error('step card missing')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(document.querySelector('[role="status"]')?.textContent).toMatch(
        /Changes applied for Identity workspace/i,
      )
    })

    await waitFor(() => {
      const chips = Array.from(document.querySelectorAll('.dg20-builder-step-chip')).map(
        (el) => el.textContent ?? '',
      )
      expect(chips.some((text) => text.includes('Identity workspace'))).toBe(true)
    })
  })

  it('preserves bilingual drafts across Builder locale switching', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await openBilingualTab(user)

    const labelEn = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-labelEn',
    ) as HTMLInputElement
    await user.clear(labelEn)
    await user.type(labelEn, 'Locale preserved draft')

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(labelEn.value).toBe('Locale preserved draft')
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(labelEn.value).toBe('Locale preserved draft')
  })

  it('supports ArrowLeft/ArrowRight/Home/End tab keyboard navigation with focus follow', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(screen.getByRole('tab', { name: 'Bilingual' })).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Steps' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Steps' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Bindings' })).toHaveFocus()

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Steps' })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Bilingual' })).toHaveFocus()
  })

  it('is axe-clean in EN and GU on the bilingual panel with unique IDs', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await openBilingualTab(user)

    const ids = collectIds(container)
    expect(new Set(ids).size).toBe(ids.length)

    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('announces repeated Apply outcomes via remounted live region', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await openBilingualTab(user)

    const card = document.querySelector('[data-bilingual-field="applicant_name"]')
    if (!(card instanceof HTMLElement)) throw new Error('field card missing')
    const labelEn = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-labelEn',
    ) as HTMLInputElement

    await user.clear(labelEn)
    await user.type(labelEn, 'Announce one')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))
    const first = document.querySelector('[data-announcement-id]')
    const firstId = first?.getAttribute('data-announcement-id')

    await user.clear(labelEn)
    await user.type(labelEn, 'Announce two')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      const second = document.querySelector('[data-announcement-id]')
      expect(second?.getAttribute('data-announcement-id')).not.toBe(firstId)
    })
  })
})
