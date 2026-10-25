import { StrictMode, useMemo, useRef, useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { FormDefinition } from '@citizen/form-contract'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'
import {
  DraftPersistenceError,
  formatStrongEtagForTests,
  useDefinitionPersistence,
  type FormDefinitionDraftPersistenceAdapter,
} from '../src/persistence/index.js'
import {
  useDefinitionValidation,
  type FormDefinitionValidationAdapter,
} from '../src/validation/index.js'

function createValidationAdapter(
  impl: FormDefinitionValidationAdapter['validateDefinition'] = async () => ({
    valid: true,
    issues: [],
  }),
): FormDefinitionValidationAdapter {
  return { validateDefinition: impl }
}

function createPersistenceAdapter(
  impl: Partial<FormDefinitionDraftPersistenceAdapter> = {},
): FormDefinitionDraftPersistenceAdapter {
  return {
    createDraft:
      impl.createDraft ??
      (async ({ definition }) => ({
        definition: structuredClone(definition),
        etag: formatStrongEtagForTests(1),
      })),
    loadDraft:
      impl.loadDraft ??
      (async ({ serviceId, version }) => ({
        definition: {
          ...createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
          serviceId,
          version,
        },
        etag: formatStrongEtagForTests(2),
      })),
    replaceDraft:
      impl.replaceDraft ??
      (async ({ definition }) => ({
        definition: structuredClone(definition),
        etag: formatStrongEtagForTests(3),
      })),
  }
}

function firstFieldId(definition: FormDefinition): string {
  const order = definition.uiSchema['ui:order']
  if (!Array.isArray(order) || typeof order[0] !== 'string') {
    throw new Error('expected ui:order')
  }
  return order[0]
}

describe('FB-D7.1 — validation match gate and Save race', () => {
  it('disables Save after a committed edit that no longer matches the validated baseline', async () => {
    const user = userEvent.setup()
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(1),
    }))
    const validationAdapter = createValidationAdapter()
    const persistenceAdapter = createPersistenceAdapter({ createDraft })

    function Host() {
      const [ui, setUi] = useState(() =>
        createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
      )
      const sessionEpochRef = useRef(0)
      const validation = useDefinitionValidation({
        definition: ui.authoring.definition,
        uiState: ui,
        adapter: validationAdapter,
      })
      const persistence = useDefinitionPersistence({
        definition: ui.authoring.definition,
        uiState: ui,
        dispatch: (action) => {
          sessionEpochRef.current += 1
          setUi((current) => authoringReducer(current, action))
        },
        validation: validation.view,
        adapter: persistenceAdapter,
        sessionEpochRef,
      })
      return (
        <div>
          <button type="button" onClick={validation.validate}>
            Validate
          </button>
          <button type="button" onClick={persistence.saveDraft} data-testid="save">
            Save
          </button>
          <button
            type="button"
            data-testid="commit-edit"
            onClick={() =>
              setUi((current) => ({
                ...current,
                authoring: {
                  ...current.authoring,
                  definition: {
                    ...current.authoring.definition,
                    audit: {
                      ...current.authoring.definition.audit,
                      createdBy: 'post-validate-edit',
                    },
                  },
                },
              }))
            }
          >
            Commit edit
          </button>
          <span data-testid="match">{String(validation.view.resultMatchesCurrentDefinition)}</span>
          <span data-testid="cansave">{String(persistence.view.canSave)}</span>
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('cansave')).toHaveTextContent('true'))
    expect(screen.getByTestId('match')).toHaveTextContent('true')
    await user.click(screen.getByTestId('commit-edit'))
    await waitFor(() => {
      expect(screen.getByTestId('match')).toHaveTextContent('false')
      expect(screen.getByTestId('cansave')).toHaveTextContent('false')
    })
    await user.click(screen.getByTestId('save'))
    expect(createDraft).not.toHaveBeenCalled()
  })

  it('keeps resultMatchesCurrentDefinition for equal reordered definitions', async () => {
    const user = userEvent.setup()
    const validationAdapter = createValidationAdapter()

    function reorderObjectKeysDeep(value: unknown): unknown {
      if (Array.isArray(value)) {
        return value.map((item) => reorderObjectKeysDeep(item))
      }
      if (value !== null && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value)
        if (proto !== Object.prototype && proto !== null) {
          return value
        }
        const keys = Object.keys(value as object).reverse()
        const out: Record<string, unknown> = {}
        for (const key of keys) {
          out[key] = reorderObjectKeysDeep((value as Record<string, unknown>)[key])
        }
        return out
      }
      return value
    }

    function Host() {
      const [ui, setUi] = useState(() =>
        createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
      )
      const validation = useDefinitionValidation({
        definition: ui.authoring.definition,
        uiState: ui,
        adapter: validationAdapter,
      })
      return (
        <div>
          <button type="button" onClick={validation.validate}>
            Validate
          </button>
          <button
            type="button"
            data-testid="reorder"
            onClick={() =>
              setUi((current) => ({
                ...current,
                authoring: {
                  ...current.authoring,
                  definition: reorderObjectKeysDeep(current.authoring.definition) as FormDefinition,
                },
              }))
            }
          >
            Reorder equal
          </button>
          <span data-testid="match">{String(validation.view.resultMatchesCurrentDefinition)}</span>
          <span data-testid="vphase">{validation.view.phase}</span>
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('vphase')).toHaveTextContent('valid'))
    await user.click(screen.getByTestId('reorder'))
    expect(screen.getByTestId('match')).toHaveTextContent('true')
    expect(screen.getByTestId('vphase')).toHaveTextContent('valid')
  })
})

