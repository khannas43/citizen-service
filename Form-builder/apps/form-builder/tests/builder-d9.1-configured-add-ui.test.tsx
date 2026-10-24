import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { hasAnyUnsavedAuthoringDraft } from '../src/validation/index.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'
import { getCanvasRowByName } from './canvas-test-utils.js'

describe('FB-D9.1 — configured-add keyboard focus and modal containment', () => {
  it('types the complete masterListId without losing input focus', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    const input = screen.getByTestId('configured-add-master-list-id')
    expect(input).toHaveFocus()

    for (const ch of 'status-list') {
      await user.keyboard(ch)
      expect(input).toHaveFocus()
    }
    expect(input).toHaveValue('status-list')
    expect(input).toHaveFocus()
  })

  it('keeps focus on the input after the first character patch', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Radio group' }))
    const input = screen.getByTestId('configured-add-master-list-id')
    await user.keyboard('a')
    expect(input).toHaveFocus()
    expect(input).toHaveValue('a')
  })

  it('refocuses masterListId on invalid Confirm, including repeats', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Radio group' }))
    const input = screen.getByTestId('configured-add-master-list-id')
    await user.type(input, ' padded ')
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(input).toHaveFocus())
    await user.click(screen.getByTestId('configured-add-confirm'))
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('wraps Tab and Shift+Tab within the dialog', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    const input = screen.getByTestId('configured-add-master-list-id')
    const confirm = screen.getByTestId('configured-add-confirm')
    const cancel = screen.getByTestId('configured-add-cancel')
    expect(input).toHaveFocus()

    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(input).toHaveFocus()

    await user.tab({ shift: true })
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.tab({ shift: true })
    expect(input).toHaveFocus()
  })

  it('keeps background palette / Open Draft / Validate / Save out of the tab order', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    const shell = document.querySelector('.dg20-builder-shell-content')
    expect(shell).toHaveAttribute('inert')

    for (let i = 0; i < 12; i += 1) {
      await user.tab()
      const active = document.activeElement
      expect(active).not.toBeNull()
      expect(screen.getByTestId('configured-add-dialog').contains(active as Node)).toBe(true)
    }
  })

  it('Escape cancels exactly once and restores palette focus', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    expect(screen.getByTestId('configured-add-dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('configured-add-dialog')).not.toBeInTheDocument()
    expect(
      document.querySelector('.dg20-builder-palette__item[data-widget-type="dropdown-master"]'),
    ).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('configured-add-dialog')).not.toBeInTheDocument()
  })

  it('Cancel restores initiating palette focus', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Radio group' }))
    await user.click(screen.getByTestId('configured-add-cancel'))
    expect(
      document.querySelector('.dg20-builder-palette__item[data-widget-type="radio"]'),
    ).toHaveFocus()
  })

  it('Confirm focuses the created canvas field', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), 'status-list')
    await user.click(screen.getByTestId('configured-add-confirm'))
    const field = getCanvasRowByName(/master-data dropdown/i)
    await waitFor(() => expect(field).toHaveFocus())
  })

  it('second beginConfiguredAdd preserves the first draft in the UI', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    await user.type(screen.getByTestId('configured-add-master-list-id'), 'keep-me')
    // Background palette is inert — use fireEvent to simulate a blocked-path dispatch via shell.
    fireEvent.click(screen.getByRole('button', { name: 'Add Radio group' }))
    expect(screen.getByTestId('configured-add-master-list-id')).toHaveValue('keep-me')
    expect(screen.getByTestId('configured-add-dialog')).toHaveTextContent(/Master-data dropdown/i)
  })

  it('session unmount clears modal containment without listener leaks', async () => {
    const user = userEvent.setup()
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    const keydownAdds = addSpy.mock.calls.filter(
      (call) => call[0] === 'keydown' && call[2] === true,
    ).length
    unmount()
    const keydownRemoves = removeSpy.mock.calls.filter(
      (call) => call[0] === 'keydown' && call[2] === true,
    ).length
    expect(keydownRemoves).toBeGreaterThanOrEqual(keydownAdds)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('multiple BuilderShell instances use unique dialog/input IDs', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <>
        <div data-testid="shell-a">
          <BuilderShell />
        </div>
        <div data-testid="shell-b">
          <BuilderShell />
        </div>
      </>,
    )
    const shells = within(container)
    const addButtons = shells.getAllByRole('button', { name: 'Add Master-data dropdown' })
    await user.click(addButtons[0]!)
    await user.click(addButtons[1]!)
    const inputs = screen.getAllByTestId('configured-add-master-list-id')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id)
    expect(inputs[0]!.id.length).toBeGreaterThan(0)
  })

  it('locale rerender preserves typed value and input focus', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Master-data dropdown' }))
    const input = screen.getByTestId('configured-add-master-list-id')
    await user.type(input, 'status-list')
    expect(input).toHaveFocus()
    // Locale controls are behind inert; fireEvent still exercises the re-render path.
    fireEvent.click(document.querySelectorAll('.dg20-builder-locale-btn')[1]!)
    const after = screen.getByTestId('configured-add-master-list-id')
    expect(after).toHaveValue('status-list')
    expect(after).toHaveFocus()
  })

  it('EN/GU configured-add remains axe-clean under StrictMode', async () => {
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
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('FB-D9.1 — pending configured-add remains unsaved for Open Draft', () => {
  it('hasAnyUnsavedAuthoringDraft is true while pending', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'radio' })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
  })

  it('immediate add remains blocked while pending', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'dropdown-master' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'keep-me' },
    })
    const before = structuredClone(ui.authoring.definition)
    const pendingBefore = structuredClone(ui.pendingConfiguredAdd)
    ui = authoringReducer(ui, { type: 'add', widgetType: 'text-short' })
    expect(ui.authoring.definition).toEqual(before)
    expect(ui.pendingConfiguredAdd).toEqual(pendingBefore)
    expect(ui.announcement?.key).toBe('announceConfiguredAddBlocked')
  })
})
