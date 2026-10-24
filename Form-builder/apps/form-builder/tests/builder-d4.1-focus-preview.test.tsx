import { StrictMode, useState, type ReactElement } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'

import {
  createAuthoringSession,
  mergeStepBoundary,
  progressiveStructureKey,
  readStepBilingualContent,
  splitStepAfterField,
  updateStepBilingualContent,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { PreviewPane } from '../src/shell/PreviewPane.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'

function collectIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('[id]')).map((el) => el.id)
}

async function openStepsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Steps' }))
  expect(screen.getByRole('tabpanel', { name: 'Steps' })).toBeInTheDocument()
}

function previewFrame(): HTMLElement {
  const el = document.querySelector('.dg20-builder-preview__frame')
  if (!(el instanceof HTMLElement)) throw new Error('preview frame missing')
  return el
}

async function completeIdentityStepAndAdvance(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const frame = previewFrame()
  const name = within(frame).getByRole('textbox', { name: /Applicant full name/i })
  await user.clear(name)
  await user.type(name, 'Preview Keep')
  await user.click(within(frame).getByRole('radio', { name: /^Female$/i }))
  await user.click(within(frame).getByRole('button', { name: 'Next' }))
  await waitFor(() => {
    expect(within(frame).getByText(/Step 2 of/i)).toBeInTheDocument()
  })
}

function PreviewHarness({
  initialDefinition,
  onChangeSpy,
}: {
  readonly initialDefinition: FormDefinition
  readonly onChangeSpy: ReturnType<typeof vi.fn>
}): ReactElement {
  const [definition, setDefinition] = useState(initialDefinition)
  const [formData, setFormData] = useState<Readonly<Record<string, unknown>>>({})

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const session = createAuthoringSession(definition)
          const split = splitStepAfterField(
            session,
            definition.meta.progressiveSteps[0]!.stepId,
            definition.meta.progressiveSteps[0]!.fieldIds[0]!,
          )
          if (!split.ok) throw new Error(split.error.code)
          setDefinition(split.state.definition)
        }}
      >
        structural-split
      </button>
      <button
        type="button"
        onClick={() => {
          const session = createAuthoringSession(definition)
          const first = definition.meta.progressiveSteps[0]!
          const baseline = readStepBilingualContent(definition, first.stepId)
          const result = updateStepBilingualContent(
            session,
            first.stepId,
            {
              stepId: first.stepId,
              labelEn: `${first.labelEn} Renamed`,
              labelGu: first.labelGu,
            },
            baseline,
          )
          if (!result.ok) throw new Error(result.error.code)
          setDefinition(result.state.definition)
        }}
      >
        label-only
      </button>
      <button
        type="button"
        onClick={() => {
          const session = createAuthoringSession(definition)
          if (definition.meta.progressiveSteps.length < 2) return
          const merged = mergeStepBoundary(session, definition.meta.progressiveSteps[0]!.stepId)
          if (!merged.ok) throw new Error(merged.error.code)
          setDefinition(merged.state.definition)
        }}
      >
        structural-merge
      </button>
      <PreviewPane
        locale="en"
        definition={definition}
        formData={formData}
        onFormDataChange={(next) => {
          onChangeSpy(next)
          setFormData(next)
        }}
      />
      <pre data-testid="structure-key">{progressiveStructureKey(definition)}</pre>
    </div>
  )
}

