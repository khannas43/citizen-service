/**
 * Deterministic in-memory Unit D acceptance adapters (FB-D22).
 * Acceptance-only — not production defaults and not public package exports.
 */

import type { FormDefinition, ValidationResult } from '@citizen/form-contract'

import { cloneJsonSafe } from '../src/authoring/clone.js'
import { assertDefinitionIntegrity } from '../src/authoring/integrity.js'
import {
  LifecycleError,
  type FormDefinitionLifecycleAdapter,
  type LifecycleSnapshot,
} from '../src/lifecycle/index.js'
import {
  DraftPersistenceError,
  formatStrongEtagForTests,
  type DraftPersistenceSnapshot,
  type FormDefinitionDraftPersistenceAdapter,
} from '../src/persistence/index.js'
import type { FormDefinitionValidationAdapter } from '../src/validation/index.js'
import {
  VersionManagementError,
  type CloneSourceReference,
  type FormDefinitionVersionManagementAdapter,
  type VersionListItem,
  type VersionListPage,
} from '../src/versions/index.js'

export type AcceptanceAdapterMode = 'success' | 'failure' | 'stale' | 'not_found' | 'duplicate'

export type AcceptanceCallLog = {
  readonly name: string
  readonly at: number
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  }
}

async function maybeDelay(ms: number | undefined, signal: AbortSignal): Promise<void> {
  if (!ms || ms <= 0) {
    throwIfAborted(signal)
    return
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      const error = new Error('aborted')
      error.name = 'AbortError'
      reject(error)
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function detachDefinition(definition: FormDefinition): FormDefinition {
  assertDefinitionIntegrity(definition)
  const detached = cloneJsonSafe(definition)
  assertDefinitionIntegrity(detached)
  return detached
}

export type AcceptanceValidationControls = {
  mode?: AcceptanceAdapterMode
  delayMs?: number
  result?: ValidationResult
  onCall?: (definition: FormDefinition) => void
}

export function createAcceptanceValidationAdapter(
  controls: AcceptanceValidationControls = {},
  log: AcceptanceCallLog[] = [],
): FormDefinitionValidationAdapter {
  let seq = 0
  return {
    async validateDefinition({ definition, signal }) {
      log.push({ name: 'validateDefinition', at: ++seq })
      controls.onCall?.(definition)
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (controls.mode === 'failure') {
        throw new Error('acceptance-validation-transport-failure')
      }
      return (
        controls.result ?? {
          valid: true,
          issues: [],
        }
      )
    },
  }
}

export type AcceptancePersistenceStore = {
  drafts: Map<string, { definition: FormDefinition; revision: number }>
  nextRevision: number
}

export function createAcceptancePersistenceStore(): AcceptancePersistenceStore {
  return { drafts: new Map(), nextRevision: 1 }
}

function draftKey(serviceId: string, version: number): string {
  return `${serviceId}::${version}`
}

export type AcceptancePersistenceControls = {
  createMode?: AcceptanceAdapterMode
  loadMode?: AcceptanceAdapterMode
  replaceMode?: AcceptanceAdapterMode
  delayMs?: number
  onCreate?: (definition: FormDefinition) => void
  onLoad?: (serviceId: string, version: number) => void
  onReplace?: (serviceId: string, version: number, etag: string) => void
}

export function createAcceptancePersistenceAdapter(
  store: AcceptancePersistenceStore,
  controls: AcceptancePersistenceControls = {},
  log: AcceptanceCallLog[] = [],
): FormDefinitionDraftPersistenceAdapter {
  let seq = 0
  return {
    async createDraft({ definition, signal }) {
      log.push({ name: 'createDraft', at: ++seq })
      controls.onCreate?.(definition)
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (controls.createMode === 'failure') {
        throw new DraftPersistenceError('failed')
      }
      if (controls.createMode === 'duplicate') {
        throw new DraftPersistenceError('duplicate')
      }
      const detached = detachDefinition(definition)
      const key = draftKey(detached.serviceId, detached.version)
      const existing = store.drafts.get(key)
      if (existing) {
        // Idempotent create for StrictMode double-invoke; explicit duplicate mode still throws above.
        return {
          definition: cloneJsonSafe(existing.definition),
          etag: formatStrongEtagForTests(existing.revision),
        }
      }
      const revision = store.nextRevision++
      store.drafts.set(key, { definition: detached, revision })
      return { definition: cloneJsonSafe(detached), etag: formatStrongEtagForTests(revision) }
    },
    async loadDraft({ serviceId, version, signal }) {
      log.push({ name: 'loadDraft', at: ++seq })
      controls.onLoad?.(serviceId, version)
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (controls.loadMode === 'failure') {
        throw new DraftPersistenceError('failed')
      }
      if (controls.loadMode === 'not_found') {
        throw new DraftPersistenceError('not_found')
      }
      const entry = store.drafts.get(draftKey(serviceId, version))
      if (!entry) {
        throw new DraftPersistenceError('not_found')
      }
      return {
        definition: cloneJsonSafe(entry.definition),
        etag: formatStrongEtagForTests(entry.revision),
      }
    },
    async replaceDraft({ serviceId, version, etag, definition, signal }) {
      log.push({ name: 'replaceDraft', at: ++seq })
      controls.onReplace?.(serviceId, version, etag)
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (controls.replaceMode === 'failure') {
        throw new DraftPersistenceError('failed')
      }
      if (controls.replaceMode === 'stale') {
        throw new DraftPersistenceError('stale')
      }
      const key = draftKey(serviceId, version)
      const entry = store.drafts.get(key)
      if (!entry) {
        throw new DraftPersistenceError('not_found')
      }
      if (etag !== formatStrongEtagForTests(entry.revision)) {
        throw new DraftPersistenceError('stale')
      }
      const detached = detachDefinition(definition)
      const revision = store.nextRevision++
      store.drafts.set(key, { definition: detached, revision })
      return { definition: cloneJsonSafe(detached), etag: formatStrongEtagForTests(revision) }
    },
  }
}

export type AcceptanceLifecycleControls = {
  mode?: AcceptanceAdapterMode
  delayMs?: number
  onSubmit?: (request: {
    serviceId: string
    version: number
    etag: string
    actorId?: string
  }) => void
}

export function createAcceptanceLifecycleAdapter(
  store: AcceptancePersistenceStore,
  controls: AcceptanceLifecycleControls = {},
  log: AcceptanceCallLog[] = [],
): FormDefinitionLifecycleAdapter {
  let seq = 0
  return {
    async submitDraft({ serviceId, version, etag, actorId, signal }) {
      log.push({ name: 'submitDraft', at: ++seq })
      controls.onSubmit?.({ serviceId, version, etag, actorId })
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (typeof actorId !== 'string' || actorId.length === 0) {
        throw new LifecycleError('invalid_actor')
      }
      if (controls.mode === 'failure') {
        throw new LifecycleError('failed')
      }
      if (controls.mode === 'stale') {
        throw new LifecycleError('stale_revision')
      }
      const key = draftKey(serviceId, version)
      const entry = store.drafts.get(key)
      if (!entry) {
        throw new LifecycleError('invalid_coordinates')
      }
      if (etag !== formatStrongEtagForTests(entry.revision)) {
        throw new LifecycleError('stale_revision')
      }
      if (entry.definition.status !== 'draft') {
        throw new LifecycleError('transition_not_allowed')
      }
      const submitted: FormDefinition = {
        ...cloneJsonSafe(entry.definition),
        status: 'submitted',
        audit: {
          createdBy: entry.definition.audit.createdBy,
          createdAt: entry.definition.audit.createdAt,
          submittedBy: actorId,
        },
      }
      const revision = store.nextRevision++
      store.drafts.set(key, { definition: submitted, revision })
      const snapshot: LifecycleSnapshot = {
        definition: cloneJsonSafe(submitted),
        etag: formatStrongEtagForTests(revision),
      }
      return snapshot
    },
  }
}

export type AcceptanceVersionControls = {
  listMode?: AcceptanceAdapterMode
  prepareMode?: AcceptanceAdapterMode
  cloneMode?: AcceptanceAdapterMode
  delayMs?: number
  /** Extra immutable sources not in the draft store (published/retired). */
  immutableSources?: Map<string, { definition: FormDefinition; revision: number }>
}

export function createAcceptanceVersionAdapter(
  store: AcceptancePersistenceStore,
  controls: AcceptanceVersionControls = {},
  log: AcceptanceCallLog[] = [],
): FormDefinitionVersionManagementAdapter {
  let seq = 0
  const sources = () => {
    const map = new Map<string, { definition: FormDefinition; revision: number }>()
    if (controls.immutableSources) {
      for (const [key, value] of controls.immutableSources) {
        map.set(key, value)
      }
    }
    // Live draft-store entries win over seeded immutable sources for the same key.
    for (const [key, value] of store.drafts) {
      map.set(key, value)
    }
    return map
  }

  return {
    async listVersions({ serviceId, afterVersion = 0, limit, signal }) {
      log.push({ name: 'listVersions', at: ++seq })
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (controls.listMode === 'failure') {
        throw new VersionManagementError('failed')
      }
      const items: VersionListItem[] = [...sources().values()]
        .map((entry) => entry.definition)
        .filter((definition) => definition.serviceId === serviceId)
        .sort((a, b) => a.version - b.version)
        .filter((definition) => definition.version > afterVersion)
        .slice(0, Math.min(100, Math.max(1, limit)))
        .map((definition) => ({
          version: definition.version,
          status: definition.status as VersionListItem['status'],
        }))
      const allVersions = [...sources().values()]
        .map((entry) => entry.definition)
        .filter((definition) => definition.serviceId === serviceId)
        .map((definition) => definition.version)
      const last = items.at(-1)?.version ?? afterVersion
      const hasMore = allVersions.some((version) => version > last)
      const page: VersionListPage = {
        serviceId,
        items,
        ...(hasMore ? { nextAfterVersion: last } : {}),
      }
      return page
    },
    async prepareCloneSource({ serviceId, sourceVersion, signal }) {
      log.push({ name: 'prepareCloneSource', at: ++seq })
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (controls.prepareMode === 'failure') {
        throw new VersionManagementError('failed')
      }
      const entry = sources().get(draftKey(serviceId, sourceVersion))
      if (!entry) {
        throw new VersionManagementError('not_found')
      }
      if (entry.definition.status !== 'published' && entry.definition.status !== 'retired') {
        throw new VersionManagementError('source_not_cloneable')
      }
      const reference: CloneSourceReference = {
        serviceId,
        version: sourceVersion,
        status: entry.definition.status,
        etag: formatStrongEtagForTests(entry.revision),
      }
      return reference
    },
    async cloneDraft({ serviceId, sourceVersion, sourceEtag, createdBy, signal }) {
      log.push({ name: 'cloneDraft', at: ++seq })
      await maybeDelay(controls.delayMs, signal)
      throwIfAborted(signal)
      if (typeof createdBy !== 'string' || createdBy.length === 0) {
        throw new VersionManagementError('invalid_actor')
      }
      if (controls.cloneMode === 'failure') {
        throw new VersionManagementError('failed')
      }
      if (controls.cloneMode === 'stale') {
        throw new VersionManagementError('stale_revision')
      }
      const entry = sources().get(draftKey(serviceId, sourceVersion))
      if (!entry) {
        throw new VersionManagementError('not_found')
      }
      if (sourceEtag !== formatStrongEtagForTests(entry.revision)) {
        throw new VersionManagementError('stale_revision')
      }
      if (entry.definition.status !== 'published' && entry.definition.status !== 'retired') {
        throw new VersionManagementError('source_not_cloneable')
      }
      const nextVersion =
        Math.max(
          0,
          ...[...sources().values()]
            .filter((item) => item.definition.serviceId === serviceId)
            .map((item) => item.definition.version),
        ) + 1
      const cloned: FormDefinition = {
        ...cloneJsonSafe(entry.definition),
        version: nextVersion,
        status: 'draft',
        audit: {
          createdBy,
          createdAt: '2026-07-26T12:30:00.000Z',
        },
      }
      const revision = 1
      store.drafts.set(draftKey(serviceId, nextVersion), { definition: cloned, revision })
      const snapshot: DraftPersistenceSnapshot = {
        definition: cloneJsonSafe(cloned),
        etag: formatStrongEtagForTests(revision),
      }
      return snapshot
    },
  }
}

export function seedPublishedSource(
  immutableSources: Map<string, { definition: FormDefinition; revision: number }>,
  definition: FormDefinition,
  revision = 1,
): void {
  const published: FormDefinition = {
    ...cloneJsonSafe(definition),
    status: 'published',
    audit: {
      ...definition.audit,
      approvedBy: 'not-a-dst-approval',
      publishedAt: '2026-07-26T11:00:00.000Z',
    },
  }
  immutableSources.set(draftKey(published.serviceId, published.version), {
    definition: published,
    revision,
  })
}
