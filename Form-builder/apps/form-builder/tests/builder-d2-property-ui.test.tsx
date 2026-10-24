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

/** Scoped to the PropertyEditor's own dirty/clean chip — avoids ambiguity with the
 * FieldInspector header's duplicate dirty chip and the canvas row's dirty chip. */
function editorStatus(): HTMLElement {
  const el = document.querySelector('.dg20-builder-editor__status')
  if (!(el instanceof HTMLElement)) {
    throw new Error('editor status region missing')
  }
  return el
}

/** Scoped to the validation summary list — avoids ambiguity with the duplicate
 * inline per-control error message rendered beside the offending field. */
function validationSummary(): HTMLElement {
  const el = document.querySelector('.dg20-builder-editor__summary')
  if (!(el instanceof HTMLElement)) {
    throw new Error('validation summary missing')
  }
  return el
}

describe('FB-D2 Builder UI — Short text property editing', () => {
  it('edits label EN/GU, required, maxLength, and pattern — the canvas label updates only after Apply', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(getCanvasRowByName(/applicant full name/i))

    const labelEn = screen.getByLabelText('Label (English)')
    await user.clear(labelEn)
    await user.type(labelEn, 'Applicant legal name')
    // Not applied yet — the canvas still shows the previously committed label.
    expect(queryCanvasRowByName(/applicant legal name/i)).not.toBeInTheDocument()
    expect(getCanvasRowByName(/applicant full name/i)).toBeInTheDocument()

    const labelGu = screen.getByLabelText('Label (Gujarati)')
    await user.clear(labelGu)
    await user.type(labelGu, 'અરજદારનું કાનૂની નામ')

    const requiredCheckbox = screen.getByLabelText('Required')
    expect(requiredCheckbox).toBeChecked()
    await user.click(requiredCheckbox)
    expect(requiredCheckbox).not.toBeChecked()

    const maxLength = screen.getByLabelText('Maximum length')
    await user.clear(maxLength)
    await user.type(maxLength, '80')

    const pattern = screen.getByLabelText('Pattern (regular expression)')
    // userEvent.type treats `[`/`]` as special-key syntax — double them to type literals.
    await user.type(pattern, '^[[A-Za-z ]]+$')

    expect(editorStatus()).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    const updatedRow = getCanvasRowByName(/applicant legal name/i)
    expect(updatedRow).toBeInTheDocument()
    expect(within(updatedRow).getByText('Optional')).toBeInTheDocument()
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
  })

  it('blocks Apply on a blank GU label or an invalid regex pattern, and shows the validation summary', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(getCanvasRowByName(/applicant full name/i))

    const labelGu = screen.getByLabelText('Label (Gujarati)')
    await user.clear(labelGu)
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(within(validationSummary()).getByText(/gujarati label is required/i)).toBeInTheDocument()
    // Rejected — the canvas row is untouched.
    expect(getCanvasRowByName(/applicant full name/i)).toBeInTheDocument()

    await user.type(labelGu, 'અરજદારનું પૂરું નામ')
    const pattern = screen.getByLabelText('Pattern (regular expression)')
    await user.type(pattern, '(unterminated')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(
      within(validationSummary()).getByText(/pattern must be a valid regular expression/i),
    ).toBeInTheDocument()
    expect(getCanvasRowByName(/applicant full name/i)).toBeInTheDocument()
  })

  it('Cancel restores the committed values and discards the draft', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(getCanvasRowByName(/applicant full name/i))

    const labelEn = screen.getByLabelText('Label (English)')
    await user.clear(labelEn)
    await user.type(labelEn, 'Temporary label')
    expect(editorStatus()).toHaveTextContent('Unsaved changes')

    await user.click(screen.getByRole('button', { name: 'Cancel changes' }))

    expect(screen.getByLabelText('Label (English)')).toHaveValue('Applicant full name')
    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(getCanvasRowByName(/applicant full name/i)).toBeInTheDocument()
  })

  it('an unapplied draft on one field survives switching to another field and back', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(getCanvasRowByName(/applicant full name/i))
    const labelEn = screen.getByLabelText('Label (English)')
    await user.clear(labelEn)
    await user.type(labelEn, 'Draft-only name')

    await user.click(getCanvasRowByName(/^gender/i))
    expect(screen.getByLabelText('Label (English)')).toHaveValue('Gender')

    await user.click(getCanvasRowByName(/applicant full name/i))
    expect(screen.getByLabelText('Label (English)')).toHaveValue('Draft-only name')
    expect(editorStatus()).toHaveTextContent('Unsaved changes')
  })
})

