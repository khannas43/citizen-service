import { useReducer, useRef, type Dispatch } from 'react'
import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  type AuthoringAction,
  type AuthoringUiState,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  formatStrongEtagForTests,
  type DefinitionPersistenceViewState,
  type FormDefinitionDraftPersistenceAdapter,
} from '../src/persistence/index.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'
import { useDefinitionVersions } from '../src/versions/use-definition-versions.js'
import type { FormDefinitionVersionManagementAdapter } from '../src/versions/index.js'

const ACTOR_ID = 'd20-1-test-actor'
const ETAG = formatStrongEtagForTests(1)

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
    loadDraft: async ({ serviceId, version }) => ({
      definition: {
        ...createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
        serviceId,
        version: Number(version),
      },
      etag: formatStrongEtagForTests(1),
    }),
  }
}

function versionAdapter(
  overrides: Partial<FormDefinitionVersionManagementAdapter> = {},
): FormDefinitionVersionManagementAdapter {
  return {
    listVersions: async () => ({
      serviceId: 'illustrative-builder-d0-preview',
      items: [
        { version: 1, status: 'draft' },
        { version: 2, status: 'published' },
      ],
      nextAfterVersion: undefined,
    }),
    prepareCloneSource: async ({ serviceId, sourceVersion }) => ({
      serviceId,
      version: sourceVersion,
      status: 'published',
      etag: ETAG,
    }),
    cloneDraft: async ({ serviceId, sourceVersion }) => ({
      definition: {
        ...createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
        serviceId,
        version: sourceVersion + 1,
      },
      etag: formatStrongEtagForTests(2),
    }),
    ...overrides,
  }
}

function idlePersistence(): DefinitionPersistenceViewState {
  return {
    phase: 'idle',
    binding: { kind: 'local' },
    definitionDirty: false,
    canSave: false,
    canLoad: true,
    loadBlockedNeedsDiscard: false,
    showDiscardConfirmation: false,
    saveBusy: false,
    loadBusy: false,
    lastSuccessKind: null,
    currentOperation: null,
    failureSurface: 'none',
    loadRetryable: false,
    coordinateGuidance: false,
  }
}

function VersionsHarness({
  uiState,
  dispatch,
  adapter,
  actorId = ACTOR_ID,
  onAdopt = () => {},
  capture,
}: {
  readonly uiState: AuthoringUiState
  readonly dispatch: Dispatch<AuthoringAction>
  readonly adapter: FormDefinitionVersionManagementAdapter | null
  readonly actorId?: string | null
  readonly onAdopt?: (snapshot: { definition: unknown; etag: string }) => void
  readonly capture?: {
    dispatch: Dispatch<AuthoringAction>
    uiState: AuthoringUiState
  }
}) {
  const sessionEpochRef = useRef(0)
  if (capture) {
    capture.dispatch = dispatch
    capture.uiState = uiState
  }
  const api = useDefinitionVersions({
    adapter,
    actorId,
    sessionEpochRef,
    currentServiceId: uiState.authoring.definition.serviceId,
    uiState,
    persistence: idlePersistence(),
    requestLoad: () => {},
    confirmDiscard: () => {},
    cancelDiscard: () => {},
    dispatch,
    onAdoptClonedDraft: onAdopt,
  })

  return (
    <div>
      <button type="button" data-testid="open-panel" onClick={api.openPanel}>
        Open
      </button>
      <button type="button" data-testid="begin-clone" onClick={() => api.beginClone(2)}>
        Begin
      </button>
      <button
        type="button"
        data-testid="confirm-clone"
        disabled={!api.view.canConfirmClone}
        onClick={api.confirmClone}
      >
        Confirm
      </button>
      <button type="button" data-testid="cancel-clone" onClick={api.cancelCloneConfirmation}>
        Cancel
      </button>
      <pre data-testid="phase">{api.view.phase}</pre>
      <pre data-testid="can-confirm">{String(api.view.canConfirmClone)}</pre>
      <pre data-testid="show-confirm">{String(api.view.showCloneConfirmation)}</pre>
    </div>
  )
}

