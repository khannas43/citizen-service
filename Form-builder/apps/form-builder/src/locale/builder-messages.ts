export type BuilderLocale = 'en' | 'gu'

export type BuilderMessageKey =
  | 'appTitle'
  | 'localPreviewBadge'
  | 'notSavedNote'
  | 'skipToMain'
  | 'paletteHeading'
  | 'paletteSearchLabel'
  | 'paletteSearchPlaceholder'
  | 'paletteNoResults'
  | 'paletteResultCount'
  | 'canvasHeading'
  | 'canvasStepChip'
  | 'canvasFamilyMemberCount'
  | 'canvasErrorHeading'
  | 'canvasErrorBody'
  | 'canvasReorderHandleAria'
  | 'canvasReorderInstructions'
  | 'canvasReorderTargetBefore'
  | 'canvasReorderTargetEnd'
  | 'canvasReorderProposedMarker'
  | 'canvasReorderMobileGuidance'
  | 'canvasReorderCrossStepBlocked'
  | 'inspectorHeading'
  | 'inspectorReadOnly'
  | 'inspectorEmpty'
  | 'inspectorFieldId'
  | 'inspectorWidgetType'
  | 'inspectorGroup'
  | 'inspectorCategory'
  | 'inspectorSupportsRequired'
  | 'inspectorRequiredState'
  | 'inspectorConfigurable'
  | 'inspectorBakedIn'
  | 'inspectorBilingualPending'
  | 'moveUp'
  | 'moveDown'
  | 'removeField'
  | 'cannotRemoveLastGuidance'
  | 'cannotRemoveLastStepFieldGuidance'
  | 'required'
  | 'optional'
  | 'yes'
  | 'no'
  | 'previewHeading'
  | 'previewNote'
  | 'tabBindings'
  | 'tabBilingual'
  | 'tabSteps'
  | 'tabBindingsBody'
  | 'tabBilingualBody'
  | 'tabStepsBody'
  | 'ariaBuilderTabs'
  | 'ariaBuilderLocale'
  | 'bilingualHeading'
  | 'bilingualGuidance'
  | 'bilingualCompleteness'
  | 'bilingualCompletenessMeter'
  | 'bilingualFieldsHeading'
  | 'bilingualStepsHeading'
  | 'bilingualColumnEn'
  | 'bilingualColumnGu'
  | 'bilingualFieldMeta'
  | 'bilingualErrorEn'
  | 'bilingualErrorGu'
  | 'bilingualStepLabelEn'
  | 'bilingualStepLabelGu'
  | 'bilingualDirty'
  | 'bilingualComplete'
  | 'bilingualIncomplete'
  | 'bilingualApply'
  | 'bilingualCancel'
  | 'stepsHeading'
  | 'stepsGuidance'
  | 'stepsStatusProgressive'
  | 'stepsStatusSinglePage'
  | 'stepsEnable'
  | 'stepsCountSummary'
  | 'stepsUnitOne'
  | 'stepsUnitMany'
  | 'stepsStepHeading'
  | 'stepsStepMeta'
  | 'stepsFieldMeta'
  | 'stepsSplitAfter'
  | 'stepsSplitAfterAria'
  | 'stepsBoundaryHeading'
  | 'stepsMoveEarlier'
  | 'stepsMoveLater'
  | 'stepsMerge'
  | 'stepsMoveEarlierAria'
  | 'stepsMoveLaterAria'
  | 'stepsMergeAria'
  | 'stepsEditLabels'
  | 'stepsEditLabelsAria'
  | 'stepsBlockedSplitLast'
  | 'stepsBlockedMoveEmpty'
  | 'stepsBlockedMergeUnsaved'
  | 'stepsAlertProgressiveNotEnabled'
  | 'stepsAlertStepNotFound'
  | 'stepsAlertFieldNotInStep'
  | 'stepsAlertSplitAfterLast'
  | 'stepsAlertBoundaryNotFound'
  | 'stepsAlertMoveWouldEmpty'
  | 'stepsAlertUnsavedBilingual'
  | 'stepsAlertInconsistent'
  | 'stepsAlertGeneric'
  | 'actionValidate'
  | 'actionSaveDraft'
  | 'actionSubmit'
  | 'actionSubmitConfirm'
  | 'actionSubmitCancel'
  | 'actionSubmitting'
  | 'submitConfirmTitle'
  | 'submitConfirmBody'
  | 'submitConfirmNonEditableWarning'
  | 'submitConfirmNotAuthWarning'
  | 'submitConfirmAdvisories'
  | 'submitSuccess'
  | 'submitFailed'
  | 'submitStale'
  | 'submitRetry'
  | 'submitBlockedActor'
  | 'submitBlockedLocal'
  | 'submitBlockedDirty'
  | 'submitBlockedValidate'
  | 'submitReadOnlyGuidance'
  | 'actionsLifecycleNote'
  | 'validateBlockedSubmitted'
  | 'validationScopeNote'
  | 'validationBlockedUnsaved'
  | 'validationValidating'
  | 'validationSuccess'
  | 'validationValidAdvisorySummary'
  | 'validationInvalidSummary'
  | 'validationFailed'
  | 'validationRetry'
  | 'validationSeverityError'
  | 'validationSeverityWarning'
  | 'validationSeverityInfo'
  | 'persistLocalDraftBadge'
  | 'persistStoredDraftBadge'
  | 'persistUnsavedChanges'
  | 'persistSavedClean'
  | 'persistCreating'
  | 'persistSaving'
  | 'persistCreated'
  | 'persistSaved'
  | 'persistLoaded'
  | 'persistDuplicate'
  | 'persistStale'
  | 'persistNotFound'
  | 'persistFailed'
  | 'persistInvalidCoordinates'
  | 'persistLoadDiscarded'
  | 'persistSaveDiscarded'
  | 'persistValidationRejected'
  | 'persistRetry'
  | 'persistOpenDraftHeading'
  | 'persistServiceIdLabel'
  | 'persistVersionLabel'
  | 'persistLoad'
  | 'persistLoading'
  | 'persistDiscardConfirmTitle'
  | 'persistDiscardConfirmBody'
  | 'persistDiscardConfirmAction'
  | 'persistDiscardCancel'
  | 'persistSaveBlockedUnsaved'
  | 'persistSaveBlockedValidate'
  | 'localeEn'
  | 'localeGu'
  | 'serviceLabel'
  | 'versionLabel'
  | 'statusDraft'
  | 'statusSubmitted'
  | 'statusApproved'
  | 'statusPublished'
  | 'statusRetired'
  | 'versionHistoryOpen'
  | 'versionHistoryHeading'
  | 'versionHistoryClose'
  | 'versionHistoryLoad'
  | 'versionHistoryLoading'
  | 'versionHistoryLoadMore'
  | 'versionHistoryEmpty'
  | 'versionHistoryFailed'
  | 'versionHistoryRetry'
  | 'versionHistoryOpenDraft'
  | 'versionHistoryCreateDraft'
  | 'versionHistoryNotCloneable'
  | 'cloneConfirmTitle'
  | 'cloneConfirmBody'
  | 'cloneConfirmNewVersion'
  | 'cloneConfirmSourceUnchanged'
  | 'cloneConfirmNotAuth'
  | 'cloneConfirmConfirm'
  | 'cloneConfirmCancel'
  | 'cloneSuccess'
  | 'cloneFailed'
  | 'cloneStale'
  | 'cloneSourceNotCloneable'
  | 'cloneBlockedActor'
  | 'versionsNote'
  | 'persistStoredSubmittedBadge'
  | 'categoryData'
  | 'categoryDisplay'
  | 'categoryLayout'
  | 'palettePending'
  | 'paletteAddAria'
  | 'paletteCreateBoundaryAria'
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
  | 'announcePageBreakCreated'
  | 'announcePageBreakNoBoundary'
  | 'announcePageBreakBlocked'
  | 'editorApply'
  | 'editorCancel'
  | 'editorCommonHeading'
  | 'editorConstraintsHeading'
  | 'editorUnsavedChanges'
  | 'editorClean'
  | 'editorRequired'
  | 'editorLabelEn'
  | 'editorLabelGu'
  | 'editorHelpEn'
  | 'editorHelpGu'
  | 'editorHelpEnRequired'
  | 'editorHelpGuRequired'
  | 'editorMaxLength'
  | 'editorPattern'
  | 'editorMinimum'
  | 'editorMaximum'
  | 'editorStep'
  | 'editorCurrencyPrecisionHint'
  | 'editorBakedConstraintsHint'
  | 'editorMobileOtpSmsOnlyHint'
  | 'editorValidationSummary'
  | 'editorPreviewValueWarning'
  | 'editorUnavailable'
  | 'editorLegacyPageBreakGuidance'
  | 'editorStaleGuidance'
  | 'editorErrorLabelEnRequired'
  | 'editorErrorLabelGuRequired'
  | 'editorErrorLabelEnPadded'
  | 'editorErrorLabelGuPadded'
  | 'editorErrorHelpPairIncomplete'
  | 'editorErrorHelpEnPadded'
  | 'editorErrorHelpGuPadded'
  | 'editorErrorHelpRequired'
  | 'editorErrorErrorPairIncomplete'
  | 'editorErrorErrorEnPadded'
  | 'editorErrorErrorGuPadded'
  | 'editorErrorMaxLengthInvalid'
  | 'editorErrorPatternInvalid'
  | 'editorErrorMinimumInvalid'
  | 'editorErrorMaximumInvalid'
  | 'editorErrorStepInvalid'
  | 'editorErrorRangeInvalid'
  | 'editorErrorCurrencyMinimumNegative'
  | 'editorVerifyEmail'
  | 'editorMinAge'
  | 'editorMaxAge'
  | 'editorErrorMinAgeInvalid'
  | 'editorErrorMaxAgeInvalid'
  | 'editorErrorAgeRangeInvalid'
  | 'editorMasterListId'
  | 'editorErrorMasterListIdInvalid'
  | 'editorMinItems'
  | 'editorMaxItems'
  | 'editorErrorMinItemsInvalid'
  | 'editorErrorMaxItemsInvalid'
  | 'editorErrorItemsRangeInvalid'
  | 'editorErrorRequiredMinItemsInvalid'
  | 'editorParentMasterListId'
  | 'editorChildMasterListId'
  | 'editorErrorParentMasterListIdInvalid'
  | 'editorErrorChildMasterListIdInvalid'
  | 'editorDefaultStateCode'
  | 'editorDefaultStateCodeHint'
  | 'editorErrorDefaultStateCodeInvalid'
  | 'editorPhotoCapturePolicyHint'
  | 'editorAllowedMimeTypes'
  | 'editorAllowedMimeTypesHint'
  | 'editorErrorAllowedMimeTypesInvalid'
  | 'editorMaxFileSizeBytes'
  | 'editorMaxFileSizeBytesHint'
  | 'editorErrorMaxFileSizeBytesInvalid'
  | 'editorDigiLockerDocumentTypeCode'
  | 'editorDigiLockerDocumentTypeCodeHint'
  | 'editorErrorDigiLockerDocumentTypeCodeInvalid'
  | 'editorFeeRuleId'
  | 'editorErrorFeeRuleIdInvalid'
  | 'editorFeeFieldPolicyHint'
  | 'editorDeclarationId'
  | 'editorErrorDeclarationIdInvalid'
  | 'editorErrorDeclarationTextEnInvalid'
  | 'editorErrorDeclarationTextGuInvalid'
  | 'editorEligibilityDeclarationPolicyHint'
  | 'editorSignatureEsignPolicyHint'
  | 'editorCafPrefillPolicyHint'
  | 'editorErrorCafAttributeInvalid'
  | 'editorErrorConfidenceMinInvalid'
  | 'configuredAddTitle'
  | 'configuredAddGuidance'
  | 'configuredAddMasterListId'
  | 'configuredAddMinItems'
  | 'configuredAddMaxItems'
  | 'configuredAddParentMasterListId'
  | 'configuredAddChildMasterListId'
  | 'configuredAddAllowedMimeTypes'
  | 'configuredAddMaxFileSizeBytes'
  | 'configuredAddDigiLockerDocumentTypeCode'
  | 'configuredAddFeeRuleId'
  | 'configuredAddDeclarationId'
  | 'configuredAddDeclarationTextEn'
  | 'configuredAddDeclarationTextGu'
  | 'configuredAddCafAttribute'
  | 'configuredAddConfidenceMin'
  | 'configuredAddInitialMemberWidgetType'
  | 'configuredAddInitialMemberLabelEn'
  | 'configuredAddInitialMemberLabelGu'
  | 'configuredAddInitialMemberRequired'
  | 'configuredAddConfirm'
  | 'configuredAddCancel'
  | 'familyRepeaterMembersHeading'
  | 'familyRepeaterAddMember'
  | 'familyRepeaterRemoveMember'
  | 'familyRepeaterMoveEarlier'
  | 'familyRepeaterMoveLater'
  | 'familyRepeaterMemberWidgetType'
  | 'familyRepeaterMembersReadOnly'
  | 'familyRepeaterMemberRequired'
  | 'announceConfiguredAddBlocked'
  | 'persistBlockedConfiguredAdd'
  | 'validationBlockedConfiguredAdd'
  | 'pageBreakDialogTitle'
  | 'pageBreakDialogGuidance'
  | 'pageBreakAfterField'
  | 'pageBreakAfterFieldInvalid'
  | 'pageBreakNextStepLabelEn'
  | 'pageBreakNextStepLabelGu'
  | 'pageBreakConfirm'
  | 'pageBreakCancel'
  | 'pageBreakNoBoundaryGuidance'
  | 'bindingsHeading'
  | 'bindingsGuidance'
  | 'bindingsCafHeading'
  | 'bindingsCafGuidance'
  | 'bindingsEmpty'
  | 'bindingsFieldMeta'
  | 'bindingsStatusBound'
  | 'bindingsStatusUnbound'
  | 'bindingsCafAttribute'
  | 'bindingsConfidenceMin'
  | 'bindingsApply'
  | 'bindingsCancel'
  | 'bindingsRemove'
  | 'bindingsDirty'
  | 'bindingsClean'
  | 'bindingsValidationSummary'
  | 'bindingsStaleGuidance'
  | 'bindingsIntegrationHeading'
  | 'bindingsIntegrationGuidance'
  | 'bindingsIntegrationEmpty'
  | 'bindingsIntegrationAdd'
  | 'bindingsIntegrationAdapterId'
  | 'bindingsIntegrationParam'
  | 'bindingsIntegrationDirection'
  | 'bindingsIntegrationDirectionIn'
  | 'bindingsIntegrationDirectionOut'
  | 'bindingsIntegrationRemoveRow'
  | 'bindingsIntegrationStaleGuidance'
  | 'bindingsIntegrationValidationSummary'
  | 'bindingsWorkflowHeading'
  | 'bindingsWorkflowGuidance'
  | 'bindingsWorkflowEmpty'
  | 'bindingsWorkflowAdd'
  | 'bindingsWorkflowStage'
  | 'bindingsWorkflowRemoveRow'
  | 'bindingsWorkflowStaleGuidance'
  | 'bindingsWorkflowValidationSummary'
  | 'bindingsFieldSelect'
  | 'bindingsNestedFieldMeta'
  | 'bindingsOpaqueIdsGuidance'
  | 'editorErrorIntegrationFieldInvalid'
  | 'editorErrorIntegrationAdapterInvalid'
  | 'editorErrorIntegrationParamInvalid'
  | 'editorErrorIntegrationDirectionInvalid'
  | 'editorErrorIntegrationDuplicateTuple'
  | 'editorErrorWorkflowFieldInvalid'
  | 'editorErrorWorkflowStageInvalid'
  | 'editorErrorWorkflowDuplicatePair'

