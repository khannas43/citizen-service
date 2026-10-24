import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import { createAuthoringSession } from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { formatStrongEtagForTests } from '../src/persistence/index.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'
import type { FormDefinitionDraftPersistenceAdapter } from '../src/persistence/index.js'
import type { FormDefinitionValidationAdapter } from '../src/validation/index.js'

function canvasRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-canvas')
  if (!(el instanceof HTMLElement)) throw new Error('canvas root missing')
  return el
}

function canvasRows(): HTMLElement[] {
  return Array.from(canvasRoot().querySelectorAll<HTMLElement>('.dg20-builder-canvas__row'))
}

function announcer(): HTMLElement | null {
  return document.querySelector('[aria-atomic="true"][data-announcement-id]')
}

function persistenceAdapter(): FormDefinitionDraftPersistenceAdapter {
  return {
    createDraft: async ({ definition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(1),
    }),
    replaceDraft: async ({ definition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(2),
    }),
    loadDraft: async () => ({
      definition: createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
      etag: formatStrongEtagForTests(1),
    }),
  }
}

function validationAdapter(): FormDefinitionValidationAdapter {
  return { validateDefinition: async () => ({ valid: true, issues: [] }) }
}

describe('FB-D20 Builder UI — canvas reorder', () => {
  it('exposes sibling reorder handles without nesting interactive controls', () => {
    render(<BuilderShell />)
    const items = canvasRoot().querySelectorAll('.dg20-builder-canvas__item')
    expect(items.length).toBeGreaterThan(1)
    for (const item of items) {
      const row = item.querySelector(':scope > .dg20-builder-canvas__row')
      const handle = item.querySelector(':scope > .dg20-builder-canvas__reorder-handle')
      expect(row).not.toBeNull()
      expect(handle).not.toBeNull()
      expect(row?.querySelector('button')).toBeNull()
    }
    expect(screen.getByText(/On narrow screens, use Move up and Move down/i)).toBeInTheDocument()
  })

  it('keyboard lift → End → drop reorders within the selected step', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    const rows = canvasRows()
    const firstId = rows[0]!.getAttribute('data-field-id')!
    const secondId = rows[1]!.getAttribute('data-field-id')!
    const handle = screen.getByTestId(
      `canvas-reorder-handle-${firstId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`,
    )
    handle.focus()
    await user.keyboard(' ')
    expect(handle).toHaveAttribute('aria-pressed', 'true')
    expect(announcer()?.textContent).toMatch(/Lifted/i)
    await user.keyboard('{End}')
    expect(screen.getByTestId('canvas-reorder-target-end')).toBeInTheDocument()
    await user.keyboard(' ')
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'false'))
    const after = canvasRows().map((row) => row.getAttribute('data-field-id'))
    expect(after[0]).toBe(secondId)
    expect(after).toContain(firstId)
    expect(document.activeElement).toBe(
      screen.getByTestId(`canvas-reorder-handle-${firstId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`),
    )
  }, 15_000)

  it('Escape cancels keyboard reorder without mutation', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const before = canvasRows().map((row) => row.getAttribute('data-field-id'))
    const handle = canvasRoot().querySelector<HTMLElement>('[data-reorder-field-id]')!
    handle.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Escape}')
    expect(canvasRows().map((row) => row.getAttribute('data-field-id'))).toEqual(before)
    expect(announcer()?.textContent).toMatch(/cancelled/i)
    expect(screen.queryByTestId('canvas-reorder-target-end')).not.toBeInTheDocument()
  })

  it('selection ArrowUp/Down remain active when reorder mode is not lifted', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const rows = canvasRows()
    rows[0]!.focus()
    await user.keyboard('{ArrowDown}')
    expect(canvasRows()[1]).toHaveAttribute('aria-current', 'true')
    canvasRows()[1]!.focus()
    await user.keyboard('{ArrowUp}')
    expect(canvasRows()[0]).toHaveAttribute('aria-current', 'true')
  })

  it('pointer drop on a valid marker commits once; outside drop cancels', async () => {
    render(<BuilderShell />)
    const rows = canvasRows()
    const firstId = rows[0]!.getAttribute('data-field-id')!
    const secondId = rows[1]!.getAttribute('data-field-id')!
    const handle = screen.getByTestId(
      `canvas-reorder-handle-${firstId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`,
    )
    fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    const end = await screen.findByTestId('canvas-reorder-target-end')
    fireEvent.dragOver(end, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(end, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.dragEnd(handle)
    await waitFor(() => {
      expect(canvasRows()[0]!.getAttribute('data-field-id')).toBe(secondId)
    })

    const before = canvasRows().map((row) => row.getAttribute('data-field-id'))
    const other = screen.getByTestId(
      `canvas-reorder-handle-${secondId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`,
    )
    fireEvent.dragStart(other, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    fireEvent.dragEnd(other)
    expect(canvasRows().map((row) => row.getAttribute('data-field-id'))).toEqual(before)
  })

  it('blocks Validate while a reorder gesture is active and restores after cancel', async () => {
    const user = userEvent.setup()
    render(
      <BuilderShell
        validationAdapter={validationAdapter()}
        persistenceAdapter={persistenceAdapter()}
      />,
    )
    const validate = screen.getByRole('button', { name: /^Validate$/i })
    expect(validate).toBeEnabled()
    const handle = canvasRoot().querySelector<HTMLElement>('[data-reorder-field-id]')!
    handle.focus()
    await user.keyboard(' ')
    expect(validate).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(validate).toBeEnabled()
  })

  it('Move Up still works as the accessible fallback', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const rows = canvasRows()
    const secondId = rows[1]!.getAttribute('data-field-id')!
    await user.click(rows[1]!)
    await user.click(screen.getByRole('button', { name: 'Move up' }))
    expect(canvasRows()[0]!.getAttribute('data-field-id')).toBe(secondId)
  })

  it('submitted/read-only mode disables reorder handles and ignores lift', async () => {
    const user = userEvent.setup()
    const { CanvasPane } = await import('../src/shell/CanvasPane.js')
    const { projectCanvasRows } = await import('../src/canvas/project-canvas.js')
    const rows = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION)
    const onBegin = vi.fn()
    render(
      <CanvasPane
        locale="en"
        rows={rows}
        selectedFieldId={rows[0]!.fieldId}
        readOnly
        gesture={null}
        reorderTargets={[]}
        onSelectField={() => {}}
        onBeginReorder={onBegin}
        onProposeReorder={() => {}}
        onCommitReorder={() => {}}
        onCancelReorder={() => {}}
      />,
    )
    const handle = screen.getAllByTestId(/canvas-reorder-handle-/)[0]!
    expect(handle).toBeDisabled()
    handle.focus()
    await user.keyboard(' ')
    expect(onBegin).not.toHaveBeenCalled()
    fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    expect(onBegin).not.toHaveBeenCalled()
  })

  it('is axe-clean in EN and GU with reorder chrome', async () => {
    const user = userEvent.setup()
    const { container, unmount } = render(<BuilderShell />)
    expect(await axe(container)).toHaveNoViolations()
    unmount()

    const gu = render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(gu.container)).toHaveNoViolations()
    expect(within(canvasRoot()).getByText(/Move up અને Move down/i)).toBeInTheDocument()
  }, 15_000)

  it('keeps 390px layout without overflow from reorder controls', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    render(<BuilderShell />)
    const canvas = canvasRoot()
    expect(canvas.scrollWidth).toBeLessThanOrEqual(canvas.clientWidth + 1)
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move down' })).toBeInTheDocument()
  })

  it('does not serialize reorder gesture state onto the DOM', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const handle = canvasRoot().querySelector<HTMLElement>('[data-reorder-field-id]')!
    handle.focus()
    await user.keyboard(' ')
    const html = canvasRoot().outerHTML
    expect(html).not.toMatch(/canvasReorderGesture|proposedBeforeFieldId|sequenceId/)
    expect(html).not.toMatch(/"etag"|If-Match/)
  })
})
