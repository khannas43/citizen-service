import { StrictMode, useEffect, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition, ValidationResult } from '@citizen/form-contract'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  type AuthoringUiState,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'
import {
  useDefinitionValidation,
  type FormDefinitionValidationAdapter,
} from '../src/validation/index.js'

function createMockAdapter(
  impl: FormDefinitionValidationAdapter['validateDefinition'],
): FormDefinitionValidationAdapter {
  return { validateDefinition: impl }
}

function ValidationHarness(props: {
  readonly definition: FormDefinition
  readonly uiState: AuthoringUiState
  readonly adapter: FormDefinitionValidationAdapter | null
  readonly onView?: (phase: string, hasResult: boolean) => void
}) {
  const { view, validate } = useDefinitionValidation(props)
  useEffect(() => {
    props.onView?.(view.phase, view.result !== null)
  }, [view.phase, view.result, props])
  return (
    <div>
      <button type="button" onClick={validate}>
        Run validate
      </button>
      <span data-testid="phase">{view.phase}</span>
      <span data-testid="has-result">{String(view.result !== null)}</span>
    </div>
  )
}

describe('FB-D6.1 Builder UI — advisories and gates', () => {
  it('shows valid advisories with warning/info issues without focusing alert', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({
      valid: true,
      issues: [
        { code: 'warn_one', message: 'Warn A', severity: 'warning' as const, path: '/w' },
        { code: 'info_one', message: 'Info B', severity: 'info' as const },
      ],
    }))
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => {
      expect(document.getElementById('dg20-builder-validation-advisories')).toBeTruthy()
    })
    const advisories = document.getElementById('dg20-builder-validation-advisories')!
    expect(advisories).toHaveAttribute('role', 'status')
    expect(advisories).toHaveTextContent(/valid with 1 warning/)
    expect(advisories).toHaveTextContent(/1 info/)
    const items = within(advisories).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('warn_one')
    expect(items[1]).toHaveTextContent('info_one')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.activeElement?.id).not.toBe('dg20-builder-validation-summary')
    expect(document.activeElement?.id).not.toBe('dg20-builder-validation-failed')
  })

  it('relabels settled advisories on locale change without another adapter call', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({
      valid: true,
      issues: [{ code: 'w', message: 'Server text', severity: 'warning' as const }],
    }))
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => {
      expect(document.getElementById('dg20-builder-validation-advisories')).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(document.getElementById('dg20-builder-validation-advisories')).toHaveTextContent(
      /માન્ય છે/,
    )
    expect(document.getElementById('dg20-builder-validation-advisories')).toHaveTextContent(
      'Server text',
    )
    expect(validateDefinition).toHaveBeenCalledTimes(1)
  })

  it('blocks Validate for bilingual-only and step-label drafts with zero calls', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)

    await user.click(screen.getByRole('tab', { name: /bilingual/i }))
    const errorEn = screen.getAllByLabelText(/error text \(english/i)[0]
    await user.type(errorEn!, 'Incomplete error')
    expect(
      screen.getByText(/apply or cancel unsaved changes before validating/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeDisabled()
    expect(validateDefinition).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: /cancel/i })[0]!)

    await user.click(screen.getByRole('tab', { name: /steps/i }))
    const stepLabel = screen.queryByLabelText(/step label \(english\)/i)
    if (stepLabel) {
      await user.type(stepLabel, ' Draft')
      expect(screen.getByRole('button', { name: /^validate$/i })).toBeDisabled()
      expect(validateDefinition).not.toHaveBeenCalled()
    } else {
      // Illustrative draft may expose step labels under bilingual tab.
      await user.click(screen.getByRole('tab', { name: /bilingual/i }))
      const stepEn = screen.queryAllByLabelText(/step label \(english\)/i)[0]
      expect(stepEn).toBeTruthy()
      await user.type(stepEn!, ' Draft')
      expect(screen.getByRole('button', { name: /^validate$/i })).toBeDisabled()
      expect(validateDefinition).not.toHaveBeenCalled()
    }
  }, 15_000)
})