describe('FB-D7.1 — pending-save draft preservation', () => {
  function SaveDraftHarness(props: {
    readonly createDraft?: FormDefinitionDraftPersistenceAdapter['createDraft']
    readonly replaceDraft?: FormDefinitionDraftPersistenceAdapter['replaceDraft']
    readonly apiRef: {
      current: {
        save: () => void
        validate: () => void
        dispatch: (action: Parameters<typeof authoringReducer>[1]) => void
        fieldId: string
        stepId: string | null
        canSave: boolean
      } | null
    }
  }) {
    const [ui, setUi] = useState(() =>
      createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
    )
    const sessionEpochRef = useRef(0)
    const validationAdapter = useMemo(() => createValidationAdapter(), [])
    const persistenceAdapter = useMemo(
      () =>
        createPersistenceAdapter({
          createDraft: props.createDraft,
          replaceDraft: props.replaceDraft,
        }),
      [props.createDraft, props.replaceDraft],
    )
    const validation = useDefinitionValidation({
      definition: ui.authoring.definition,
      uiState: ui,
      adapter: validationAdapter,
    })
    const dispatch = (action: Parameters<typeof authoringReducer>[1]) => {
      sessionEpochRef.current += 1
      setUi((current) => authoringReducer(current, action))
    }
    const persistence = useDefinitionPersistence({
      definition: ui.authoring.definition,
      uiState: ui,
      dispatch,
      validation: validation.view,
      adapter: persistenceAdapter,
      sessionEpochRef,
    })
    const fieldId = firstFieldId(ui.authoring.definition)
    const stepId = ui.authoring.definition.meta.progressiveSteps[0]?.stepId ?? null
    props.apiRef.current = {
      save: persistence.saveDraft,
      validate: validation.validate,
      dispatch,
      fieldId,
      stepId,
      canSave: persistence.view.canSave,
    }
    const propertyDraft = ui.editorDrafts[fieldId]?.draft.labelEn ?? ''
    const bilingualDraft = ui.editorDrafts[fieldId]?.errorDraft.en ?? ''
    const stepDraft = stepId ? (ui.stepEditorDrafts[stepId]?.draft.labelEn ?? '') : ''
    return (
      <div>
        <span data-testid="binding">{persistence.view.binding.kind}</span>
        <span data-testid="phase">{persistence.view.phase}</span>
        <span data-testid="cansave">{String(persistence.view.canSave)}</span>
        <span data-testid="property-draft">{propertyDraft}</span>
        <span data-testid="bilingual-draft">{bilingualDraft}</span>
        <span data-testid="step-draft">{stepDraft}</span>
      </div>
    )
  }

  it('preserves a Property draft typed during pending create', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => {
      await gate
      return { definition: structuredClone(definition), etag: formatStrongEtagForTests(9) }
    })
    const apiRef: {
      current: {
        save: () => void
        validate: () => void
        dispatch: (action: Parameters<typeof authoringReducer>[1]) => void
        fieldId: string
        stepId: string | null
        canSave: boolean
      } | null
    } = { current: null }
    render(<SaveDraftHarness createDraft={createDraft} apiRef={apiRef} />)
    await waitFor(() => expect(apiRef.current).not.toBeNull())
    await act(async () => {
      apiRef.current!.validate()
    })
    await waitFor(() => expect(screen.getByTestId('cansave')).toHaveTextContent('true'))
    await act(async () => {
      apiRef.current!.save()
    })
    await waitFor(() => expect(createDraft).toHaveBeenCalledTimes(1))
    await act(async () => {
      apiRef.current!.dispatch({
        type: 'patchEditorDraft',
        fieldId: apiRef.current!.fieldId,
        patch: { labelEn: 'PropertyDuringCreate' },
      })
    })
    expect(screen.getByTestId('property-draft')).toHaveTextContent('PropertyDuringCreate')
    await act(async () => {
      release()
    })
    await waitFor(() => expect(screen.getByTestId('binding')).toHaveTextContent('persisted'))
    expect(screen.getByTestId('property-draft')).toHaveTextContent('PropertyDuringCreate')
    expect(screen.getByTestId('phase')).toHaveTextContent('saved')
  })

  it('preserves Bilingual and Step drafts typed during pending PUT', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(1),
    }))
    const replaceDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => {
      await gate
      return { definition: structuredClone(definition), etag: formatStrongEtagForTests(2) }
    })
    const apiRef: {
      current: {
        save: () => void
        validate: () => void
        dispatch: (action: Parameters<typeof authoringReducer>[1]) => void
        fieldId: string
        stepId: string | null
        canSave: boolean
      } | null
    } = { current: null }
    render(
      <SaveDraftHarness createDraft={createDraft} replaceDraft={replaceDraft} apiRef={apiRef} />,
    )
    await waitFor(() => expect(apiRef.current).not.toBeNull())
    await act(async () => {
      apiRef.current!.validate()
    })
    await waitFor(() => expect(screen.getByTestId('cansave')).toHaveTextContent('true'))
    await act(async () => {
      apiRef.current!.save()
    })
    await waitFor(() => expect(screen.getByTestId('binding')).toHaveTextContent('persisted'))

    await act(async () => {
      apiRef.current!.dispatch({
        type: 'patchEditorDraft',
        fieldId: apiRef.current!.fieldId,
        patch: { labelEn: 'CommitBeforePut' },
      })
      apiRef.current!.dispatch({
        type: 'applyEditorDraft',
        fieldId: apiRef.current!.fieldId,
      })
      apiRef.current!.dispatch({ type: 'enableProgressiveSteps' })
    })
    await act(async () => {
      apiRef.current!.validate()
    })
    await waitFor(() => expect(screen.getByTestId('cansave')).toHaveTextContent('true'))
    await act(async () => {
      apiRef.current!.save()
    })
    await waitFor(() => expect(replaceDraft).toHaveBeenCalledTimes(1))

    await waitFor(() => expect(apiRef.current!.stepId).not.toBeNull())
    await act(async () => {
      apiRef.current!.dispatch({
        type: 'patchFieldBilingual',
        fieldId: apiRef.current!.fieldId,
        patch: { errorEn: 'BilingualDuringPut' },
      })
      apiRef.current!.dispatch({
        type: 'patchStepEditorDraft',
        stepId: apiRef.current!.stepId!,
        patch: { labelEn: 'StepDuringPut' },
      })
    })
    expect(screen.getByTestId('bilingual-draft')).toHaveTextContent('BilingualDuringPut')
    expect(screen.getByTestId('step-draft')).toHaveTextContent('StepDuringPut')
    await act(async () => {
      release()
    })
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('saved'))
    expect(screen.getByTestId('bilingual-draft')).toHaveTextContent('BilingualDuringPut')
    expect(screen.getByTestId('step-draft')).toHaveTextContent('StepDuringPut')
  })
})