function GuardHost({
  adapter,
  actorId = ACTOR_ID,
  onAdopt,
  capture,
}: {
  readonly adapter: FormDefinitionVersionManagementAdapter
  readonly actorId?: string | null
  readonly onAdopt?: (snapshot: { definition: unknown; etag: string }) => void
  readonly capture: {
    dispatch: Dispatch<AuthoringAction>
    uiState: AuthoringUiState
  }
}) {
  const [uiState, dispatch] = useReducer(authoringReducer, undefined, () =>
    createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
  )
  return (
    <VersionsHarness
      uiState={uiState}
      dispatch={dispatch}
      adapter={adapter}
      actorId={actorId}
      onAdopt={onAdopt}
      capture={capture}
    />
  )
}

function firstFieldId(): string {
  return (ILLUSTRATIVE_DRAFT_DEFINITION.uiSchema['ui:order'] as string[])[0]!
}

describe('FB-D20.1 — clone confirmation interaction guard', () => {
  it('disables confirm and blocks clone POST while a D20 reorder gesture is active', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(versionAdapter().cloneDraft)
    const adapter = versionAdapter({ cloneDraft })
    const capture = {
      dispatch: (() => {}) as Dispatch<AuthoringAction>,
      uiState: createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
    }
    render(<GuardHost adapter={adapter} capture={capture} />)

    await user.click(screen.getByTestId('open-panel'))
    await user.click(screen.getByTestId('begin-clone'))
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('confirming_clone'))
    expect(screen.getByTestId('can-confirm')).toHaveTextContent('true')

    act(() => {
      capture.dispatch({ type: 'beginCanvasReorder', fieldId: firstFieldId(), mode: 'keyboard' })
    })
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('false'))
    expect(screen.getByTestId('confirm-clone')).toBeDisabled()
    expect(screen.getByTestId('show-confirm')).toHaveTextContent('true')
    screen.getByTestId('confirm-clone').click()
    expect(cloneDraft).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(ETAG)

    act(() => {
      capture.dispatch({ type: 'cancelCanvasReorder' })
    })
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('true'))
    expect(screen.getByTestId('confirm-clone')).toBeEnabled()
    await user.click(screen.getByTestId('confirm-clone'))
    await waitFor(() => expect(cloneDraft).toHaveBeenCalledTimes(1))
  })

  it('blocks clone confirmation while configured-add is pending', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(versionAdapter().cloneDraft)
    const adapter = versionAdapter({ cloneDraft })
    const capture = {
      dispatch: (() => {}) as Dispatch<AuthoringAction>,
      uiState: createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
    }
    render(<GuardHost adapter={adapter} capture={capture} />)
    await user.click(screen.getByTestId('open-panel'))
    await user.click(screen.getByTestId('begin-clone'))
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('true'))

    act(() => {
      capture.dispatch({ type: 'beginConfiguredAdd', widgetType: 'radio' })
    })
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('false'))
    screen.getByTestId('confirm-clone').click()
    expect(cloneDraft).not.toHaveBeenCalled()

    act(() => {
      capture.dispatch({ type: 'cancelConfiguredAdd' })
    })
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('true'))
  })

  it('blocks clone confirmation while structural page-break add is pending', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(versionAdapter().cloneDraft)
    const adapter = versionAdapter({ cloneDraft })
    const capture = {
      dispatch: (() => {}) as Dispatch<AuthoringAction>,
      uiState: createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
    }
    render(<GuardHost adapter={adapter} capture={capture} />)
    await user.click(screen.getByTestId('open-panel'))
    await user.click(screen.getByTestId('begin-clone'))
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('true'))

    act(() => {
      capture.dispatch({ type: 'beginPageBreakAdd' })
    })
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('false'))
    screen.getByTestId('confirm-clone').click()
    expect(cloneDraft).not.toHaveBeenCalled()
  })

  it('keeps Cancel available and leaves the session unchanged while blocked', async () => {
    const user = userEvent.setup()
    const onAdopt = vi.fn()
    const adapter = versionAdapter()
    const capture = {
      dispatch: (() => {}) as Dispatch<AuthoringAction>,
      uiState: createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
    }
    render(<GuardHost adapter={adapter} onAdopt={onAdopt} capture={capture} />)
    const definitionBefore = capture.uiState.authoring.definition
    await user.click(screen.getByTestId('open-panel'))
    await user.click(screen.getByTestId('begin-clone'))
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('confirming_clone'))
    act(() => {
      capture.dispatch({ type: 'beginCanvasReorder', fieldId: firstFieldId(), mode: 'pointer' })
    })
    await waitFor(() => expect(screen.getByTestId('can-confirm')).toHaveTextContent('false'))
    expect(screen.getByTestId('cancel-clone')).toBeEnabled()
    await user.click(screen.getByTestId('cancel-clone'))
    expect(screen.getByTestId('phase')).toHaveTextContent('listed')
    expect(onAdopt).not.toHaveBeenCalled()
    expect(capture.uiState.authoring.definition).toBe(definitionBefore)
  })

  it('allows clone prepare/confirm without lifecycleActorId (OIDC JWT path)', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(versionAdapter().cloneDraft)
    const adapter = versionAdapter({ cloneDraft })
    const capture = {
      dispatch: (() => {}) as Dispatch<AuthoringAction>,
      uiState: createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)),
    }
    render(<GuardHost adapter={adapter} actorId={null} capture={capture} />)
    await user.click(screen.getByTestId('open-panel'))
    await user.click(screen.getByTestId('begin-clone'))
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('confirming_clone'))
    expect(screen.getByTestId('can-confirm')).toHaveTextContent('true')
    await user.click(screen.getByTestId('confirm-clone'))
    await waitFor(() => expect(cloneDraft).toHaveBeenCalledTimes(1))
    const call = cloneDraft.mock.calls[0]![0] as { createdBy?: string }
    expect(call.createdBy).toBeUndefined()
  })
})