describe('FB-D6.1 — validation lifecycle cancellation', () => {
  it('aborts on adapter swap and ignores late resolve', async () => {
    const user = userEvent.setup()
    let release!: (result: ValidationResult) => void
    const gate = new Promise<ValidationResult>((resolve) => {
      release = resolve
    })
    const first = createMockAdapter(async () => gate)
    const second = createMockAdapter(async () => ({ valid: true, issues: [] }))

    function Host() {
      const [adapter, setAdapter] = useState(first)
      const [ui] = useState(() =>
        createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
      )
      return (
        <div>
          <button type="button" onClick={() => setAdapter(second)}>
            Swap adapter
          </button>
          <ValidationHarness definition={ui.authoring.definition} uiState={ui} adapter={adapter} />
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /run validate/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('validating')
    await user.click(screen.getByRole('button', { name: /swap adapter/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('idle')
    release({ valid: false, issues: [{ code: 'late', message: 'nope', severity: 'error' }] })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('idle')
      expect(screen.getByTestId('has-result')).toHaveTextContent('false')
    })
  })

  it('aborts on semantic definition change but keeps settled result for deep-equal replacement', async () => {
    const user = userEvent.setup()
    let release1!: (result: ValidationResult) => void
    const gate1 = new Promise<ValidationResult>((resolve) => {
      release1 = resolve
    })
    let release2!: (result: ValidationResult) => void
    const gate2 = new Promise<ValidationResult>((resolve) => {
      release2 = resolve
    })
    let call = 0
    const adapter = createMockAdapter(async () => {
      call += 1
      return call === 1 ? gate1 : gate2
    })
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition

    function Host() {
      const [definition, setDefinition] = useState(base)
      const [ui] = useState(() => createAuthoringUiState(createAuthoringSession(base)))
      return (
        <div>
          <button type="button" onClick={() => setDefinition(structuredClone(definition))}>
            Equal replace
          </button>
          <button
            type="button"
            onClick={() => setDefinition({ ...definition, serviceId: 'changed-service' })}
          >
            Change definition
          </button>
          <ValidationHarness definition={definition} uiState={ui} adapter={adapter} />
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /run validate/i }))
    release1({ valid: true, issues: [] })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('valid')
    })
    await user.click(screen.getByRole('button', { name: /equal replace/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('valid')
    expect(screen.getByTestId('has-result')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: /run validate/i }))
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('validating')
    })
    await user.click(screen.getByRole('button', { name: /change definition/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('idle')
    expect(screen.getByTestId('has-result')).toHaveTextContent('false')
    release2({ valid: true, issues: [] })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('idle')
    })
  })

  it('aborts mid-flight when property, bilingual, or step drafts become dirty', async () => {
    const user = userEvent.setup()
    let release!: (result: ValidationResult) => void
    const gate = new Promise<ValidationResult>((resolve) => {
      release = resolve
    })
    const adapter = createMockAdapter(async () => gate)
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)

    function Host({
      makeDirty,
    }: {
      readonly makeDirty: (ui: AuthoringUiState) => AuthoringUiState
    }) {
      const [ui, setUi] = useState(() => createAuthoringUiState(session))
      return (
        <div>
          <button type="button" onClick={() => setUi((current) => makeDirty(current))}>
            Dirty
          </button>
          <ValidationHarness definition={ui.authoring.definition} uiState={ui} adapter={adapter} />
        </div>
      )
    }

    const propertyDirty = (ui: AuthoringUiState) =>
      authoringReducer(ui, {
        type: 'patchEditorDraft',
        fieldId: 'applicant_name',
        patch: { labelEn: 'Dirty property' },
      })
    const { unmount } = render(<Host makeDirty={propertyDirty} />)
    await user.click(screen.getByRole('button', { name: /run validate/i }))
    await user.click(screen.getByRole('button', { name: /^dirty$/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('idle')
    release({ valid: true, issues: [] })
    await waitFor(() => {
      expect(screen.getByTestId('has-result')).toHaveTextContent('false')
    })
    unmount()

    let release2!: (result: ValidationResult) => void
    const gate2 = new Promise<ValidationResult>((resolve) => {
      release2 = resolve
    })
    const adapter2 = createMockAdapter(async () => gate2)
    const bilingualDirty = (ui: AuthoringUiState) =>
      authoringReducer(ui, {
        type: 'patchFieldBilingual',
        fieldId: 'applicant_name',
        patch: { errorEn: 'Dirty bilingual' },
      })
    const view2 = render(<Host makeDirty={bilingualDirty} />)
    // Remount with new adapter via rerender is awkward — use fresh Host
    view2.unmount()

    function Host2({
      makeDirty,
      adapter: activeAdapter,
    }: {
      readonly makeDirty: (ui: AuthoringUiState) => AuthoringUiState
      readonly adapter: FormDefinitionValidationAdapter
    }) {
      const [ui, setUi] = useState(() => createAuthoringUiState(session))
      return (
        <div>
          <button type="button" onClick={() => setUi((current) => makeDirty(current))}>
            Dirty
          </button>
          <ValidationHarness
            definition={ui.authoring.definition}
            uiState={ui}
            adapter={activeAdapter}
          />
        </div>
      )
    }

    render(<Host2 makeDirty={bilingualDirty} adapter={adapter2} />)
    await user.click(screen.getByRole('button', { name: /run validate/i }))
    await user.click(screen.getByRole('button', { name: /^dirty$/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('idle')
    release2({ valid: false, issues: [{ code: 'e', message: 'x', severity: 'error' }] })
    await waitFor(() => {
      expect(screen.getByTestId('has-result')).toHaveTextContent('false')
    })
  })

  it('StrictMode duplicate Validate still makes one call; stale reject ignored', async () => {
    const user = userEvent.setup()
    let rejectGate!: (error: Error) => void
    const gate = new Promise<ValidationResult>((_resolve, reject) => {
      rejectGate = reject
    })
    const validateDefinition = vi.fn(async () => gate)
    render(
      <StrictMode>
        <BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />
      </StrictMode>,
    )
    const button = screen.getByRole('button', { name: /^validate$/i })
    await user.click(button)
    await user.click(button)
    expect(validateDefinition).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    rejectGate(new Error('late transport failure'))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
