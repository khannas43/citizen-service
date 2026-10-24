import type { DraftPersistenceSnapshot } from '../persistence/form-definition-draft-persistence-adapter.js'

export type VersionListStatus = 'draft' | 'submitted' | 'approved' | 'published' | 'retired'

export interface VersionListItem {
  readonly version: number
  readonly status: VersionListStatus
}

export interface VersionListPage {
  readonly serviceId: string
  readonly items: readonly VersionListItem[]
  readonly nextAfterVersion?: number
}

export interface CloneSourceReference {
  readonly serviceId: string
  readonly version: number
  readonly status: 'published' | 'retired'
  readonly etag: string
}

export interface ListVersionsRequest {
  readonly serviceId: string
  readonly afterVersion?: number
  readonly limit: number
  readonly signal: AbortSignal
}

export interface PrepareCloneSourceRequest {
  readonly serviceId: string
  readonly sourceVersion: number
  readonly signal: AbortSignal
}

export interface CloneDraftRequest {
  readonly serviceId: string
  readonly sourceVersion: number
  readonly sourceEtag: string
  /**
   * Technical/non-OIDC injected adapters only. Default HTTP adapter ignores this and never sends
   * client identity (FB-E5.4.2B).
   */
  readonly createdBy?: string
  readonly signal: AbortSignal
}

export interface FormDefinitionVersionManagementAdapter {
  listVersions(request: ListVersionsRequest): Promise<VersionListPage>
  prepareCloneSource(request: PrepareCloneSourceRequest): Promise<CloneSourceReference>
  cloneDraft(request: CloneDraftRequest): Promise<DraftPersistenceSnapshot>
}

export type VersionManagementFailureCode =
  | 'invalid_request'
  | 'not_found'
  | 'source_not_cloneable'
  | 'stale_revision'
  | 'response_rejected'
  | 'failed'
  | 'invalid_coordinates'
  | 'invalid_actor'
  | 'unauthenticated'

export class VersionManagementError extends Error {
  readonly code: VersionManagementFailureCode

  constructor(code: VersionManagementFailureCode) {
    super(code)
    this.name = 'VersionManagementError'
    this.code = code
  }
}