describe('FB-D7.1 — operation-specific failure and retry', () => {
  it('keeps Save failure in Save surface with exactly one alert and no Load Retry', async () => {
    const user = userEvent.setup()
    const createDraft = vi.fn(async () => {
      throw new DraftPersistenceError('failed')
    })
    render(
      <BuilderShell
        validationAdapter={createValidationAdapter()}
        persistenceAdapter={createPersistenceAdapter({ createDraft })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('save-draft-button')).toBeEnabled())
    await user.click(screen.getByTestId('save-draft-button'))
    await waitFor(() => expect(screen.getByTestId('persist-save-failed')).toBeInTheDocument())
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    const panel = screen.getByTestId('open-draft-panel')
    expect(within(panel).queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows coordinate guidance without Retry and clears prior load failure coords', async () => {
    const user = userEvent.setup()
    const loadDraft = vi.fn(async () => {
      throw new DraftPersistenceError('not_found')
    })
    render(
      <BuilderShell
        validationAdapter={createValidationAdapter()}
        persistenceAdapter={createPersistenceAdapter({ loadDraft })}
      />,
    )
    const panel = screen.getByTestId('open-draft-panel')
    await user.type(within(panel).getByLabelText(/service id/i), 'missing-service')
    await user.click(within(panel).getByRole('button', { name: /^load$/i }))
    await user.click(screen.getByRole('button', { name: /discard local changes and load/i }))
    await waitFor(() => {
      expect(within(panel).getByRole('alert')).toHaveTextContent(/no draft was found/i)
    })
    expect(within(panel).getByRole('button', { name: /^retry$/i })).toBeInTheDocument()

    await user.clear(within(panel).getByLabelText(/service id/i))
    await user.type(within(panel).getByLabelText(/service id/i), ' bad')
    await user.click(within(panel).getByRole('button', { name: /^load$/i }))
    await waitFor(() => {
      expect(within(panel).getByRole('alert')).toHaveTextContent(/valid service id and version/i)
    })
    expect(within(panel).queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument()
    expect(loadDraft).toHaveBeenCalledTimes(1)
  })

  it('rechecks discard confirmation on Load Retry after a committed edit', async () => {
    const user = userEvent.setup()
    const loadDraft = vi.fn(async () => {
      throw new DraftPersistenceError('failed')
    })
    const validationAdapter = createValidationAdapter()
    const persistenceAdapter = createPersistenceAdapter({ loadDraft })

    function Host() {
      const [ui, setUi] = useState(() =>
        createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
      )
      const sessionEpochRef = useRef(0)
      const validation = useDefinitionValidation({
        definition: ui.authoring.definition,
        uiState: ui,
        adapter: validationAdapter,
      })
      const persistence = useDefinitionPersistence({
        definition: ui.authoring.definition,
        uiState: ui,
        dispatch: (action) => {
          sessionEpochRef.current += 1
          setUi((current) => authoringReducer(current, action))
        },
        validation: validation.view,
        adapter: persistenceAdapter,
        sessionEpochRef,
      })
      return (
        <div>
          <button type="button" onClick={() => persistence.requestLoad('svc-retry', '2')}>
            Load
          </button>
          <button type="button" onClick={persistence.confirmDiscardAndLoad}>
            Confirm
          </button>
          <button type="button" onClick={persistence.cancelDiscardConfirmation}>
            Cancel discard
          </button>
          <button type="button" onClick={persistence.retryLastFailure}>
            Retry
          </button>
          <button
            type="button"
            data-testid="edit"
            onClick={() =>
              setUi((current) => ({
                ...current,
                authoring: {
                  ...current.authoring,
                  definition: {
                    ...current.authoring.definition,
                    audit: {
                      ...current.authoring.definition.audit,
                      createdBy: 'after-load-fail',
                    },
                  },
                },
              }))
            }
          >
            Edit
          </button>
          <span data-testid="phase">{persistence.view.phase}</span>
          <span data-testid="discard">{String(persistence.view.showDiscardConfirmation)}</span>
          <span data-testid="created-by">{ui.authoring.definition.audit.createdBy}</span>
          <span data-testid="retryable">{String(persistence.view.loadRetryable)}</span>
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /^load$/i }))
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))
    await waitFor(() => {
      expect(loadDraft).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('phase')).toHaveTextContent('failed')
      expect(screen.getByTestId('retryable')).toHaveTextContent('true')
    })

    await user.click(screen.getByTestId('edit'))
    await user.click(screen.getByRole('button', { name: /^retry$/i }))
    expect(screen.getByTestId('discard')).toHaveTextContent('true')
    expect(loadDraft).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /cancel discard/i }))
    expect(loadDraft).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('created-by')).toHaveTextContent('after-load-fail')

    await user.click(screen.getByRole('button', { name: /^retry$/i }))
    expect(screen.getByTestId('discard')).toHaveTextContent('true')
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))
    await waitFor(() => expect(loadDraft).toHaveBeenCalledTimes(2))
  })

  it('treats stale load rejection after session change as discarded without failure alert', async () => {
    const user = userEvent.setup()
    let rejectGate!: (error: unknown) => void
    const gate = new Promise<never>((_resolve, reject) => {
      rejectGate = reject
    })
    let bumpEpoch!: () => void
    const loadDraft = vi.fn(async () => gate)
    const persistenceAdapter = createPersistenceAdapter({ loadDraft })
    const validationAdapter = createValidationAdapter()

    function Host() {
      const [ui, setUi] = useState(() =>
        createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
      )
      const sessionEpochRef = useRef(0)
      const validation = useDefinitionValidation({
        definition: ui.authoring.definition,
        uiState: ui,
        adapter: validationAdapter,
      })
      const persistence = useDefinitionPersistence({
        definition: ui.authoring.definition,
        uiState: ui,
        dispatch: (action) => {
          sessionEpochRef.current += 1
          setUi((current) => authoringReducer(current, action))
        },
        validation: validation.view,
        adapter: persistenceAdapter,
        sessionEpochRef,
      })
      bumpEpoch = () => {
        sessionEpochRef.current += 1
      }
      return (
        <div>
          <button type="button" onClick={() => persistence.requestLoad('svc', '2')}>
            Load
          </button>
          <button type="button" onClick={persistence.confirmDiscardAndLoad}>
            Confirm
          </button>
          <span data-testid="phase">{persistence.view.phase}</span>
          <span data-testid="surface">{persistence.view.failureSurface}</span>
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /^load$/i }))
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('loading'))
    bumpEpoch()
    await act(async () => {
      rejectGate(new DraftPersistenceError('failed'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('discarded')
      expect(screen.getByTestId('surface')).toHaveTextContent('none')
    })
  })

  it('rejects a hostile injected adapter response without mutating binding', async () => {
    const user = userEvent.setup()
    const createDraft = vi.fn(async () => ({
      definition: { lockVersion: 1 },
      etag: formatStrongEtagForTests(1),
    }))
    const validationAdapter = createValidationAdapter()
    const persistenceAdapter = createPersistenceAdapter({
      createDraft: createDraft as FormDefinitionDraftPersistenceAdapter['createDraft'],
    })

    function Host() {
      const [ui, setUi] = useState(() =>
        createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
      )
      const sessionEpochRef = useRef(0)
      const validation = useDefinitionValidation({
        definition: ui.authoring.definition,
        uiState: ui,
        adapter: validationAdapter,
      })
      const persistence = useDefinitionPersistence({
        definition: ui.authoring.definition,
        uiState: ui,
        dispatch: (action) => {
          sessionEpochRef.current += 1
          setUi((current) => authoringReducer(current, action))
        },
        validation: validation.view,
        adapter: persistenceAdapter,
        sessionEpochRef,
      })
      return (
        <div>
          <button type="button" onClick={validation.validate}>
            Validate
          </button>
          <button type="button" onClick={persistence.saveDraft}>
            Save
          </button>
          <span data-testid="binding">{persistence.view.binding.kind}</span>
          <span data-testid="phase">{persistence.view.phase}</span>
          <span data-testid="surface">{persistence.view.failureSurface}</span>
          <span data-testid="service">{ui.authoring.definition.serviceId}</span>
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('binding')).toHaveTextContent('local'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('failed')
      expect(screen.getByTestId('surface')).toHaveTextContent('save')
      expect(screen.getByTestId('binding')).toHaveTextContent('local')
    })
    expect(screen.getByTestId('service')).toHaveTextContent(ILLUSTRATIVE_DRAFT_DEFINITION.serviceId)
  })

  it('mutates a detached baseline without affecting local definition', async () => {
    const user = userEvent.setup()
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(1),
    }))
    const validationAdapter = createValidationAdapter()
    const persistenceAdapter = createPersistenceAdapter({ createDraft })

    function Host() {
      const [ui, setUi] = useState(() =>
        createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
      )
      const sessionEpochRef = useRef(0)
      const validation = useDefinitionValidation({
        definition: ui.authoring.definition,
        uiState: ui,
        adapter: validationAdapter,
      })
      const persistence = useDefinitionPersistence({
        definition: ui.authoring.definition,
        uiState: ui,
        dispatch: (action) => {
          sessionEpochRef.current += 1
          setUi((current) => authoringReducer(current, action))
        },
        validation: validation.view,
        adapter: persistenceAdapter,
        sessionEpochRef,
      })
      return (
        <div>
          <button type="button" onClick={validation.validate}>
            Validate
          </button>
          <button type="button" onClick={persistence.saveDraft}>
            Save
          </button>
          <button
            type="button"
            data-testid="mutate-baseline"
            onClick={() => {
              const binding = persistence.view.binding
              if (binding.kind === 'persisted') {
                ;(binding.baseline as { serviceId: string }).serviceId = 'baseline-mutated'
              }
            }}
          >
            Mutate baseline
          </button>
          <span data-testid="binding">{persistence.view.binding.kind}</span>
          <span data-testid="service">{ui.authoring.definition.serviceId}</span>
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByTestId('binding')).toHaveTextContent('persisted'))
    await user.click(screen.getByTestId('mutate-baseline'))
    expect(screen.getByTestId('service')).toHaveTextContent(ILLUSTRATIVE_DRAFT_DEFINITION.serviceId)
  })

  it('StrictMode create issues exactly one adapter call and stays axe-clean in EN/GU', async () => {
    const user = userEvent.setup()
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(1),
    }))
    const { container } = render(
      <StrictMode>
        <BuilderShell
          validationAdapter={createValidationAdapter()}
          persistenceAdapter={createPersistenceAdapter({ createDraft })}
        />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('save-draft-button')).toBeEnabled())
    await user.click(screen.getByTestId('save-draft-button'))
    await waitFor(() => expect(createDraft).toHaveBeenCalledTimes(1))
    expect(await axe(container)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: /^GU$/i }))
    expect(await axe(container)).toHaveNoViolations()
    expect(firstFieldId(ILLUSTRATIVE_DRAFT_DEFINITION)).toBeTruthy()
  })
})