describe('FB-D2 Builder UI — Number property editing', () => {
  it('edits minimum, maximum, and step, and applies them', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(getCanvasRowByName(/household size/i))

    const minimum = screen.getByLabelText('Minimum')
    await user.clear(minimum)
    await user.type(minimum, '2')
    const maximum = screen.getByLabelText('Maximum')
    await user.clear(maximum)
    await user.type(maximum, '12')
    const step = screen.getByLabelText('Step')
    await user.type(step, '1')

    expect(editorStatus()).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(screen.getByLabelText('Minimum')).toHaveValue('2')
    expect(screen.getByLabelText('Maximum')).toHaveValue('12')
    expect(screen.getByLabelText('Step')).toHaveValue('1')
  })
})

describe('FB-D2 Builder UI — Info panel property editing', () => {
  it('edits EN/GU help (both mandatory for info-panel) and applies', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(getCanvasRowByName(/provide accurate household details/i))

    const helpEn = screen.getByLabelText('Help text (English)')
    await user.clear(helpEn)
    await user.type(helpEn, 'Updated static guidance for applicants.')
    const helpGu = screen.getByLabelText('Help text (Gujarati)')
    await user.clear(helpGu)
    await user.type(helpGu, 'અરજદારો માટે અપડેટ કરેલી સ્થિર માર્ગદર્શિકા.')

    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(editorStatus()).toHaveTextContent('No unsaved changes')
    expect(screen.getByLabelText('Help text (English)')).toHaveValue(
      'Updated static guidance for applicants.',
    )
  })

  it('blocks Apply when help is blanked in only one language (help mandatory both EN and GU)', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(getCanvasRowByName(/provide accurate household details/i))

    const helpEn = screen.getByLabelText('Help text (English)')
    await user.clear(helpEn)
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      within(validationSummary()).getByText(/help text is required in both english and gujarati/i),
    ).toBeInTheDocument()
  })
})

describe('FB-D2 Builder UI — accessibility and DOM integrity after editing', () => {
  it('is axe-clean in EN and GU after editing and applying a field property', async () => {
    const user = userEvent.setup()
    const { container } = render(<BuilderShell />)
    await user.click(getCanvasRowByName(/applicant full name/i))
    const labelEn = screen.getByLabelText('Label (English)')
    await user.clear(labelEn)
    await user.type(labelEn, 'Applicant legal name')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('keeps unique DOM ids after selecting and editing a field', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)
    await user.click(getCanvasRowByName(/applicant full name/i))
    const labelEn = screen.getByLabelText('Label (English)')
    await user.type(labelEn, ' extra')
    const ids = collectIds(document)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('FB-D2 Builder UI — StrictMode purity', () => {
  it('StrictMode double-invoke of add + property Apply still yields a single field with a single committed value', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    const before = canvasRowButtons().length

    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    expect(canvasRowButtons()).toHaveLength(before + 1)
    expect(document.querySelectorAll('[data-field-id="text_short_1"]')).toHaveLength(1)

    const labelEn = screen.getByLabelText('Label (English)')
    await user.clear(labelEn)
    await user.type(labelEn, 'Renamed under StrictMode')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(getCanvasRowByName(/renamed under strictmode/i)).toBeInTheDocument()
    expect(canvasRowButtons()).toHaveLength(before + 1)
    expect(document.querySelectorAll('[data-field-id="text_short_1"]')).toHaveLength(1)
  })
})

describe('FB-D2.1 Builder UI — currency effective range', () => {
  it('rejects blank minimum with maximum -1, focuses Maximum, keeps draft dirty, then applies a corrected maximum', async () => {
    const user = userEvent.setup()
    render(<BuilderShell />)

    await user.click(screen.getByRole('button', { name: 'Add Currency (₹)' }))
    const fieldId = 'currency_inr_1'
    await waitFor(() => {
      expect(document.querySelector(`[data-field-id="${fieldId}"]`)).not.toBeNull()
    })

    const maximum = screen.getByLabelText('Maximum')
    await user.clear(maximum)
    await user.type(maximum, '-1')

    const definitionBefore = document.querySelector('.dg20-builder-preview')?.innerHTML

    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      screen.getAllByText(/minimum must be less than or equal to maximum/i).length,
    ).toBeGreaterThan(0)
    expect(maximum).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => {
      expect(maximum).toHaveFocus()
    })
    expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0)
    expect(document.querySelector('.dg20-builder-preview')?.innerHTML).toBe(definitionBefore)

    await user.clear(maximum)
    await user.type(maximum, '100')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    // Property draft is clean; header still shows local-definition unsaved (FB-D7).
    const remaining = screen.getAllByText('Unsaved changes')
    expect(
      remaining.every((node) => node.closest('[data-testid="persist-dirty-badge"]') !== null),
    ).toBe(true)
  })
})