describe('FB-D4.1 — focus integrity after preview remount', () => {
  it('split focuses the new Steps card after preview remount (StrictMode)', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await openStepsTab(user)

    const beforeCards = document.querySelectorAll('[id^="dg20-builder-steps-card-"]')
    const beforeIds = new Set(Array.from(beforeCards).map((el) => el.id))

    await user.click(screen.getAllByRole('button', { name: /Start new step after/i })[0]!)

    await waitFor(() => {
      expect(screen.getByText(/3 steps · 7 fields/)).toBeInTheDocument()
    })

    await waitFor(() => {
      const active = document.activeElement
      expect(active?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
      expect(beforeIds.has(active!.id)).toBe(false)
      expect(active?.id).not.toMatch(/step-heading/)
    })
  })

  it('merge focuses the surviving Steps card; merge→split→merge refocuses same stepId', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await openStepsTab(user)

    const survivingId = 'dg20-builder-steps-card-identity'
    await user.click(screen.getAllByRole('button', { name: /Merge step/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id).toBe(survivingId)
    })

    await user.click(screen.getAllByRole('button', { name: /Start new step after/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
      expect(document.activeElement?.id).not.toBe(survivingId)
    })

    await user.click(screen.getAllByRole('button', { name: /Merge step/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id).toBe(survivingId)
    })
  })

  it('split → move → merge keeps Steps focus and never leaves preview heading active', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await openStepsTab(user)

    await user.click(screen.getAllByRole('button', { name: /Start new step after/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
    })
    expect(document.activeElement?.classList.contains('dg20-renderer-step-heading')).toBe(false)

    const moveLater = screen.getAllByRole('button', { name: /Move boundary later/i })[0]!
    await user.click(moveLater)
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
    })
    expect(document.activeElement?.classList.contains('dg20-renderer-step-heading')).toBe(false)
    // Move focuses previousStepId of the boundary — first boundary's previous is identity
    // after split the first step may still be identity or a new id depending on split target.
    expect(document.activeElement!.id).toMatch(/^dg20-builder-steps-card-/)

    await user.click(screen.getAllByRole('button', { name: /Merge step/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
    })
    expect(document.activeElement?.classList.contains('dg20-renderer-step-heading')).toBe(false)
    expect(document.querySelector('.dg20-renderer-step-heading')).not.toBe(document.activeElement)

    // Same surviving card can be refocused after another split/merge cycle
    await user.click(screen.getAllByRole('button', { name: /Start new step after/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
      expect(document.activeElement?.classList.contains('dg20-renderer-step-heading')).toBe(false)
    })
    await user.click(screen.getAllByRole('button', { name: /Merge step/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
      expect(document.activeElement?.classList.contains('dg20-renderer-step-heading')).toBe(false)
    })
  })

  it('keyboard split focuses the new step card', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    const stepsTab = screen.getByRole('tab', { name: 'Steps' })
    stepsTab.focus()
    await user.keyboard('{Enter}')
    const split = screen.getAllByRole('button', { name: /Start new step after/i })[0]!
    split.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
    })
  })

  it('axe-clean EN/GU on Steps with unique IDs after focus operations', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    await openStepsTab(user)
    await user.click(screen.getAllByRole('button', { name: /Start new step after/i })[0]!)
    await waitFor(() => {
      expect(document.activeElement?.id?.startsWith('dg20-builder-steps-card-')).toBe(true)
    })
    const ids = collectIds(container)
    expect(new Set(ids).size).toBe(ids.length)
    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('FB-D4.1 — PreviewPane remount integration', () => {
  it('structural remount resets to step 1 and preserves controlled preview data', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(
      <PreviewHarness
        initialDefinition={ILLUSTRATIVE_DRAFT_DEFINITION}
        onChangeSpy={onChangeSpy}
      />,
    )

    await completeIdentityStepAndAdvance(user)

    const callsBefore = onChangeSpy.mock.calls.length
    const keyBefore = screen.getByTestId('structure-key').textContent
    await user.click(screen.getByRole('button', { name: 'structural-split' }))

    await waitFor(() => {
      expect(screen.getByTestId('structure-key').textContent).not.toBe(keyBefore)
    })
    await waitFor(() => {
      expect(within(previewFrame()).getByText(/Step 1 of/i)).toBeInTheDocument()
    })

    expect(onChangeSpy.mock.calls.length).toBe(callsBefore)

    // After split after first field, applicant_name is on step 2.
    await user.click(within(previewFrame()).getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(
        (
          within(previewFrame()).getByRole('textbox', {
            name: /Applicant full name/i,
          }) as HTMLInputElement
        ).value,
      ).toBe('Preview Keep')
    })

    // Genuine user edit still emits.
    const nameField = within(previewFrame()).getByRole('textbox', {
      name: /Applicant full name/i,
    }) as HTMLInputElement
    const callsAfterNav = onChangeSpy.mock.calls.length
    await user.clear(nameField)
    await user.type(nameField, 'Edited')
    expect(onChangeSpy.mock.calls.length).toBeGreaterThan(callsAfterNav)
  })

  it('label-only change does not remount (structure key stable; step index kept)', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(
      <PreviewHarness
        initialDefinition={ILLUSTRATIVE_DRAFT_DEFINITION}
        onChangeSpy={onChangeSpy}
      />,
    )

    await completeIdentityStepAndAdvance(user)
    const keyBefore = screen.getByTestId('structure-key').textContent
    const callsBefore = onChangeSpy.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'label-only' }))
    expect(screen.getByTestId('structure-key').textContent).toBe(keyBefore)
    expect(within(previewFrame()).getByText(/Step 2 of/i)).toBeInTheDocument()
    expect(onChangeSpy.mock.calls.length).toBe(callsBefore)
  })
})
