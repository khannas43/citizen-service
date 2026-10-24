import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { createAuthoringSession } from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  formatStrongEtagForTests,
  type FormDefinitionDraftPersistenceAdapter,
} from '../src/persistence/index.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'
import type { FormDefinitionVersionManagementAdapter } from '../src/versions/index.js'

const ACTOR_ID = 'd19-test-actor'

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

function adapter(
  overrides: Partial<FormDefinitionVersionManagementAdapter> = {},
): FormDefinitionVersionManagementAdapter {
  return {
    listVersions: async ({ afterVersion }) =>
      afterVersion === undefined
        ? {
            serviceId: 'illustrative-builder-d0-preview',
            items: [
              { version: 1, status: 'draft' },
              { version: 2, status: 'published' },
            ],
            nextAfterVersion: 2,
          }
        : {
            serviceId: 'illustrative-builder-d0-preview',
            items: [{ version: 3, status: 'retired' }],
          },
    prepareCloneSource: async ({ serviceId, sourceVersion }) => ({
      serviceId,
      version: sourceVersion,
      status: 'published',
      etag: formatStrongEtagForTests(1),
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

function renderShell(
  versionManagementAdapter: FormDefinitionVersionManagementAdapter,
  actor = ACTOR_ID,
) {
  return render(
    <StrictMode>
      <BuilderShell
        persistenceAdapter={persistenceAdapter()}
        versionManagementAdapter={versionManagementAdapter}
        lifecycleActorId={actor}
      />
    </StrictMode>,
  )
}

describe('FB-D19 Builder version history UI', () => {
  it('lists versions and appends Load more results', async () => {
    const user = userEvent.setup()
    renderShell(adapter())
    await user.click(screen.getByRole('button', { name: /version history/i }))
    await user.click(screen.getByRole('button', { name: /load versions/i }))
    expect(await screen.findByText('v2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /load more/i }))
    expect(await screen.findByText('v3')).toBeInTheDocument()
  })

  it('opens drafts through persistence and cancels cloning without POST', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(adapter().cloneDraft)
    renderShell(adapter({ cloneDraft }))
    await user.click(screen.getByRole('button', { name: /version history/i }))
    await user.click(screen.getByRole('button', { name: /load versions/i }))
    await user.click(screen.getByRole('button', { name: /open draft/i }))
    await waitFor(() =>
      expect(screen.queryByTestId('version-history-panel')).not.toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: /version history/i }))
    await user.click(screen.getByRole('button', { name: /load versions/i }))
    await user.click(screen.getByRole('button', { name: /create new draft/i }))
    expect(await screen.findByTestId('clone-confirm-dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('clone-confirm-cancel'))
    expect(cloneDraft).not.toHaveBeenCalled()
  })

  it('clones exactly once under StrictMode without exposing actor or ETag', async () => {
    const user = userEvent.setup()
    const cloneDraft = vi.fn(adapter().cloneDraft)
    renderShell(adapter({ cloneDraft }))
    await user.click(screen.getByRole('button', { name: /version history/i }))
    await user.click(screen.getByRole('button', { name: /load versions/i }))
    await user.click(screen.getByRole('button', { name: /create new draft/i }))
    await user.click(await screen.findByTestId('clone-confirm-confirm'))
    await waitFor(() => expect(cloneDraft).toHaveBeenCalledTimes(1))
    expect(document.body.textContent).not.toContain(ACTOR_ID)
    expect(document.body.textContent).not.toMatch(/"[A-Za-z0-9_-]{11}"/)
  })

  it('is axe-clean in EN and GU at 390px', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const user = userEvent.setup()
    const { container } = renderShell(adapter())
    await user.click(screen.getByRole('button', { name: /version history/i }))
    expect(await axe(container)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: /^GU$/i }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
