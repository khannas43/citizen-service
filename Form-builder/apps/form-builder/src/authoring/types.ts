import type { FormDefinition } from '@dg20/form-contract'

/** Immutable Builder authoring session state (FB-D1). */
export interface BuilderAuthoringState {
  readonly definition: FormDefinition
  readonly selectedFieldId: string | null
  readonly previewFormData: Readonly<Record<string, unknown>>
}

export type AuthoringErrorCode =
  | 'inconsistent_definition'
  | 'unknown_widget_type'
  | 'widget_not_addable'
  | 'field_not_found'
  | 'cannot_remove_last_field'
  | 'cannot_empty_progressive_step'
  | 'move_at_canvas_boundary'
  | 'move_crosses_step_boundary'
  | 'no_progressive_steps'
  | 'unsafe_json_value'
  | 'unsupported_property_editor'
  | 'configuration_widget_mismatch'
  | 'configuration_invalid'
  | 'stale_editor_draft'
  | 'progressive_steps_not_enabled'
  | 'progressive_steps_already_enabled'
  | 'step_not_found'
  | 'field_not_in_step'
  | 'split_after_last_field'
  | 'boundary_not_found'
  | 'boundary_move_would_empty_step'
  | 'step_has_unsaved_bilingual_changes'
  | 'inconsistent_step_boundaries'
  | 'structural_widget_requires_boundary_action'

export interface AuthoringErrorOptions {
  /**
   * Machine-readable failure reason (e.g. an `AutosaveSnapshotFailureReason`
   * from `cloneJsonSafeObject`). Never a stringified hostile value.
   */
  readonly reason?: string
}

export class AuthoringError extends Error {
  readonly code: AuthoringErrorCode
  readonly reason?: string

  constructor(code: AuthoringErrorCode, message: string, options?: AuthoringErrorOptions) {
    super(message)
    this.name = 'AuthoringError'
    this.code = code
    this.reason = options?.reason
  }
}

export type AuthoringSuccess<T extends BuilderAuthoringState = BuilderAuthoringState> = {
  readonly ok: true
  readonly state: T
  readonly announcementKey?: AuthoringAnnouncementKey
  readonly announcementVars?: Readonly<Record<string, string | number>>
}

export type AuthoringFailure = {
  readonly ok: false
  readonly error: AuthoringError
}

export type AuthoringResult = AuthoringSuccess | AuthoringFailure

export type AuthoringAnnouncementKey =
  | 'announceFieldAdded'
  | 'announceFieldRemoved'
  | 'announceFieldMovedUp'
  | 'announceFieldMovedDown'
  | 'announceFieldReordered'
  | 'announceCanvasReorderLifted'
  | 'announceCanvasReorderProposed'
  | 'announceCanvasReorderProposedEnd'
  | 'announceCanvasReorderProposedFirst'
  | 'announceCanvasReorderProposedLast'
  | 'announceCanvasReorderDropped'
  | 'announceCanvasReorderCancelled'
  | 'announceCanvasReorderCrossStepBlocked'
  | 'announceCannotRemoveLast'
  | 'announceCannotEmptyStep'
  | 'announceAuthoringError'
  | 'announceChangesApplied'
  | 'announceChangesCancelled'
  | 'announceConfigurationInvalid'
  | 'announceEditorDraftStale'
  | 'announceProgressiveEnabled'
  | 'announceStepSplit'
  | 'announceBoundaryMovedEarlier'
  | 'announceBoundaryMovedLater'
  | 'announceStepsMerged'
  | 'announceStepHasUnsavedBilingual'
  | 'announceConfiguredAddBlocked'
  | 'announcePageBreakCreated'
  | 'announcePageBreakNoBoundary'
  | 'announcePageBreakBlocked'

export type MoveDirection = 'up' | 'down'