describe('FB-D20.1 — BuilderShell clone confirmation UI', () => {
  it('wires canConfirmClone into the dialog Confirm button', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(versionAdapter().cloneDraft)
    const stableAdapter = versionAdapter({ cloneDraft })
    render(
      <StrictMode>
        <BuilderShell
          persistenceAdapter={persistenceAdapter()}
          versionManagementAdapter={stableAdapter}
          lifecycleActorId={ACTOR_ID}
        />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: /version history/i }))
    await user.click(screen.getByRole('button', { name: /load versions/i }))
    await user.click(screen.getByRole('button', { name: /create new draft/i }))
    const confirm = await screen.findByTestId('clone-confirm-confirm')
    expect(confirm).toBeEnabled()
    expect(document.body.textContent).not.toContain(ETAG)
    await user.click(screen.getByTestId('clone-confirm-cancel'))
    expect(screen.queryByTestId('clone-confirm-dialog')).not.toBeInTheDocument()
    expect(cloneDraft).not.toHaveBeenCalled()
  }, 15_000)

  it('still clones exactly once under StrictMode when eligible', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(versionAdapter().cloneDraft)
    const stableAdapter = versionAdapter({ cloneDraft })
    render(
      <StrictMode>
        <BuilderShell
          persistenceAdapter={persistenceAdapter()}
          versionManagementAdapter={stableAdapter}
          lifecycleActorId={ACTOR_ID}
        />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: /version history/i }))
    await user.click(screen.getByRole('button', { name: /load versions/i }))
    await user.click(screen.getByRole('button', { name: /create new draft/i }))
    await user.click(await screen.findByTestId('clone-confirm-confirm'))
    await waitFor(() => expect(cloneDraft).toHaveBeenCalledTimes(1))
  }, 15_000)

  it('keeps submitted read-only: reducer ignores reorder lift; version history remains openable', async () => {
    const user = userEvent.setup()
    const submitted = {
      ...createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
      status: 'submitted' as const,
    }
    const ui = createAuthoringUiState(createAuthoringSession(submitted))
    const next = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: firstFieldId(),
      mode: 'keyboard',
    })
    expect(next.canvasReorderGesture).toBeNull()

    render(
      <BuilderShell
        persistenceAdapter={persistenceAdapter()}
        versionManagementAdapter={versionAdapter()}
        lifecycleActorId={ACTOR_ID}
      />,
    )
    await user.click(screen.getByRole('button', { name: /version history/i }))
    expect(screen.getByTestId('version-history-panel')).toBeInTheDocument()
  }, 15_000)
})
