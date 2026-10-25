import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import { PALETTE_GROUPS, PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'
import type { FormDefinition } from '@citizen/form-contract'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import {
  ILLUSTRATIVE_DRAFT_DEFINITION,
  ILLUSTRATIVE_DRAFT_SERVICE_ID,
} from '../src/definition/illustrative-draft-definition.js'
import { CanvasProjectionError, projectCanvasRows } from '../src/canvas/project-canvas.js'
import { countFilteredWidgets, filterPaletteGroups } from '../src/palette/filter-palette.js'

function collectIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('[id]')).map((el) => el.id)
}

function canvasRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-canvas')
  if (!(el instanceof HTMLElement)) {
    throw new Error('canvas root missing')
  }
  return el
}

function canvasRowButtons(): HTMLElement[] {
  return Array.from(canvasRoot().querySelectorAll<HTMLElement>('.dg20-builder-canvas__row'))
}

function canvasRowNamed(label: string): HTMLElement {
  const match = canvasRowButtons().find((row) => new RegExp(label, 'i').test(row.textContent ?? ''))
  if (!match) {
    throw new Error(`canvas row not found for label: ${label}`)
  }
  return match
}

describe('FB-D0 Builder SPA foundation', () => {
  it('renders all three panes', () => {
    render(<BuilderShell />)
    expect(screen.getByRole('heading', { name: /controlled palette/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /form canvas/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /live preview/i })).toBeInTheDocument()
  })

  it('exposes exact palette count 30 and group count 6', () => {
    expect(PALETTE_WIDGET_COUNT).toBe(30)
    expect(PALETTE_GROUPS).toHaveLength(6)
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__group')).toHaveLength(6)
  })

  it('filters palette with EN search and restores on clear', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const search = screen.getByLabelText(/search palette/i)
    await user.type(search, 'gender')
    const filtered = document.querySelectorAll('.dg20-builder-palette__item').length
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(30)
    await user.clear(search)
    expect(document.querySelectorAll('.dg20-builder-palette__item')).toHaveLength(30)
  })

  it('filters palette with GU metadata search', () => {
    const groups = filterPaletteGroups('લિંગ')
    const count = countFilteredWidgets(groups)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(30)
  })

  it('shows localized no-results state', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.type(screen.getByLabelText(/search palette/i), 'zzzz-not-a-widget')
    expect(screen.getByText(/no palette widgets match/i)).toBeInTheDocument()
    expect(document.querySelectorAll('.dg20-builder-palette__item')).toHaveLength(0)
  })

  it('preserves group and widget registry order', () => {
    const groups = filterPaletteGroups('')
    expect(groups.map((g) => g.group.groupId)).toEqual(PALETTE_GROUPS.map((g) => g.groupId))
  })

  it('switches Builder and Renderer locale without resetting definition or formData', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const before = ILLUSTRATIVE_DRAFT_DEFINITION
    expect(Object.isFrozen(before)).toBe(true)

    await user.click(screen.getByRole('button', { name: 'GU', pressed: false }))
    expect(screen.getByRole('button', { name: 'GU' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/સ્થાનિક તકનીકી પૂર્વાવલોકન/)).toBeInTheDocument()
    expect(ILLUSTRATIVE_DRAFT_DEFINITION).toBe(before)
    expect(ILLUSTRATIVE_DRAFT_DEFINITION.serviceId).toBe(ILLUSTRATIVE_DRAFT_SERVICE_ID)
  })

  it('derives canvas order from definition ui:order', () => {
    const rows = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION)
    const order = ILLUSTRATIVE_DRAFT_DEFINITION.uiSchema['ui:order'] as string[]
    expect(rows.map((r) => r.fieldId)).toEqual(order)
    render(<BuilderShell />)
    const buttons = canvasRowButtons()
    expect(buttons[0]?.textContent).toMatch(/Applicant identity/i)
  })

  it('selects first row initially and changes selection on click', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const rows = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION)
    const first = canvasRowNamed(rows[0]!.labelEn)
    expect(first).toHaveAttribute('aria-current', 'true')

    const second = canvasRowNamed(rows[1]!.labelEn)
    await user.click(second)
    expect(second).toHaveAttribute('aria-current', 'true')
    expect(first).not.toHaveAttribute('aria-current')
    const inspector = document.querySelector('.dg20-builder-inspector')
    expect(inspector).not.toBeNull()
    expect(within(inspector as HTMLElement).getByText(rows[1]!.fieldId)).toBeInTheDocument()
  })

  it('shows inspector metadata for the selected row', () => {
    render(<BuilderShell />)
    const rows = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION)
    const inspector = document.querySelector('.dg20-builder-inspector')
    expect(inspector).not.toBeNull()
    const scope = within(inspector as HTMLElement)
    expect(scope.getByText(/common properties/i)).toBeInTheDocument()
    expect(scope.queryByText(/property editing deferred/i)).not.toBeInTheDocument()
    expect(scope.getByText(rows[0]!.fieldId)).toBeInTheDocument()
    expect(scope.getByText(rows[0]!.widgetType)).toBeInTheDocument()
  })

  it('supports keyboard selection on canvas rows', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const rows = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION)
    const first = canvasRowNamed(rows[0]!.labelEn)
    first.focus()
    await user.keyboard('{ArrowDown}')
    const second = canvasRowNamed(rows[1]!.labelEn)
    expect(second).toHaveAttribute('aria-current', 'true')
  })

  it('preview uses the exact illustrative definition reference', () => {
    render(<BuilderShell />)
    expect(ILLUSTRATIVE_DRAFT_DEFINITION.serviceId).toBe(ILLUSTRATIVE_DRAFT_SERVICE_ID)
    expect(Object.isFrozen(ILLUSTRATIVE_DRAFT_DEFINITION)).toBe(true)
    expect(screen.getByText(ILLUSTRATIVE_DRAFT_SERVICE_ID)).toBeInTheDocument()
  })

  it('preview formData changes do not mutate definition', () => {
    const snapshot = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION)
    render(<BuilderShell />)
    expect(ILLUSTRATIVE_DRAFT_DEFINITION).toEqual(snapshot)
    expect(() => {
      ;(ILLUSTRATIVE_DRAFT_DEFINITION as { serviceId: string }).serviceId = 'mutated'
    }).toThrow()
  })

  it('tabs use correct semantics', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const tablist = screen.getByRole('tablist')
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    await user.click(tabs[1]!)
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
  })

  it('actions keep Save/Submit disabled while Validate is unavailable without adapter', () => {
    render(<BuilderShell validationAdapter={null} />)
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^submit draft$/i })).toBeDisabled()
    expect(screen.getByText(/technical submit uses unit c/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/authenticated actor context required/i)
  })

  it('does not show custom-field or raw-JSON controls', () => {
    render(<BuilderShell />)
    expect(document.body.textContent).not.toMatch(/custom-field|raw json|raw-json/i)
  })

  it('does not call fetch or web storage APIs', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(<BuilderShell />)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    storageSpy.mockRestore()
  })

  it('has unique DOM IDs', () => {
    render(<BuilderShell />)
    const ids = collectIds(document)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is axe-clean in EN', async () => {
    const { container } = render(<BuilderShell />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean in GU', async () => {
    const user = userEvent.setup()
    const { container } = render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('keeps the illustrative definition deeply frozen', () => {
    expect(Object.isFrozen(ILLUSTRATIVE_DRAFT_DEFINITION)).toBe(true)
    expect(Object.isFrozen(ILLUSTRATIVE_DRAFT_DEFINITION.jsonSchema)).toBe(true)
    expect(Object.isFrozen(ILLUSTRATIVE_DRAFT_DEFINITION.meta)).toBe(true)
  })

  it('produces an explicit safe failure for inconsistent canvas projection', () => {
    const bad = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION) as FormDefinition
    ;(bad.uiSchema as { 'ui:order': string[] })['ui:order'] = ['applicant_name']
    expect(() => projectCanvasRows(bad)).toThrow(CanvasProjectionError)
  })
})
