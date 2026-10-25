import type { FormDefinition } from '@citizen/form-contract'

export interface SubmitDraftRequest {
  readonly serviceId: string
  readonly version: number
  readonly etag: string
  /**
   * Technical/non-OIDC injected adapters only. Default HTTP adapter ignores this and never sends
   * client identity (FB-E5.4.2B).
   */
  readonly actorId?: string
  readonly signal: AbortSignal
}

export interface LifecycleSnapshot {
  readonly definition: FormDefinition
  readonly etag: string
}

/** The lifecycle port exposes only the allowed draft submission transition. */
export interface FormDefinitionLifecycleAdapter {
  submitDraft(request: SubmitDraftRequest): Promise<LifecycleSnapshot>
}

export type LifecycleFailureCode =
  | 'stale_revision'
  | 'transition_not_allowed'
  | 'invalid_request'
  | 'response_rejected'
  | 'failed'
  | 'invalid_coordinates'
  | 'invalid_actor'
  | 'unauthenticated'

export class LifecycleError extends Error {
  readonly code: LifecycleFailureCode

  constructor(code: LifecycleFailureCode) {
    super(code)
    this.name = 'LifecycleError'
    this.code = code
  }
}