const EN: Record<BuilderMessageKey, string> = {
  appTitle: 'DG 2.0 Form Builder',
  localPreviewBadge: 'Local technical preview',
  notSavedNote:
    'Local and stored draft status is shown above. Technical submit requires a saved, validated draft and host actor context.',
  skipToMain: 'Skip to main Builder content',
  paletteHeading: 'Controlled palette',
  paletteSearchLabel: 'Search palette',
  paletteSearchPlaceholder: 'Search by label, description, or widget type',
  paletteNoResults: 'No palette widgets match your search.',
  paletteResultCount: '{count} widgets shown',
  canvasHeading: 'Form canvas',
  canvasStepChip: 'Step: {label}',
  canvasFamilyMemberCount: '{count} member fields',
  canvasErrorHeading: 'Canvas cannot be displayed',
  canvasErrorBody:
    'This form definition is in an inconsistent state and cannot be shown safely. No changes were made.',
  canvasReorderHandleAria: 'Reorder {label}',
  canvasReorderInstructions:
    'Press Space or Enter to lift. Use arrow keys, Home, or End to choose a position; press Space or Enter to drop, or Escape to cancel. Tab cancels reorder before moving focus.',
  canvasReorderTargetBefore: 'Move before {label}',
  canvasReorderTargetEnd: 'Move to end of step',
  canvasReorderProposedMarker: 'Proposed insertion position',
  canvasReorderMobileGuidance:
    'On narrow screens, use Move up and Move down. Pointer drag reordering is for desktop.',
  canvasReorderCrossStepBlocked: 'Cannot drop across step boundary',
  inspectorHeading: 'Selected field',
  inspectorReadOnly: 'Property editing deferred — D1 supports add/remove/reorder only',
  inspectorEmpty: 'Select a canvas field to inspect and edit its properties.',
  inspectorFieldId: 'Field ID',
  inspectorWidgetType: 'Widget type',
  inspectorGroup: 'Palette group',
  inspectorCategory: 'Category',
  inspectorSupportsRequired: 'Supports required',
  inspectorRequiredState: 'Required on this form',
  inspectorConfigurable: 'Configurable properties',
  inspectorBakedIn: 'Baked-in behaviour',
  inspectorBilingualPending: 'This field has unsaved changes in the Bilingual tab.',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeField: 'Remove field',
  cannotRemoveLastGuidance:
    'Add another field before removing this one — a form needs at least one field.',
  cannotRemoveLastStepFieldGuidance:
    'Add another field to this step before removing this one — each step needs at least one field.',
  required: 'Required',
  optional: 'Optional',
  yes: 'Yes',
  no: 'No',
  previewHeading: 'Live preview',
  previewNote:
    'Embedded Unit B FormRenderer in preview mode. Fill-test edits affect preview data only. Property Apply updates the definition shown here.',
  tabBindings: 'Bindings',
  tabBilingual: 'Bilingual',
  tabSteps: 'Steps',
  tabBindingsBody:
    'CAF Prefill bindings are authored below when available. Integration and Workflow bindings remain deferred.',
  tabBilingualBody:
    'Edit every governed EN/GU string side by side. Apply per field or step; unapplied drafts do not update the canvas or preview.',
  tabStepsBody:
    'Author progressive-step boundaries over the canvas field order. Edit step labels in the Bilingual tab.',
  ariaBuilderTabs: 'Builder tabs',
  ariaBuilderLocale: 'Builder locale',
  bilingualHeading: 'Bilingual workspace',
  bilingualGuidance:
    'Labels are required in both languages. Help and error text are optional pairs (both blank or both filled). Info-panel and eligibility-declaration help are required. Progressive-step labels are required.',
  bilingualCompleteness: 'Completeness: {complete} of {active} pairs ({percentage}%)',
  bilingualCompletenessMeter: 'Bilingual completeness',
  bilingualFieldsHeading: 'Field strings',
  bilingualStepsHeading: 'Progressive-step strings',
  bilingualColumnEn: 'English',
  bilingualColumnGu: 'Gujarati',
  bilingualFieldMeta: '{label} · {widgetType} · {fieldId}',
  bilingualErrorEn: 'Error text (English, optional)',
  bilingualErrorGu: 'Error text (Gujarati, optional)',
  bilingualStepLabelEn: 'Step label (English)',
  bilingualStepLabelGu: 'Step label (Gujarati)',
  bilingualDirty: 'Dirty',
  bilingualComplete: 'Complete',
  bilingualIncomplete: 'Incomplete',
  bilingualApply: 'Apply',
  bilingualCancel: 'Cancel',
  stepsHeading: 'Progressive steps',
  stepsGuidance:
    'Steps are ordered contiguous boundaries over the canvas field order. Split interior fields to create steps; move or merge boundaries between adjacent steps. Edit EN/GU step labels in the Bilingual tab.',
  stepsStatusProgressive: 'Progressive multi-step form',
  stepsStatusSinglePage: 'Single-page form (progressive steps not enabled)',
  stepsEnable: 'Enable progressive steps',
  stepsCountSummary: '{stepCount} {stepUnit} · {fieldCount} fields',
  stepsUnitOne: 'step',
  stepsUnitMany: 'steps',
  stepsStepHeading: 'Step {number}',
  stepsStepMeta: '{stepId} · EN: {labelEn} · GU: {labelGu}',
  stepsFieldMeta: '{label} · {fieldId} · {widgetType}',
  stepsSplitAfter: 'Start new step after this field',
  stepsSplitAfterAria: 'Start new step after {label} in step {stepNumber}',
  stepsBoundaryHeading: 'Boundary between step {previousNumber} and step {nextNumber}',
  stepsMoveEarlier: 'Move boundary earlier',
  stepsMoveLater: 'Move boundary later',
  stepsMerge: 'Merge steps',
  stepsMoveEarlierAria: 'Move boundary earlier between step {previousNumber} and step {nextNumber}',
  stepsMoveLaterAria: 'Move boundary later between step {previousNumber} and step {nextNumber}',
  stepsMergeAria: 'Merge step {previousNumber} with step {nextNumber}',
  stepsEditLabels: 'Edit labels in Bilingual',
  stepsEditLabelsAria: 'Edit labels for step {stepNumber} in the Bilingual tab',
  stepsBlockedSplitLast: 'Cannot split after the last field in a step.',
  stepsBlockedMoveEmpty: 'This move would leave a step empty.',
  stepsBlockedMergeUnsaved:
    'Apply or cancel unsaved step-label changes in the Bilingual tab before merging.',
  stepsAlertProgressiveNotEnabled: 'Enable progressive steps before changing boundaries.',
  stepsAlertStepNotFound: 'That step could not be found. No changes were made.',
  stepsAlertFieldNotInStep: 'That field is not in the selected step. No changes were made.',
  stepsAlertSplitAfterLast: 'Cannot start a new step after the last field in a step.',
  stepsAlertBoundaryNotFound: 'That step boundary could not be found. No changes were made.',
  stepsAlertMoveWouldEmpty: 'That boundary move would leave a step empty. No changes were made.',
  stepsAlertUnsavedBilingual:
    'Apply or cancel unsaved bilingual step-label changes before merging steps.',
  stepsAlertInconsistent:
    'Step boundaries are inconsistent with the canvas order. No changes were made.',
  stepsAlertGeneric: 'That steps action could not be completed. No changes were made.',
  actionValidate: 'Validate',
  actionSaveDraft: 'Save draft',
  actionSubmit: 'Submit draft',
  actionSubmitConfirm: 'Submit draft',
  actionSubmitCancel: 'Cancel',
  actionSubmitting: 'Submitting…',
  submitConfirmTitle: 'Submit draft?',
  submitConfirmBody: 'This transitions the stored draft to submitted.',
  submitConfirmNonEditableWarning: 'Submitted definitions become non-editable.',
  submitConfirmNotAuthWarning:
    'This technical submit does not prove DST delivery or authentication.',
  submitConfirmAdvisories: '{warnings} warning(s) and {infos} info message(s) remain.',
  submitSuccess: 'Draft submitted.',
  submitFailed: 'The draft could not be submitted. Try again.',
  submitStale: 'The stored draft changed. Your local draft was kept.',
  submitRetry: 'Retry submit',
  submitBlockedActor: 'Authenticated actor context required.',
  submitBlockedLocal: 'Save this local draft before submitting.',
  submitBlockedDirty: 'Save committed changes before submitting.',
  submitBlockedValidate: 'Validate the committed draft before submitting.',
  submitReadOnlyGuidance:
    'Submitted definitions are read-only. Open a draft to continue authoring.',
  actionsLifecycleNote: 'Technical submit uses Unit C. It is not authentication or DST delivery.',
  validateBlockedSubmitted: 'Submitted definitions cannot be validated.',
  validationScopeNote:
    'Validate checks the committed Form Definition only — not preview values or unsaved property drafts.',
  validationBlockedUnsaved: 'Apply or cancel unsaved changes before validating.',
  validationValidating: 'Validating…',
  validationSuccess: 'Definition is valid.',
  validationValidAdvisorySummary:
    'Definition is valid with {warnings} warning(s) and {infos} info message(s).',
  validationInvalidSummary:
    'Validation found {errors} error(s), {warnings} warning(s), and {infos} info message(s).',
  validationFailed: 'Validation could not be completed. Check the connection and try again.',
  validationRetry: 'Retry validation',
  validationSeverityError: 'Error',
  validationSeverityWarning: 'Warning',
  validationSeverityInfo: 'Info',
  persistLocalDraftBadge: 'Local draft',
  persistStoredDraftBadge: 'Stored draft',
  persistUnsavedChanges: 'Unsaved changes',
  persistSavedClean: 'Saved',
  persistCreating: 'Creating draft…',
  persistSaving: 'Saving draft…',
  persistCreated: 'Draft created.',
  persistSaved: 'Draft saved.',
  persistLoaded: 'Draft loaded.',
  persistDuplicate:
    'A draft with this service ID and version already exists. Load the existing draft to continue.',
  persistStale:
    'This draft was changed elsewhere. Reload the draft before saving again. Your local edits were kept.',
  persistNotFound: 'No draft was found for that service ID and version.',
  persistFailed: 'The draft request could not be completed. Try again.',
  persistInvalidCoordinates: 'Enter a valid service ID and version before loading a draft.',
  persistLoadDiscarded: 'Load discarded because local work changed.',
  persistSaveDiscarded:
    'Save result discarded because the draft identity changed. Load the intended draft explicitly.',
  persistValidationRejected:
    'The server rejected this definition. Validate and fix issues, then try again.',
  persistRetry: 'Retry',
  persistOpenDraftHeading: 'Open draft',
  persistServiceIdLabel: 'Service ID',
  persistVersionLabel: 'Version',
  persistLoad: 'Load',
  persistLoading: 'Loading…',
  persistDiscardConfirmTitle: 'Discard local changes?',
  persistDiscardConfirmBody:
    'Loading replaces the current authoring session. Unsaved definition changes and editor drafts will be discarded.',
  persistDiscardConfirmAction: 'Discard local changes and load',
  persistDiscardCancel: 'Cancel',
  persistSaveBlockedUnsaved: 'Apply or cancel unsaved editor changes before saving.',
  persistSaveBlockedValidate: 'Validate the committed definition before saving.',
  localeEn: 'EN',
  localeGu: 'GU',
  serviceLabel: 'Service',
  versionLabel: 'Version',
  statusDraft: 'draft',
  statusSubmitted: 'submitted',
  statusApproved: 'approved',
  statusPublished: 'published',
  statusRetired: 'retired',
  versionHistoryOpen: 'Version history',
  versionHistoryHeading: 'Version history',
  versionHistoryClose: 'Close',
  versionHistoryLoad: 'Load versions',
  versionHistoryLoading: 'Loading versions…',
  versionHistoryLoadMore: 'Load more',
  versionHistoryEmpty: 'No versions found for this service.',
  versionHistoryFailed: 'Version history could not be loaded.',
  versionHistoryRetry: 'Retry',
  versionHistoryOpenDraft: 'Open Draft',
  versionHistoryCreateDraft: 'Create New Draft',
  versionHistoryNotCloneable: 'This version cannot be used to create a draft.',
  cloneConfirmTitle: 'Create a new draft?',
  cloneConfirmBody: 'Create a new draft from this immutable version.',
  cloneConfirmNewVersion: 'The next available version will be allocated.',
  cloneConfirmSourceUnchanged: 'The source version will remain unchanged.',
  cloneConfirmNotAuth: 'This technical action is not authentication or authorization.',
  cloneConfirmConfirm: 'Create draft',
  cloneConfirmCancel: 'Cancel',
  cloneSuccess: 'New draft created.',
  cloneFailed: 'The new draft could not be created.',
  cloneStale: 'The source version changed. Reload versions and try again.',
  cloneSourceNotCloneable: 'Only published or retired versions can create a new draft.',
  cloneBlockedActor: 'Configure a valid technical actor to create a draft.',
  versionsNote:
    'Technical requests may include service ID, version, and createdBy. This is not authentication.',
  persistStoredSubmittedBadge: 'Stored submitted definition',
  categoryData: 'Data',
  categoryDisplay: 'Display',
  categoryLayout: 'Layout',
  palettePending: 'Authoring configuration pending',
  paletteAddAria: 'Add {label}',
  paletteCreateBoundaryAria: 'Create boundary ({label})',
  announceFieldAdded: 'Added {label}',
  announceFieldRemoved: 'Removed {label}',
  announceFieldMovedUp: 'Moved {label} up',
  announceFieldMovedDown: 'Moved {label} down',
  announceFieldReordered: 'Reordered {label}',
  announceCanvasReorderLifted: 'Lifted {label}. Choose a position.',
  announceCanvasReorderProposed: 'Proposed position before {beforeLabel}.',
  announceCanvasReorderProposedEnd: 'Proposed position at end of step.',
  announceCanvasReorderProposedFirst: 'First valid position: before {label}.',
  announceCanvasReorderProposedLast: 'Last valid position: before {label}.',
  announceCanvasReorderDropped: 'Dropped {label}.',
  announceCanvasReorderCancelled: 'Reorder cancelled for {label}.',
  announceCanvasReorderCrossStepBlocked: 'Cannot move field across progressive-step boundary.',
  announceCannotRemoveLast: 'Cannot remove {label} — a form needs at least one field.',
  announceCannotEmptyStep: 'Cannot remove {label} — each step needs at least one field.',
  announceAuthoringError: 'That action could not be completed. No changes were made.',
  announceChangesApplied: 'Changes applied for {label}',
  announceChangesCancelled: 'Changes cancelled for {label}',
  announceConfigurationInvalid: 'Fix the highlighted property errors before applying.',
  announceEditorDraftStale:
    'Committed properties changed. Cancel to reload them, then re-apply your edits.',
  announceProgressiveEnabled: 'Progressive steps enabled with one step covering all fields.',
  announceStepSplit: 'Started a new step after the selected field.',
  announceBoundaryMovedEarlier: 'Moved step boundary earlier.',
  announceBoundaryMovedLater: 'Moved step boundary later.',
  announceStepsMerged: 'Merged adjacent steps.',
  announceStepHasUnsavedBilingual:
    'Apply or cancel bilingual step-label changes before merging steps.',
  announcePageBreakCreated: 'Created a step boundary after the selected field.',
  announcePageBreakNoBoundary:
    'Add at least two fields in a step before creating a page-break boundary.',
  announcePageBreakBlocked:
    'Finish or cancel the pending page-break boundary before making other structural changes.',
  editorApply: 'Apply changes',
  editorCancel: 'Cancel changes',
  editorCommonHeading: 'Common properties',
  editorConstraintsHeading: 'Widget constraints',
  editorUnsavedChanges: 'Unsaved changes',
  editorClean: 'No unsaved changes',
  editorRequired: 'Required',
  editorLabelEn: 'Label (English)',
  editorLabelGu: 'Label (Gujarati)',
  editorHelpEn: 'Help text (English, optional)',
  editorHelpGu: 'Help text (Gujarati, optional)',
  editorHelpEnRequired: 'Help text (English)',
  editorHelpGuRequired: 'Help text (Gujarati)',
  editorMaxLength: 'Maximum length',
  editorPattern: 'Pattern (regular expression)',
  editorMinimum: 'Minimum',
  editorMaximum: 'Maximum',
  editorStep: 'Step',
  editorCurrencyPrecisionHint: 'Currency precision is fixed at two decimal places (₹).',
  editorBakedConstraintsHint:
    'Baked widget constraints (range or enum) are preserved and are not editable in this increment.',
  editorMobileOtpSmsOnlyHint:
    'Mobile OTP verification uses SMS only in v1. The OTP channel is not editable here.',
  editorValidationSummary: 'Fix the following before applying:',
  editorPreviewValueWarning:
    'The current preview value may be invalid under these constraints. It was not cleared — use the live preview to correct it.',
  editorUnavailable: 'Property editor not available in this increment',
  editorLegacyPageBreakGuidance:
    'This legacy page-break field is read-only. Use the Page break palette action to create progressive-step boundaries. Do not convert this field automatically.',
  editorStaleGuidance:
    'Committed field properties changed since you started editing. Cancel changes to reload the current values, then re-apply your edits. Your draft was not applied.',
  editorErrorLabelEnRequired: 'English label is required and must not be blank.',
  editorErrorLabelGuRequired: 'Gujarati label is required and must not be blank.',
  editorErrorLabelEnPadded: 'English label must not have leading or trailing spaces.',
  editorErrorLabelGuPadded: 'Gujarati label must not have leading or trailing spaces.',
  editorErrorHelpPairIncomplete:
    'Help text must be provided in both English and Gujarati, or left blank in both.',
  editorErrorHelpEnPadded: 'English help must not have leading or trailing spaces.',
  editorErrorHelpGuPadded: 'Gujarati help must not have leading or trailing spaces.',
  editorErrorHelpRequired: 'Help text is required in both English and Gujarati for this widget.',
  editorErrorErrorPairIncomplete:
    'Error text must be provided in both English and Gujarati, or left blank in both.',
  editorErrorErrorEnPadded: 'English error text must not have leading or trailing spaces.',
  editorErrorErrorGuPadded: 'Gujarati error text must not have leading or trailing spaces.',
  editorErrorMaxLengthInvalid: 'Maximum length must be a positive whole number.',
  editorErrorPatternInvalid: 'Pattern must be a valid regular expression, or left blank.',
  editorErrorMinimumInvalid: 'Minimum must be a finite number, or left blank.',
  editorErrorMaximumInvalid: 'Maximum must be a finite number, or left blank.',
  editorErrorStepInvalid: 'Step must be a finite number greater than zero, or left blank.',
  editorErrorRangeInvalid: 'Minimum must be less than or equal to maximum.',
  editorErrorCurrencyMinimumNegative: 'Currency minimum cannot be below zero.',
  editorVerifyEmail: 'Require email verification',
  editorMinAge: 'Minimum age',
  editorMaxAge: 'Maximum age',
  editorErrorMinAgeInvalid:
    'Minimum age must be a whole number of 0 or greater with no leading zeros, or left blank.',
  editorErrorMaxAgeInvalid:
    'Maximum age must be a whole number of 0 or greater with no leading zeros, or left blank.',
  editorErrorAgeRangeInvalid: 'Minimum age must be less than or equal to maximum age.',
  editorMasterListId: 'Master list ID',
  editorErrorMasterListIdInvalid:
    'Master list ID is required and must be a nonblank value with no leading or trailing spaces.',
  editorMinItems: 'Minimum items',
  editorMaxItems: 'Maximum items',
  editorErrorMinItemsInvalid:
    'Minimum items must be a nonnegative whole number with no padding or signs.',
  editorErrorMaxItemsInvalid:
    'Maximum items must be a nonnegative whole number with no padding or signs.',
  editorErrorItemsRangeInvalid: 'Maximum items must be greater than or equal to minimum items.',
  editorErrorRequiredMinItemsInvalid:
    'When the field is required, minimum items must be present and at least 1.',
  editorParentMasterListId: 'Parent master list ID',
  editorChildMasterListId: 'Child master list ID',
  editorErrorParentMasterListIdInvalid:
    'Parent master list ID is required and must be a nonblank value with no leading or trailing spaces.',
  editorErrorChildMasterListIdInvalid:
    'Child master list ID is required and must be a nonblank value with no leading or trailing spaces.',
  editorDefaultStateCode: 'Default state code (optional)',
  editorDefaultStateCodeHint:
    'Optional geography state code only. Leave blank to omit. The Builder does not look up states.',
  editorErrorDefaultStateCodeInvalid:
    'Default state code must be a nonblank value with no leading or trailing spaces, or left blank.',
  editorPhotoCapturePolicyHint:
    'Photo capture stores a CLEAN object-store reference only (JPEG/PNG, max 5 MiB, 300–4096 px). Policy is provisional pending product/security confirmation. MIME, size, dimensions and scan status are not editable here.',
  editorAllowedMimeTypes: 'Allowed MIME types',
  editorAllowedMimeTypesHint:
    'One MIME type per line. Exact values are preserved; do not pad or duplicate.',
  editorErrorAllowedMimeTypesInvalid:
    'Enter at least one nonblank, unpadded MIME type per line with no duplicates.',
  editorMaxFileSizeBytes: 'Maximum file size (bytes)',
  editorMaxFileSizeBytesHint:
    'Positive whole number up to 26214400 (25 MiB). No padding, signs, decimals, or separators.',
  editorErrorMaxFileSizeBytesInvalid:
    'Maximum file size must be a positive whole number not exceeding 26214400 (25 MiB).',
  editorDigiLockerDocumentTypeCode: 'DigiLocker document type code',
  editorDigiLockerDocumentTypeCodeHint:
    'Exact nonblank code. Not looked up against a provider list in Builder.',
  editorErrorDigiLockerDocumentTypeCodeInvalid:
    'Document type code must be a nonblank, unpadded value with no leading or trailing spaces.',
  editorFeeRuleId: 'Fee rule ID',
  editorErrorFeeRuleIdInvalid:
    'Fee rule ID is required and must be a nonblank value with no leading or trailing spaces.',
  editorFeeFieldPolicyHint:
    'INR only · amount stored in paise · computation requires host feeContextRevision and FeeComputationAdapter. Builder preview does not claim live fee computation.',
  editorDeclarationId: 'Declaration ID',
  editorErrorDeclarationIdInvalid:
    'Declaration ID is required and must be a nonblank value with no leading or trailing spaces.',
  editorErrorDeclarationTextEnInvalid:
    'English declaration text is required and must be a nonblank value with no leading or trailing spaces.',
  editorErrorDeclarationTextGuInvalid:
    'Gujarati declaration text is required and must be a nonblank value with no leading or trailing spaces.',
  editorEligibilityDeclarationPolicyHint:
    'Stores a consent receipt reference only after host ConsentLoggingAdapter records the decision. Changing declaration text requires a new declarationId. Builder preview does not fabricate receipts.',
  editorSignatureEsignPolicyHint:
    'Stores a signed artefact reference only. Host owns signer authentication, payload construction and verification. Authoritative eSign contract remains provisional/external.',
  editorCafPrefillPolicyHint:
    'Schema stores fixed value and source only. CAF attribute and confidence minimum are authored as a prefill binding — created on Add field, and edited later in the Bindings tab.',
  editorErrorCafAttributeInvalid:
    'CAF attribute is required and must be a nonblank value with no leading or trailing spaces.',
  editorErrorConfidenceMinInvalid:
    'Confidence minimum must be a finite number from 0 to 1 inclusive (for example 0.8).',
  configuredAddTitle: 'Configure {label}',
  configuredAddGuidance:
    'Enter the master-data list ID before adding this field. The Builder does not look up or invent list IDs.',
  configuredAddMasterListId: 'Master list ID',
  configuredAddMinItems: 'Minimum items (optional)',
  configuredAddMaxItems: 'Maximum items (optional)',
  configuredAddParentMasterListId: 'Parent master list ID',
  configuredAddChildMasterListId: 'Child master list ID',
  configuredAddAllowedMimeTypes: 'Allowed MIME types',
  configuredAddMaxFileSizeBytes: 'Maximum file size (bytes)',
  configuredAddDigiLockerDocumentTypeCode: 'DigiLocker document type code',
  configuredAddFeeRuleId: 'Fee rule ID',
  configuredAddDeclarationId: 'Declaration ID',
  configuredAddDeclarationTextEn: 'Declaration text (English)',
  configuredAddDeclarationTextGu: 'Declaration text (Gujarati)',
  configuredAddCafAttribute: 'CAF attribute',
  configuredAddConfidenceMin: 'Confidence minimum (0–1)',
  configuredAddInitialMemberWidgetType: 'Initial member widget',
  configuredAddInitialMemberLabelEn: 'Initial member label (English)',
  configuredAddInitialMemberLabelGu: 'Initial member label (Gujarati)',
  configuredAddInitialMemberRequired: 'Initial member required',
  configuredAddConfirm: 'Add field',
  configuredAddCancel: 'Cancel',
  familyRepeaterMembersHeading: 'Member fields',
  familyRepeaterAddMember: 'Add member field',
  familyRepeaterRemoveMember: 'Remove member',
  familyRepeaterMoveEarlier: 'Move earlier',
  familyRepeaterMoveLater: 'Move later',
  familyRepeaterMemberWidgetType: 'Member widget type',
  familyRepeaterMembersReadOnly:
    'Member structure is read-only because this family repeater includes unsupported child widgets.',
  familyRepeaterMemberRequired: 'Required',
  announceConfiguredAddBlocked:
    'Finish or cancel the pending field configuration before making other structural changes.',
  persistBlockedConfiguredAdd: 'Finish or cancel the pending field configuration before saving.',
  validationBlockedConfiguredAdd:
    'Finish or cancel the pending field configuration before validating.',
  pageBreakDialogTitle: 'Create step boundary ({label})',
  pageBreakDialogGuidance:
    'Choose where the new step starts and enter bilingual labels for the next step. This does not add a form field.',
  pageBreakAfterField: 'Create boundary after field',
  pageBreakAfterFieldInvalid: 'Select an eligible field that is not the last field in its step.',
  pageBreakNextStepLabelEn: 'Next step label (English)',
  pageBreakNextStepLabelGu: 'Next step label (Gujarati)',
  pageBreakConfirm: 'Create boundary',
  pageBreakCancel: 'Cancel',
  pageBreakNoBoundaryGuidance:
    'Add at least two fields in a step before creating a page-break boundary.',
  bindingsHeading: 'Bindings',
  bindingsGuidance:
    'Author CAF Prefill, Integration Hub, and Workflow stage bindings. Each surface applies independently.',
  bindingsCafHeading: 'CAF Prefill',
  bindingsCafGuidance:
    'Author CAF attribute and confidence minimum here. Each binding uses the definition fieldId. Confirming a CAF field add creates the initial binding.',
  bindingsEmpty:
    'No CAF Prefill fields on this form yet. Add a CAF Prefill field from the palette to author bindings.',
  bindingsFieldMeta: '{label} · {fieldId}',
  bindingsStatusBound: 'Bound',
  bindingsStatusUnbound: 'Unbound',
  bindingsCafAttribute: 'CAF attribute',
  bindingsConfidenceMin: 'Confidence minimum (0–1)',
  bindingsApply: 'Apply',
  bindingsCancel: 'Cancel',
  bindingsRemove: 'Remove binding',
  bindingsDirty: 'Unsaved changes',
  bindingsClean: 'No unsaved changes',
  bindingsValidationSummary: 'Fix the following before applying:',
  bindingsStaleGuidance:
    'Committed CAF binding changed since you started editing. Cancel changes to reload the current values, then re-apply your edits. Your draft was not applied.',
  bindingsIntegrationHeading: 'Integration Hub',
  bindingsIntegrationGuidance:
    'Bind data-producing fields to Integration Hub adapters. Adapter and parameter identifiers are opaque and externally governed — this builder does not look them up.',
  bindingsIntegrationEmpty: 'No integration bindings yet. Add a row to author one.',
  bindingsIntegrationAdd: 'Add integration binding',
  bindingsIntegrationAdapterId: 'Adapter ID',
  bindingsIntegrationParam: 'Parameter',
  bindingsIntegrationDirection: 'Direction',
  bindingsIntegrationDirectionIn: 'In',
  bindingsIntegrationDirectionOut: 'Out',
  bindingsIntegrationRemoveRow: 'Remove row',
  bindingsIntegrationStaleGuidance:
    'Committed integration bindings changed since you started editing. Cancel to reload current values, then re-apply your edits. Your draft was not applied.',
  bindingsIntegrationValidationSummary: 'Fix the following integration bindings before applying:',
  bindingsWorkflowHeading: 'Workflow stages',
  bindingsWorkflowGuidance:
    'Bind data-producing fields to workflow stages. Stage identifiers are opaque and externally governed — this builder does not look them up.',
  bindingsWorkflowEmpty: 'No workflow bindings yet. Add a row to author one.',
  bindingsWorkflowAdd: 'Add workflow binding',
  bindingsWorkflowStage: 'Stage',
  bindingsWorkflowRemoveRow: 'Remove row',
  bindingsWorkflowStaleGuidance:
    'Committed workflow bindings changed since you started editing. Cancel to reload current values, then re-apply your edits. Your draft was not applied.',
  bindingsWorkflowValidationSummary: 'Fix the following workflow bindings before applying:',
  bindingsFieldSelect: 'Field',
  bindingsNestedFieldMeta: '{label} · nested in {parent} · {fieldId}',
  bindingsOpaqueIdsGuidance:
    'Adapter, parameter, and stage values are configuration identifiers only. Do not paste credentials, tokens, or runtime payloads here.',
  editorErrorIntegrationFieldInvalid: 'Select a governed data-producing field.',
  editorErrorIntegrationAdapterInvalid:
    'Enter an exact non-blank adapter ID with no leading or trailing spaces.',
  editorErrorIntegrationParamInvalid:
    'Enter an exact non-blank parameter with no leading or trailing spaces.',
  editorErrorIntegrationDirectionInvalid: 'Choose direction In or Out.',
  editorErrorIntegrationDuplicateTuple:
    'This field, adapter, parameter, and direction combination is already listed.',
  editorErrorWorkflowFieldInvalid: 'Select a governed data-producing field.',
  editorErrorWorkflowStageInvalid:
    'Enter an exact non-blank stage with no leading or trailing spaces.',
  editorErrorWorkflowDuplicatePair: 'This field and stage combination is already listed.',
}

