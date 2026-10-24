import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import {
  UNIT_D_ACCEPTANCE_ACTOR,
  UNIT_D_ACCEPTANCE_DEFINITION,
  UNIT_D_ACCEPTANCE_SERVICE_ID,
  createAcceptanceLifecycleAdapter,
  createAcceptancePersistenceAdapter,
  createAcceptancePersistenceStore,
  createAcceptanceValidationAdapter,
  createAcceptanceVersionAdapter,
  seedPublishedSource,
  type AcceptanceCallLog,
  type AcceptancePersistenceStore,
} from '../acceptance/index.js'
import { createAuthoringSession } from '../src/authoring/index.js'
import { formatStrongEtagForTests } from '../src/persistence/index.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'

function harness(options?: {
  validationMode?: 'success' | 'failure'
  replaceMode?: 'success' | 'stale'
  lifecycleMode?: 'success' | 'failure' | 'stale'
  cloneMode?: 'success' | 'stale'
}) {
  const log: AcceptanceCallLog[] = []
  const store = createAcceptancePersistenceStore()
  const immutable = new Map()
  // Clone sources use distinct versions so submitted v1 is not overwritten.
  seedPublishedSource(
    immutable,
    {
      ...createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION).definition,
      version: 10,
    },
    1,
  )
  immutable.set(`${UNIT_D_ACCEPTANCE_SERVICE_ID}::11`, {
    definition: {
      ...createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION).definition,
      version: 11,
      status: 'retired' as const,
    },
    revision: 1,
  })

  const validation = createAcceptanceValidationAdapter(
    {
      mode: options?.validationMode === 'failure' ? 'failure' : 'success',
      result:
        options?.validationMode === 'failure'
          ? undefined
          : {
              valid: true,
              issues: [
                {
                  severity: 'info',
                  code: 'acceptance.advisory',
                  message: 'Representative advisory only',
                  path: 'meta',
                },
              ],
            },
    },
    log,
  )
  const persistence = createAcceptancePersistenceAdapter(
    store,
    { replaceMode: options?.replaceMode === 'stale' ? 'stale' : 'success' },
    log,
  )
  const lifecycle = createAcceptanceLifecycleAdapter(
    store,
    { mode: options?.lifecycleMode ?? 'success' },
    log,
  )
  const versions = createAcceptanceVersionAdapter(
    store,
    {
      immutableSources: immutable,
      cloneMode: options?.cloneMode === 'stale' ? 'stale' : 'success',
    },
    log,
  )

  return { log, store, validation, persistence, lifecycle, versions }
}

function renderAcceptance(parts: ReturnType<typeof harness>) {
  return render(
    <StrictMode>
      <BuilderShell
        initialDefinition={UNIT_D_ACCEPTANCE_DEFINITION}
        validationAdapter={parts.validation}
        persistenceAdapter={parts.persistence}
        lifecycleAdapter={parts.lifecycle}
        versionManagementAdapter={parts.versions}
        lifecycleActorId={UNIT_D_ACCEPTANCE_ACTOR}
      />
    </StrictMode>,
  )
}

async function validateAndCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Validate$/i }))
  await waitFor(() => expect(screen.getByTestId('save-draft-button')).toBeEnabled())
  await user.click(screen.getByTestId('save-draft-button'))
  await waitFor(() => expect(screen.getByTestId('persist-success')).toBeInTheDocument())
}

