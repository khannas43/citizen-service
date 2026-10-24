import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

describe('FB-D3.1 Builder UI — cross-editor isolation', () => {
  it('one-sided Bilingual error does not block Property maxLength Apply; focus stays valid', async () => {
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
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(maxLength).toHaveValue('77')

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(errorEn.value).toBe('Only English error')

    const card = document.querySelector('[data-bilingual-field="applicant_name"]')
    if (!(card instanceof HTMLElement)) throw new Error('field card missing')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(within(card).getByRole('alert')).toBeInTheDocument()
    })
    const errorGu = document.getElementById(
      'dg20-builder-bilingual-field-applicant_name-errorGu',
    ) as HTMLTextAreaElement
    expect(errorGu).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => {
      expect(document.activeElement).toBe(errorGu)
    })

    await user.type(errorGu, 'ગુજરાતી ભૂલ')
    await user.click(within(card).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(within(card).queryByRole('alert')).not.toBeInTheDocument()
    })
  }, 15_000)

  it('localizes tablist and locale group accessible names in GU', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    expect(screen.getByRole('tablist', { name: 'Builder tabs' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Builder locale' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'GU', exact: true }))
    expect(screen.getByRole('tablist', { name: 'બિલ્ડર ટૅબ્સ' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'બિલ્ડર ભાષા' })).toBeInTheDocument()
    expect(await axe(document.body)).toHaveNoViolations()
  })
})
