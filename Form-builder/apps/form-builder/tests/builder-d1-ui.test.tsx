import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { projectCanvasRows } from '../src/canvas/project-canvas.js'

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

function announcerEl(): HTMLElement | null {
  return document.querySelector('[role="status"][aria-live="polite"][aria-atomic="true"]')
}

function announcerText(): string {
  return announcerEl()?.textContent ?? ''
}

function announcerId(): string | null {
  return announcerEl()?.getAttribute('data-announcement-id') ?? null
}

const BASELINE_FIELD_COUNT = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION).length

describe('FB-D1 Builder UI — authoring wiring', () => {
  it('adds a text-short field via the palette', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT)

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 1)
  })

  it('adds a section-header (display) field via the palette', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Section header' }))
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 1)
  })

  it('removes the selected field via the inspector', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const rows = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION)

    await user.click(canvasRowNamed(rows[1]!.labelEn))
    await user.click(screen.getByRole('button', { name: 'Remove field' }))

    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT - 1)
    expect(screen.queryByText(rows[1]!.fieldId)).not.toBeInTheDocument()
  })

  it('cannot remove fields past one-per-step and shows step guidance on the remainder', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    // Deterministic order reducing each progressive step to exactly one
    // field — the minimum reachable while the illustrative definition's two
    // steps ('identity': section_identity/applicant_name/gender/info_guidance,
    // 'household': household_size/purpose_statement/agree_terms) both exist.
    // One field is deliberately left un-removed in each step.
    const removalOrder = [
      /applicant identity/i,
      /applicant full name/i,
      /gender/i,
      /household size/i,
      /purpose statement/i,
    ]

    for (const namePattern of removalOrder) {
      await user.click(canvasRowNamed(namePattern.source))
      await user.click(screen.getByRole('button', { name: 'Remove field' }))
    }

    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT - removalOrder.length)

    for (const button of canvasRowButtons()) {
      await user.click(button)
      expect(screen.getByRole('button', { name: 'Remove field' })).toBeDisabled()
      expect(screen.getByText(/each step needs at least one field/i)).toBeInTheDocument()
    }
  })

  it('a disabled Remove button (final field of a step) cannot be triggered and performs no removal', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(canvasRowNamed('household size'))
    await user.click(screen.getByRole('button', { name: 'Remove field' }))
    await user.click(canvasRowNamed('purpose statement'))
    await user.click(screen.getByRole('button', { name: 'Remove field' }))

    await user.click(canvasRowNamed('agree to the declaration'))
    const removeButton = screen.getByRole('button', { name: 'Remove field' })
    expect(removeButton).toBeDisabled()

    const beforeCount = canvasRowButtons().length
    await user.click(removeButton)
    expect(canvasRowButtons()).toHaveLength(beforeCount)
  })

  it('disables Remove for the final field of a progressive step while other fields remain on the form', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    // The 'household' step has 3 fields; empty it down to its last one while
    // the 'identity' step still has fields — the whole-form count stays > 1.
    await user.click(canvasRowNamed('household size'))
    await user.click(screen.getByRole('button', { name: 'Remove field' }))
    await user.click(canvasRowNamed('purpose statement'))
    await user.click(screen.getByRole('button', { name: 'Remove field' }))

    await user.click(canvasRowNamed('agree to the declaration'))
    expect(screen.getByRole('button', { name: 'Remove field' })).toBeDisabled()
    expect(screen.getByText(/each step needs at least one field/i)).toBeInTheDocument()
    expect(canvasRowButtons().length).toBeGreaterThan(1)
  })

  it('moves a field up within its progressive step', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const rows = projectCanvasRows(ILLUSTRATIVE_DRAFT_DEFINITION)

    await user.click(canvasRowNamed(rows[1]!.labelEn))
    await user.click(screen.getByRole('button', { name: 'Move up' }))

    const reordered = canvasRowButtons()
    expect(reordered[0]?.textContent).toMatch(new RegExp(rows[1]!.labelEn, 'i'))
    expect(reordered[1]?.textContent).toMatch(new RegExp(rows[0]!.labelEn, 'i'))
  })

  it('exposes page-break as an enabled structural create-boundary action', async () => {
    render(<BuilderShell />)
    const pageBreakButton = screen.getByRole('button', {
      name: /Create boundary \(Page break\)/i,
    })
    expect(pageBreakButton).toBeEnabled()
    expect(pageBreakButton).not.toHaveClass('dg20-builder-palette__item--pending')
    expect(pageBreakButton).toHaveClass('dg20-builder-palette__item--addable')

    const before = canvasRowButtons().length
    // Structural page-break must not insert a canvas field row via ordinary add.
    expect(canvasRowButtons()).toHaveLength(before)
  })

  it('reports exactly 30 addable and 0 pending palette buttons', () => {
    render(<BuilderShell />)
    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
    expect(document.querySelectorAll('.dg20-builder-palette__item')).toHaveLength(30)
  })

  it('keeps all 30 widgets searchable, addable and pending alike', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    const search = screen.getByLabelText(/search palette/i)

    await user.type(search, 'aadhaar')
    expect(document.querySelectorAll('.dg20-builder-palette__item')).toHaveLength(1)
    await user.clear(search)

    await user.type(search, 'text')
    expect(document.querySelectorAll('.dg20-builder-palette__item').length).toBeGreaterThan(0)
    await user.clear(search)

    expect(document.querySelectorAll('.dg20-builder-palette__item')).toHaveLength(30)
  })

  it('preserves authored state across a locale switch', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 1)

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 1)

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 1)
  })

  it('live preview definition reflects an added field (canvas count mirrors definition fields)', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    await user.click(screen.getByRole('button', { name: 'Add Number' }))

    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 2)
    const preview = document.querySelector('.dg20-builder-preview')
    expect(preview).not.toBeNull()
  })

  it('focuses the newly added field row after add', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Percentage' }))

    await waitFor(() => {
      const newRow = document.querySelector<HTMLElement>('[data-field-id="percentage_1"]')
      expect(newRow).not.toBeNull()
      expect(newRow).toHaveFocus()
    })
  })

  it('announces field-added text in EN and GU', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    expect(announcerText()).toMatch(/added/i)

    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(screen.getByRole('button', { name: 'સંખ્યા ઉમેરો' }))
    expect(announcerText()).toMatch(/ઉમેરાયું/)
  })

  it('announces text after each successful removal down to one field per step', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    const removalOrder = [
      /applicant identity/i,
      /applicant full name/i,
      /gender/i,
      /household size/i,
      /purpose statement/i,
    ]
    for (const namePattern of removalOrder) {
      await user.click(canvasRowNamed(namePattern.source))
      await user.click(screen.getByRole('button', { name: 'Remove field' }))
    }

    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT - removalOrder.length)
    expect(announcerText().length).toBeGreaterThan(0)
  })

  it('has unique DOM IDs after authoring interactions', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    const ids = collectIds(document)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is axe-clean in EN after adding a field', async () => {
    const user = userEvent.setup()
    const { container } = render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean in GU after adding a field', async () => {
    const user = userEvent.setup()
    const { container } = render(<BuilderShell />)
    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(screen.getByRole('button', { name: 'સંખ્યા ઉમેરો' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('StrictMode dev double-invoke does not duplicate an add operation or its focus effect', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT)

    await user.click(screen.getByRole('button', { name: 'Add Percentage' }))

    // A single reducer dispatch must yield exactly one new field, not two,
    // even though StrictMode intentionally double-invokes reducers/effects
    // in development to surface impurities.
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 1)
    await waitFor(() => {
      const newRow = document.querySelector<HTMLElement>('[data-field-id="percentage_1"]')
      expect(newRow).not.toBeNull()
      expect(newRow).toHaveFocus()
    })
    expect(document.querySelectorAll('[data-field-id="percentage_1"]')).toHaveLength(1)
  })
})

