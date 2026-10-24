import type { FormDefinition } from '@dg20/form-contract'

import { addField } from './add-field.js'
import {
  fieldBilingualFromParts,
  isFieldBilingualDirty,
  isStepBilingualDirty,
  readFieldBilingualContent,
  readStepBilingualContent,
  type BilingualErrorPair,
  type BilingualFieldPatch,
  type FieldBilingualContent,
  type StepBilingualContent,
  type StepBilingualDraft,
} from './bilingual-types.js'
import { createAuthoringSession, selectField, setPreviewFormData } from './create-session.js'
import { assertDefinitionIntegrity } from './integrity.js'
import { cloneJsonSafe } from './clone.js'
import { getCanvasReorderTargets, moveField, reorderFieldWithinStep } from './move-field.js'
import { findStepIndexForField } from './integrity.js'
import type { FieldConfiguration, FieldConfigurationDraft } from './property-config-types.js'
import {
  configurationToDraft,
  isConfigurationDirty,
  readFieldConfiguration,
  removeEditorDraft,
  seedEditorDraftWithBaseline,
} from './read-field-configuration.js'
import { removeField } from './remove-field.js'
import {
  enableProgressiveSteps,
  mergeStepBoundary,
  moveStepBoundary,
  splitStepAfterField,
  stepHasUnsavedBilingualChanges,
} from './step-boundaries.js'
import {
  AuthoringError,
  type AuthoringAnnouncementKey,
  type AuthoringErrorCode,
  type BuilderAuthoringState,
  type MoveDirection,
} from './types.js'
import { updateFieldBilingualContent } from './update-field-bilingual.js'
import { updateFieldConfiguration } from './update-field-configuration.js'
import { updateStepBilingualContent } from './update-step-bilingual.js'
import {
  validateFieldBilingualDraft,
  validateStepBilingualDraft,
} from './validate-field-bilingual.js'
import { validateFieldConfigurationDraft } from './validate-field-configuration.js'
import {
  isConfiguredAddableWidgetType,
  isStructuralAddableWidgetType,
  type ConfiguredAddableWidgetType,
} from './templates.js'
import {
  createEmptyPendingConfiguredAdd,
  firstFocusControlForWidget,
  patchPendingConfiguredAdd,
  validatePendingConfiguredAdd,
  type ConfiguredAddFocusControl,
  type PendingConfiguredAdd,
  type PendingConfiguredAddPatch,
} from './configured-add.js'
import {
  createEmptyPendingPageBreak,
  createPageBreakBoundary,
  patchPendingPageBreak,
  validatePendingPageBreak,
  type PageBreakAddFocusControl,
  type PendingStructuralAdd,
  type PendingStructuralAddPatch,
} from './page-break-authoring.js'
import {
  isCafBindingDraftDirty,
  removeCafPrefillBinding,
  seedCafBindingDraftEntry,
  updateCafPrefillBinding,
  validateCafPrefillBindingDraft,
  type CafBindingDraftEntry,
  type CafPrefillBindingDraftContent,
} from './caf-prefill-binding-authoring.js'
import {
  allocateIntegrationRowKey,
  emptyIntegrationDraftRow,
  liveBaselineMatchesIntegrationSurface,
  seedIntegrationBindingDraftSurface,
  updateIntegrationBindings,
  validateIntegrationBindingsDraft,
  type IntegrationBindingDraftRow,
  type IntegrationBindingDraftSurface,
} from './integration-binding-authoring.js'
import {
  allocateWorkflowRowKey,
  emptyWorkflowDraftRow,
  liveBaselineMatchesWorkflowSurface,
  seedWorkflowBindingDraftSurface,
  updateWorkflowBindings,
  validateWorkflowBindingsDraft,
  type WorkflowBindingDraftRow,
  type WorkflowBindingDraftSurface,
} from './workflow-binding-authoring.js'
import {
  acceptedFamilyRepeaterConfigurationFromDraft,
  draftAddFamilyMember,
  draftMoveFamilyMember,
  draftRemoveFamilyMember,
  getFamilyMemberCapabilities,
  isFamilyRepeaterDraftDirty,
  isFamilyRepeaterRoot,
  readFamilyMemberConfiguration,
  readFamilyRepeaterDraftContent,
  serializeFamilyRepeaterStructureBaseline,
  updateFamilyRepeaterConfiguration,
  validateFamilyRepeaterDraftContent,
  type FamilyRepeaterDraftContent,
  type FamilyRepeaterStructureBaseline,
} from './family-repeater-authoring.js'
import { collectFamilyRepeaterNestedPaths } from './family-repeater-schema-admission.js'
import type { FamilyMemberWidgetType } from './family-member-types.js'

export type { ConfiguredAddFocusControl, PendingConfiguredAdd, PendingConfiguredAddPatch }

export type AuthoringAction =
  | { readonly type: 'add'; readonly widgetType: string }
  | {
      readonly type: 'beginConfiguredAdd'
      readonly widgetType: ConfiguredAddableWidgetType
    }
  | {
      readonly type: 'patchConfiguredAdd'
      readonly patch: PendingConfiguredAddPatch
    }
  | { readonly type: 'cancelConfiguredAdd' }
  | { readonly type: 'confirmConfiguredAdd' }
  | { readonly type: 'beginPageBreakAdd' }
  | {
      readonly type: 'patchPageBreakAdd'
      readonly patch: PendingStructuralAddPatch
    }
  | { readonly type: 'cancelPageBreakAdd' }
  | { readonly type: 'confirmPageBreakAdd' }
  | { readonly type: 'remove'; readonly fieldId: string }
  | { readonly type: 'move'; readonly fieldId: string; readonly direction: MoveDirection }
  | {
      readonly type: 'beginCanvasReorder'
      readonly fieldId: string
      readonly mode: 'pointer' | 'keyboard'
    }
  | { readonly type: 'proposeCanvasReorder'; readonly beforeFieldId: string | null }
  | { readonly type: 'commitCanvasReorder' }
  | { readonly type: 'cancelCanvasReorder' }
  | { readonly type: 'select'; readonly fieldId: string | null }
  | { readonly type: 'setPreviewFormData'; readonly formData: Readonly<Record<string, unknown>> }
  | {
      readonly type: 'patchEditorDraft'
      readonly fieldId: string
      readonly patch: Readonly<Record<string, string | boolean | number>>
    }
  | { readonly type: 'applyEditorDraft'; readonly fieldId: string }
  | { readonly type: 'cancelEditorDraft'; readonly fieldId: string }
  | {
      readonly type: 'patchFieldBilingual'
      readonly fieldId: string
      readonly patch: BilingualFieldPatch
    }
  | { readonly type: 'applyFieldBilingual'; readonly fieldId: string }
  | { readonly type: 'cancelFieldBilingual'; readonly fieldId: string }
  | {
      readonly type: 'patchStepEditorDraft'
      readonly stepId: string
      readonly patch: Readonly<Partial<Pick<StepBilingualDraft, 'labelEn' | 'labelGu'>>>
    }
  | { readonly type: 'applyStepBilingual'; readonly stepId: string }
  | { readonly type: 'cancelStepBilingual'; readonly stepId: string }
  | {
      readonly type: 'patchBindingDraft'
      readonly fieldId: string
      readonly patch: Readonly<Partial<CafPrefillBindingDraftContent>>
    }
  | { readonly type: 'applyBindingDraft'; readonly fieldId: string }
  | { readonly type: 'cancelBindingDraft'; readonly fieldId: string }
  | { readonly type: 'removeBinding'; readonly fieldId: string }
  | { readonly type: 'ensureIntegrationBindingDraft' }
  | { readonly type: 'addIntegrationBindingRow' }
  | {
      readonly type: 'patchIntegrationBindingRow'
      readonly rowKey: string
      readonly patch: Readonly<Partial<Omit<IntegrationBindingDraftRow, 'rowKey'>>>
    }
  | { readonly type: 'removeIntegrationBindingRow'; readonly rowKey: string }
  | { readonly type: 'applyIntegrationBindingDraft' }
  | { readonly type: 'cancelIntegrationBindingDraft' }
  | { readonly type: 'ensureWorkflowBindingDraft' }
  | { readonly type: 'addWorkflowBindingRow' }
  | {
      readonly type: 'patchWorkflowBindingRow'
      readonly rowKey: string
      readonly patch: Readonly<Partial<Omit<WorkflowBindingDraftRow, 'rowKey'>>>
    }
  | { readonly type: 'removeWorkflowBindingRow'; readonly rowKey: string }
  | { readonly type: 'applyWorkflowBindingDraft' }
  | { readonly type: 'cancelWorkflowBindingDraft' }
  | {
      readonly type: 'patchFamilyRepeaterDraft'
      readonly fieldId: string
      readonly patch: Readonly<
        Partial<
          Pick<
            FamilyRepeaterDraftContent,
            'labelEn' | 'labelGu' | 'helpEn' | 'helpGu' | 'minItems' | 'maxItems'
          >
        > & {
          readonly memberPropertyName?: string
          readonly memberPatch?: Readonly<Record<string, string | boolean | number>>
        }
      >
    }
  | { readonly type: 'applyFamilyRepeaterDraft'; readonly fieldId: string }
  | { readonly type: 'cancelFamilyRepeaterDraft'; readonly fieldId: string }
  | {
      readonly type: 'addFamilyRepeaterMemberDraft'
      readonly fieldId: string
      readonly widgetType: FamilyMemberWidgetType
      readonly labelEn: string
      readonly labelGu: string
      readonly required: boolean
    }
  | {
      readonly type: 'removeFamilyRepeaterMemberDraft'
      readonly fieldId: string
      readonly propertyName: string
    }
  | {
      readonly type: 'moveFamilyRepeaterMemberDraft'
      readonly fieldId: string
      readonly propertyName: string
      readonly direction: 'earlier' | 'later'
    }
  | { readonly type: 'enableProgressiveSteps' }
  | {
      readonly type: 'splitStepAfterField'
      readonly stepId: string
      readonly fieldId: string
    }
  | {
      readonly type: 'moveStepBoundary'
      readonly previousStepId: string
      readonly direction: 'earlier' | 'later'
    }
  | { readonly type: 'mergeStepBoundary'; readonly previousStepId: string }
  | { readonly type: 'clearStepsActionAlert' }
  | { readonly type: 'focusBilingualStep'; readonly stepId: string }
  | {
      readonly type: 'replaceAuthoringSession'
      readonly definition: FormDefinition
      /** `clear` for loaded coordinates; `preserve` for same-coordinate save adoption. */
      readonly previewPolicy: 'clear' | 'preserve'
    }