describe('FB-D22 — Unit D package acceptance (shell)', () => {
  it('fresh authoring: palette 30, drafts block, apply restores, no fetch/storage', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const storageSet = vi.spyOn(Storage.prototype, 'setItem')
    const parts = harness()
    renderAcceptance(parts)

    expect(document.querySelectorAll('.dg20-builder-palette__item--addable')).toHaveLength(30)
    expect(document.querySelectorAll('.dg20-builder-palette__item--pending')).toHaveLength(0)
    expect(document.body.textContent).toContain(UNIT_D_ACCEPTANCE_SERVICE_ID)

    // Immediate add remains available on the acceptance fixture.
    await user.click(screen.getByRole('button', { name: /Add Short text/i }))
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-field-id], .dg20-builder-canvas__row').length,
      ).toBeGreaterThan(0),
    )

    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    await user.click(screen.getByRole('button', { name: 'Add integration binding' }))
    expect(screen.getByRole('button', { name: /^Validate$/i })).toBeDisabled()
    await user.click(
      within(
        screen.getByRole('heading', { name: /Integration Hub/i }).closest('section')!,
      ).getByRole('button', { name: /^Cancel$/i }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /^Validate$/i })).toBeEnabled())

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSet).not.toHaveBeenCalled()
    expect(document.body.innerHTML).not.toMatch(/\bETag\b|unit-d-acceptance-actor/i)
  }, 20_000)

  it('validation advisory, create, save If-Match, submit confirmation, read-only', async () => {
    const user = userEvent.setup()
    const parts = harness()
    renderAcceptance(parts)

    await validateAndCreate(user)
    expect(parts.log.map((entry) => entry.name)).toEqual(['validateDefinition', 'createDraft'])
    expect(parts.store.drafts.size).toBe(1)

    // Edit property to invalidate validation, then validate + replace.
    const canvasButtons = within(
      document.querySelector('.dg20-builder-canvas') as HTMLElement,
    ).getAllByRole('button')
    const fieldButton = canvasButtons.find(
      (button) =>
        button.getAttribute('data-reorder-field-id') == null &&
        (button.textContent ?? '').length > 0,
    )
    if (fieldButton) {
      await user.click(fieldButton)
    }
    const labelEn = screen.queryByLabelText(/Label \(English\)/i)
    if (labelEn) {
      await user.clear(labelEn)
      await user.type(labelEn, 'Acceptance renamed')
      await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    }

    await user.click(screen.getByRole('button', { name: /^Validate$/i }))
    await waitFor(() => expect(screen.getByTestId('save-draft-button')).toBeEnabled())
    await user.click(screen.getByTestId('save-draft-button'))
    await waitFor(() =>
      expect(parts.log.filter((entry) => entry.name === 'replaceDraft').length).toBeGreaterThan(0),
    )

    await waitFor(() => expect(screen.getByTestId('submit-button')).toBeEnabled())
    await user.click(screen.getByTestId('submit-button'))
    expect(screen.getByTestId('submit-confirm-dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(parts.log.some((entry) => entry.name === 'submitDraft')).toBe(false)

    await user.click(screen.getByTestId('submit-button'))
    await user.click(screen.getByTestId('submit-confirm-confirm'))
    await waitFor(() =>
      expect(parts.log.filter((entry) => entry.name === 'submitDraft')).toHaveLength(1),
    )
    await waitFor(() => expect(screen.getByTestId('submit-success')).toBeInTheDocument())
    expect(document.body.innerHTML).not.toMatch(/\bETag\b|unit-d-acceptance-actor/i)
  }, 30_000)

  it('Open Draft discard Cancel makes zero load calls; version list + clone after submit', async () => {
    const user = userEvent.setup()
    const parts = harness()
    renderAcceptance(parts)

    // Local unbound session always needs discard confirmation before load.
    const panel = screen.getByTestId('open-draft-panel')
    await user.type(within(panel).getByLabelText(/service id/i), 'other-service')
    await user.clear(within(panel).getByLabelText(/^version$/i))
    await user.type(within(panel).getByLabelText(/^version$/i), '2')
    await user.click(within(panel).getByRole('button', { name: /^load$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/discard local changes/i)
    const loadsBefore = parts.log.filter((entry) => entry.name === 'loadDraft').length
    await user.click(within(panel).getByRole('button', { name: /^cancel$/i }))
    expect(parts.log.filter((entry) => entry.name === 'loadDraft').length).toBe(loadsBefore)

    await validateAndCreate(user)
    await waitFor(() => expect(screen.getByTestId('submit-button')).toBeEnabled())
    await user.click(screen.getByTestId('submit-button'))
    await user.click(screen.getByTestId('submit-confirm-confirm'))
    await waitFor(() => expect(parts.log.some((entry) => entry.name === 'submitDraft')).toBe(true))
    await waitFor(() => expect(screen.getByTestId('submit-readonly-guidance')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /^Version history$/i }))
    await user.click(screen.getByRole('button', { name: /^Load versions$/i }))
    await waitFor(() => expect(parts.log.some((entry) => entry.name === 'listVersions')).toBe(true))
    expect(await screen.findByText('v1')).toBeInTheDocument()
    expect(screen.getByText('v10')).toBeInTheDocument()
    expect(screen.getByText('v11')).toBeInTheDocument()

    const createDraftButtons = screen.getAllByRole('button', { name: /create new draft/i })
    expect(createDraftButtons.length).toBeGreaterThan(0)
    await user.click(createDraftButtons[0]!)
    expect(await screen.findByTestId('clone-confirm-dialog')).toBeInTheDocument()
    await user.click(screen.getByTestId('clone-confirm-cancel'))
    expect(parts.log.some((entry) => entry.name === 'cloneDraft')).toBe(false)

    await user.click(screen.getAllByRole('button', { name: /create new draft/i })[0]!)
    await user.click(screen.getByTestId('clone-confirm-confirm'))
    await waitFor(() => expect(parts.log.some((entry) => entry.name === 'cloneDraft')).toBe(true))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Add Short text/i })).toBeEnabled(),
    )
    expect(document.body.innerHTML).not.toMatch(/\bETag\b|unit-d-acceptance-actor/i)
  }, 45_000)

  it('validation transport failure + Retry; locale relabel without network', async () => {
    const user = userEvent.setup()
    const parts = harness({ validationMode: 'failure' })
    renderAcceptance(parts)

    await user.click(screen.getByRole('button', { name: /^Validate$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(screen.getByRole('button', { name: 'GU' })).toHaveAttribute('aria-pressed', 'true')
    expect(parts.log.filter((entry) => entry.name === 'validateDefinition').length).toBe(1)
  }, 15_000)

  it('axe EN/GU on shell with acceptance fixture; 390px no overflow', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 390,
    })
    const parts = harness()
    const { container } = renderAcceptance(parts)
    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(await axe(document.querySelector('.dg20-builder-bindings')!)).toHaveNoViolations()
    await user.click(screen.getByRole('tab', { name: 'Bilingual' }))
    expect(await axe(document.querySelector('.dg20-builder-bilingual')!)).toHaveNoViolations()
    await user.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(await axe(document.querySelector('.dg20-builder-steps')!)).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(container)).toHaveNoViolations()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(391)
  }, 20_000)
})

