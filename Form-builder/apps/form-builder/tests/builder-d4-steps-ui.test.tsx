import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'

function collectIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('[id]')).map((el) => el.id)
}

async function openStepsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Steps' }))
  expect(screen.getByRole('tabpanel', { name: 'Steps' })).toBeInTheDocument()
}

describe('FB-D4 Builder UI — Steps workspace', () => {
  it('shows progressive steps and can split, move, and merge boundaries', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await openStepsTab(user)

    expect(screen.getByRole('heading', { name: 'Progressive steps' })).toBeInTheDocument()
    expect(screen.getByText(/2 steps · 7 fields/)).toBeInTheDocument()

    const splitButtons = screen.getAllByRole('button', {
      name: /Start new step after/i,
    })
    expect(splitButtons.length).toBeGreaterThan(0)
    await user.click(splitButtons[0]!)

    await waitFor(() => {
      expect(screen.getByText(/3 steps · 7 fields/)).toBeInTheDocument()
    })

    const moveLater = screen.getAllByRole('button', { name: /Move boundary later/i })[0]!
    await user.click(moveLater)

    const merge = screen.getAllByRole('button', { name: /Merge step/i })[0]!
    await user.click(merge)

    await waitFor(() => {
      expect(screen.getByText(/2 steps · 7 fields/)).toBeInTheDocument()
    })
  })

  it('blocks merge when removed step has dirty bilingual draft, then succeeds after Cancel', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const stepCards = document.querySelectorAll('[data-bilingual-step]')
    expect(stepCards.length).toBeGreaterThanOrEqual(2)
    const secondStepId = stepCards[1]!.getAttribute('data-bilingual-step')
    expect(secondStepId).toBeTruthy()

    const labelEn = document.getElementById(
      `dg20-builder-bilingual-step-${secondStepId}-labelEn`,
    ) as HTMLInputElement
    await user.clear(labelEn)
    await user.type(labelEn, 'Dirty step label')

    await openStepsTab(user)
    const mergeButtons = screen.getAllByRole('button', { name: /Merge step/i })
    const blockedMerge = mergeButtons[0]!
    expect(blockedMerge).toBeDisabled()
    expect(screen.getByText(/Apply or cancel unsaved step-label changes/i)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    const card = document.querySelector(`[data-bilingual-step="${secondStepId}"]`)
    if (!(card instanceof HTMLElement)) throw new Error('step card missing')
    await user.click(within(card).getByRole('button', { name: 'Cancel' }))

    await openStepsTab(user)
    const enabledMerge = screen.getAllByRole('button', { name: /Merge step/i })[0]!
    expect(enabledMerge).not.toBeDisabled()
    await user.click(enabledMerge)

    await waitFor(() => {
      expect(screen.getByText(/1 step · 7 fields/)).toBeInTheDocument()
    })
  })

  it('links Edit labels to Bilingual and focuses the step control', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await openStepsTab(user)

    await user.click(screen.getAllByRole('button', { name: /Edit labels for step/i })[0]!)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Bilingual' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
    await waitFor(() => {
      const focused = document.activeElement
      expect(focused?.id).toMatch(/dg20-builder-bilingual-step-.*-labelEn/)
    })
  })

  it('is axe-clean in EN and GU with unique IDs', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await openStepsTab(user)

    const ids = collectIds(container)
    expect(new Set(ids).size).toBe(ids.length)

    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('supports keyboard-only activation of Steps tab and split control', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    const stepsTab = screen.getByRole('tab', { name: 'Steps' })
    stepsTab.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tabpanel', { name: 'Steps' })).toBeInTheDocument()

    const split = screen.getAllByRole('button', { name: /Start new step after/i })[0]!
    split.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(screen.getByText(/3 steps · 7 fields/)).toBeInTheDocument()
    })
  })
})
