import { StrictMode, useEffect, useRef, useState } from 'react'
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
        definition,
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
        definition,
        etag: formatStrongEtagForTests(3),
      })),
  }
}

describe('FB-D7 Builder UI — save and load', () => {
  it('validates then creates a local draft into a clean stored state', async () => {
    const user = userEvent.setup()
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(11),
    }))
    render(
      <BuilderShell
        validationAdapter={createValidationAdapter()}
        persistenceAdapter={createPersistenceAdapter({ createDraft })}
      />,
    )
    expect(screen.getByTestId('persist-binding-badge')).toHaveTextContent(/local draft/i)
    expect(screen.getByTestId('save-draft-button')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('save-draft-button')).toBeEnabled()
    })
    await user.click(screen.getByTestId('save-draft-button'))
    await waitFor(() => {
      expect(createDraft).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('persist-binding-badge')).toHaveTextContent(/stored draft/i)
      expect(screen.getByTestId('persist-dirty-badge')).toHaveTextContent(/^saved$/i)
      expect(screen.getByTestId('persist-success')).toHaveTextContent(/draft created/i)
    })
    expect(screen.getByTestId('save-draft-button')).toBeDisabled()
    // FB-E5.4.2B: submit eligibility no longer requires client actorId (JWT sub under OIDC).
    expect(screen.getByTestId('submit-button')).toBeEnabled()
    expect(document.body.textContent).not.toMatch(/"[A-Za-z0-9_-]{11}"/)
  })

  it('requires discard confirmation for load and Cancel makes zero calls', async () => {
    const user = userEvent.setup()
    const loadDraft = vi.fn()
    render(
      <BuilderShell
        validationAdapter={createValidationAdapter()}
        persistenceAdapter={createPersistenceAdapter({ loadDraft })}
      />,
    )
    const panel = screen.getByTestId('open-draft-panel')
    await user.type(within(panel).getByLabelText(/service id/i), 'other-service')
    await user.clear(within(panel).getByLabelText(/^version$/i))
    await user.type(within(panel).getByLabelText(/^version$/i), '2')
    await user.click(within(panel).getByRole('button', { name: /^load$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/discard local changes/i)
    expect(loadDraft).not.toHaveBeenCalled()
    await user.click(within(panel).getByRole('button', { name: /^cancel$/i }))
    expect(loadDraft).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('loads after explicit discard and replaces the session', async () => {
    const user = userEvent.setup()
    const loaded = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const loadDraft = vi.fn(async () => ({
      definition: {
        ...loaded,
        serviceId: 'loaded-service',
        version: 2,
      },
      etag: formatStrongEtagForTests(4),
    }))
    render(
      <BuilderShell
        validationAdapter={createValidationAdapter()}
        persistenceAdapter={createPersistenceAdapter({ loadDraft })}
      />,
    )
    const panel = screen.getByTestId('open-draft-panel')
    await user.clear(within(panel).getByLabelText(/service id/i))
    await user.type(within(panel).getByLabelText(/service id/i), 'loaded-service')
    await user.clear(within(panel).getByLabelText(/^version$/i))
    await user.type(within(panel).getByLabelText(/^version$/i), '2')
    await user.click(within(panel).getByRole('button', { name: /^load$/i }))
    await user.click(screen.getByRole('button', { name: /discard local changes and load/i }))
    await waitFor(() => {
      expect(loadDraft).toHaveBeenCalledTimes(1)
      expect(screen.getByText('loaded-service')).toBeInTheDocument()
      expect(screen.getByTestId('persist-binding-badge')).toHaveTextContent(/stored draft/i)
      expect(screen.getByTestId('persist-success')).toHaveTextContent(/draft loaded/i)
    })
  })

  it('shows duplicate guidance without inventing an ETag', async () => {
    const user = userEvent.setup()
    const createDraft = vi.fn(async () => {
      throw new DraftPersistenceError('duplicate')
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
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i)
    })
    expect(screen.getByTestId('persist-binding-badge')).toHaveTextContent(/local draft/i)
  })

  it('shows stale guidance and keeps the local definition', async () => {
    const user = userEvent.setup()
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(1),
    }))
    const replaceDraft = vi.fn(async () => {
      throw new DraftPersistenceError('stale')
    })
    const validationAdapter = createValidationAdapter()
    const persistenceAdapter = createPersistenceAdapter({ createDraft, replaceDraft })

    function Host() {
      const [ui, setUi] = useState(() => createAuthoringUiState(createAuthoringSession(base)))
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
          <button
            type="button"
            onClick={persistence.saveDraft}
            disabled={!persistence.view.canSave}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() =>
              setUi((current) => ({
                ...current,
                authoring: {
                  ...current.authoring,
                  definition: {
                    ...current.authoring.definition,
                    audit: {
                      ...current.authoring.definition.audit,
                      createdBy: 'stale-local-edit',
                    },
                  },
                },
              }))
            }
          >
            Edit definition
          </button>
          <span data-testid="phase">{persistence.view.phase}</span>
          <span data-testid="cansave">{String(persistence.view.canSave)}</span>
          <span data-testid="created-by">{ui.authoring.definition.audit.createdBy}</span>
          <span data-testid="binding">{persistence.view.binding.kind}</span>
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('cansave')).toHaveTextContent('true'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByTestId('binding')).toHaveTextContent('persisted'))
    await user.click(screen.getByRole('button', { name: /edit definition/i }))
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('cansave')).toHaveTextContent('true'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      expect(replaceDraft).toHaveBeenCalled()
      expect(screen.getByTestId('phase')).toHaveTextContent('stale')
      expect(screen.getByTestId('cansave')).toHaveTextContent('false')
      expect(screen.getByTestId('created-by')).toHaveTextContent('stale-local-edit')
    })
  })

  it('enables Submit after create when validation is current and stays axe-clean in EN', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StrictMode>
        <BuilderShell
          validationAdapter={createValidationAdapter()}
          persistenceAdapter={createPersistenceAdapter()}
        />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('save-draft-button')).toBeEnabled())
    await user.click(screen.getByTestId('save-draft-button'))
    await waitFor(() => expect(screen.getByTestId('persist-success')).toBeInTheDocument())
    expect(screen.getByTestId('submit-button')).toBeEnabled()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('FB-D7 — persistence hook races', () => {
  function Harness(props: {
    readonly persistenceAdapter: FormDefinitionDraftPersistenceAdapter
    readonly validationAdapter?: FormDefinitionValidationAdapter
    readonly onEpoch?: (bump: () => void) => void
  }) {
    const [ui, setUi] = useState(() =>
      createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
    )
    const sessionEpochRef = useRef(0)
    const validation = useDefinitionValidation({
      definition: ui.authoring.definition,
      uiState: ui,
      adapter: props.validationAdapter ?? createValidationAdapter(),
    })
    const persistence = useDefinitionPersistence({
      definition: ui.authoring.definition,
      uiState: ui,
      dispatch: (action) => {
        sessionEpochRef.current += 1
        setUi((current) => authoringReducer(current, action))
      },
      validation: validation.view,
      adapter: props.persistenceAdapter,
      sessionEpochRef,
    })
    useEffect(() => {
      props.onEpoch?.(() => {
        sessionEpochRef.current += 1
      })
    }, [props])
    return (
      <div>
        <button type="button" onClick={validation.validate}>
          Validate
        </button>
        <button type="button" onClick={persistence.saveDraft} disabled={!persistence.view.canSave}>
          Save
        </button>
        <button type="button" onClick={() => persistence.requestLoad('loaded-service', '2')}>
          Load
        </button>
        <button type="button" onClick={persistence.confirmDiscardAndLoad}>
          Confirm discard
        </button>
        <span data-testid="phase">{persistence.view.phase}</span>
        <span data-testid="binding">{persistence.view.binding.kind}</span>
        <span data-testid="service">{ui.authoring.definition.serviceId}</span>
      </div>
    )
  }

  it('discards stale load when the session mutates mid-flight', async () => {
    const user = userEvent.setup()
    let release!: (value: { definition: FormDefinition; etag: string }) => void
    const gate = new Promise<{ definition: FormDefinition; etag: string }>((resolve) => {
      release = resolve
    })
    let bumpEpoch!: () => void
    const loadDraft = vi.fn(async () => gate)
    render(
      <Harness
        persistenceAdapter={createPersistenceAdapter({ loadDraft })}
        onEpoch={(bump) => {
          bumpEpoch = bump
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^load$/i }))
    await user.click(screen.getByRole('button', { name: /confirm discard/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('loading')
    bumpEpoch()
    release({
      definition: {
        ...createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
        serviceId: 'should-not-apply',
      },
      etag: formatStrongEtagForTests(9),
    })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('discarded')
      expect(screen.getByTestId('service')).not.toHaveTextContent('should-not-apply')
    })
  })

  it('discards save acknowledgement when coordinates change mid-flight', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => {
      await gate
      return { definition: structuredClone(definition), etag: formatStrongEtagForTests(5) }
    })

    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    const validationAdapter = createValidationAdapter(validateDefinition)
    const persistenceAdapter = createPersistenceAdapter({ createDraft })

    function SaveRaceHost() {
      const [ui, setUi] = useState(() => createAuthoringUiState(createAuthoringSession(base)))
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
            onClick={() =>
              setUi((current) => ({
                ...current,
                authoring: {
                  ...current.authoring,
                  definition: {
                    ...current.authoring.definition,
                    serviceId: 'edited-during-save',
                  },
                },
              }))
            }
          >
            Edit during save
          </button>
          <span data-testid="vphase">{validation.view.phase}</span>
          <span data-testid="cansave">{String(persistence.view.canSave)}</span>
          <span data-testid="service">{ui.authoring.definition.serviceId}</span>
          <span data-testid="binding">{persistence.view.binding.kind}</span>
          <span data-testid="phase">{persistence.view.phase}</span>
          <span data-testid="dirty">{String(persistence.view.definitionDirty)}</span>
        </div>
      )
    }

    render(<SaveRaceHost />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(validateDefinition).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('vphase')).toHaveTextContent('valid'))
    await waitFor(() => expect(screen.getByTestId('cansave')).toHaveTextContent('true'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(createDraft).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /edit during save/i }))
    await act(async () => {
      release()
    })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('discarded')
      expect(screen.getByTestId('binding')).toHaveTextContent('local')
      expect(screen.getByTestId('service')).toHaveTextContent('edited-during-save')
    })
  })

  it('retains a newer same-coordinate edit over a returned save baseline', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const createDraft = vi.fn(async ({ definition }: { definition: FormDefinition }) => {
      await gate
      return { definition: structuredClone(definition), etag: formatStrongEtagForTests(5) }
    })

    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    const validationAdapter = createValidationAdapter(validateDefinition)
    const persistenceAdapter = createPersistenceAdapter({ createDraft })

    function SaveRaceHost() {
      const [ui, setUi] = useState(() => createAuthoringUiState(createAuthoringSession(base)))
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
            onClick={() =>
              setUi((current) => ({
                ...current,
                authoring: {
                  ...current.authoring,
                  definition: {
                    ...current.authoring.definition,
                    audit: {
                      ...current.authoring.definition.audit,
                      createdBy: 'edited-during-save',
                    },
                  },
                },
              }))
            }
          >
            Edit during save
          </button>
          <span data-testid="binding">{persistence.view.binding.kind}</span>
          <span data-testid="created-by">{ui.authoring.definition.audit.createdBy}</span>
          <span data-testid="dirty">{String(persistence.view.definitionDirty)}</span>
        </div>
      )
    }

    render(<SaveRaceHost />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => expect(screen.getByTestId('binding')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(createDraft).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /edit during save/i }))
    await act(async () => {
      release()
    })
    await waitFor(() => {
      expect(screen.getByTestId('binding')).toHaveTextContent('persisted')
      expect(screen.getByTestId('created-by')).toHaveTextContent('edited-during-save')
      expect(screen.getByTestId('dirty')).toHaveTextContent('true')
    })
  })
})
