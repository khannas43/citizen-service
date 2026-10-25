import type { FormDefinition } from '@citizen/form-contract'

/** Exact draft coordinates for Unit C GET/PUT query parameters (FB-D7). */
export interface DraftCoordinates {
  readonly serviceId: string
  readonly version: number
}

/** Detached server baseline + opaque ETag held outside FormDefinition (FB-D7). */
export interface DraftPersistenceSnapshot {
  readonly definition: FormDefinition
  readonly etag: string
}

export interface CreateDraftRequest {
  readonly definition: FormDefinition
  readonly signal: AbortSignal
}

export interface LoadDraftRequest {
  readonly serviceId: string
  readonly version: number
  readonly signal: AbortSignal
}

export interface ReplaceDraftRequest {
  readonly serviceId: string
  readonly version: number
  readonly etag: string
  readonly definition: FormDefinition
  readonly signal: AbortSignal
}

/**
 * Builder-owned draft persistence port (FB-D7).
 * Not WidgetServicePorts and not form-renderer.
 */
export interface FormDefinitionDraftPersistenceAdapter {
  createDraft(request: CreateDraftRequest): Promise<DraftPersistenceSnapshot>
  loadDraft(request: LoadDraftRequest): Promise<DraftPersistenceSnapshot>
  replaceDraft(request: ReplaceDraftRequest): Promise<DraftPersistenceSnapshot>
}

export type DraftPersistenceFailureCode =
  | 'duplicate'
  | 'not_found'
  | 'stale'
  | 'not_editable'
  | 'validation_rejected'
  | 'response_rejected'
  | 'failed'
  | 'invalid_coordinates'
  | 'unauthenticated'

export class DraftPersistenceError extends Error {
  readonly code: DraftPersistenceFailureCode

  constructor(code: DraftPersistenceFailureCode) {
    super(code)
    this.name = 'DraftPersistenceError'
    this.code = code
  }
}