describe('FB-D22 — acceptance adapter failure matrix', () => {
  it('stale replace, duplicate create, load not found, and clone stale', async () => {
    const store: AcceptancePersistenceStore = createAcceptancePersistenceStore()
    const session = createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION)
    const signal = new AbortController().signal

    const duplicate = createAcceptancePersistenceAdapter(store, { createMode: 'duplicate' })
    await expect(
      duplicate.createDraft({ definition: session.definition, signal }),
    ).rejects.toMatchObject({ code: 'duplicate' })

    const persistence = createAcceptancePersistenceAdapter(store, { replaceMode: 'stale' })
    const created = await persistence.createDraft({ definition: session.definition, signal })
    await expect(
      persistence.replaceDraft({
        serviceId: created.definition.serviceId,
        version: created.definition.version,
        etag: created.etag,
        definition: created.definition,
        signal,
      }),
    ).rejects.toMatchObject({ code: 'stale' })
    expect(
      store.drafts.get(`${created.definition.serviceId}::${created.definition.version}`)!.revision,
    ).toBe(1)

    const missing = createAcceptancePersistenceAdapter(store, { loadMode: 'not_found' })
    await expect(
      missing.loadDraft({
        serviceId: UNIT_D_ACCEPTANCE_SERVICE_ID,
        version: 99,
        signal,
      }),
    ).rejects.toMatchObject({ code: 'not_found' })

    const immutable = new Map()
    seedPublishedSource(immutable, UNIT_D_ACCEPTANCE_DEFINITION, 3)
    const versionsWithSource = createAcceptanceVersionAdapter(store, {
      immutableSources: immutable,
      cloneMode: 'stale',
    })
    await expect(
      versionsWithSource.cloneDraft({
        serviceId: UNIT_D_ACCEPTANCE_SERVICE_ID,
        sourceVersion: 1,
        sourceEtag: formatStrongEtagForTests(3),
        createdBy: UNIT_D_ACCEPTANCE_ACTOR,
        signal,
      }),
    ).rejects.toMatchObject({ code: 'stale_revision' })
    expect(store.drafts.size).toBe(1)
  })
})