const GU: Record<BuilderMessageKey, string> = {
  appTitle: 'DG 2.0 ફોર્મ બિલ્ડર',
  localPreviewBadge: 'સ્થાનિક તકનીકી પૂર્વાવલોકન',
  notSavedNote:
    'સ્થાનિક અને સંગ્રહિત ડ્રાફ્ટ સ્થિતિ ઉપર દર્શાવેલ છે. તકનીકી સબમિટ માટે સાચવેલ માન્ય ડ્રાફ્ટ અને હોસ્ટ અભિનેતા સંદર્ભ જરૂરી છે.',
  skipToMain: 'મુખ્ય બિલ્ડર સામગ્રી પર જાઓ',
  paletteHeading: 'નિયંત્રિત પેલેટ',
  paletteSearchLabel: 'પેલેટ શોધો',
  paletteSearchPlaceholder: 'લેબલ, વર્ણન અથવા વિજેટ પ્રકાર દ્વારા શોધો',
  paletteNoResults: 'તમારી શોધ સાથે કોઈ પેલેટ વિજેટ મેળ ખાતું નથી.',
  paletteResultCount: '{count} વિજેટ્સ દર્શાવેલ',
  canvasHeading: 'ફોર્મ કેનવાસ',
  canvasStepChip: 'પગલું: {label}',
  canvasFamilyMemberCount: '{count} સભ્ય ક્ષેત્રો',
  canvasErrorHeading: 'કેનવાસ બતાવી શકાતું નથી',
  canvasErrorBody:
    'આ ફોર્મ વ્યાખ્યા અસંગત સ્થિતિમાં છે અને સુરક્ષિત રીતે બતાવી શકાતી નથી. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  canvasReorderHandleAria: '{label} નો ક્રમ બદલો',
  canvasReorderInstructions:
    'ઉઠાવવા Space અથવા Enter દબાવો. સ્થાન પસંદ કરવા arrow keys, Home અથવા End વાપરો; મૂકવા Space અથવા Enter, અથવા રદ કરવા Escape દબાવો. Tab ક્રમ બદલવાનું રદ કરીને ફોકસ ખસેડે છે.',
  canvasReorderTargetBefore: '{label} પહેલાં ખસેડો',
  canvasReorderTargetEnd: 'પગલાના અંતે ખસેડો',
  canvasReorderProposedMarker: 'સૂચિત દાખલ સ્થાન',
  canvasReorderMobileGuidance:
    'નાની સ્ક્રીન પર Move up અને Move down વાપરો. પોઇન્ટર ડ્રેગ ફક્ત ડેસ્કટોપ માટે છે.',
  canvasReorderCrossStepBlocked: 'પગલાની સીમા પાર મૂકી શકાતું નથી',
  inspectorHeading: 'પસંદ કરેલ ક્ષેત્ર',
  inspectorReadOnly: 'ગુણધર્મ સંપાદન મુલતવી — D1 ફક્ત ઉમેરો/દૂર કરો/ક્રમ બદલો સપોર્ટ કરે છે',
  inspectorEmpty: 'ગુણધર્મો જોવા અને સંપાદિત કરવા માટે કેનવાસ ક્ષેત્ર પસંદ કરો.',
  inspectorFieldId: 'ક્ષેત્ર ID',
  inspectorWidgetType: 'વિજેટ પ્રકાર',
  inspectorGroup: 'પેલેટ જૂથ',
  inspectorCategory: 'શ્રેણી',
  inspectorSupportsRequired: 'આવશ્યક સપોર્ટ',
  inspectorRequiredState: 'આ ફોર્મ પર આવશ્યક',
  inspectorConfigurable: 'ગોઠવી શકાય તેવા ગુણધર્મો',
  inspectorBakedIn: 'સમાવિષ્ટ વર્તન',
  inspectorBilingualPending: 'આ ક્ષેત્રમાં દ્વિભાષી ટૅબમાં ન સાચવેલા ફેરફારો છે.',
  moveUp: 'ઉપર ખસેડો',
  moveDown: 'નીચે ખસેડો',
  removeField: 'ક્ષેત્ર દૂર કરો',
  cannotRemoveLastGuidance:
    'આ ક્ષેત્ર દૂર કરતાં પહેલાં બીજું ક્ષેત્ર ઉમેરો — ફોર્મમાં ઓછામાં ઓછું એક ક્ષેત્ર જરૂરી છે.',
  cannotRemoveLastStepFieldGuidance:
    'આ ક્ષેત્ર દૂર કરતાં પહેલાં આ પગલામાં બીજું ક્ષેત્ર ઉમેરો — દરેક પગલામાં ઓછામાં ઓછું એક ક્ષેત્ર જરૂરી છે.',
  required: 'આવશ્યક',
  optional: 'વૈકલ્પિક',
  yes: 'હા',
  no: 'ના',
  previewHeading: 'લાઇવ પૂર્વાવલોકન',
  previewNote:
    'એમ્બેડ કરેલ Unit B FormRenderer પૂર્વાવલોકન મોડમાં. ભરવાના ફેરફારો ફક્ત પૂર્વાવલોકન ડેટાને અસર કરે છે. ગુણધર્મ Apply વ્યાખ્યા અહીં અપડેટ કરે છે.',
  tabBindings: 'બાઇન્ડિંગ્સ',
  tabBilingual: 'દ્વિભાષી',
  tabSteps: 'પગલાં',
  tabBindingsBody:
    'CAF Prefill બાઇન્ડિંગ્સ ઉપલબ્ધ હોય ત્યારે નીચે લેખિત થાય છે. એકીકરણ અને વર્કફ્લો બાઇન્ડિંગ્સ હજુ મુલતવી છે.',
  tabBilingualBody:
    'દરેક નિયંત્રિત EN/GU સ્ટ્રિંગ બાજુ-બાજુ સંપાદિત કરો. ક્ષેત્ર અથવા પગલા દીઠ Apply કરો; ન લાગુ થયેલા ડ્રાફ્ટ કેનવાસ કે પૂર્વાવલોકનને અપડેટ કરતા નથી.',
  tabStepsBody:
    'કેનવાસ ક્ષેત્ર ક્રમ પર પ્રગતિશીલ પગલાની સીમાઓ લેખિત કરો. પગલાના લેબલ બાયલિંગ્યુઅલ ટેબમાં સંપાદિત કરો.',
  ariaBuilderTabs: 'બિલ્ડર ટૅબ્સ',
  ariaBuilderLocale: 'બિલ્ડર ભાષા',
  bilingualHeading: 'દ્વિભાષી કાર્યક્ષેત્ર',
  bilingualGuidance:
    'લેબલ બંને ભાષામાં જરૂરી છે. મદદ અને ભૂલ લખાણ વૈકલ્પિક જોડી છે (બંને ખાલી અથવા બંને ભરેલા). Info-panel અને પાત્રતા ઘોષણાની મદદ જરૂરી છે. પ્રગતિશીલ પગલાંના લેબલ જરૂરી છે.',
  bilingualCompleteness: 'પૂર્ણતા: {active}માંથી {complete} જોડી ({percentage}%)',
  bilingualCompletenessMeter: 'દ્વિભાષી પૂર્ણતા',
  bilingualFieldsHeading: 'ક્ષેત્ર સ્ટ્રિંગ્સ',
  bilingualStepsHeading: 'પ્રગતિશીલ પગલાં સ્ટ્રિંગ્સ',
  bilingualColumnEn: 'અંગ્રેજી',
  bilingualColumnGu: 'ગુજરાતી',
  bilingualFieldMeta: '{label} · {widgetType} · {fieldId}',
  bilingualErrorEn: 'ભૂલ લખાણ (અંગ્રેજી, વૈકલ્પિક)',
  bilingualErrorGu: 'ભૂલ લખાણ (ગુજરાતી, વૈકલ્પિક)',
  bilingualStepLabelEn: 'પગલાનું લેબલ (અંગ્રેજી)',
  bilingualStepLabelGu: 'પગલાનું લેબલ (ગુજરાતી)',
  bilingualDirty: 'અસાચવેલ',
  bilingualComplete: 'પૂર્ણ',
  bilingualIncomplete: 'અપૂર્ણ',
  bilingualApply: 'લાગુ કરો',
  bilingualCancel: 'રદ કરો',
  stepsHeading: 'પ્રગતિશીલ પગલાં',
  stepsGuidance:
    'પગલાં કેનવાસ ક્ષેત્ર ક્રમ પર ક્રમબદ્ધ સંલગ્ન સીમાઓ છે. પગલાં બનાવવા અંદરના ક્ષેત્રો પછી વિભાજિત કરો; પડોશી પગલાં વચ્ચે સીમા ખસેડો અથવા મર્જ કરો. EN/GU પગલા લેબલ બાયલિંગ્યુઅલ ટેબમાં સંપાદિત કરો.',
  stepsStatusProgressive: 'પ્રગતિશીલ બહુ-પગલાંનું ફોર્મ',
  stepsStatusSinglePage: 'એક-પૃષ્ઠ ફોર્મ (પ્રગતિશીલ પગલાં સક્ષમ નથી)',
  stepsEnable: 'પ્રગતિશીલ પગલાં સક્ષમ કરો',
  stepsCountSummary: '{stepCount} {stepUnit} · {fieldCount} ક્ષેત્રો',
  stepsUnitOne: 'પગલું',
  stepsUnitMany: 'પગલાં',
  stepsStepHeading: 'પગલું {number}',
  stepsStepMeta: '{stepId} · EN: {labelEn} · GU: {labelGu}',
  stepsFieldMeta: '{label} · {fieldId} · {widgetType}',
  stepsSplitAfter: 'આ ક્ષેત્ર પછી નવું પગલું શરૂ કરો',
  stepsSplitAfterAria: 'પગલું {stepNumber}માં {label} પછી નવું પગલું શરૂ કરો',
  stepsBoundaryHeading: 'પગલું {previousNumber} અને પગલું {nextNumber} વચ્ચેની સીમા',
  stepsMoveEarlier: 'સીમા પહેલાં ખસેડો',
  stepsMoveLater: 'સીમા પછી ખસેડો',
  stepsMerge: 'પગલાં મર્જ કરો',
  stepsMoveEarlierAria: 'પગલું {previousNumber} અને {nextNumber} વચ્ચેની સીમા પહેલાં ખસેડો',
  stepsMoveLaterAria: 'પગલું {previousNumber} અને {nextNumber} વચ્ચેની સીમા પછી ખસેડો',
  stepsMergeAria: 'પગલું {previousNumber} ને પગલું {nextNumber} સાથે મર્જ કરો',
  stepsEditLabels: 'બાયલિંગ્યુઅલમાં લેબલ સંપાદિત કરો',
  stepsEditLabelsAria: 'બાયલિંગ્યુઅલ ટેબમાં પગલું {stepNumber} ના લેબલ સંપાદિત કરો',
  stepsBlockedSplitLast: 'પગલાના છેલ્લા ક્ષેત્ર પછી વિભાજિત કરી શકાતું નથી.',
  stepsBlockedMoveEmpty: 'આ ખસેડવાથી પગલું ખાલી થઈ જશે.',
  stepsBlockedMergeUnsaved:
    'મર્જ કરતા પહેલાં બાયલિંગ્યુઅલ ટેબમાં અસાચવેલા પગલા-લેબલ ફેરફારો લાગુ કરો અથવા રદ કરો.',
  stepsAlertProgressiveNotEnabled: 'સીમાઓ બદલતા પહેલાં પ્રગતિશીલ પગલાં સક્ષમ કરો.',
  stepsAlertStepNotFound: 'તે પગલું મળ્યું નથી. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  stepsAlertFieldNotInStep: 'તે ક્ષેત્ર પસંદ કરેલા પગલામાં નથી. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  stepsAlertSplitAfterLast: 'પગલાના છેલ્લા ક્ષેત્ર પછી નવું પગલું શરૂ કરી શકાતું નથી.',
  stepsAlertBoundaryNotFound: 'તે પગલાની સીમા મળી નથી. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  stepsAlertMoveWouldEmpty: 'તે સીમા ખસેડવાથી પગલું ખાલી થઈ જશે. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  stepsAlertUnsavedBilingual:
    'પગલાં મર્જ કરતા પહેલાં અસાચવેલા દ્વિભાષી પગલા-લેબલ ફેરફારો લાગુ કરો અથવા રદ કરો.',
  stepsAlertInconsistent: 'પગલાની સીમાઓ કેનવાસ ક્રમ સાથે અસંગત છે. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  stepsAlertGeneric: 'તે પગલાંની ક્રિયા પૂર્ણ કરી શકાઈ નથી. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  actionValidate: 'માન્ય કરો',
  actionSaveDraft: 'ડ્રાફ્ટ સાચવો',
  actionSubmit: 'ડ્રાફ્ટ સબમિટ કરો',
  actionSubmitConfirm: 'ડ્રાફ્ટ સબમિટ કરો',
  actionSubmitCancel: 'રદ કરો',
  actionSubmitting: 'સબમિટ થઈ રહ્યું છે…',
  submitConfirmTitle: 'ડ્રાફ્ટ સબમિટ કરીએ?',
  submitConfirmBody: 'આ સંગ્રહિત ડ્રાફ્ટને submitted સ્થિતિમાં ફેરવે છે.',
  submitConfirmNonEditableWarning: 'Submitted વ્યાખ્યાઓ સંપાદનયોગ્ય રહેશે નહીં.',
  submitConfirmNotAuthWarning: 'આ તકનીકી સબમિટ DST વિતરણ અથવા પ્રમાણીકરણ સાબિત કરતું નથી.',
  submitConfirmAdvisories: '{warnings} ચેતવણી(ઓ) અને {infos} માહિતી સંદેશા બાકી છે.',
  submitSuccess: 'ડ્રાફ્ટ સબમિટ થયો.',
  submitFailed: 'ડ્રાફ્ટ સબમિટ થઈ શક્યો નથી. ફરી પ્રયાસ કરો.',
  submitStale: 'સંગ્રહિત ડ્રાફ્ટ બદલાયો છે. તમારો સ્થાનિક ડ્રાફ્ટ રાખવામાં આવ્યો છે.',
  submitRetry: 'સબમિટ ફરી પ્રયાસ કરો',
  submitBlockedActor: 'પ્રમાણિત actor context જરૂરી છે.',
  submitBlockedLocal: 'સબમિટ કરતા પહેલાં આ સ્થાનિક ડ્રાફ્ટ સાચવો.',
  submitBlockedDirty: 'સબમિટ કરતા પહેલાં સમર્પિત ફેરફારો સાચવો.',
  submitBlockedValidate: 'સબમિટ કરતા પહેલાં સમર્પિત ડ્રાફ્ટ માન્ય કરો.',
  submitReadOnlyGuidance: 'Submitted વ્યાખ્યાઓ ફક્ત વાંચવા માટે છે. લેખન ચાલુ રાખવા ડ્રાફ્ટ ખોલો.',
  actionsLifecycleNote: 'તકનીકી સબમિટ Unit C વાપરે છે. તે પ્રમાણીકરણ અથવા DST વિતરણ નથી.',
  validateBlockedSubmitted: 'Submitted વ્યાખ્યાઓ માન્ય કરી શકાતી નથી.',
  validationScopeNote:
    'માન્યકરણ ફક્ત સમર્પિત ફોર્મ વ્યાખ્યા તપાસે છે — પૂર્વાવલોકન મૂલ્યો અથવા ન સાચવેલા ગુણધર્મ ડ્રાફ્ટ નહીં.',
  validationBlockedUnsaved: 'માન્ય કરતા પહેલાં ન સાચવેલા ફેરફારો લાગુ કરો અથવા રદ કરો.',
  validationValidating: 'માન્ય કરી રહ્યા છીએ…',
  validationSuccess: 'વ્યાખ્યા માન્ય છે.',
  validationValidAdvisorySummary:
    'વ્યાખ્યા માન્ય છે — {warnings} ચેતવણી(ઓ) અને {infos} માહિતી સંદેશા સાથે.',
  validationInvalidSummary:
    'માન્યકરણમાં {errors} ભૂલ(ઓ), {warnings} ચેતવણી(ઓ) અને {infos} માહિતી સંદેશા મળ્યા.',
  validationFailed: 'માન્યકરણ પૂર્ણ થઈ શક્યું નથી. કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.',
  validationRetry: 'માન્યકરણ ફરી પ્રયાસ કરો',
  validationSeverityError: 'ભૂલ',
  validationSeverityWarning: 'ચેતવણી',
  validationSeverityInfo: 'માહિતી',
  persistLocalDraftBadge: 'સ્થાનિક ડ્રાફ્ટ',
  persistStoredDraftBadge: 'સંગ્રહિત ડ્રાફ્ટ',
  persistUnsavedChanges: 'ન સાચવેલા ફેરફારો',
  persistSavedClean: 'સાચવેલું',
  persistCreating: 'ડ્રાફ્ટ બનાવી રહ્યા છીએ…',
  persistSaving: 'ડ્રાફ્ટ સાચવી રહ્યા છીએ…',
  persistCreated: 'ડ્રાફ્ટ બનાવાયું.',
  persistSaved: 'ડ્રાફ્ટ સાચવાયું.',
  persistLoaded: 'ડ્રાફ્ટ લોડ થયો.',
  persistDuplicate:
    'આ સર્વિસ ID અને વર્ઝન સાથેનો ડ્રાફ્ટ પહેલેથી અસ્તિત્વમાં છે. ચાલુ રાખવા માટે મોજૂદ ડ્રાફ્ટ લોડ કરો.',
  persistStale:
    'આ ડ્રાફ્ટ બીજી જગ્યાએ બદલાયો છે. ફરી સાચવતા પહેલાં ડ્રાફ્ટ ફરીથી લોડ કરો. તમારા સ્થાનિક ફેરફારો રાખવામાં આવ્યા છે.',
  persistNotFound: 'તે સર્વિસ ID અને વર્ઝન માટે કોઈ ડ્રાફ્ટ મળ્યો નથી.',
  persistFailed: 'ડ્રાફ્ટ વિનંતી પૂર્ણ થઈ શકી નથી. ફરી પ્રયાસ કરો.',
  persistInvalidCoordinates: 'ડ્રાફ્ટ લોડ કરતા પહેલાં માન્ય સર્વિસ ID અને વર્ઝન દાખલ કરો.',
  persistLoadDiscarded: 'સ્થાનિક કાર્ય બદલાતા લોડ કાઢી નાખવામાં આવ્યો.',
  persistSaveDiscarded:
    'ડ્રાફ્ટ ઓળખ બદલાતા સાચવવાનું પરિણામ કાઢી નાખવામાં આવ્યું. ઇચ્છિત ડ્રાફ્ટ સ્પષ્ટપણે લોડ કરો.',
  persistValidationRejected:
    'સર્વરે આ વ્યાખ્યા નકારી. માન્ય કરો, સમસ્યાઓ સુધારો, પછી ફરી પ્રયાસ કરો.',
  persistRetry: 'ફરી પ્રયાસ કરો',
  persistOpenDraftHeading: 'ડ્રાફ્ટ ખોલો',
  persistServiceIdLabel: 'સર્વિસ ID',
  persistVersionLabel: 'વર્ઝન',
  persistLoad: 'લોડ કરો',
  persistLoading: 'લોડ થઈ રહ્યું છે…',
  persistDiscardConfirmTitle: 'સ્થાનિક ફેરફારો કાઢી નાખીએ?',
  persistDiscardConfirmBody:
    'લોડ કરવાથી વર્તમાન લેખન સત્ર બદલાઈ જશે. ન સાચવેલા વ્યાખ્યા ફેરફારો અને એડિટર ડ્રાફ્ટ કાઢી નાખવામાં આવશે.',
  persistDiscardConfirmAction: 'સ્થાનિક ફેરફારો કાઢી નાખો અને લોડ કરો',
  persistDiscardCancel: 'રદ કરો',
  persistSaveBlockedUnsaved: 'સાચવતા પહેલાં ન સાચવેલા એડિટર ફેરફારો લાગુ કરો અથવા રદ કરો.',
  persistSaveBlockedValidate: 'સાચવતા પહેલાં સમર્પિત વ્યાખ્યા માન્ય કરો.',
  localeEn: 'EN',
  localeGu: 'GU',
  serviceLabel: 'સેવા',
  versionLabel: 'આવૃત્તિ',
  statusDraft: 'ડ્રાફ્ટ',
  statusSubmitted: 'સબમિટ થયેલ',
  statusApproved: 'મંજૂર થયેલ',
  statusPublished: 'પ્રકાશિત',
  statusRetired: 'નિવૃત્ત',
  versionHistoryOpen: 'વર્ઝન ઇતિહાસ',
  versionHistoryHeading: 'વર્ઝન ઇતિહાસ',
  versionHistoryClose: 'બંધ કરો',
  versionHistoryLoad: 'વર્ઝન લોડ કરો',
  versionHistoryLoading: 'વર્ઝન લોડ થઈ રહ્યાં છે…',
  versionHistoryLoadMore: 'વધુ લોડ કરો',
  versionHistoryEmpty: 'આ સેવા માટે કોઈ વર્ઝન મળ્યું નથી.',
  versionHistoryFailed: 'વર્ઝન ઇતિહાસ લોડ થઈ શક્યો નથી.',
  versionHistoryRetry: 'ફરી પ્રયાસ કરો',
  versionHistoryOpenDraft: 'ડ્રાફ્ટ ખોલો',
  versionHistoryCreateDraft: 'નવો ડ્રાફ્ટ બનાવો',
  versionHistoryNotCloneable: 'આ વર્ઝનથી ડ્રાફ્ટ બનાવી શકાતો નથી.',
  cloneConfirmTitle: 'નવો ડ્રાફ્ટ બનાવવો છે?',
  cloneConfirmBody: 'આ અપરિવર્તનીય વર્ઝનમાંથી નવો ડ્રાફ્ટ બનાવો.',
  cloneConfirmNewVersion: 'આગલું ઉપલબ્ધ વર્ઝન ફાળવવામાં આવશે.',
  cloneConfirmSourceUnchanged: 'સ્ત્રોત વર્ઝન યથાવત રહેશે.',
  cloneConfirmNotAuth: 'આ તકનીકી ક્રિયા પ્રમાણીકરણ અથવા અધિકૃતતા નથી.',
  cloneConfirmConfirm: 'ડ્રાફ્ટ બનાવો',
  cloneConfirmCancel: 'રદ કરો',
  cloneSuccess: 'નવો ડ્રાફ્ટ બનાવાયો.',
  cloneFailed: 'નવો ડ્રાફ્ટ બનાવી શકાયો નથી.',
  cloneStale: 'સ્ત્રોત વર્ઝન બદલાયું છે. વર્ઝન ફરી લોડ કરો અને પ્રયાસ કરો.',
  cloneSourceNotCloneable: 'ફક્ત પ્રકાશિત અથવા નિવૃત્ત વર્ઝનથી નવો ડ્રાફ્ટ બનાવી શકાય છે.',
  cloneBlockedActor: 'ડ્રાફ્ટ બનાવવા માટે માન્ય તકનીકી actor રૂપરેખાંકિત કરો.',
  versionsNote: 'તકનીકી વિનંતીઓમાં સેવા ID, વર્ઝન અને createdBy હોઈ શકે છે. આ પ્રમાણીકરણ નથી.',
  persistStoredSubmittedBadge: 'સંગ્રહિત submitted વ્યાખ્યા',
  categoryData: 'ડેટા',
  categoryDisplay: 'પ્રદર્શન',
  categoryLayout: 'લેઆઉટ',
  palettePending: 'લેખન રૂપરેખાંકન બાકી છે',
  paletteAddAria: '{label} ઉમેરો',
  paletteCreateBoundaryAria: 'સીમા બનાવો ({label})',
  announceFieldAdded: '{label} ઉમેરાયું',
  announceFieldRemoved: '{label} દૂર કરાયું',
  announceFieldMovedUp: '{label} ઉપર ખસેડાયું',
  announceFieldMovedDown: '{label} નીચે ખસેડાયું',
  announceFieldReordered: '{label} નો ક્રમ બદલાયો',
  announceCanvasReorderLifted: '{label} ઉઠાવાયું. સ્થાન પસંદ કરો.',
  announceCanvasReorderProposed: '{beforeLabel} પહેલાં સૂચિત સ્થાન.',
  announceCanvasReorderProposedEnd: 'પગલાના અંતે સૂચિત સ્થાન.',
  announceCanvasReorderProposedFirst: 'પહેલું માન્ય સ્થાન: {label} પહેલાં.',
  announceCanvasReorderProposedLast: 'છેલ્લું માન્ય સ્થાન: {label} પહેલાં.',
  announceCanvasReorderDropped: '{label} મૂકાયું.',
  announceCanvasReorderCancelled: '{label} માટે ક્રમ બદલવું રદ થયું.',
  announceCanvasReorderCrossStepBlocked: 'ક્ષેત્રને પ્રગતિશીલ પગલાની સીમા પાર ખસેડી શકાતું નથી.',
  announceCannotRemoveLast:
    '{label} દૂર કરી શકાતું નથી — ફોર્મમાં ઓછામાં ઓછું એક ક્ષેત્ર જરૂરી છે.',
  announceCannotEmptyStep:
    '{label} દૂર કરી શકાતું નથી — દરેક પગલામાં ઓછામાં ઓછું એક ક્ષેત્ર જરૂરી છે.',
  announceAuthoringError: 'તે ક્રિયા પૂર્ણ કરી શકાઈ નથી. કોઈ ફેરફાર કરવામાં આવ્યો નથી.',
  announceChangesApplied: '{label} માટે ફેરફારો લાગુ થયા',
  announceChangesCancelled: '{label} માટે ફેરફારો રદ થયા',
  announceConfigurationInvalid: 'લાગુ કરતા પહેલાં હાઇલાઇટ કરેલી ભૂલો સુધારો.',
  announceEditorDraftStale:
    'સમર્પિત ગુણધર્મો બદલાયા. તેમને ફરી લોડ કરવા રદ કરો, પછી તમારા ફેરફારો ફરી લાગુ કરો.',
  announceProgressiveEnabled: 'પ્રગતિશીલ પગલાં સક્ષમ થયાં — એક પગલું બધા ક્ષેત્રોને આવરે છે.',
  announceStepSplit: 'પસંદ કરેલા ક્ષેત્ર પછી નવું પગલું શરૂ થયું.',
  announceBoundaryMovedEarlier: 'પગલાની સીમા પહેલાં ખસેડાઈ.',
  announceBoundaryMovedLater: 'પગલાની સીમા પછી ખસેડાઈ.',
  announceStepsMerged: 'પડોશી પગલાં મર્જ થયાં.',
  announceStepHasUnsavedBilingual:
    'પગલાં મર્જ કરતા પહેલાં દ્વિભાષી પગલા-લેબલ ફેરફારો લાગુ કરો અથવા રદ કરો.',
  announcePageBreakCreated: 'પસંદ કરેલા ક્ષેત્ર પછી પગલાની સીમા બનાવાઈ.',
  announcePageBreakNoBoundary:
    'પેજ-બ્રેક સીમા બનાવતા પહેલાં એક પગલામાં ઓછામાં ઓછાં બે ક્ષેત્રો ઉમેરો.',
  announcePageBreakBlocked:
    'અન્ય માળખાકીય ફેરફારો કરતા પહેલાં બાકીની પેજ-બ્રેક સીમા પૂર્ણ કરો અથવા રદ કરો.',
  editorApply: 'ફેરફારો લાગુ કરો',
  editorCancel: 'ફેરફારો રદ કરો',
  editorCommonHeading: 'સામાન્ય ગુણધર્મો',
  editorConstraintsHeading: 'વિજેટ મર્યાદાઓ',
  editorUnsavedChanges: 'ન સાચવેલા ફેરફારો',
  editorClean: 'ન સાચવેલા ફેરફારો નથી',
  editorRequired: 'આવશ્યક',
  editorLabelEn: 'લેબલ (અંગ્રેજી)',
  editorLabelGu: 'લેબલ (ગુજરાતી)',
  editorHelpEn: 'મદદ લખાણ (અંગ્રેજી, વૈકલ્પિક)',
  editorHelpGu: 'મદદ લખાણ (ગુજરાતી, વૈકલ્પિક)',
  editorHelpEnRequired: 'મદદ લખાણ (અંગ્રેજી)',
  editorHelpGuRequired: 'મદદ લખાણ (ગુજરાતી)',
  editorMaxLength: 'મહત્તમ લંબાઈ',
  editorPattern: 'પેટર્ન (નિયમિત અભિવ્યક્તિ)',
  editorMinimum: 'ન્યૂનતમ',
  editorMaximum: 'મહત્તમ',
  editorStep: 'પગલું',
  editorCurrencyPrecisionHint: 'ચલણની ચોકસાઈ બે દશાંશ સ્થાને નિયત છે (₹).',
  editorBakedConstraintsHint:
    'સમાવિષ્ટ વિજેટ મર્યાદાઓ (રેન્જ અથવા enum) સાચવવામાં આવે છે અને આ વધારામાં સંપાદનયોગ્ય નથી.',
  editorMobileOtpSmsOnlyHint:
    'મોબાઇલ OTP ચકાસણી v1માં ફક્ત SMS વાપરે છે. OTP ચેનલ અહીં સંપાદનયોગ્ય નથી.',
  editorValidationSummary: 'લાગુ કરતા પહેલાં નીચેનું સુધારો:',
  editorPreviewValueWarning:
    'વર્તમાન પૂર્વાવલોકન મૂલ્ય આ મર્યાદાઓ હેઠળ અમાન્ય હોઈ શકે છે. તે સાફ કરવામાં આવ્યું નથી — સુધારવા માટે લાઇવ પૂર્વાવલોકન વાપરો.',
  editorUnavailable: 'આ વધારામાં ગુણધર્મ સંપાદક ઉપલબ્ધ નથી',
  editorLegacyPageBreakGuidance:
    'આ જૂનું પેજ-બ્રેક ક્ષેત્ર ફક્ત વાંચવા માટે છે. પ્રગતિશીલ-પગલાની સીમાઓ બનાવવા માટે પેલેટમાંથી Page break વાપરો. આ ક્ષેત્રને આપમેળે રૂપાંતરિત કરશો નહીં.',
  editorStaleGuidance:
    'તમે સંપાદન શરૂ કર્યા પછી સમર્પિત ક્ષેત્ર ગુણધર્મો બદલાયા. વર્તમાન મૂલ્યો ફરી લોડ કરવા ફેરફારો રદ કરો, પછી તમારા ફેરફારો ફરી લાગુ કરો. તમારો ડ્રાફ્ટ લાગુ થયો નથી.',
  editorErrorLabelEnRequired: 'અંગ્રેજી લેબલ જરૂરી છે અને ખાલી ન હોવું જોઈએ.',
  editorErrorLabelGuRequired: 'ગુજરાતી લેબલ જરૂરી છે અને ખાલી ન હોવું જોઈએ.',
  editorErrorLabelEnPadded: 'અંગ્રેજી લેબલમાં આગળ કે પાછળ જગ્યા ન હોવી જોઈએ.',
  editorErrorLabelGuPadded: 'ગુજરાતી લેબલમાં આગળ કે પાછળ જગ્યા ન હોવી જોઈએ.',
  editorErrorHelpPairIncomplete: 'મદદ લખાણ અંગ્રેજી અને ગુજરાતી બંનેમાં આપો, અથવા બંને ખાલી રાખો.',
  editorErrorHelpEnPadded: 'અંગ્રેજી મદદમાં આગળ કે પાછળ જગ્યા ન હોવી જોઈએ.',
  editorErrorHelpGuPadded: 'ગુજરાતી મદદમાં આગળ કે પાછળ જગ્યા ન હોવી જોઈએ.',
  editorErrorHelpRequired: 'આ વિજેટ માટે અંગ્રેજી અને ગુજરાતી બંનેમાં મદદ લખાણ જરૂરી છે.',
  editorErrorErrorPairIncomplete: 'ભૂલ લખાણ અંગ્રેજી અને ગુજરાતી બંનેમાં આપો, અથવા બંને ખાલી રાખો.',
  editorErrorErrorEnPadded: 'અંગ્રેજી ભૂલ લખાણમાં આગળ કે પાછળ જગ્યા ન હોવી જોઈએ.',
  editorErrorErrorGuPadded: 'ગુજરાતી ભૂલ લખાણમાં આગળ કે પાછળ જગ્યા ન હોવી જોઈએ.',
  editorErrorMaxLengthInvalid: 'મહત્તમ લંબાઈ ધન પૂર્ણાંક હોવી જોઈએ.',
  editorErrorPatternInvalid: 'પેટર્ન માન્ય નિયમિત અભિવ્યક્તિ હોવી જોઈએ, અથવા ખાલી રાખો.',
  editorErrorMinimumInvalid: 'ન્યૂનતમ મર્યાદિત સંખ્યા હોવી જોઈએ, અથવા ખાલી રાખો.',
  editorErrorMaximumInvalid: 'મહત્તમ મર્યાદિત સંખ્યા હોવી જોઈએ, અથવા ખાલી રાખો.',
  editorErrorStepInvalid: 'પગલું શૂન્યથી મોટી મર્યાદિત સંખ્યા હોવું જોઈએ, અથવા ખાલી રાખો.',
  editorErrorRangeInvalid: 'ન્યૂનતમ મહત્તમ કરતાં ઓછું અથવા બરાબર હોવું જોઈએ.',
  editorErrorCurrencyMinimumNegative: 'ચલણનું ન્યૂનતમ શૂન્યથી નીચે ન હોઈ શકે.',
  editorVerifyEmail: 'ઈમેલ ચકાસણી આવશ્યક',
  editorMinAge: 'ન્યૂનતમ ઉંમર',
  editorMaxAge: 'મહત્તમ ઉંમર',
  editorErrorMinAgeInvalid:
    'ન્યૂનતમ ઉંમર 0 અથવા તેથી વધુનો પૂર્ણાંક હોવો જોઈએ (આગળના શૂન્ય વગર), અથવા ખાલી રાખો.',
  editorErrorMaxAgeInvalid:
    'મહત્તમ ઉંમર 0 અથવા તેથી વધુનો પૂર્ણાંક હોવો જોઈએ (આગળના શૂન્ય વગર), અથવા ખાલી રાખો.',
  editorErrorAgeRangeInvalid: 'ન્યૂનતમ ઉંમર મહત્તમ ઉંમર કરતાં ઓછી અથવા બરાબર હોવી જોઈએ.',
  editorMasterListId: 'માસ્ટર યાદી ID',
  editorErrorMasterListIdInvalid:
    'માસ્ટર યાદી ID જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorMinItems: 'ન્યૂનતમ આઇટમ્સ',
  editorMaxItems: 'મહત્તમ આઇટમ્સ',
  editorErrorMinItemsInvalid:
    'ન્યૂનતમ આઇટમ્સ padding કે ચિહ્ન વગરનો nonnegative પૂર્ણાંક હોવો જોઈએ.',
  editorErrorMaxItemsInvalid:
    'મહત્તમ આઇટમ્સ padding કે ચિહ્ન વગરનો nonnegative પૂર્ણાંક હોવો જોઈએ.',
  editorErrorItemsRangeInvalid: 'મહત્તમ આઇટમ્સ ન્યૂનતમ આઇટમ્સ કરતાં ઓછી ન હોવી જોઈએ.',
  editorErrorRequiredMinItemsInvalid:
    'ક્ષેત્ર જરૂરી હોય ત્યારે ન્યૂનતમ આઇટમ્સ હાજર અને ઓછામાં ઓછી 1 હોવી જોઈએ.',
  editorParentMasterListId: 'પેરેન્ટ માસ્ટર યાદી ID',
  editorChildMasterListId: 'ચાઇલ્ડ માસ્ટર યાદી ID',
  editorErrorParentMasterListIdInvalid:
    'પેરેન્ટ માસ્ટર યાદી ID જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorErrorChildMasterListIdInvalid:
    'ચાઇલ્ડ માસ્ટર યાદી ID જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorDefaultStateCode: 'ડિફોલ્ટ રાજ્ય કોડ (વૈકલ્પિક)',
  editorDefaultStateCodeHint:
    'ફક્ત વૈકલ્પિક ભૂગોળ રાજ્ય કોડ. છોડી દો તો ગેરહાજર. બિલ્ડર રાજ્યો શોધતું નથી.',
  editorErrorDefaultStateCodeInvalid:
    'ડિફોલ્ટ રાજ્ય કોડ આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ, અથવા ખાલી છોડો.',
  editorPhotoCapturePolicyHint:
    'ફોટો કેપ્ચર ફક્ત CLEAN ઑબ્જેક્ટ-સ્ટોર સંદર્ભ સંગ્રહે છે (JPEG/PNG, મહત્તમ 5 MiB, 300–4096 px). નીતિ ઉત્પાદન/સુરક્ષા પુષ્ટિની રાહ જુએ છે. MIME, કદ, પરિમાણ અને સ્કેન સ્થિતિ અહીં સંપાદનયોગ્ય નથી.',
  editorAllowedMimeTypes: 'મંજૂર MIME પ્રકારો',
  editorAllowedMimeTypesHint:
    'દરેક લાઇને એક MIME પ્રકાર. ચોક્કસ કિંમતો સાચવાય છે; padding કે નકલ ન કરો.',
  editorErrorAllowedMimeTypesInvalid:
    'દરેક લાઇને ઓછામાં ઓછો એક ખાલી ન હોય તેવો, padding વગરનો MIME પ્રકાર દાખલ કરો — નકલ વગર.',
  editorMaxFileSizeBytes: 'મહત્તમ ફાઇલ કદ (બાઇટ્સ)',
  editorMaxFileSizeBytesHint:
    '26214400 (25 MiB) સુધીનો ધન પૂર્ણાંક. Padding, ચિહ્ન, દશાંશ કે વિભાજક નહીં.',
  editorErrorMaxFileSizeBytesInvalid:
    'મહત્તમ ફાઇલ કદ 26214400 (25 MiB) સુધીનો ધન પૂર્ણાંક હોવો જોઈએ.',
  editorDigiLockerDocumentTypeCode: 'DigiLocker દસ્તાવેજ પ્રકાર કોડ',
  editorDigiLockerDocumentTypeCodeHint:
    'ચોક્કસ ખાલી ન હોય તેવો કોડ. બિલ્ડર પ્રદાતા યાદી સામે શોધતું નથી.',
  editorErrorDigiLockerDocumentTypeCodeInvalid:
    'દસ્તાવેજ પ્રકાર કોડ આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorFeeRuleId: 'ફી નિયમ ID',
  editorErrorFeeRuleIdInvalid:
    'ફી નિયમ ID જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorFeeFieldPolicyHint:
    'ફક્ત INR · રકમ પૈસામાં · ગણતરી માટે હોસ્ટ feeContextRevision અને FeeComputationAdapter જરૂરી. બિલ્ડર પૂર્વાવલોકન લાઇવ ફી ગણતરીનો દાવો કરતું નથી.',
  editorDeclarationId: 'ઘોષણા ID',
  editorErrorDeclarationIdInvalid:
    'ઘોષણા ID જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorErrorDeclarationTextEnInvalid:
    'અંગ્રેજી ઘોષણા લખાણ જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorErrorDeclarationTextGuInvalid:
    'ગુજરાતી ઘોષણા લખાણ જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorEligibilityDeclarationPolicyHint:
    'હોસ્ટ ConsentLoggingAdapter નિર્ણય નોંધે પછી જ સંમતિ રસીદ સંદર્ભ સંગ્રહે છે. ઘોષણા લખાણ બદલવા માટે નવી declarationId જરૂરી છે. બિલ્ડર પૂર્વાવલોકન રસીદ બનાવતું નથી.',
  editorSignatureEsignPolicyHint:
    'ફક્ત સહી કરેલા આર્ટિફેક્ટ સંદર્ભ સંગ્રહે છે. હોસ્ટ સહીકર્તા પ્રમાણીકરણ, પેલોડ અને ચકાસણીનો માલિક છે. અધિકૃત eSign કરાર અસ્થાયી/બાહ્ય રહે છે.',
  editorCafPrefillPolicyHint:
    'સ્કીમા ફક્ત નિયત value અને source સંગ્રહે છે. CAF એટ્રિબ્યુટ અને confidence ન્યૂનતમ prefill બાઇન્ડિંગ તરીકે લેખિત થાય છે — ક્ષેત્ર ઉમેરો પર બને છે, પછી બાઇન્ડિંગ્સ ટેબમાં સંપાદિત થાય છે.',
  editorErrorCafAttributeInvalid:
    'CAF એટ્રિબ્યુટ જરૂરી છે અને આગળ કે પાછળ જગ્યા વગરની ખાલી ન હોય તેવી કિંમત હોવી જોઈએ.',
  editorErrorConfidenceMinInvalid:
    'Confidence ન્યૂનતમ 0 થી 1 સુધીની મર્યાદિત સંખ્યા હોવી જોઈએ (ઉદાહરણ 0.8).',
  configuredAddTitle: '{label} ગોઠવો',
  configuredAddGuidance:
    'આ ક્ષેત્ર ઉમેરતા પહેલાં માસ્ટર-ડેટા યાદી ID દાખલ કરો. બિલ્ડર યાદી ID શોધતું કે બનાવતું નથી.',
  configuredAddMasterListId: 'માસ્ટર યાદી ID',
  configuredAddMinItems: 'ન્યૂનતમ આઇટમ્સ (વૈકલ્પિક)',
  configuredAddMaxItems: 'મહત્તમ આઇટમ્સ (વૈકલ્પિક)',
  configuredAddParentMasterListId: 'પેરેન્ટ માસ્ટર યાદી ID',
  configuredAddChildMasterListId: 'ચાઇલ્ડ માસ્ટર યાદી ID',
  configuredAddAllowedMimeTypes: 'મંજૂર MIME પ્રકારો',
  configuredAddMaxFileSizeBytes: 'મહત્તમ ફાઇલ કદ (બાઇટ્સ)',
  configuredAddDigiLockerDocumentTypeCode: 'DigiLocker દસ્તાવેજ પ્રકાર કોડ',
  configuredAddFeeRuleId: 'ફી નિયમ ID',
  configuredAddDeclarationId: 'ઘોષણા ID',
  configuredAddDeclarationTextEn: 'ઘોષણા લખાણ (અંગ્રેજી)',
  configuredAddDeclarationTextGu: 'ઘોષણા લખાણ (ગુજરાતી)',
  configuredAddCafAttribute: 'CAF એટ્રિબ્યુટ',
  configuredAddConfidenceMin: 'Confidence ન્યૂનતમ (0–1)',
  configuredAddInitialMemberWidgetType: 'પ્રારંભિક સભ્ય વિજેટ',
  configuredAddInitialMemberLabelEn: 'પ્રારંભિક સભ્ય લેબલ (અંગ્રેજી)',
  configuredAddInitialMemberLabelGu: 'પ્રારંભિક સભ્ય લેબલ (ગુજરાતી)',
  configuredAddInitialMemberRequired: 'પ્રારંભિક સભ્ય આવશ્યક',
  configuredAddConfirm: 'ક્ષેત્ર ઉમેરો',
  configuredAddCancel: 'રદ કરો',
  familyRepeaterMembersHeading: 'સભ્ય ક્ષેત્રો',
  familyRepeaterAddMember: 'સભ્ય ક્ષેત્ર ઉમેરો',
  familyRepeaterRemoveMember: 'સભ્ય દૂર કરો',
  familyRepeaterMoveEarlier: 'પહેલાં ખસેડો',
  familyRepeaterMoveLater: 'પછી ખસેડો',
  familyRepeaterMemberWidgetType: 'સભ્ય વિજેટ પ્રકાર',
  familyRepeaterMembersReadOnly:
    'સભ્ય માળખું ફક્ત વાંચવા માટે છે કારણ કે આ પારિવારિક રિપીટરમાં અસમર્થિત ચાઇલ્ડ વિજેટ્સ છે.',
  familyRepeaterMemberRequired: 'આવશ્યક',
  announceConfiguredAddBlocked:
    'અન્ય માળખાકીય ફેરફારો કરતા પહેલાં બાકીની ક્ષેત્ર ગોઠવણી પૂર્ણ કરો અથવા રદ કરો.',
  persistBlockedConfiguredAdd: 'સાચવતા પહેલાં બાકીની ક્ષેત્ર ગોઠવણી પૂર્ણ કરો અથવા રદ કરો.',
  validationBlockedConfiguredAdd: 'માન્ય કરતા પહેલાં બાકીની ક્ષેત્ર ગોઠવણી પૂર્ણ કરો અથવા રદ કરો.',
  pageBreakDialogTitle: 'પગલાની સીમા બનાવો ({label})',
  pageBreakDialogGuidance:
    'નવું પગલું ક્યાંથી શરૂ થાય તે પસંદ કરો અને આગલા પગલા માટે દ્વિભાષી લેબલ દાખલ કરો. આ કોઈ ફોર્મ ક્ષેત્ર ઉમેરતું નથી.',
  pageBreakAfterField: 'ક્ષેત્ર પછી સીમા બનાવો',
  pageBreakAfterFieldInvalid: 'પગલાના છેલ્લા ક્ષેત્ર સિવાયનું પાત્ર ક્ષેત્ર પસંદ કરો.',
  pageBreakNextStepLabelEn: 'આગલું પગલું લેબલ (અંગ્રેજી)',
  pageBreakNextStepLabelGu: 'આગલું પગલું લેબલ (ગુજરાતી)',
  pageBreakConfirm: 'સીમા બનાવો',
  pageBreakCancel: 'રદ કરો',
  pageBreakNoBoundaryGuidance:
    'પેજ-બ્રેક સીમા બનાવતા પહેલાં એક પગલામાં ઓછામાં ઓછાં બે ક્ષેત્રો ઉમેરો.',
  bindingsHeading: 'બાઇન્ડિંગ્સ',
  bindingsGuidance:
    'CAF Prefill, Integration Hub અને Workflow સ્ટેજ બાઇન્ડિંગ્સ લેખિત કરો. દરેક સપાટી સ્વતંત્ર રીતે લાગુ થાય છે.',
  bindingsCafHeading: 'CAF Prefill',
  bindingsCafGuidance:
    'CAF એટ્રિબ્યુટ અને confidence ન્યૂનતમ અહીં લેખિત કરો. દરેક બાઇન્ડિંગ વ્યાખ્યાના fieldId નો ઉપયોગ કરે છે. CAF ક્ષેત્ર ઉમેરતા Confirm પર પ્રારંભિક બાઇન્ડિંગ બને છે.',
  bindingsEmpty:
    'આ ફોર્મ પર હજુ કોઈ CAF Prefill ક્ષેત્ર નથી. બાઇન્ડિંગ લેખન માટે પેલેટમાંથી CAF Prefill ક્ષેત્ર ઉમેરો.',
  bindingsFieldMeta: '{label} · {fieldId}',
  bindingsStatusBound: 'બંધાયેલ',
  bindingsStatusUnbound: 'અનબાઉન્ડ',
  bindingsCafAttribute: 'CAF એટ્રિબ્યુટ',
  bindingsConfidenceMin: 'Confidence ન્યૂનતમ (0–1)',
  bindingsApply: 'લાગુ કરો',
  bindingsCancel: 'રદ કરો',
  bindingsRemove: 'બાઇન્ડિંગ દૂર કરો',
  bindingsDirty: 'ન સાચવેલા ફેરફારો',
  bindingsClean: 'ન સાચવેલા ફેરફારો નથી',
  bindingsValidationSummary: 'લાગુ કરતા પહેલાં નીચેનું સુધારો:',
  bindingsStaleGuidance:
    'તમે સંપાદન શરૂ કર્યા પછી સમર્પિત CAF બાઇન્ડિંગ બદલાયું. વર્તમાન મૂલ્યો ફરી લોડ કરવા ફેરફારો રદ કરો, પછી તમારા ફેરફારો ફરી લાગુ કરો. તમારો ડ્રાફ્ટ લાગુ થયો નથી.',
  bindingsIntegrationHeading: 'Integration Hub',
  bindingsIntegrationGuidance:
    'ડેટા-ઉત્પાદક ક્ષેત્રોને Integration Hub એડેપ્ટર સાથે બાંધો. એડેપ્ટર અને પેરામીટર ઓળખકર્તાઓ અપારદર્શક અને બાહ્ય રીતે શાસિત છે — આ બિલ્ડર તેમને શોધતું નથી.',
  bindingsIntegrationEmpty: 'હજુ કોઈ એકીકરણ બાઇન્ડિંગ નથી. એક ઉમેરવા માટે પંક્તિ ઉમેરો.',
  bindingsIntegrationAdd: 'એકીકરણ બાઇન્ડિંગ ઉમેરો',
  bindingsIntegrationAdapterId: 'એડેપ્ટર ID',
  bindingsIntegrationParam: 'પેરામીટર',
  bindingsIntegrationDirection: 'દિશા',
  bindingsIntegrationDirectionIn: 'અંદર',
  bindingsIntegrationDirectionOut: 'બહાર',
  bindingsIntegrationRemoveRow: 'પંક્તિ દૂર કરો',
  bindingsIntegrationStaleGuidance:
    'તમે સંપાદન શરૂ કર્યા પછી સમર્પિત એકીકરણ બાઇન્ડિંગ્સ બદલાયાં. વર્તમાન મૂલ્યો ફરી લોડ કરવા રદ કરો, પછી ફરી લાગુ કરો. તમારો ડ્રાફ્ટ લાગુ થયો નથી.',
  bindingsIntegrationValidationSummary: 'લાગુ કરતા પહેલાં નીચેની એકીકરણ બાઇન્ડિંગ્સ સુધારો:',
  bindingsWorkflowHeading: 'વર્કફ્લો સ્ટેજીસ',
  bindingsWorkflowGuidance:
    'ડેટા-ઉત્પાદક ક્ષેત્રોને વર્કફ્લો સ્ટેજ સાથે બાંધો. સ્ટેજ ઓળખકર્તાઓ અપારદર્શક અને બાહ્ય રીતે શાસિત છે — આ બિલ્ડર તેમને શોધતું નથી.',
  bindingsWorkflowEmpty: 'હજુ કોઈ વર્કફ્લો બાઇન્ડિંગ નથી. એક ઉમેરવા માટે પંક્તિ ઉમેરો.',
  bindingsWorkflowAdd: 'વર્કફ્લો બાઇન્ડિંગ ઉમેરો',
  bindingsWorkflowStage: 'સ્ટેજ',
  bindingsWorkflowRemoveRow: 'પંક્તિ દૂર કરો',
  bindingsWorkflowStaleGuidance:
    'તમે સંપાદન શરૂ કર્યા પછી સમર્પિત વર્કફ્લો બાઇન્ડિંગ્સ બદલાયાં. વર્તમાન મૂલ્યો ફરી લોડ કરવા રદ કરો, પછી ફરી લાગુ કરો. તમારો ડ્રાફ્ટ લાગુ થયો નથી.',
  bindingsWorkflowValidationSummary: 'લાગુ કરતા પહેલાં નીચેની વર્કફ્લો બાઇન્ડિંગ્સ સુધારો:',
  bindingsFieldSelect: 'ક્ષેત્ર',
  bindingsNestedFieldMeta: '{label} · {parent} માં નેસ્ટેડ · {fieldId}',
  bindingsOpaqueIdsGuidance:
    'એડેપ્ટર, પેરામીટર અને સ્ટેજ મૂલ્યો ફક્ત રૂપરેખા ઓળખકર્તાઓ છે. અહીં ઓળખપત્રો, ટોકન્સ અથવા રનટાઇમ પેલોડ્સ મૂકશો નહીં.',
  editorErrorIntegrationFieldInvalid: 'શાસિત ડેટા-ઉત્પાદક ક્ષેત્ર પસંદ કરો.',
  editorErrorIntegrationAdapterInvalid:
    'ખાલી ન હોય તેવું અને આગળ/પાછળ જગ્યા વગરનું ચોક્કસ એડેપ્ટર ID દાખલ કરો.',
  editorErrorIntegrationParamInvalid:
    'ખાલી ન હોય તેવું અને આગળ/પાછળ જગ્યા વગરનું ચોક્કસ પેરામીટર દાખલ કરો.',
  editorErrorIntegrationDirectionInvalid: 'દિશા અંદર અથવા બહાર પસંદ કરો.',
  editorErrorIntegrationDuplicateTuple:
    'આ ક્ષેત્ર, એડેપ્ટર, પેરામીટર અને દિશા સંયોજન પહેલેથી યાદીમાં છે.',
  editorErrorWorkflowFieldInvalid: 'શાસિત ડેટા-ઉત્પાદક ક્ષેત્ર પસંદ કરો.',
  editorErrorWorkflowStageInvalid:
    'ખાલી ન હોય તેવું અને આગળ/પાછળ જગ્યા વગરનું ચોક્કસ સ્ટેજ દાખલ કરો.',
  editorErrorWorkflowDuplicatePair: 'આ ક્ષેત્ર અને સ્ટેજ સંયોજન પહેલેથી યાદીમાં છે.',
}

const CATALOGUE: Record<BuilderLocale, Record<BuilderMessageKey, string>> = {
  en: EN,
  gu: GU,
}

export function builderMessage(
  locale: BuilderLocale,
  key: BuilderMessageKey,
  vars?: Readonly<Record<string, string | number>>,
): string {
  let text = CATALOGUE[locale][key]
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
