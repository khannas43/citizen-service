import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { FormDefinition } from '@citizen/form-contract'

import { createAuthoringSession } from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { LifecycleError, type FormDefinitionLifecycleAdapter } from '../src/lifecycle/index.js'
import {
  formatStrongEtagForTests,
  type FormDefinitionDraftPersistenceAdapter,
} from '../src/persistence/index.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'
import type { FormDefinitionValidationAdapter } from '../src/validation/index.js'

const ACTOR_ID = 'd18-test-actor'

function validationAdapter(): FormDefinitionValidationAdapter {
  return { validateDefinition: async () => ({ valid: true, issues: [] }) }
}

function persistenceAdapter(): FormDefinitionDraftPersistenceAdapter {
  return {
    createDraft: async ({ definition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(1),
    }),
    loadDraft: async () => ({
      definition: createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
      etag: formatStrongEtagForTests(1),
    }),
    replaceDraft: async ({ definition }) => ({
      definition: structuredClone(definition),
      etag: formatStrongEtagForTests(2),
    }),
  }
}

function submittedSnapshot(definition: FormDefinition) {
  return {
    definition: {
      ...structuredClone(definition),
      status: 'submitted' as const,
      audit: { ...definition.audit, submittedBy: ACTOR_ID },
    },
    etag: formatStrongEtagForTests(2),
  }
}

async function validateAndCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^validate$/i }))
  await waitFor(() => expect(screen.getByTestId('save-draft-button')).toBeEnabled(), {
    timeout: 15_000,
  })
  await user.click(screen.getByTestId('save-draft-button'))
  await waitFor(() => expect(screen.getByTestId('persist-success')).toBeInTheDocument(), {
    timeout: 15_000,
  })
  await waitFor(() => expect(screen.getByTestId('submit-button')).toBeEnabled(), {
    timeout: 15_000,
  })
}

function renderShell(lifecycleAdapter: FormDefinitionLifecycleAdapter) {
  return render(
    <StrictMode>
      <BuilderShell
        validationAdapter={validationAdapter()}
        persistenceAdapter={persistenceAdapter()}
        lifecycleAdapter={lifecycleAdapter}
        lifecycleActorId={ACTOR_ID}
      />
    </StrictMode>,
  )
}

describe('FB-D18 Builder lifecycle UI', () => {
  it('opens confirmation after Validate/Create, while Cancel and Escape make zero lifecycle calls', async () => {
    const user = userEvent.setup()
    const submitDraft = vi.fn()
    renderShell({ submitDraft })
    expect(screen.getByTestId('submit-button')).toBeDisabled()
    await validateAndCreate(user)

    await user.click(screen.getByTestId('submit-button'))
    expect(screen.getByTestId('submit-confirm-dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('submit-confirm-cancel'))
    expect(screen.queryByTestId('submit-confirm-dialog')).not.toBeInTheDocument()
    expect(submitDraft).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('submit-button'))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('submit-confirm-dialog')).not.toBeInTheDocument()
    expect(submitDraft).not.toHaveBeenCalled()
  }, 15_000)

  it('submits exactly once under StrictMode and makes authoring read-only', async () => {
    const user = userEvent.setup()
    const submitDraft = vi.fn(
      async ({
        serviceId,
        version,
      }: Parameters<FormDefinitionLifecycleAdapter['submitDraft']>[0]) =>
        submittedSnapshot({
          ...createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
          serviceId,
          version,
        }),
    )
    renderShell({ submitDraft })
    await validateAndCreate(user)
    await user.click(screen.getByTestId('submit-button'))
    await user.click(screen.getByTestId('submit-confirm-confirm'))
    await waitFor(() => expect(screen.getByTestId('submit-success')).toBeInTheDocument(), {
      timeout: 15_000,
    })
    expect(submitDraft).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('submit-readonly-guidance')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: /Add |Create boundary/i })) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByTestId('open-draft-panel')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(ACTOR_ID)
    expect(document.body.textContent).not.toMatch(/"[A-Za-z0-9_-]{11}"/)
  }, 15_000)

  it('keeps the local draft when submit receives a stale response', async () => {
    const user = userEvent.setup()
    const submitDraft = vi.fn(async () => {
      throw new LifecycleError('stale_revision')
    })
    renderShell({ submitDraft })
    await validateAndCreate(user)
    await user.click(screen.getByTestId('submit-button'))
    await user.click(screen.getByTestId('submit-confirm-confirm'))
    await waitFor(
      () => expect(screen.getByRole('alert')).toHaveTextContent(/stored draft changed/i),
      {
        timeout: 15_000,
      },
    )
    expect(screen.queryByTestId('submit-success')).not.toBeInTheDocument()
    expect(screen.queryByTestId('submit-readonly-guidance')).not.toBeInTheDocument()
  }, 15_000)

  it('is axe-clean in EN and GU at a 390px confirmation viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const user = userEvent.setup()
    const { container } = renderShell({ submitDraft: vi.fn() })
    await validateAndCreate(user)
    await user.click(screen.getByTestId('submit-button'))
    expect(await axe(container)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: /^GU$/i }))
    expect(await axe(container)).toHaveNoViolations()
  }, 15_000)
})