/** Announcement carries a monotonic `id` so repeated identical text is re-announced by SRs. */
export interface AuthoringAnnouncement {
  readonly id: number
  readonly key: AuthoringAnnouncementKey
  readonly vars?: Readonly<Record<string, string | number>>
}

/**
 * Per-field UI editor draft state (never stored in FormDefinition / previewFormData).
 * Labels/help live in the shared property draft; error messages are Bilingual-only (FB-D3.1).
 */
export interface EditorDraftEntry {
  readonly draft: FieldConfigurationDraft
  readonly baseline: FieldConfiguration
  readonly errorDraft: BilingualErrorPair
  readonly errorBaseline: BilingualErrorPair
  readonly propertyShowValidation: boolean
  readonly propertyShowStaleGuidance: boolean
  readonly bilingualShowValidation: boolean
  readonly bilingualShowStaleGuidance: boolean
}

/** Per-step bilingual label draft (FB-D3). Outside FormDefinition / previewFormData. */
export interface StepEditorDraftEntry {
  readonly draft: StepBilingualDraft
  readonly baseline: StepBilingualContent
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
}

/** UI-only family-repeater draft entry (FB-D16). Cleared on field remove / session replace. */
export interface FamilyRepeaterDraftEntry {
  readonly draft: FamilyRepeaterDraftContent
  readonly contentBaseline: FamilyRepeaterDraftContent
  readonly baseline: FamilyRepeaterStructureBaseline
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
  readonly structureReadOnly: boolean
}

/**
 * UI-facing authoring state: the pure authoring session plus state derived
 * purely from the last dispatched action — accessibility announcement,
 * pending DOM focus targets, and per-field / per-step editor drafts.
 */
export interface AuthoringUiState {
  readonly authoring: BuilderAuthoringState
  readonly announcement: AuthoringAnnouncement | null
  readonly pendingFocusFieldId: string | null
  /**
   * Focus token after invalid Apply. Property: bare control (`labelGu`) or
   * `property-summary:{fieldId}`. Bilingual field: `field:{fieldId}:{control}`
   * or `bilingual-summary:{fieldId}`. Step: `step:{stepId}:{control}`.
   * CAF binding: `binding:{fieldId}:{cafAttribute|confidenceMin}` or
   * `binding-summary:{fieldId}` (FB-D15).
   * Family repeater: same property control tokens (FB-D16).
   */
  readonly pendingFocusEditorControl: string | null
  /**
   * Steps workspace focus request after enable / split / move / merge.
   * `requestId` is allocated from {@link AuthoringUiState.stepFocusRequestSequence}
   * so clearing `pendingFocusStep` never reuses an earlier ID (FB-D4.1.1).
   */
  readonly pendingFocusStep: PendingFocusStepRequest | null
  /**
   * Session-monotonic counter for Steps focus requests. Never resets when
   * `pendingFocusStep` is cleared (failures, moves that previously nullled, etc.).
   */
  readonly stepFocusRequestSequence: number
  /** Single actionable alert for Steps boundary failures (role=alert). */
  readonly stepsActionAlertCode: AuthoringErrorCode | null
  readonly editorDrafts: Readonly<Record<string, EditorDraftEntry>>
  readonly stepEditorDrafts: Readonly<Record<string, StepEditorDraftEntry>>
  /** FB-D15: UI-only CAF prefill binding drafts. Cleared on field remove / session replace. */
  readonly bindingDrafts: Readonly<Record<string, CafBindingDraftEntry>>
  /** FB-D21: UI-only Integration Hub binding draft surface. */
  readonly integrationBindingDraft: IntegrationBindingDraftSurface | null
  /** FB-D21: UI-only Workflow binding draft surface. */
  readonly workflowBindingDraft: WorkflowBindingDraftSurface | null
  /** FB-D16: UI-only family-repeater drafts. Cleared on field remove / session replace. */
  readonly familyRepeaterDrafts: Readonly<Record<string, FamilyRepeaterDraftEntry>>
  /** FB-D9: UI-only configured-add draft. Cleared on confirm/cancel/session replace. */
  readonly pendingConfiguredAdd: PendingConfiguredAdd | null
  /** FB-D17: UI-only page-break boundary draft. Cleared on confirm/cancel/session replace. */
  readonly pendingStructuralAdd: PendingStructuralAdd | null
  /** Focus palette control after configured-add Cancel/Escape. */
  readonly pendingFocusPaletteWidgetType: string | null
  /**
   * Sequenced focus request for the configured-add masterListId control (FB-D9.1).
   * Ordinary patches clear this without allocating a new request (no focus steal).
   */
  readonly pendingFocusConfiguredAdd: PendingConfiguredAddFocusRequest | null
  /**
   * Session-monotonic counter for configured-add focus requests. Never resets when
   * `pendingFocusConfiguredAdd` is cleared (FB-D9.1).
   */
  readonly configuredAddFocusRequestSequence: number
  /**
   * Sequenced focus request for page-break dialog controls (FB-D17).
   * Ordinary patches clear this without allocating a new request.
   */
  readonly pendingFocusStructuralAdd: PendingStructuralAddFocusRequest | null
  /**
   * Session-monotonic counter for structural-add focus requests. Never resets when
   * `pendingFocusStructuralAdd` is cleared (FB-D17).
   */
  readonly structuralAddFocusRequestSequence: number
  /** Ephemeral pointer/keyboard canvas reorder state; never persisted in FormDefinition. */
  readonly canvasReorderGesture: {
    readonly fieldId: string
    readonly stepId: string | null
    readonly proposedBeforeFieldId: string | null
    readonly mode: 'pointer' | 'keyboard'
    readonly sequenceId: number
  } | null
  readonly canvasReorderSequence: number
}

/** Explicit authoring focus request for a Steps workspace card (FB-D4.1). */
export interface PendingFocusStepRequest {
  readonly requestId: number
  readonly stepId: string
}

/** Explicit focus request for configured-add controls (FB-D9.1 / FB-D10). */
export interface PendingConfiguredAddFocusRequest {
  readonly requestId: number
  readonly control: ConfiguredAddFocusControl
}

/** Explicit focus request for page-break boundary controls (FB-D17). */
export interface PendingStructuralAddFocusRequest {
  readonly requestId: number
  readonly control: PageBreakAddFocusControl
}

export function createAuthoringUiState(authoring: BuilderAuthoringState): AuthoringUiState {
  return {
    authoring,
    announcement: null,
    pendingFocusFieldId: null,
    pendingFocusEditorControl: null,
    pendingFocusStep: null,
    stepFocusRequestSequence: 0,
    stepsActionAlertCode: null,
    editorDrafts: {},
    stepEditorDrafts: {},
    bindingDrafts: {},
    integrationBindingDraft: null,
    workflowBindingDraft: null,
    familyRepeaterDrafts: {},
    pendingConfiguredAdd: null,
    pendingStructuralAdd: null,
    pendingFocusPaletteWidgetType: null,
    pendingFocusConfiguredAdd: null,
    configuredAddFocusRequestSequence: 0,
    pendingFocusStructuralAdd: null,
    structuralAddFocusRequestSequence: 0,
    canvasReorderGesture: null,
    canvasReorderSequence: 0,
  }
}

function announce(
  previous: AuthoringUiState,
  key: AuthoringAnnouncementKey,
  vars?: Readonly<Record<string, string | number>>,
): AuthoringAnnouncement {
  return { id: (previous.announcement?.id ?? 0) + 1, key, vars }
}

/**
 * Allocate the next Steps focus request. Sequence advances only on success with
 * a non-null stepId; clearing pending focus alone never resets the counter.
 */
function allocateFocusStep(
  previous: AuthoringUiState,
  stepId: string | null,
): Pick<AuthoringUiState, 'pendingFocusStep' | 'stepFocusRequestSequence'> {
  if (stepId === null) {
    return {
      pendingFocusStep: null,
      stepFocusRequestSequence: previous.stepFocusRequestSequence,
    }
  }
  const requestId = previous.stepFocusRequestSequence + 1
  return {
    pendingFocusStep: { requestId, stepId },
    stepFocusRequestSequence: requestId,
  }
}

function labelForField(authoring: BuilderAuthoringState, fieldId: string): string {
  return authoring.definition.meta.bilingual.labels[fieldId]?.en ?? fieldId
}

function draftsWithout(
  drafts: Readonly<Record<string, EditorDraftEntry>>,
  fieldId: string,
): Readonly<Record<string, EditorDraftEntry>> {
  if (!(fieldId in drafts)) {
    return drafts
  }
  const next: Record<string, EditorDraftEntry> = { ...drafts }
  delete next[fieldId]
  return next
}

function stepDraftsWithout(
  drafts: Readonly<Record<string, StepEditorDraftEntry>>,
  stepId: string,
): Readonly<Record<string, StepEditorDraftEntry>> {
  if (!(stepId in drafts)) {
    return drafts
  }
  const next: Record<string, StepEditorDraftEntry> = { ...drafts }
  delete next[stepId]
  return next
}

function bindingDraftsWithout(
  drafts: Readonly<Record<string, CafBindingDraftEntry>>,
  fieldId: string,
): Readonly<Record<string, CafBindingDraftEntry>> {
  if (!(fieldId in drafts)) {
    return drafts
  }
  const next: Record<string, CafBindingDraftEntry> = { ...drafts }
  delete next[fieldId]
  return next
}