describe('FB-D1.2 Builder UI — repeated identical live-region announcements', () => {
  it('re-announces identical EN text when Short text is added twice under StrictMode', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    const firstText = announcerText()
    const firstId = announcerId()
    const firstNode = announcerEl()
    expect(firstText).toMatch(/^Added Short text$/i)
    expect(firstId).toBe('1')
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 1)

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    const secondText = announcerText()
    const secondId = announcerId()
    const secondNode = announcerEl()

    expect(secondText).toBe(firstText)
    expect(secondId).not.toBe(firstId)
    expect(secondNode).not.toBe(firstNode)
    expect(canvasRowButtons()).toHaveLength(BASELINE_FIELD_COUNT + 2)
    await waitFor(() => {
      const row = document.querySelector<HTMLElement>('[data-field-id="text_short_2"]')
      expect(row).not.toBeNull()
      expect(row).toHaveFocus()
    })
    expect(document.querySelectorAll('[data-field-id="text_short_1"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-field-id="text_short_2"]')).toHaveLength(1)
  })

  it('re-announces identical GU text when Short text is added twice', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'GU' }))
    await user.click(screen.getByRole('button', { name: 'ટૂંકું લખાણ ઉમેરો' }))
    const firstText = announcerText()
    const firstId = announcerId()
    const firstNode = announcerEl()
    expect(firstText.length).toBeGreaterThan(0)
    expect(firstText).toMatch(/ઉમેરાયું/)

    await user.click(screen.getByRole('button', { name: 'ટૂંકું લખાણ ઉમેરો' }))
    const secondText = announcerText()
    const secondId = announcerId()
    const secondNode = announcerEl()

    expect(secondText).toBe(firstText)
    expect(secondId).not.toBe(firstId)
    expect(secondNode).not.toBe(firstNode)
    await waitFor(() => {
      const row = document.querySelector<HTMLElement>('[data-field-id="text_short_2"]')
      expect(row).not.toBeNull()
      expect(row).toHaveFocus()
    })
  })
})
