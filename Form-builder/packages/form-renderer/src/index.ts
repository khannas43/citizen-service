export type {
  FormRendererMode,
  FormRendererLocale,
  FormRendererChangeData,
  FormRendererSubmitData,
  FormRendererStepChangeData,
  FormRendererProps,
  FormDefinitionAdmissionReason,
  FormDefinitionAdmissionResult,
  FormRendererMessageKey,
} from './renderer-types.js'

export { FormRenderer, DG20_RENDERER_ID_SEPARATOR } from './FormRenderer.js'

export { admitFormDefinition } from './definition-admission.js'
export type { AdmitFormDefinitionOptions } from './definition-admission.js'

export {
  createDg20FormValidator,
  getDg20FormValidator,
  resetDg20FormValidatorForTests,
  tryCompileFormSchema,
} from './validator-2020.js'

export { resolveRendererMessage, getRendererMessageCatalogue } from './renderer-messages.js'

export {
  buildProgressivePlan,
  deriveStepSchema,
  deriveStepUiSchema,
  normalizeStepUiOrder,
  pickStepFormData,
  mergeStepFormData,
  earliestStepIndexForErrors,
  filterErrorSchemaForStep,
  listRootPropertyKeys,
  APPROVED_STEP_UI_ROOT_DIRECTIVES,
} from './progressive-steps.js'
export type {
  ProgressivePlan,
  ProgressivePlanResult,
  ProgressivePlanFailureReason,
  ProgressiveStepPlan,
} from './progressive-steps.js'

export {
  createAutosaveSnapshot,
  AUTOSAVE_SNAPSHOT_MAX_DEPTH,
  AUTOSAVE_SNAPSHOT_MAX_NODES,
} from './progressive-autosave.js'
export type {
  ProgressiveAutosaveAdapter,
  ProgressiveAutosaveRequest,
  ProgressiveAutosaveStatus,
  ProgressiveAutosaveStatusData,
  AutosaveSnapshotFailureReason,
  AutosaveSnapshotResult,
} from './progressive-autosave.js'

export {
  admitProgressiveResumeResult,
  resolveResumeContextRevision,
  resolveResumeTargetFromCheckpoint,
  resumeSessionTokenForKey,
  RESUME_CONTEXT_REVISION_MAX_LENGTH,
  RESUME_SESSION_TOKEN_NONE,
  RESUME_SESSION_TOKEN_INVALID,
} from './progressive-resume.js'
export type {
  ProgressiveResumeAdapter,
  ProgressiveResumeRequest,
  ProgressiveResumeResult,
  ProgressiveResumeCheckpoint,
  ProgressiveResumeStatus,
  ProgressiveResumeStatusData,
  ProgressiveResumeAdmissionResult,
  ProgressiveResumeAdmissionFailureReason,
  ResumeContextRevisionResolution,
} from './progressive-resume.js'

export {
  admitCafPrefillAdapterResult,
  createCafSessionCoordinator,
} from './caf-session-coordinator.js'
export type {
  CafPrefillAdmissionFailureReason,
  CafPrefillAdmissionResult,
  CafSessionCoordinator,
} from './caf-session-coordinator.js'