function familyRepeaterDraftsWithout(
  drafts: Readonly<Record<string, FamilyRepeaterDraftEntry>>,
  fieldId: string,
): Readonly<Record<string, FamilyRepeaterDraftEntry>> {
  if (!(fieldId in drafts)) {
    return drafts
  }
  const next: Record<string, FamilyRepeaterDraftEntry> = { ...drafts }
  delete next[fieldId]
  return next
}

function seedFamilyRepeaterDraftEntry(
  definition: BuilderAuthoringState['definition'],
  fieldId: string,
): FamilyRepeaterDraftEntry {
  const draft = readFamilyRepeaterDraftContent(definition, fieldId)
  const capabilities = getFamilyMemberCapabilities(definition, fieldId)
  return {
    draft,
    contentBaseline: draft,
    baseline: serializeFamilyRepeaterStructureBaseline(definition, fieldId),
    showValidation: false,
    showStaleGuidance: false,
    structureReadOnly: !capabilities.membersEditable,
  }
}

function getOrSeedFamilyRepeaterEntry(
  state: AuthoringUiState,
  fieldId: string,
): FamilyRepeaterDraftEntry {
  const existing = state.familyRepeaterDrafts[fieldId]
  if (existing) {
    return existing
  }
  return seedFamilyRepeaterDraftEntry(state.authoring.definition, fieldId)
}

function readCommittedErrors(
  definition: BuilderAuthoringState['definition'],
  fieldId: string,
): BilingualErrorPair {
  const pair = definition.meta.bilingual.errors[fieldId]
  if (!pair) {
    return { en: '', gu: '' }
  }
  return { en: pair.en, gu: pair.gu }
}

function mergeLabelsHelpIntoDraft(
  draft: FieldConfigurationDraft,
  bilingual: FieldBilingualContent,
): FieldConfigurationDraft {
  return {
    ...draft,
    labelEn: bilingual.labelEn,
    labelGu: bilingual.labelGu,
    helpEn: bilingual.helpEn,
    helpGu: bilingual.helpGu,
  }
}

function mergeLabelsHelpIntoBaseline(
  baseline: FieldConfiguration,
  bilingual: FieldBilingualContent,
): FieldConfiguration {
  return mergeLabelsHelpIntoDraft(baseline, bilingual) as FieldConfiguration
}

function bilingualFromEntry(fieldId: string, entry: EditorDraftEntry): FieldBilingualContent {
  return fieldBilingualFromParts(fieldId, entry.draft.widgetType, entry.draft, entry.errorDraft)
}

function bilingualBaselineFromEntry(
  fieldId: string,
  entry: EditorDraftEntry,
): FieldBilingualContent {
  return fieldBilingualFromParts(
    fieldId,
    entry.baseline.widgetType,
    entry.baseline,
    entry.errorBaseline,
  )
}

function getOrSeedEntry(state: AuthoringUiState, fieldId: string): EditorDraftEntry {
  const existing = state.editorDrafts[fieldId]
  if (existing) {
    return existing
  }
  const nested = collectFamilyRepeaterNestedPaths(state.authoring.definition).get(fieldId)
  if (nested) {
    const committed = readFamilyMemberConfiguration(
      state.authoring.definition,
      nested.repeaterFieldId,
      nested.propertyName,
    )
    const draft = configurationToDraft(committed)
    const errors = readCommittedErrors(state.authoring.definition, fieldId)
    return {
      draft,
      baseline: draft,
      errorDraft: errors,
      errorBaseline: errors,
      propertyShowValidation: false,
      propertyShowStaleGuidance: false,
      bilingualShowValidation: false,
      bilingualShowStaleGuidance: false,
    }
  }
  const seeded = seedEditorDraftWithBaseline(state.authoring.definition, fieldId)
  const errors = readCommittedErrors(state.authoring.definition, fieldId)
  return {
    draft: seeded.draft,
    baseline: seeded.baseline,
    errorDraft: errors,
    errorBaseline: errors,
    propertyShowValidation: false,
    propertyShowStaleGuidance: false,
    bilingualShowValidation: false,
    bilingualShowStaleGuidance: false,
  }
}

function seedStepEntry(
  definition: BuilderAuthoringState['definition'],
  stepId: string,
): StepEditorDraftEntry {
  const committed = readStepBilingualContent(definition, stepId)
  return {
    draft: { ...committed },
    baseline: { ...committed },
    showValidation: false,
    showStaleGuidance: false,
  }
}

function getOrSeedStepEntry(state: AuthoringUiState, stepId: string): StepEditorDraftEntry {
  const existing = state.stepEditorDrafts[stepId]
  if (existing) {
    return existing
  }
  return seedStepEntry(state.authoring.definition, stepId)
}

/**
 * Return the CAF binding draft for `fieldId`, seeding from the committed binding
 * when missing. Only caf-prefill provenance fields may be seeded (FB-D15).
 */
function getOrSeedBindingEntry(state: AuthoringUiState, fieldId: string): CafBindingDraftEntry {
  const existing = state.bindingDrafts[fieldId]
  if (existing) {
    return existing
  }
  const provenance = state.authoring.definition.meta.paletteProvenance.find(
    (entry) => entry.fieldId === fieldId,
  )
  if (!provenance) {
    throw new AuthoringError('field_not_found', `Field not found: ${fieldId}`)
  }
  if (provenance.widgetType !== 'caf-prefill') {
    throw new AuthoringError(
      'configuration_invalid',
      'CAF prefill bindings are only valid on caf-prefill fields',
    )
  }
  return seedCafBindingDraftEntry(state.authoring.definition, fieldId)
}

const PROPERTY_PATCH_KEYS = new Set([
  'labelEn',
  'labelGu',
  'helpEn',
  'helpGu',
  'required',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'step',
  'verifyEmail',
  'minAge',
  'maxAge',
  'masterListId',
  'minItems',
  'maxItems',
  'parentMasterListId',
  'childMasterListId',
  'defaultStateCode',
  'allowedMimeTypesText',
  'maxFileSizeBytes',
  'digiLockerDocumentTypeCode',
  'feeRuleId',
  'declarationId',
])

function hasModalAddPending(state: AuthoringUiState): boolean {
  return state.pendingConfiguredAdd !== null || state.pendingStructuralAdd !== null
}

function blockWhileModalAddPending(state: AuthoringUiState): AuthoringUiState {
  // Preserve pending modal + its focus request; do not retarget palette/canvas focus.
  const key =
    state.pendingStructuralAdd !== null
      ? 'announcePageBreakBlocked'
      : 'announceConfiguredAddBlocked'
  return {
    ...state,
    announcement: announce(state, key),
    pendingFocusFieldId: null,
    pendingFocusEditorControl: null,
    pendingFocusPaletteWidgetType: null,
  }
}

function blockWhileCanvasReorderActive(state: AuthoringUiState): AuthoringUiState {
  return {
    ...state,
    announcement: announce(state, 'announceAuthoringError'),
    pendingFocusFieldId: null,
    pendingFocusEditorControl: null,
  }
}

/** Mark Integration/Workflow draft surfaces stale when committed arrays diverge (FB-D21). */
function markBindingSurfacesStaleIfNeeded(
  state: AuthoringUiState,
  definition: FormDefinition,
): {
  readonly integrationBindingDraft: IntegrationBindingDraftSurface | null
  readonly workflowBindingDraft: WorkflowBindingDraftSurface | null
} {
  let integration = state.integrationBindingDraft
  let workflow = state.workflowBindingDraft
  if (integration !== null && !liveBaselineMatchesIntegrationSurface(definition, integration)) {
    integration = { ...integration, showStaleGuidance: true }
  }
  if (workflow !== null && !liveBaselineMatchesWorkflowSurface(definition, workflow)) {
    workflow = { ...workflow, showStaleGuidance: true }
  }
  return { integrationBindingDraft: integration, workflowBindingDraft: workflow }
}

function getOrSeedIntegrationSurface(state: AuthoringUiState): IntegrationBindingDraftSurface {
  return (
    state.integrationBindingDraft ?? seedIntegrationBindingDraftSurface(state.authoring.definition)
  )
}

function getOrSeedWorkflowSurface(state: AuthoringUiState): WorkflowBindingDraftSurface {
  return state.workflowBindingDraft ?? seedWorkflowBindingDraftSurface(state.authoring.definition)
}

function firstIntegrationFocusControl(
  issues: readonly { readonly rowKey: string; readonly control: string }[],
): string {
  const first = issues[0]
  if (!first || first.rowKey.length === 0) {
    return 'integration-summary'
  }
  return `integration:${first.rowKey}:${first.control}`
}

function firstWorkflowFocusControl(
  issues: readonly { readonly rowKey: string; readonly control: string }[],
): string {
  const first = issues[0]
  if (!first || first.rowKey.length === 0) {
    return 'workflow-summary'
  }
  return `workflow:${first.rowKey}:${first.control}`
}

function allocateConfiguredAddFocus(
  state: AuthoringUiState,
  control: ConfiguredAddFocusControl,
): Pick<AuthoringUiState, 'pendingFocusConfiguredAdd' | 'configuredAddFocusRequestSequence'> {
  const requestId = state.configuredAddFocusRequestSequence + 1
  return {
    configuredAddFocusRequestSequence: requestId,
    pendingFocusConfiguredAdd: { requestId, control },
  }
}

function allocateStructuralAddFocus(
  state: AuthoringUiState,
  control: PageBreakAddFocusControl,
): Pick<AuthoringUiState, 'pendingFocusStructuralAdd' | 'structuralAddFocusRequestSequence'> {
  const requestId = state.structuralAddFocusRequestSequence + 1
  return {
    structuralAddFocusRequestSequence: requestId,
    pendingFocusStructuralAdd: { requestId, control },
  }
}

