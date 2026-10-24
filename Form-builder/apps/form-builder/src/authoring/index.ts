export { cloneJsonSafe, cloneJsonSafeObject } from './clone.js'
export type { CloneJsonSafeResult } from './clone.js'
export { createAuthoringSession, selectField, setPreviewFormData } from './create-session.js'
export { allocateFieldId, collectExistingFieldIds, widgetTypeToIdStem } from './field-ids.js'
export { assertDefinitionIntegrity, isExactLocalizedPair } from './integrity.js'
export {
  admitAddressBlockXDg20,
  isAdmittedAddressBlockSchema,
  isAdmittedAddressPhotoSchema,
  isAdmittedPhotoCaptureSchema,
  isAddressPhotoWidgetType,
} from './address-photo-schema-admission.js'
export type { AddressPhotoWidgetType } from './address-photo-schema-admission.js'
export {
  admitDigiLockerXDg20,
  admitDocUploadXDg20,
  isAdmittedDigiLockerSchema,
  isAdmittedDocDigiLockerSchema,
  isAdmittedDocUploadSchema,
  isDocDigiLockerWidgetType,
} from './doc-digilocker-schema-admission.js'
export type {
  AdmittedDigiLockerXDg20,
  AdmittedDocUploadXDg20,
  DocDigiLockerWidgetType,
} from './doc-digilocker-schema-admission.js'
export {
  DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES,
  allowedMimeTypesToDraft,
  isExactDigiLockerDocumentTypeCode,
  maxFileSizeBytesToDraft,
  parseAllowedMimeTypesText,
  parseMaxFileSizeBytesDraft,
} from './doc-digilocker-policy.js'
export {
  FEE_AMOUNT_MINOR_MAX,
  admitFeeFieldXDg20,
  isAdmittedFeeEsignSchema,
  isAdmittedFeeFieldSchema,
  isAdmittedSignatureEsignSchema,
  isExactFeeRuleId,
  isFeeEsignWidgetType,
} from './fee-esign-schema-admission.js'
export type { AdmittedFeeFieldXDg20, FeeEsignWidgetType } from './fee-esign-schema-admission.js'
export {
  admitEligibilityDeclarationXDg20,
  isAdmittedEligibilityDeclarationSchema,
  isEligibilityDeclarationWidgetType,
  isExactDeclarationId,
  isExactDeclarationText,
} from './eligibility-declaration-schema-admission.js'
export type {
  AdmittedEligibilityDeclarationXDg20,
  EligibilityDeclarationWidgetType,
} from './eligibility-declaration-schema-admission.js'
export {
  isAdmittedCafPrefillSchema,
  isCafPrefillWidgetType,
} from './caf-prefill-schema-admission.js'
export type { CafPrefillWidgetType } from './caf-prefill-schema-admission.js'
export { FAMILY_MEMBER_WIDGET_TYPES, isFamilyMemberWidgetType } from './family-member-types.js'
export type { FamilyMemberWidgetType } from './family-member-types.js'
export {
  allocateMemberPropertyId,
  familyMemberDefinitionPath,
  isDescendantOfRepeater,
  isRepeaterDescendantPath,
} from './family-repeater-paths.js'
export {
  admitFamilyRepeaterSchema,
  assertFamilyRepeaterFieldGoverned,
  collectFamilyRepeaterNestedPaths,
  isAdmittedFamilyMemberChildSchema,
  isAdmittedFamilyRepeaterSchema,
  isFamilyRepeaterWidgetType,
  resolveFamilyRepeaterChildAdmissionMode,
} from './family-repeater-schema-admission.js'
export type {
  FamilyRepeaterChildAdmissionMode,
  FamilyRepeaterSchemaAdmission,
  FamilyRepeaterWidgetType,
} from './family-repeater-schema-admission.js'
export {
  acceptedFamilyRepeaterConfigurationFromDraft,
  addFamilyMember,
  createDefaultFamilyMemberConfiguration,
  draftAddFamilyMember,
  draftMoveFamilyMember,
  draftRemoveFamilyMember,
  familyRepeaterPreviewStructureKey,
  getFamilyMemberCapabilities,
  isFamilyRepeaterDraftDirty,
  isFamilyRepeaterRoot,
  moveFamilyMember,
  readFamilyMemberConfiguration,
  readFamilyRepeaterDraftContent,
  removeFamilyMember,
  seedFamilyRepeaterDraftContent,
  serializeFamilyRepeaterMemberStructureKey,
  serializeFamilyRepeaterStructureBaseline,
  updateFamilyRepeaterConfiguration,
  validateFamilyRepeaterDraftContent,
} from './family-repeater-authoring.js'
export type {
  FamilyMemberCapabilities,
  FamilyMemberDraft,
  FamilyRepeaterAcceptedConfiguration,
  FamilyRepeaterDraftContent,
  FamilyRepeaterDraftValidationResult,
  FamilyRepeaterStructureBaseline,
} from './family-repeater-authoring.js'
export {
  collectVisibleCafBindingDrafts,
  collectVisibleCafBindingRows,
  isAnyBindingDraftDirty,
  isCafBindingContentDirty,
  isCafBindingDraftDirty,
  readCafPrefillBinding,
  removeCafPrefillBinding,
  seedCafBindingDraftContent,
  seedCafBindingDraftEntry,
  updateCafPrefillBinding,
  validateCafPrefillBindingDraft,
} from './caf-prefill-binding-authoring.js'
export type {
  CafBindingDraftEntry,
  CafPrefillBindingBaseline,
  CafPrefillBindingDraftContent,
  CafPrefillBindingIssue,
  CafPrefillBindingIssueCode,
  CafPrefillBindingValidationResult,
  VisibleCafBindingDraft,
  VisibleCafBindingRow,
} from './caf-prefill-binding-authoring.js'
export {
  bindableFieldOrderIndex,
  canvasRootFieldIdsForBindingTargets,
  collectBindableFields,
  isBindableFieldId,
} from './collect-bindable-fields.js'
export type { BindableField, BindableFieldKind } from './collect-bindable-fields.js'
export {
  allocateIntegrationRowKey,
  collectIntegrationBindingDirtyFieldIds,
  emptyIntegrationDraftRow,
  isIntegrationBindingSurfaceDirty,
  isIntegrationBindingsDraftDirty,
  liveBaselineMatchesIntegrationSurface,
  readIntegrationBindings,
  seedIntegrationBindingDraftSurface,
  sortIntegrationBindings,
  updateIntegrationBindings,
  validateIntegrationBindingsDraft,
} from './integration-binding-authoring.js'
export type {
  IntegrationBindingDraftContent,
  IntegrationBindingDraftRow,
  IntegrationBindingDraftSurface,
  IntegrationBindingIssue,
  IntegrationBindingIssueCode,
  IntegrationBindingValidationResult,
} from './integration-binding-authoring.js'
export {
  allocateWorkflowRowKey,
  collectWorkflowBindingDirtyFieldIds,
  emptyWorkflowDraftRow,
  isWorkflowBindingSurfaceDirty,
  isWorkflowBindingsDraftDirty,
  liveBaselineMatchesWorkflowSurface,
  readWorkflowBindings,
  seedWorkflowBindingDraftSurface,
  sortWorkflowBindings,
  updateWorkflowBindings,
  validateWorkflowBindingsDraft,
} from './workflow-binding-authoring.js'
export type {
  WorkflowBindingDraftContent,
  WorkflowBindingDraftRow,
  WorkflowBindingDraftSurface,
  WorkflowBindingIssue,
  WorkflowBindingIssueCode,
  WorkflowBindingValidationResult,
} from './workflow-binding-authoring.js'
export {
  admitDobXDg20,
  admitEmailXDg20,
  admitMobileOtpXDg20,
  isAdmittedAadhaarSchema,
  isAdmittedBankAccountSchema,
  isAdmittedCitizenSchema,
  isAdmittedDobSchema,
  isAdmittedEmailSchema,
  isAdmittedFullNameSchema,
  isAdmittedMobileOtpSchema,
  isAdmittedPincodeSchema,
  isCitizenWidgetType,
} from './citizen-schema-admission.js'
export type {
  AdmittedDobXDg20,
  AdmittedEmailXDg20,
  CitizenWidgetType,
  XDg20AdmissionResult,
} from './citizen-schema-admission.js'
export {
  admitMasterListXDg20,
  isAdmittedDropdownMasterSchema,
  isAdmittedMasterListWidgetSchema,
  isAdmittedRadioSchema,
  isExactMasterListId,
  isMasterListWidgetType,
} from './master-list-schema-admission.js'
export type { MasterListWidgetType } from './master-list-schema-admission.js'
export {
  admitCascadingXDg20,
  isAdmittedCascadingDropdownSchema,
  isAdmittedGovernedMasterDataSchema,
  isAdmittedMultiselectSchema,
  isGovernedMasterDataWidgetType,
} from './master-data-schema-admission.js'
export type { GovernedMasterDataWidgetType } from './master-data-schema-admission.js'
export { addField } from './add-field.js'
export type { AddFieldOptions } from './add-field.js'
export { getRemoveCapability, removeField } from './remove-field.js'
export type { RemoveBlockingReason, RemoveCapability } from './remove-field.js'
export {
  getCanvasReorderTargets,
  getMoveCapability,
  moveField,
  reorderFieldWithinStep,
} from './move-field.js'
export type { CanvasReorderRequest, CanvasReorderTarget, MoveCapability } from './move-field.js'
export {
  authoringReducer,
  createAuthoringUiState,
  hasActiveCanvasReorderGesture,
  isFamilyRepeaterDraftEntryDirty,
  isFieldAnyDraftDirty,
  isFieldBindingDraftDirty,
  isFieldBilingualEditorDirty,
  isFieldEditorDirty,
  isPropertyEditorDirty,
  isStepEditorDirty,
} from './reducer.js'
export type {
  AuthoringAction,
  AuthoringAnnouncement,
  AuthoringUiState,
  EditorDraftEntry,
  FamilyRepeaterDraftEntry,
  PendingConfiguredAdd,
  PendingConfiguredAddFocusRequest,
  PendingConfiguredAddPatch,
  PendingFocusStepRequest,
  PendingStructuralAddFocusRequest,
  StepEditorDraftEntry,
  ConfiguredAddFocusControl,
} from './reducer.js'
export {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  CONFIGURED_ADDABLE_WIDGET_TYPES,
  D1_ADDABLE_COUNT,
  D1_ADDABLE_WIDGET_TYPES,
  D1_PENDING_COUNT,
  FIELD_ADDABLE_COUNT,
  FIELD_ADDABLE_WIDGET_TYPES,
  PENDING_COUNT,
  STRUCTURAL_ADDABLE_COUNT,
  STRUCTURAL_ADDABLE_WIDGET_TYPES,
  defaultBilingualLabel,
  defaultHelpContent,
  getAuthoringTemplate,
  isAddableWidgetType,
  isConfiguredAddableWidgetType,
  isD1AddableWidgetType,
  isFieldAddableWidgetType,
  isStructuralAddableWidgetType,
} from './templates.js'
export type {
  AddableWidgetType,
  AuthoringFieldTemplate,
  ConfiguredAddTemplateInput,
  ConfiguredAddableWidgetType,
  ConfiguredAuthoringFieldTemplate,
  D1AddableWidgetType,
  FieldAddableWidgetType,
  ImmediateAuthoringFieldTemplate,
  StructuralAddableWidgetType,
} from './templates.js'
export type {
  AuthoringAnnouncementKey,
  AuthoringErrorCode,
  AuthoringFailure,
  AuthoringResult,
  AuthoringSuccess,
  BuilderAuthoringState,
  MoveDirection,
} from './types.js'
export { AuthoringError } from './types.js'
export {
  isEditableWidgetType,
  type CommonDataEditable,
  type CommonEditableStrings,
  type ConfigurationIssue,
  type ConfigurationIssueCode,
  type ConfigurationValidationResult,
  type EditableWidgetType,
  type FieldConfiguration,
  type FieldConfigurationDraft,
} from './property-config-types.js'
export {
  configurationToDraft,
  ensureEditorDraft,
  hasDirtyEditorDraft,
  isConfigurationDirty,
  listDirtyFieldIds,
  readFieldConfiguration,
  removeEditorDraft,
  seedEditorDraftWithBaseline,
} from './read-field-configuration.js'
export { validateFieldConfigurationDraft } from './validate-field-configuration.js'
export { updateFieldConfiguration } from './update-field-configuration.js'
export { parseOptionalJsonDecimal, parseRequiredJsonDecimal } from './json-decimal.js'
export { previewValueMayBeInvalid, schemaHasOwnKey } from './preview-constraint-warning.js'
export {
  fieldBilingualFromConfiguration,
  fieldBilingualFromParts,
  isFieldBilingualDirty,
  isStepBilingualDirty,
  readAllFieldBilingualContent,
  readAllStepBilingualContent,
  readFieldBilingualContent,
  readStepBilingualContent,
} from './bilingual-types.js'
export type {
  BilingualCompleteness,
  BilingualCompletenessPair,
  BilingualErrorPair,
  BilingualFieldPatch,
  BilingualIssue,
  BilingualIssueCode,
  FieldBilingualContent,
  FieldBilingualDraft,
  FieldBilingualValidationResult,
  StepBilingualContent,
  StepBilingualDraft,
  StepBilingualValidationResult,
} from './bilingual-types.js'
export {
  validateFieldBilingualDraft,
  validateStepBilingualDraft,
} from './validate-field-bilingual.js'
export { updateFieldBilingualContent } from './update-field-bilingual.js'
export { updateStepBilingualContent } from './update-step-bilingual.js'
export { computeBilingualCompleteness } from './compute-bilingual-completeness.js'
export {
  collectVisibleBilingualDrafts,
  visibleFieldBilingual,
} from './collect-visible-bilingual.js'
export {
  allocateStepId,
  collectExistingStepIds,
  defaultStepLabels,
  enableProgressiveSteps,
  getStepBoundaryCapabilities,
  mergeStepBoundary,
  moveStepBoundary,
  progressiveStructureKey,
  splitStepAfterField,
  stepHasUnsavedBilingualChanges,
} from './step-boundaries.js'
export type {
  BoundaryCapability,
  BoundaryMoveBlockedReason,
  BoundaryMoveDirection,
  MergeBlockedReason,
  SplitBlockedReason,
  SplitFieldCapability,
  StepBoundaryCapabilities,
} from './step-boundaries.js'
export {
  canCreatePageBreakBoundary,
  createEmptyPendingPageBreak,
  createPageBreakBoundary,
  getPageBreakBoundaryOptions,
  patchPendingPageBreak,
  resolveDefaultPageBreakAfterFieldId,
  validatePendingPageBreak,
} from './page-break-authoring.js'
export type {
  PageBreakAddFocusControl,
  PageBreakBoundaryOption,
  PageBreakCreateRequest,
  PendingStructuralAdd,
  PendingStructuralAddPatch,
} from './page-break-authoring.js'