function beginPageBreakAddState(state: AuthoringUiState): AuthoringUiState {
  if (hasModalAddPending(state)) {
    return blockWhileModalAddPending(state)
  }
  const pending = createEmptyPendingPageBreak(
    state.authoring.definition,
    state.authoring.selectedFieldId,
  )
  if (pending === null) {
    return {
      ...state,
      announcement: announce(state, 'announcePageBreakNoBoundary'),
      pendingFocusFieldId: null,
      pendingFocusEditorControl: null,
      pendingFocusPaletteWidgetType: null,
    }
  }
  return {
    ...state,
    pendingStructuralAdd: pending,
    pendingFocusPaletteWidgetType: null,
    pendingFocusFieldId: null,
    pendingFocusEditorControl: null,
    pendingFocusConfiguredAdd: null,
    ...allocateStructuralAddFocus(state, 'afterFieldId'),
  }
}

/**
 * Pure reducer for the Builder authoring session (… / FB-D9 / FB-D9.1 / FB-D10 / FB-D15).
 * No DOM access, no timers, no randomness. StrictMode-safe.
 */
export function authoringReducer(
  state: AuthoringUiState,
  action: AuthoringAction,
): AuthoringUiState {
  if (
    state.authoring.definition.status !== 'draft' &&
    action.type !== 'replaceAuthoringSession' &&
    action.type !== 'select' &&
    action.type !== 'setPreviewFormData' &&
    action.type !== 'clearStepsActionAlert' &&
    action.type !== 'focusBilingualStep' &&
    action.type !== 'cancelIntegrationBindingDraft' &&
    action.type !== 'cancelWorkflowBindingDraft'
  ) {
    return state
  }
  switch (action.type) {
    case 'beginCanvasReorder': {
      if (hasModalAddPending(state) || state.canvasReorderGesture !== null) {
        return state.canvasReorderGesture !== null ? state : blockWhileModalAddPending(state)
      }
      const targets = getCanvasReorderTargets(state.authoring.definition, action.fieldId)
      const current = targets.find((target) => target.isNoOp)
      if (!current) return { ...state, announcement: announce(state, 'announceAuthoringError') }
      const stepIndex = findStepIndexForField(
        state.authoring.definition.meta.progressiveSteps,
        action.fieldId,
      )
      const sequenceId = state.canvasReorderSequence + 1
      const label = labelForField(state.authoring, action.fieldId)
      return {
        ...state,
        canvasReorderGesture: {
          fieldId: action.fieldId,
          stepId:
            stepIndex >= 0
              ? state.authoring.definition.meta.progressiveSteps[stepIndex]!.stepId
              : null,
          proposedBeforeFieldId: current.beforeFieldId,
          mode: action.mode,
          sequenceId,
        },
        canvasReorderSequence: sequenceId,
        announcement: announce(state, 'announceCanvasReorderLifted', { label }),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'proposeCanvasReorder': {
      const gesture = state.canvasReorderGesture
      if (!gesture) return state
      const target = getCanvasReorderTargets(state.authoring.definition, gesture.fieldId).find(
        (candidate) => candidate.beforeFieldId === action.beforeFieldId,
      )
      if (!target || target.beforeFieldId === gesture.proposedBeforeFieldId) return state
      const sequenceId = state.canvasReorderSequence + 1
      const targets = getCanvasReorderTargets(state.authoring.definition, gesture.fieldId)
      const positionIndex = targets.findIndex(
        (candidate) => candidate.beforeFieldId === target.beforeFieldId,
      )
      const atFirst = positionIndex === 0
      const announcement =
        target.beforeFieldId === null
          ? announce(state, 'announceCanvasReorderProposedEnd')
          : atFirst
            ? announce(state, 'announceCanvasReorderProposedFirst', {
                label: labelForField(state.authoring, target.beforeFieldId),
              })
            : announce(state, 'announceCanvasReorderProposed', {
                beforeLabel: labelForField(state.authoring, target.beforeFieldId),
              })
      return {
        ...state,
        canvasReorderGesture: {
          ...gesture,
          proposedBeforeFieldId: target.beforeFieldId,
          sequenceId,
        },
        canvasReorderSequence: sequenceId,
        announcement,
      }
    }

    case 'commitCanvasReorder': {
      const gesture = state.canvasReorderGesture
      if (!gesture) return state
      const result = reorderFieldWithinStep(state.authoring, {
        fieldId: gesture.fieldId,
        beforeFieldId: gesture.proposedBeforeFieldId,
      })
      if (!result.ok) {
        const blockedCrossStep = result.error.code === 'move_crosses_step_boundary'
        return {
          ...state,
          canvasReorderGesture: null,
          announcement: announce(
            state,
            blockedCrossStep ? 'announceCanvasReorderCrossStepBlocked' : 'announceAuthoringError',
          ),
          pendingFocusEditorControl: `canvas-reorder-handle:${gesture.fieldId}`,
        }
      }
      const label = labelForField(state.authoring, gesture.fieldId)
      return {
        ...state,
        authoring: result.state,
        canvasReorderGesture: null,
        announcement: announce(state, 'announceCanvasReorderDropped', { label }),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: `canvas-reorder-handle:${gesture.fieldId}`,
      }
    }

    case 'cancelCanvasReorder': {
      const gesture = state.canvasReorderGesture
      if (!gesture) return state
      return {
        ...state,
        canvasReorderGesture: null,
        announcement: announce(state, 'announceCanvasReorderCancelled', {
          label: labelForField(state.authoring, gesture.fieldId),
        }),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: `canvas-reorder-handle:${gesture.fieldId}`,
      }
    }

    case 'beginConfiguredAdd': {
      if (state.canvasReorderGesture !== null) {
        return blockWhileCanvasReorderActive(state)
      }
      if (!isConfiguredAddableWidgetType(action.widgetType)) {
        return {
          ...state,
          announcement: announce(state, 'announceAuthoringError'),
        }
      }
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      return {
        ...state,
        pendingConfiguredAdd: createEmptyPendingConfiguredAdd(action.widgetType),
        pendingFocusPaletteWidgetType: null,
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
        ...allocateConfiguredAddFocus(state, firstFocusControlForWidget(action.widgetType)),
      }
    }

    case 'patchConfiguredAdd': {
      if (state.pendingConfiguredAdd === null) {
        return state
      }
      return {
        ...state,
        pendingConfiguredAdd: patchPendingConfiguredAdd(state.pendingConfiguredAdd, action.patch),
        pendingFocusConfiguredAdd: null,
      }
    }

    case 'cancelConfiguredAdd': {
      if (state.pendingConfiguredAdd === null) {
        return state
      }
      return {
        ...state,
        pendingConfiguredAdd: null,
        pendingFocusPaletteWidgetType: state.pendingConfiguredAdd.widgetType,
        pendingFocusConfiguredAdd: null,
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'confirmConfiguredAdd': {
      const pending = state.pendingConfiguredAdd
      if (pending === null) {
        return state
      }
      const validated = validatePendingConfiguredAdd(pending)
      if (!validated.ok) {
        return {
          ...state,
          pendingConfiguredAdd: { ...pending, showValidation: true },
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          pendingFocusPaletteWidgetType: null,
          announcement: announce(state, 'announceConfigurationInvalid'),
          ...allocateConfiguredAddFocus(state, validated.firstInvalidControl),
        }
      }
      const result = addField(state.authoring, pending.widgetType, {
        configured: validated.configured,
      })
      if (result.ok) {
        return {
          ...state,
          authoring: result.state,
          pendingConfiguredAdd: null,
          pendingFocusConfiguredAdd: null,
          pendingFocusPaletteWidgetType: null,
          announcement: announce(
            state,
            result.announcementKey ?? 'announceFieldAdded',
            result.announcementVars,
          ),
          pendingFocusFieldId: result.state.selectedFieldId,
          pendingFocusEditorControl: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusConfiguredAdd: null,
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'beginPageBreakAdd': {
      if (state.canvasReorderGesture !== null) {
        return blockWhileCanvasReorderActive(state)
      }
      return beginPageBreakAddState(state)
    }

    case 'patchPageBreakAdd': {
      if (state.pendingStructuralAdd === null) {
        return state
      }
      return {
        ...state,
        pendingStructuralAdd: patchPendingPageBreak(state.pendingStructuralAdd, action.patch),
        pendingFocusStructuralAdd: null,
      }
    }

    case 'cancelPageBreakAdd': {
      if (state.pendingStructuralAdd === null) {
        return state
      }
      return {
        ...state,
        pendingStructuralAdd: null,
        pendingFocusPaletteWidgetType: state.pendingStructuralAdd.widgetType,
        pendingFocusStructuralAdd: null,
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'confirmPageBreakAdd': {
      const pending = state.pendingStructuralAdd
      if (pending === null) {
        return state
      }
      const validated = validatePendingPageBreak(pending, state.authoring.definition)
      if (!validated.ok) {
        return {
          ...state,
          pendingStructuralAdd: { ...pending, showValidation: true },
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          pendingFocusPaletteWidgetType: null,
          announcement: announce(state, 'announceConfigurationInvalid'),
          ...allocateStructuralAddFocus(state, validated.firstInvalidControl),
        }
      }
      const result = createPageBreakBoundary(state.authoring, validated.request)
      if (result.ok) {
        const newStepId =
          typeof result.announcementVars?.stepId === 'string'
            ? result.announcementVars.stepId
            : null
        return {
          ...state,
          authoring: result.state,
          pendingStructuralAdd: null,
          pendingFocusStructuralAdd: null,
          pendingFocusPaletteWidgetType: null,
          announcement: announce(
            state,
            result.announcementKey ?? 'announcePageBreakCreated',
            result.announcementVars,
          ),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          ...allocateFocusStep(state, newStepId),
          stepsActionAlertCode: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusStructuralAdd: null,
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
        pendingFocusStep: null,
        stepsActionAlertCode: result.error.code,
      }
    }

    case 'add': {
      if (state.canvasReorderGesture !== null) {
        return blockWhileCanvasReorderActive(state)
      }
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      if (isStructuralAddableWidgetType(action.widgetType)) {
        return beginPageBreakAddState(state)
      }
      if (isConfiguredAddableWidgetType(action.widgetType)) {
        return {
          ...state,
          pendingConfiguredAdd: createEmptyPendingConfiguredAdd(action.widgetType),
          pendingFocusPaletteWidgetType: null,
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          ...allocateConfiguredAddFocus(state, firstFocusControlForWidget(action.widgetType)),
        }
      }
      const result = addField(state.authoring, action.widgetType)
      if (result.ok) {
        return {
          ...state,
          authoring: result.state,
          announcement: announce(
            state,
            result.announcementKey ?? 'announceFieldAdded',
            result.announcementVars,
          ),
          pendingFocusFieldId: result.state.selectedFieldId,
          pendingFocusEditorControl: null,
          pendingFocusPaletteWidgetType: null,
          pendingFocusConfiguredAdd: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'remove': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const result = removeField(state.authoring, action.fieldId)
      if (result.ok) {
        return {
          ...state,
          authoring: result.state,
          announcement: announce(
            state,
            result.announcementKey ?? 'announceFieldRemoved',
            result.announcementVars,
          ),
          pendingFocusFieldId: result.state.selectedFieldId,
          pendingFocusEditorControl: null,
          editorDrafts: draftsWithout(state.editorDrafts, action.fieldId),
          bindingDrafts: bindingDraftsWithout(state.bindingDrafts, action.fieldId),
          familyRepeaterDrafts: familyRepeaterDraftsWithout(
            state.familyRepeaterDrafts,
            action.fieldId,
          ),
          ...markBindingSurfacesStaleIfNeeded(state, result.state.definition),
        }
      }
      if (result.error.code === 'cannot_remove_last_field') {
        const label = labelForField(state.authoring, action.fieldId)
        return {
          ...state,
          announcement: announce(state, 'announceCannotRemoveLast', { label }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      }
      if (result.error.code === 'cannot_empty_progressive_step') {
        const label = labelForField(state.authoring, action.fieldId)
        return {
          ...state,
          announcement: announce(state, 'announceCannotEmptyStep', { label }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'move': {
      if (state.canvasReorderGesture !== null) {
        return blockWhileCanvasReorderActive(state)
      }
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const result = moveField(state.authoring, action.fieldId, action.direction)
      if (result.ok) {
        return {
          ...state,
          authoring: result.state,
          announcement: announce(
            state,
            result.announcementKey ??
              (action.direction === 'up' ? 'announceFieldMovedUp' : 'announceFieldMovedDown'),
            result.announcementVars,
          ),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'select': {
      try {
        const authoring = selectField(state.authoring, action.fieldId)
        return {
          ...state,
          authoring,
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return state
        }
        throw error
      }
    }

    case 'setPreviewFormData': {
      try {
        const authoring = setPreviewFormData(state.authoring, action.formData)
        return { ...state, authoring }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return { ...state, announcement: announce(state, 'announceAuthoringError') }
        }
        throw error
      }
    }

    case 'patchEditorDraft': {
      try {
        const previousEntry = getOrSeedEntry(state, action.fieldId)
        const previous = previousEntry.draft as unknown as Record<string, unknown>
        const sanitized: Record<string, string | boolean | number> = {}
        for (const [key, value] of Object.entries(action.patch)) {
          if (PROPERTY_PATCH_KEYS.has(key)) {
            sanitized[key] = value
          }
        }
        const nextDraft = {
          ...previous,
          ...sanitized,
        } as unknown as FieldConfigurationDraft
        if (nextDraft.widgetType !== previousEntry.draft.widgetType) {
          return state
        }
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              ...previousEntry,
              draft: nextDraft,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'patchFieldBilingual': {
      try {
        const previousEntry = getOrSeedEntry(state, action.fieldId)
        const { patch } = action
        const nextDraft = {
          ...previousEntry.draft,
          ...(patch.labelEn !== undefined ? { labelEn: patch.labelEn } : {}),
          ...(patch.labelGu !== undefined ? { labelGu: patch.labelGu } : {}),
          ...(patch.helpEn !== undefined ? { helpEn: patch.helpEn } : {}),
          ...(patch.helpGu !== undefined ? { helpGu: patch.helpGu } : {}),
        } as FieldConfigurationDraft
        if (nextDraft.widgetType !== previousEntry.draft.widgetType) {
          return state
        }
        const nextErrorDraft: BilingualErrorPair = {
          en: patch.errorEn !== undefined ? patch.errorEn : previousEntry.errorDraft.en,
          gu: patch.errorGu !== undefined ? patch.errorGu : previousEntry.errorDraft.gu,
        }
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              ...previousEntry,
              draft: nextDraft,
              errorDraft: nextErrorDraft,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'applyEditorDraft': {
      let entry: EditorDraftEntry
      try {
        entry = getOrSeedEntry(state, action.fieldId)
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }

      if (
        entry.draft.widgetType === 'family-repeater' ||
        collectFamilyRepeaterNestedPaths(state.authoring.definition).has(action.fieldId)
      ) {
        // Family-repeater property Apply uses applyFamilyRepeaterDraft (FB-D16).
        return {
          ...state,
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusEditorControl: null,
        }
      }

      const draft = entry.draft
      const validation = validateFieldConfigurationDraft(draft)
      if (!validation.ok) {
        const firstControl = validation.issues[0]?.control ?? null
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              ...entry,
              propertyShowValidation: true,
              propertyShowStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceConfigurationInvalid'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: firstControl ?? `property-summary:${action.fieldId}`,
        }
      }

      const result = updateFieldConfiguration(
        state.authoring,
        action.fieldId,
        validation.configuration,
        entry.baseline,
      )
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            editorDrafts: {
              ...state.editorDrafts,
              [action.fieldId]: {
                ...entry,
                propertyShowValidation: false,
                propertyShowStaleGuidance: true,
              },
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: `property-summary:${action.fieldId}`,
          }
        }
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              ...entry,
              propertyShowValidation: true,
              propertyShowStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: `property-summary:${action.fieldId}`,
        }
      }

      const applied = configurationToDraft(
        readFieldConfiguration(result.state.definition, action.fieldId),
      )
      // Preserve Bilingual error draft/baseline and bilingual validation flags.
      // Sync committed labels/help into the bilingual baseline identity via shared draft.
      return {
        ...state,
        authoring: result.state,
        editorDrafts: {
          ...state.editorDrafts,
          [action.fieldId]: {
            draft: applied,
            baseline: configurationToDraft(applied),
            errorDraft: entry.errorDraft,
            errorBaseline: entry.errorBaseline,
            propertyShowValidation: false,
            propertyShowStaleGuidance: false,
            bilingualShowValidation: entry.bilingualShowValidation,
            bilingualShowStaleGuidance: entry.bilingualShowStaleGuidance,
          },
        },
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'cancelEditorDraft': {
      try {
        const entry = getOrSeedEntry(state, action.fieldId)
        const without = draftsWithout(state.editorDrafts, action.fieldId)
        const rebased = getOrSeedEntry({ ...state, editorDrafts: without }, action.fieldId)
        const label = rebased.baseline.labelEn
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              draft: rebased.draft,
              baseline: rebased.baseline,
              errorDraft: entry.errorDraft,
              errorBaseline: entry.errorBaseline,
              propertyShowValidation: false,
              propertyShowStaleGuidance: false,
              bilingualShowValidation: entry.bilingualShowValidation,
              bilingualShowStaleGuidance: entry.bilingualShowStaleGuidance,
            },
          },
          announcement: announce(state, 'announceChangesCancelled', { label }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            editorDrafts: draftsWithout(state.editorDrafts, action.fieldId),
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }
    }

    case 'applyFieldBilingual': {
      let entry: EditorDraftEntry
      try {
        entry = getOrSeedEntry(state, action.fieldId)
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }

      const bilingualDraft = bilingualFromEntry(action.fieldId, entry)
      const validation = validateFieldBilingualDraft(bilingualDraft)
      if (!validation.ok) {
        const firstControl = validation.issues[0]?.control ?? null
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              ...entry,
              bilingualShowValidation: true,
              bilingualShowStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceConfigurationInvalid'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: firstControl
            ? `field:${action.fieldId}:${firstControl}`
            : `bilingual-summary:${action.fieldId}`,
        }
      }

      const bilingualBaseline = bilingualBaselineFromEntry(action.fieldId, entry)
      const result = updateFieldBilingualContent(
        state.authoring,
        action.fieldId,
        validation.content,
        bilingualBaseline,
      )
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            editorDrafts: {
              ...state.editorDrafts,
              [action.fieldId]: {
                ...entry,
                bilingualShowValidation: false,
                bilingualShowStaleGuidance: true,
              },
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: `bilingual-summary:${action.fieldId}`,
          }
        }
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              ...entry,
              bilingualShowValidation: true,
              bilingualShowStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: `bilingual-summary:${action.fieldId}`,
        }
      }

      const appliedBilingual = readFieldBilingualContent(result.state.definition, action.fieldId)
      const appliedErrors: BilingualErrorPair = {
        en: appliedBilingual.errorEn,
        gu: appliedBilingual.errorGu,
      }
      const nextFamilyDrafts =
        appliedBilingual.widgetType === 'family-repeater' &&
        state.familyRepeaterDrafts[action.fieldId]
          ? {
              ...state.familyRepeaterDrafts,
              [action.fieldId]: seedFamilyRepeaterDraftEntry(
                result.state.definition,
                action.fieldId,
              ),
            }
          : state.familyRepeaterDrafts
      return {
        ...state,
        authoring: result.state,
        editorDrafts: {
          ...state.editorDrafts,
          [action.fieldId]: {
            draft: mergeLabelsHelpIntoDraft(entry.draft, appliedBilingual),
            baseline: mergeLabelsHelpIntoBaseline(entry.baseline, appliedBilingual),
            errorDraft: appliedErrors,
            errorBaseline: appliedErrors,
            propertyShowValidation: entry.propertyShowValidation,
            propertyShowStaleGuidance: entry.propertyShowStaleGuidance,
            bilingualShowValidation: false,
            bilingualShowStaleGuidance: false,
          },
        },
        familyRepeaterDrafts: nextFamilyDrafts,
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'cancelFieldBilingual': {
      try {
        const entry = getOrSeedEntry(state, action.fieldId)
        const committed = readFieldBilingualContent(state.authoring.definition, action.fieldId)
        const committedErrors: BilingualErrorPair = {
          en: committed.errorEn,
          gu: committed.errorGu,
        }
        return {
          ...state,
          editorDrafts: {
            ...state.editorDrafts,
            [action.fieldId]: {
              draft: mergeLabelsHelpIntoDraft(entry.draft, committed),
              baseline: mergeLabelsHelpIntoBaseline(entry.baseline, committed),
              errorDraft: committedErrors,
              errorBaseline: committedErrors,
              propertyShowValidation: entry.propertyShowValidation,
              propertyShowStaleGuidance: entry.propertyShowStaleGuidance,
              bilingualShowValidation: false,
              bilingualShowStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceChangesCancelled', {
            label: committed.labelEn,
          }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }
    }

    case 'patchStepEditorDraft': {
      try {
        const previousEntry = getOrSeedStepEntry(state, action.stepId)
        const nextDraft: StepBilingualDraft = {
          ...previousEntry.draft,
          ...action.patch,
          stepId: previousEntry.draft.stepId,
        }
        return {
          ...state,
          stepEditorDrafts: {
            ...state.stepEditorDrafts,
            [action.stepId]: {
              draft: nextDraft,
              baseline: previousEntry.baseline,
              showValidation: previousEntry.showValidation,
              showStaleGuidance: previousEntry.showStaleGuidance,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'applyStepBilingual': {
      let entry: StepEditorDraftEntry
      try {
        entry = getOrSeedStepEntry(state, action.stepId)
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }

      const validation = validateStepBilingualDraft(entry.draft)
      if (!validation.ok) {
        const firstControl = validation.issues[0]?.control ?? null
        return {
          ...state,
          stepEditorDrafts: {
            ...state.stepEditorDrafts,
            [action.stepId]: {
              draft: entry.draft,
              baseline: entry.baseline,
              showValidation: true,
              showStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceConfigurationInvalid'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: firstControl
            ? `step:${action.stepId}:${firstControl}`
            : `bilingual-step-summary:${action.stepId}`,
        }
      }

      const result = updateStepBilingualContent(
        state.authoring,
        action.stepId,
        validation.content,
        entry.baseline,
      )
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            stepEditorDrafts: {
              ...state.stepEditorDrafts,
              [action.stepId]: {
                draft: entry.draft,
                baseline: entry.baseline,
                showValidation: false,
                showStaleGuidance: true,
              },
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: `bilingual-step-summary:${action.stepId}`,
          }
        }
        return {
          ...state,
          stepEditorDrafts: {
            ...state.stepEditorDrafts,
            [action.stepId]: {
              draft: entry.draft,
              baseline: entry.baseline,
              showValidation: true,
              showStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: `bilingual-step-summary:${action.stepId}`,
        }
      }

      const applied = readStepBilingualContent(result.state.definition, action.stepId)
      return {
        ...state,
        authoring: result.state,
        stepEditorDrafts: {
          ...state.stepEditorDrafts,
          [action.stepId]: {
            draft: { ...applied },
            baseline: { ...applied },
            showValidation: false,
            showStaleGuidance: false,
          },
        },
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'cancelStepBilingual': {
      try {
        const rebased = seedStepEntry(state.authoring.definition, action.stepId)
        return {
          ...state,
          stepEditorDrafts: {
            ...state.stepEditorDrafts,
            [action.stepId]: rebased,
          },
          announcement: announce(state, 'announceChangesCancelled', {
            label: rebased.baseline.labelEn,
          }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }
    }

    case 'patchBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      try {
        const previousEntry = getOrSeedBindingEntry(state, action.fieldId)
        const nextDraft: CafPrefillBindingDraftContent = {
          cafAttribute:
            action.patch.cafAttribute !== undefined
              ? action.patch.cafAttribute
              : previousEntry.draft.cafAttribute,
          confidenceMin:
            action.patch.confidenceMin !== undefined
              ? action.patch.confidenceMin
              : previousEntry.draft.confidenceMin,
        }
        return {
          ...state,
          bindingDrafts: {
            ...state.bindingDrafts,
            [action.fieldId]: {
              ...previousEntry,
              draft: nextDraft,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'applyBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      let entry: CafBindingDraftEntry
      try {
        entry = getOrSeedBindingEntry(state, action.fieldId)
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }

      const validation = validateCafPrefillBindingDraft(action.fieldId, entry.draft)
      if (!validation.ok) {
        const firstControl = validation.issues[0]?.control ?? null
        return {
          ...state,
          bindingDrafts: {
            ...state.bindingDrafts,
            [action.fieldId]: {
              ...entry,
              showValidation: true,
              showStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceConfigurationInvalid'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: firstControl
            ? `binding:${action.fieldId}:${firstControl}`
            : `binding-summary:${action.fieldId}`,
        }
      }

      const result = updateCafPrefillBinding(
        state.authoring,
        action.fieldId,
        entry.draft,
        entry.baseline,
      )
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            bindingDrafts: {
              ...state.bindingDrafts,
              [action.fieldId]: {
                ...entry,
                showValidation: false,
                showStaleGuidance: true,
              },
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: `binding-summary:${action.fieldId}`,
          }
        }
        return {
          ...state,
          bindingDrafts: {
            ...state.bindingDrafts,
            [action.fieldId]: {
              ...entry,
              showValidation: true,
              showStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: `binding-summary:${action.fieldId}`,
        }
      }

      const rebased = seedCafBindingDraftEntry(result.state.definition, action.fieldId)
      return {
        ...state,
        authoring: result.state,
        bindingDrafts: {
          ...state.bindingDrafts,
          [action.fieldId]: rebased,
        },
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'cancelBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      try {
        getOrSeedBindingEntry(state, action.fieldId)
        const rebased = seedCafBindingDraftEntry(state.authoring.definition, action.fieldId)
        const label = labelForField(state.authoring, action.fieldId)
        return {
          ...state,
          bindingDrafts: {
            ...state.bindingDrafts,
            [action.fieldId]: rebased,
          },
          announcement: announce(state, 'announceChangesCancelled', { label }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            bindingDrafts: bindingDraftsWithout(state.bindingDrafts, action.fieldId),
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }
    }

    case 'removeBinding': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      let entry: CafBindingDraftEntry
      try {
        entry = getOrSeedBindingEntry(state, action.fieldId)
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }

      const result = removeCafPrefillBinding(state.authoring, action.fieldId, entry.baseline)
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            bindingDrafts: {
              ...state.bindingDrafts,
              [action.fieldId]: {
                ...entry,
                showValidation: false,
                showStaleGuidance: true,
              },
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: `binding-summary:${action.fieldId}`,
          }
        }
        return {
          ...state,
          bindingDrafts: {
            ...state.bindingDrafts,
            [action.fieldId]: {
              ...entry,
              showValidation: true,
              showStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: `binding-summary:${action.fieldId}`,
        }
      }

      const rebased = seedCafBindingDraftEntry(result.state.definition, action.fieldId)
      return {
        ...state,
        authoring: result.state,
        bindingDrafts: {
          ...state.bindingDrafts,
          [action.fieldId]: rebased,
        },
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'ensureIntegrationBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      if (state.integrationBindingDraft !== null) {
        return state
      }
      return {
        ...state,
        integrationBindingDraft: seedIntegrationBindingDraftSurface(state.authoring.definition),
        pendingFocusEditorControl: null,
      }
    }

    case 'addIntegrationBindingRow': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedIntegrationSurface(state)
      const allocated = allocateIntegrationRowKey(surface)
      return {
        ...state,
        integrationBindingDraft: {
          ...surface,
          draft: {
            rows: [...surface.draft.rows, emptyIntegrationDraftRow(allocated.rowKey)],
          },
          nextRowKeySeq: allocated.nextRowKeySeq,
          showStaleGuidance: false,
        },
        pendingFocusEditorControl: `integration:${allocated.rowKey}:fieldId`,
      }
    }

    case 'patchIntegrationBindingRow': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedIntegrationSurface(state)
      const nextRows = surface.draft.rows.map((row) => {
        if (row.rowKey !== action.rowKey) return row
        return {
          ...row,
          ...(action.patch.fieldId !== undefined ? { fieldId: action.patch.fieldId } : {}),
          ...(action.patch.adapterId !== undefined ? { adapterId: action.patch.adapterId } : {}),
          ...(action.patch.param !== undefined ? { param: action.patch.param } : {}),
          ...(action.patch.direction !== undefined ? { direction: action.patch.direction } : {}),
        }
      })
      return {
        ...state,
        integrationBindingDraft: {
          ...surface,
          draft: { rows: nextRows },
        },
        pendingFocusEditorControl: null,
      }
    }

    case 'removeIntegrationBindingRow': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedIntegrationSurface(state)
      return {
        ...state,
        integrationBindingDraft: {
          ...surface,
          draft: {
            rows: surface.draft.rows.filter((row) => row.rowKey !== action.rowKey),
          },
        },
        pendingFocusEditorControl: null,
      }
    }

    case 'applyIntegrationBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedIntegrationSurface(state)
      const validation = validateIntegrationBindingsDraft(state.authoring.definition, surface.draft)
      if (!validation.ok) {
        return {
          ...state,
          integrationBindingDraft: {
            ...surface,
            showValidation: true,
            showStaleGuidance: false,
          },
          announcement: announce(state, 'announceConfigurationInvalid'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: firstIntegrationFocusControl(validation.issues),
        }
      }
      const result = updateIntegrationBindings(state.authoring, surface.draft, surface.baseline)
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            integrationBindingDraft: {
              ...surface,
              showValidation: false,
              showStaleGuidance: true,
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: 'integration-summary',
          }
        }
        return {
          ...state,
          integrationBindingDraft: {
            ...surface,
            showValidation: true,
            showStaleGuidance: false,
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: 'integration-summary',
        }
      }
      return {
        ...state,
        authoring: result.state,
        integrationBindingDraft: seedIntegrationBindingDraftSurface(result.state.definition),
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'cancelIntegrationBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      if (state.integrationBindingDraft === null) {
        return state
      }
      try {
        const rebased = seedIntegrationBindingDraftSurface(state.authoring.definition)
        return {
          ...state,
          integrationBindingDraft: rebased,
          announcement: announce(state, 'announceChangesCancelled', {
            label: 'Integration Hub',
          }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            integrationBindingDraft: null,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }
    }

    case 'ensureWorkflowBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      if (state.workflowBindingDraft !== null) {
        return state
      }
      return {
        ...state,
        workflowBindingDraft: seedWorkflowBindingDraftSurface(state.authoring.definition),
        pendingFocusEditorControl: null,
      }
    }

    case 'addWorkflowBindingRow': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedWorkflowSurface(state)
      const allocated = allocateWorkflowRowKey(surface)
      return {
        ...state,
        workflowBindingDraft: {
          ...surface,
          draft: {
            rows: [...surface.draft.rows, emptyWorkflowDraftRow(allocated.rowKey)],
          },
          nextRowKeySeq: allocated.nextRowKeySeq,
          showStaleGuidance: false,
        },
        pendingFocusEditorControl: `workflow:${allocated.rowKey}:fieldId`,
      }
    }

    case 'patchWorkflowBindingRow': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedWorkflowSurface(state)
      const nextRows = surface.draft.rows.map((row) => {
        if (row.rowKey !== action.rowKey) return row
        return {
          ...row,
          ...(action.patch.fieldId !== undefined ? { fieldId: action.patch.fieldId } : {}),
          ...(action.patch.stage !== undefined ? { stage: action.patch.stage } : {}),
        }
      })
      return {
        ...state,
        workflowBindingDraft: {
          ...surface,
          draft: { rows: nextRows },
        },
        pendingFocusEditorControl: null,
      }
    }

    case 'removeWorkflowBindingRow': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedWorkflowSurface(state)
      return {
        ...state,
        workflowBindingDraft: {
          ...surface,
          draft: {
            rows: surface.draft.rows.filter((row) => row.rowKey !== action.rowKey),
          },
        },
        pendingFocusEditorControl: null,
      }
    }

    case 'applyWorkflowBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const surface = getOrSeedWorkflowSurface(state)
      const validation = validateWorkflowBindingsDraft(state.authoring.definition, surface.draft)
      if (!validation.ok) {
        return {
          ...state,
          workflowBindingDraft: {
            ...surface,
            showValidation: true,
            showStaleGuidance: false,
          },
          announcement: announce(state, 'announceConfigurationInvalid'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: firstWorkflowFocusControl(validation.issues),
        }
      }
      const result = updateWorkflowBindings(state.authoring, surface.draft, surface.baseline)
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            workflowBindingDraft: {
              ...surface,
              showValidation: false,
              showStaleGuidance: true,
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: 'workflow-summary',
          }
        }
        return {
          ...state,
          workflowBindingDraft: {
            ...surface,
            showValidation: true,
            showStaleGuidance: false,
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: 'workflow-summary',
        }
      }
      return {
        ...state,
        authoring: result.state,
        workflowBindingDraft: seedWorkflowBindingDraftSurface(result.state.definition),
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'cancelWorkflowBindingDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      if (state.workflowBindingDraft === null) {
        return state
      }
      try {
        const rebased = seedWorkflowBindingDraftSurface(state.authoring.definition)
        return {
          ...state,
          workflowBindingDraft: rebased,
          announcement: announce(state, 'announceChangesCancelled', {
            label: 'Workflow',
          }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            workflowBindingDraft: null,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }
    }

    case 'patchFamilyRepeaterDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      try {
        if (!isFamilyRepeaterRoot(state.authoring.definition, action.fieldId)) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        const previousEntry = getOrSeedFamilyRepeaterEntry(state, action.fieldId)
        let nextDraft: FamilyRepeaterDraftContent = {
          ...previousEntry.draft,
          ...(action.patch.labelEn !== undefined ? { labelEn: action.patch.labelEn } : {}),
          ...(action.patch.labelGu !== undefined ? { labelGu: action.patch.labelGu } : {}),
          ...(action.patch.helpEn !== undefined ? { helpEn: action.patch.helpEn } : {}),
          ...(action.patch.helpGu !== undefined ? { helpGu: action.patch.helpGu } : {}),
          ...(action.patch.minItems !== undefined ? { minItems: action.patch.minItems } : {}),
          ...(action.patch.maxItems !== undefined ? { maxItems: action.patch.maxItems } : {}),
        }
        if (action.patch.memberPropertyName && action.patch.memberPatch) {
          nextDraft = {
            ...nextDraft,
            members: nextDraft.members.map((member) => {
              if (member.propertyName !== action.patch.memberPropertyName) {
                return member
              }
              const previous = member.configuration as unknown as Record<string, unknown>
              const sanitized: Record<string, string | boolean | number> = {}
              for (const [key, value] of Object.entries(action.patch.memberPatch!)) {
                if (PROPERTY_PATCH_KEYS.has(key)) {
                  sanitized[key] = value
                }
              }
              const nextConfiguration = {
                ...previous,
                ...sanitized,
              } as unknown as FieldConfigurationDraft
              if (nextConfiguration.widgetType !== member.configuration.widgetType) {
                return member
              }
              return { ...member, configuration: nextConfiguration }
            }),
          }
        }
        return {
          ...state,
          familyRepeaterDrafts: {
            ...state.familyRepeaterDrafts,
            [action.fieldId]: {
              ...previousEntry,
              draft: nextDraft,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'applyFamilyRepeaterDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      let entry: FamilyRepeaterDraftEntry
      try {
        entry = getOrSeedFamilyRepeaterEntry(state, action.fieldId)
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }

      const previewRows = state.authoring.previewFormData[action.fieldId]
      const previewRowCount = Array.isArray(previewRows) ? previewRows.length : undefined
      const validation = validateFamilyRepeaterDraftContent(entry.draft, { previewRowCount })
      if (!validation.ok) {
        return {
          ...state,
          familyRepeaterDrafts: {
            ...state.familyRepeaterDrafts,
            [action.fieldId]: {
              ...entry,
              showValidation: true,
              showStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceConfigurationInvalid'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl:
            validation.firstInvalidControl || `property-summary:${action.fieldId}`,
        }
      }

      let accepted
      try {
        accepted = acceptedFamilyRepeaterConfigurationFromDraft(validation.content)
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            familyRepeaterDrafts: {
              ...state.familyRepeaterDrafts,
              [action.fieldId]: {
                ...entry,
                showValidation: true,
                showStaleGuidance: false,
              },
            },
            announcement: announce(state, 'announceConfigurationInvalid'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: `property-summary:${action.fieldId}`,
          }
        }
        throw error
      }

      const result = updateFamilyRepeaterConfiguration(
        state.authoring,
        action.fieldId,
        accepted,
        entry.baseline,
      )
      if (!result.ok) {
        if (result.error.code === 'stale_editor_draft') {
          return {
            ...state,
            familyRepeaterDrafts: {
              ...state.familyRepeaterDrafts,
              [action.fieldId]: {
                ...entry,
                showValidation: false,
                showStaleGuidance: true,
              },
            },
            announcement: announce(state, 'announceEditorDraftStale'),
            pendingFocusFieldId: null,
            pendingFocusEditorControl: `property-summary:${action.fieldId}`,
          }
        }
        return {
          ...state,
          familyRepeaterDrafts: {
            ...state.familyRepeaterDrafts,
            [action.fieldId]: {
              ...entry,
              showValidation: true,
              showStaleGuidance: false,
            },
          },
          announcement: announce(state, 'announceAuthoringError'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: `property-summary:${action.fieldId}`,
        }
      }

      const rebased = seedFamilyRepeaterDraftEntry(result.state.definition, action.fieldId)
      return {
        ...state,
        authoring: result.state,
        familyRepeaterDrafts: {
          ...state.familyRepeaterDrafts,
          [action.fieldId]: rebased,
        },
        // Keep bilingual editorDrafts for root labels in sync after structure apply.
        editorDrafts: draftsWithout(state.editorDrafts, action.fieldId),
        ...markBindingSurfacesStaleIfNeeded(state, result.state.definition),
        announcement: announce(
          state,
          result.announcementKey ?? 'announceChangesApplied',
          result.announcementVars,
        ),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
      }
    }

    case 'cancelFamilyRepeaterDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      try {
        const rebased = seedFamilyRepeaterDraftEntry(state.authoring.definition, action.fieldId)
        const label = labelForField(state.authoring, action.fieldId)
        return {
          ...state,
          familyRepeaterDrafts: {
            ...state.familyRepeaterDrafts,
            [action.fieldId]: rebased,
          },
          announcement: announce(state, 'announceChangesCancelled', { label }),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            familyRepeaterDrafts: familyRepeaterDraftsWithout(
              state.familyRepeaterDrafts,
              action.fieldId,
            ),
            announcement: announce(state, 'announceAuthoringError'),
            pendingFocusEditorControl: null,
          }
        }
        throw error
      }
    }

    case 'addFamilyRepeaterMemberDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      try {
        const previousEntry = getOrSeedFamilyRepeaterEntry(state, action.fieldId)
        if (previousEntry.structureReadOnly) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        const nextDraft = draftAddFamilyMember(previousEntry.draft, {
          widgetType: action.widgetType,
          labelEn: action.labelEn,
          labelGu: action.labelGu,
          required: action.required,
        })
        return {
          ...state,
          familyRepeaterDrafts: {
            ...state.familyRepeaterDrafts,
            [action.fieldId]: {
              ...previousEntry,
              draft: nextDraft,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'removeFamilyRepeaterMemberDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      try {
        const previousEntry = getOrSeedFamilyRepeaterEntry(state, action.fieldId)
        if (previousEntry.structureReadOnly) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        const nextDraft = draftRemoveFamilyMember(previousEntry.draft, action.propertyName)
        return {
          ...state,
          familyRepeaterDrafts: {
            ...state.familyRepeaterDrafts,
            [action.fieldId]: {
              ...previousEntry,
              draft: nextDraft,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'moveFamilyRepeaterMemberDraft': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      try {
        const previousEntry = getOrSeedFamilyRepeaterEntry(state, action.fieldId)
        if (previousEntry.structureReadOnly) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        const nextDraft = draftMoveFamilyMember(
          previousEntry.draft,
          action.propertyName,
          action.direction,
        )
        return {
          ...state,
          familyRepeaterDrafts: {
            ...state.familyRepeaterDrafts,
            [action.fieldId]: {
              ...previousEntry,
              draft: nextDraft,
            },
          },
          pendingFocusEditorControl: null,
        }
      } catch (error) {
        if (error instanceof AuthoringError) {
          return {
            ...state,
            announcement: announce(state, 'announceAuthoringError'),
          }
        }
        throw error
      }
    }

    case 'enableProgressiveSteps': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const result = enableProgressiveSteps(state.authoring)
      if (result.ok) {
        const newStepId = result.state.definition.meta.progressiveSteps[0]?.stepId ?? null
        return {
          ...state,
          authoring: result.state,
          announcement: announce(
            state,
            result.announcementKey ?? 'announceProgressiveEnabled',
            result.announcementVars,
          ),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          ...allocateFocusStep(state, newStepId),
          stepsActionAlertCode: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
        pendingFocusStep: null,
        stepsActionAlertCode: result.error.code,
      }
    }

    case 'splitStepAfterField': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const result = splitStepAfterField(state.authoring, action.stepId, action.fieldId)
      if (result.ok) {
        const newStepId =
          typeof result.announcementVars?.stepId === 'string'
            ? result.announcementVars.stepId
            : null
        return {
          ...state,
          authoring: result.state,
          announcement: announce(
            state,
            result.announcementKey ?? 'announceStepSplit',
            result.announcementVars,
          ),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          ...allocateFocusStep(state, newStepId),
          stepsActionAlertCode: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
        pendingFocusStep: null,
        stepsActionAlertCode: result.error.code,
      }
    }

    case 'moveStepBoundary': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const result = moveStepBoundary(state.authoring, action.previousStepId, action.direction)
      if (result.ok) {
        return {
          ...state,
          authoring: result.state,
          announcement: announce(
            state,
            result.announcementKey ??
              (action.direction === 'earlier'
                ? 'announceBoundaryMovedEarlier'
                : 'announceBoundaryMovedLater'),
            result.announcementVars,
          ),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          ...allocateFocusStep(state, action.previousStepId),
          stepsActionAlertCode: null,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
        pendingFocusStep: null,
        stepsActionAlertCode: result.error.code,
      }
    }

    case 'mergeStepBoundary': {
      if (hasModalAddPending(state)) {
        return blockWhileModalAddPending(state)
      }
      const steps = state.authoring.definition.meta.progressiveSteps
      const previousIndex = steps.findIndex((step) => step.stepId === action.previousStepId)
      const removedStepId =
        previousIndex >= 0 && previousIndex < steps.length - 1
          ? steps[previousIndex + 1]!.stepId
          : null
      const removedHasPending =
        removedStepId !== null &&
        stepHasUnsavedBilingualChanges(state.stepEditorDrafts[removedStepId])

      const result = mergeStepBoundary(state.authoring, action.previousStepId, {
        removedStepHasUnsavedBilingual: removedHasPending,
      })
      if (result.ok) {
        return {
          ...state,
          authoring: result.state,
          stepEditorDrafts:
            removedStepId !== null
              ? stepDraftsWithout(state.stepEditorDrafts, removedStepId)
              : state.stepEditorDrafts,
          announcement: announce(
            state,
            result.announcementKey ?? 'announceStepsMerged',
            result.announcementVars,
          ),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          ...allocateFocusStep(state, action.previousStepId),
          stepsActionAlertCode: null,
        }
      }
      if (result.error.code === 'step_has_unsaved_bilingual_changes') {
        return {
          ...state,
          announcement: announce(state, 'announceStepHasUnsavedBilingual'),
          pendingFocusFieldId: null,
          pendingFocusEditorControl: null,
          pendingFocusStep: null,
          stepsActionAlertCode: result.error.code,
        }
      }
      return {
        ...state,
        announcement: announce(state, 'announceAuthoringError'),
        pendingFocusFieldId: null,
        pendingFocusEditorControl: null,
        pendingFocusStep: null,
        stepsActionAlertCode: result.error.code,
      }
    }

    case 'clearStepsActionAlert': {
      if (state.stepsActionAlertCode === null) {
        return state
      }
      return { ...state, stepsActionAlertCode: null }
    }

    case 'focusBilingualStep': {
      return {
        ...state,
        pendingFocusFieldId: null,
        pendingFocusEditorControl: `step:${action.stepId}:labelEn`,
        pendingFocusStep: null,
      }
    }

    case 'replaceAuthoringSession': {
      // Integrity before and after clone; never partially merge two definitions (FB-D7).
      assertDefinitionIntegrity(action.definition)
      const detached = cloneJsonSafe(action.definition)
      assertDefinitionIntegrity(detached)
      const nextAuthoring = createAuthoringSession(detached)
      const authoring =
        action.previewPolicy === 'preserve'
          ? {
              ...nextAuthoring,
              previewFormData: state.authoring.previewFormData,
            }
          : nextAuthoring
      const reset = createAuthoringUiState(authoring)
      return {
        ...reset,
        pendingFocusFieldId: authoring.selectedFieldId,
      }
    }

    default:
      return state
  }
}

/**
 * Property-surface dirty only (FB-D3.1.1).
 * Compares property draft vs baseline and property stale guidance.
 * Ignores Bilingual error drafts and bilingual stale state.
 */
export function isPropertyEditorDirty(state: AuthoringUiState, fieldId: string): boolean {
  const entry = state.editorDrafts[fieldId]
  if (!entry) {
    return false
  }
  if (entry.propertyShowStaleGuidance) {
    return true
  }
  return isConfigurationDirty(entry.baseline, entry.draft)
}

/**
 * Bilingual-surface dirty only (FB-D3 / FB-D3.1.1).
 * Shared labels/help plus error draft vs bilingual baseline; bilingual stale only.
 * Ignores constraint-only property changes.
 */
export function isFieldBilingualEditorDirty(state: AuthoringUiState, fieldId: string): boolean {
  const entry = state.editorDrafts[fieldId]
  if (!entry) {
    return false
  }
  if (entry.bilingualShowStaleGuidance) {
    return true
  }
  const draft = bilingualFromEntry(fieldId, entry)
  const baseline = bilingualBaselineFromEntry(fieldId, entry)
  return isFieldBilingualDirty(baseline, draft)
}

/**
 * CAF binding-surface dirty only (FB-D15).
 * Compares binding draft vs baseline and binding stale guidance.
 */
export function isFieldBindingDraftDirty(state: AuthoringUiState, fieldId: string): boolean {
  const entry = state.bindingDrafts[fieldId]
  if (!entry) {
    return false
  }
  return isCafBindingDraftDirty(entry.baseline, entry.draft, entry.showStaleGuidance)
}

/**
 * Family-repeater property-surface dirty only (FB-D16).
 */
export function isFamilyRepeaterDraftEntryDirty(state: AuthoringUiState, fieldId: string): boolean {
  const entry = state.familyRepeaterDrafts[fieldId]
  if (!entry) {
    return false
  }
  if (entry.showStaleGuidance) {
    return true
  }
  return isFamilyRepeaterDraftDirty(entry.draft, entry.contentBaseline)
}

/**
 * Overall field dirty for canvas / global unsaved indication (FB-D3.1.1 / FB-D15 / FB-D16).
 * True when Property, Bilingual, CAF binding, or family-repeater surface has pending work.
 */
export function isFieldAnyDraftDirty(state: AuthoringUiState, fieldId: string): boolean {
  return (
    isPropertyEditorDirty(state, fieldId) ||
    isFieldBilingualEditorDirty(state, fieldId) ||
    isFieldBindingDraftDirty(state, fieldId) ||
    isFamilyRepeaterDraftEntryDirty(state, fieldId)
  )
}

/**
 * @deprecated Prefer {@link isPropertyEditorDirty} or {@link isFieldAnyDraftDirty}.
 * Alias of {@link isFieldAnyDraftDirty} (overall field dirty, not property-only).
 */
export function isFieldEditorDirty(state: AuthoringUiState, fieldId: string): boolean {
  return isFieldAnyDraftDirty(state, fieldId)
}

export function isStepEditorDirty(state: AuthoringUiState, stepId: string): boolean {
  const entry = state.stepEditorDrafts[stepId]
  if (!entry) {
    return false
  }
  if (entry.showStaleGuidance) {
    return true
  }
  return isStepBilingualDirty(entry.baseline, entry.draft)
}

export function hasActiveCanvasReorderGesture(state: AuthoringUiState): boolean {
  return state.canvasReorderGesture !== null
}

export { removeEditorDraft }
