import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { FormDefinition } from '@citizen/form-contract'

import {
  AuthoringError,
  authoringReducer,
  canvasRootFieldIdsForBindingTargets,
  collectIntegrationBindingDirtyFieldIds,
  collectWorkflowBindingDirtyFieldIds,
  configurationToDraft,
  createAuthoringSession,
  createAuthoringUiState,
  getCanvasReorderTargets,
  getMoveCapability,
  getPageBreakBoundaryOptions,
  getRemoveCapability,
  isConfiguredAddableWidgetType,
  isEditableWidgetType,
  isFamilyRepeaterDraftEntryDirty,
  isFieldAnyDraftDirty,
  hasActiveCanvasReorderGesture,
  isPropertyEditorDirty,
  isStructuralAddableWidgetType,
  previewValueMayBeInvalid,
  readFamilyRepeaterDraftContent,
  readFieldConfiguration,
  serializeFamilyRepeaterStructureBaseline,
  getFamilyMemberCapabilities,
  type AuthoringAction,
  type FamilyMemberWidgetType,
  type FamilyRepeaterDraftContent,
  type FamilyRepeaterDraftEntry,
  type IntegrationBindingDraftRow,
  type MoveDirection,
  type PendingConfiguredAddPatch,
  type PendingStructuralAddPatch,
  type WorkflowBindingDraftRow,
} from '../authoring/index.js'
import { CanvasProjectionError, projectCanvasRows } from '../canvas/project-canvas.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../definition/illustrative-draft-definition.js'
import type { AccessTokenProvider } from '../auth/index.js'
import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import {
  createHttpFormDefinitionDraftPersistenceAdapter,
  useDefinitionPersistence,
  type FormDefinitionDraftPersistenceAdapter,
} from '../persistence/index.js'
import {
  createHttpFormDefinitionLifecycleAdapter,
  useDefinitionLifecycle,
  type FormDefinitionLifecycleAdapter,
} from '../lifecycle/index.js'
import {
  createHttpFormDefinitionVersionManagementAdapter,
  useDefinitionVersions,
  type FormDefinitionVersionManagementAdapter,
} from '../versions/index.js'
import {
  createHttpFormDefinitionValidationAdapter,
  useDefinitionValidation,
  type FormDefinitionValidationAdapter,
} from '../validation/index.js'
import { BuilderActions } from './BuilderActions.js'
import { BuilderHeader } from './BuilderHeader.js'
import { BuilderTabs, type BuilderTabId } from './BuilderTabs.js'
import { BindingsWorkspace } from './BindingsWorkspace.js'
import { BilingualWorkspace } from './BilingualWorkspace.js'
import { CanvasPane } from './CanvasPane.js'
import { ConfiguredAddDialog } from './ConfiguredAddDialog.js'
import { PageBreakDialog } from './PageBreakDialog.js'
import { FieldInspector } from './FieldInspector.js'
import { PalettePane } from './PalettePane.js'
import { PreviewPane } from './PreviewPane.js'
import { StepsWorkspace } from './StepsWorkspace.js'
import { SubmitConfirmDialog } from './SubmitConfirmDialog.js'
import { CloneVersionConfirmDialog } from './CloneVersionConfirmDialog.js'
import { VersionHistoryPanel } from './VersionHistoryPanel.js'

/** Authoring mutations that must invalidate an in-flight exact load (FB-D7). */
function actionAffectsPersistenceRace(action: AuthoringAction): boolean {
  switch (action.type) {
    case 'select':
    case 'setPreviewFormData':
    case 'clearStepsActionAlert':
    case 'focusBilingualStep':
    case 'ensureIntegrationBindingDraft':
    case 'ensureWorkflowBindingDraft':
      return false
    default:
      return true
  }
}

export interface BuilderShellProps {
  /** Injectable Unit C validation port. Pass `null` to disable Validate. Omit to use default HTTP. */
  readonly validationAdapter?: FormDefinitionValidationAdapter | null
  /** Injectable Unit C draft persistence port. Pass `null` to disable Save/Load. */
  readonly persistenceAdapter?: FormDefinitionDraftPersistenceAdapter | null
  /** Injectable Unit C technical lifecycle port. */
  readonly lifecycleAdapter?: FormDefinitionLifecycleAdapter | null
  /** Host-provided technical actor; this is not authentication. Non-production only. */
  readonly lifecycleActorId?: string | null
  /** Injectable immutable-version listing and clone port. */
  readonly versionManagementAdapter?: FormDefinitionVersionManagementAdapter | null
  /**
   * Host-owned request-time access token provider (FB-E5.4.2A).
   * No default — remote HTTP adapters fail closed without a provider.
   * Does not read localStorage or Vite token env vars.
   */
  readonly accessTokenProvider?: AccessTokenProvider | null
  /**
   * Optional initial FormDefinition for acceptance / technical harnesses (FB-D22).
   * Defaults to the illustrative draft. Production `main.tsx` does not pass this.
   * Always cloned into a detached session — the source reference is never retained.
   */
  readonly initialDefinition?: FormDefinition
}

export function BuilderShell({
  validationAdapter: validationAdapterProp,
  persistenceAdapter: persistenceAdapterProp,
  lifecycleAdapter: lifecycleAdapterProp,
  lifecycleActorId = null,
  versionManagementAdapter: versionManagementAdapterProp,
  accessTokenProvider = null,
  initialDefinition = ILLUSTRATIVE_DRAFT_DEFINITION,
}: BuilderShellProps = {}) {
  // Default HTTP adapters are rebuilt when the host provider identity changes so hooks abort
  // safely. Explicitly injected domain adapters are never wrapped.
  const defaultHttpAdapters = useMemo(() => {
    const tokenOpts =
      accessTokenProvider != null ? { accessTokenProvider } : { accessTokenProvider: null }
    return {
      validation: createHttpFormDefinitionValidationAdapter(tokenOpts),
      persistence: createHttpFormDefinitionDraftPersistenceAdapter(tokenOpts),
      lifecycle: createHttpFormDefinitionLifecycleAdapter(tokenOpts),
      versions: createHttpFormDefinitionVersionManagementAdapter(tokenOpts),
    }
  }, [accessTokenProvider])

  const validationAdapter =
    validationAdapterProp === undefined ? defaultHttpAdapters.validation : validationAdapterProp
  const persistenceAdapter =
    persistenceAdapterProp === undefined ? defaultHttpAdapters.persistence : persistenceAdapterProp
  const lifecycleAdapter =
    lifecycleAdapterProp === undefined ? defaultHttpAdapters.lifecycle : lifecycleAdapterProp
  const versionManagementAdapter =
    versionManagementAdapterProp === undefined
      ? defaultHttpAdapters.versions
      : versionManagementAdapterProp

  // Locale is intentionally independent from authoring/preview state: switching
  // locale must never reset the in-progress authoring session (FB-D1 / FB-D2).
  const [locale, setLocale] = useState<BuilderLocale>('en')
  const [activeTab, setActiveTab] = useState<BuilderTabId>('bindings')
  const [uiState, dispatchBase] = useReducer(authoringReducer, initialDefinition, (definition) =>
    createAuthoringUiState(createAuthoringSession(definition)),
  )
  const sessionEpochRef = useRef(0)
  const authoringState = uiState.authoring
  const lastFocusedFieldIdRef = useRef<string | null>(null)

  const dispatch = useCallback((action: AuthoringAction) => {
    if (actionAffectsPersistenceRace(action)) {
      sessionEpochRef.current += 1
    }
    dispatchBase(action)
  }, [])

  const {
    view: validationView,
    validate: runValidation,
    summaryRef: validationSummaryRef,
  } = useDefinitionValidation({
    definition: authoringState.definition,
    uiState,
    adapter: validationAdapter,
  })

  const {
    view: persistenceView,
    saveDraft,
    requestLoad,
    confirmDiscardAndLoad,
    cancelDiscardConfirmation,
    retryLastFailure,
    adoptPersistedSnapshot,
    summaryRef: persistSummaryRef,
  } = useDefinitionPersistence({
    definition: authoringState.definition,
    uiState,
    dispatch,
    validation: validationView,
    adapter: persistenceAdapter,
    sessionEpochRef,
  })

  const {
    view: lifecycleView,
    requestSubmit,
    confirmSubmit,
    cancelConfirmation: cancelSubmitConfirmation,
    retryLastFailure: retrySubmit,
    summaryRef: lifecycleSummaryRef,
  } = useDefinitionLifecycle({
    definition: authoringState.definition,
    uiState,
    dispatch,
    validation: validationView,
    persistence: persistenceView,
    adapter: lifecycleAdapter,
    actorId: lifecycleActorId,
    sessionEpochRef,
    onAdoptSubmitted: useCallback(
      (snapshot) => {
        dispatch({
          type: 'replaceAuthoringSession',
          definition: snapshot.definition,
          previewPolicy: 'preserve',
        })
        adoptPersistedSnapshot(snapshot.definition, snapshot.etag)
      },
      [adoptPersistedSnapshot, dispatch],
    ),
  })

  const {
    view: versionsView,
    openPanel: openVersionHistory,
    closePanel: closeVersionHistory,
    setServiceIdInput: setVersionServiceIdInput,
    loadVersions,
    loadMore: loadMoreVersions,
    openDraftVersion,
    beginClone,
    confirmClone,
    cancelCloneConfirmation,
    retryLastFailure: retryVersionFailure,
  } = useDefinitionVersions({
    adapter: versionManagementAdapter,
    actorId: lifecycleActorId,
    sessionEpochRef,
    currentServiceId: authoringState.definition.serviceId,
    uiState,
    persistence: persistenceView,
    requestLoad,
    confirmDiscard: confirmDiscardAndLoad,
    cancelDiscard: cancelDiscardConfirmation,
    dispatch,
    onAdoptClonedDraft: useCallback(
      (snapshot) => {
        dispatch({
          type: 'replaceAuthoringSession',
          definition: snapshot.definition,
          previewPolicy: 'clear',
        })
        adoptPersistedSnapshot(snapshot.definition, snapshot.etag)
      },
      [adoptPersistedSnapshot, dispatch],
    ),
  })

  const projection = useMemo(() => {
    try {
      return { ok: true as const, rows: projectCanvasRows(authoringState.definition) }
    } catch (error) {
      if (error instanceof CanvasProjectionError) {
        return { ok: false as const, error }
      }
      throw error
    }
  }, [authoringState.definition])

  const rows = useMemo(() => (projection.ok ? projection.rows : []), [projection])
  const selectedRow = rows.find((row) => row.fieldId === authoringState.selectedFieldId) ?? null
  const moveCapability = getMoveCapability(authoringState, authoringState.selectedFieldId)
  const removeCapability = getRemoveCapability(authoringState, authoringState.selectedFieldId)

  const dirtyFieldIds = useMemo(() => {
    const ids = new Set<string>()
    for (const fieldId of Object.keys(uiState.editorDrafts)) {
      if (isFieldAnyDraftDirty(uiState, fieldId)) {
        ids.add(fieldId)
      }
    }
    for (const fieldId of Object.keys(uiState.bindingDrafts)) {
      if (isFieldAnyDraftDirty(uiState, fieldId)) {
        ids.add(fieldId)
      }
    }
    for (const fieldId of Object.keys(uiState.familyRepeaterDrafts)) {
      if (isFieldAnyDraftDirty(uiState, fieldId)) {
        ids.add(fieldId)
      }
    }
    for (const fieldId of canvasRootFieldIdsForBindingTargets(
      authoringState.definition,
      collectIntegrationBindingDirtyFieldIds(
        uiState.integrationBindingDraft,
        authoringState.definition,
      ),
    )) {
      ids.add(fieldId)
    }
    for (const fieldId of canvasRootFieldIdsForBindingTargets(
      authoringState.definition,
      collectWorkflowBindingDirtyFieldIds(uiState.workflowBindingDraft, authoringState.definition),
    )) {
      ids.add(fieldId)
    }
    return ids
  }, [uiState, authoringState.definition])

  const selectedFieldId = authoringState.selectedFieldId
  const editorEntry = selectedFieldId !== null ? uiState.editorDrafts[selectedFieldId] : undefined
  const familyRepeaterEntry = useMemo((): FamilyRepeaterDraftEntry | null => {
    if (selectedFieldId === null || selectedRow === null) {
      return null
    }
    if (selectedRow.widgetType !== 'family-repeater') {
      return null
    }
    const existing = uiState.familyRepeaterDrafts[selectedFieldId]
    if (existing) {
      return existing
    }
    try {
      const draft = readFamilyRepeaterDraftContent(authoringState.definition, selectedFieldId)
      const capabilities = getFamilyMemberCapabilities(authoringState.definition, selectedFieldId)
      return {
        draft,
        contentBaseline: draft,
        baseline: serializeFamilyRepeaterStructureBaseline(
          authoringState.definition,
          selectedFieldId,
        ),
        showValidation: false,
        showStaleGuidance: false,
        structureReadOnly: !capabilities.membersEditable,
      }
    } catch (error) {
      if (error instanceof AuthoringError) {
        return null
      }
      throw error
    }
  }, [selectedFieldId, selectedRow, uiState.familyRepeaterDrafts, authoringState.definition])

  const displayDraft = useMemo(() => {
    if (selectedFieldId === null || selectedRow === null) {
      return null
    }
    if (!isEditableWidgetType(selectedRow.widgetType)) {
      return null
    }
    if (selectedRow.widgetType === 'family-repeater') {
      // Property surface uses familyRepeaterDrafts exclusively (FB-D16).
      return null
    }
    if (editorEntry) {
      return editorEntry.draft
    }
    try {
      return configurationToDraft(
        readFieldConfiguration(authoringState.definition, selectedFieldId),
      )
    } catch (error) {
      if (error instanceof AuthoringError) {
        return null
      }
      throw error
    }
  }, [selectedFieldId, selectedRow, editorEntry, authoringState.definition])

  const overallFieldDirty =
    selectedFieldId !== null ? isFieldAnyDraftDirty(uiState, selectedFieldId) : false
  const effectivePropertyDirty =
    selectedFieldId !== null && selectedRow?.widgetType === 'family-repeater'
      ? isFamilyRepeaterDraftEntryDirty(uiState, selectedFieldId)
      : selectedFieldId !== null
        ? isPropertyEditorDirty(uiState, selectedFieldId)
        : false
  const bilingualOnlyPending = overallFieldDirty && !effectivePropertyDirty
  const previewWarning = useMemo(() => {
    if (selectedFieldId === null || displayDraft === null) {
      return false
    }
    return previewValueMayBeInvalid(
      authoringState.definition,
      selectedFieldId,
      displayDraft,
      authoringState.previewFormData,
    )
  }, [selectedFieldId, displayDraft, authoringState.definition, authoringState.previewFormData])

  useEffect(() => {
    const fieldId = uiState.pendingFocusFieldId
    if (fieldId === null || fieldId === lastFocusedFieldIdRef.current) {
      return
    }
    lastFocusedFieldIdRef.current = fieldId
    const frame = requestAnimationFrame(() => {
      const selector = `[data-field-id="${CSS.escape(fieldId)}"]`
      const el = document.querySelector<HTMLElement>(selector)
      el?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [uiState.pendingFocusFieldId])

  useEffect(() => {
    const widgetType = uiState.pendingFocusPaletteWidgetType
    if (widgetType === null) {
      return
    }
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `.dg20-builder-palette__item[data-widget-type="${CSS.escape(widgetType)}"]`,
      )
      el?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [uiState.pendingFocusPaletteWidgetType, uiState.announcement?.id])

  useEffect(() => {
    const control = uiState.pendingFocusEditorControl
    if (control === null) {
      return
    }
    // Switch to Bindings tab when focus targets a binding control (bilingual
    // focus does not auto-switch tabs except via explicit Edit labels).
    if (control.startsWith('binding:') || control.startsWith('binding-summary:')) {
      setActiveTab('bindings')
    }
    // setTimeout(0) survives React StrictMode's effect cleanup/re-run better than
    // a single requestAnimationFrame (which is cancelled before it can focus).
    const timer = window.setTimeout(() => {
      let elementId: string | null = null
      if (control.startsWith('binding:')) {
        const [, fieldId, controlName] = control.split(':')
        if (fieldId && controlName) {
          elementId = `dg20-builder-binding-${fieldId}-${controlName}`
        }
      } else if (control.startsWith('binding-summary:')) {
        elementId = `dg20-builder-binding-summary-${control.slice('binding-summary:'.length)}`
      } else if (control.startsWith('integration:')) {
        const [, rowKey, controlName] = control.split(':')
        if (rowKey && controlName) {
          elementId = `dg20-builder-integration-${rowKey}-${controlName}`
        }
      } else if (control === 'integration-summary') {
        elementId = 'dg20-builder-integration-summary'
      } else if (control.startsWith('workflow:')) {
        const [, rowKey, controlName] = control.split(':')
        if (rowKey && controlName) {
          elementId = `dg20-builder-workflow-${rowKey}-${controlName}`
        }
      } else if (control === 'workflow-summary') {
        elementId = 'dg20-builder-workflow-summary'
      } else if (control.startsWith('field:')) {
        const [, fieldId, controlName] = control.split(':')
        if (fieldId && controlName) {
          elementId = `dg20-builder-bilingual-field-${fieldId}-${controlName}`
        }
      } else if (control.startsWith('step:')) {
        const [, stepId, controlName] = control.split(':')
        if (stepId && controlName) {
          elementId = `dg20-builder-bilingual-step-${stepId}-${controlName}`
        }
      } else if (control.startsWith('property-summary:')) {
        elementId = `dg20-builder-property-summary-${control.slice('property-summary:'.length)}`
      } else if (control.startsWith('bilingual-summary:')) {
        elementId = `dg20-builder-bilingual-summary-${control.slice('bilingual-summary:'.length)}`
      } else if (control.startsWith('bilingual-step-summary:')) {
        elementId = `dg20-builder-bilingual-step-summary-${control.slice('bilingual-step-summary:'.length)}`
      } else if (control.startsWith('canvas-reorder-handle:')) {
        const fieldId = control.slice('canvas-reorder-handle:'.length)
        document
          .querySelector<HTMLElement>(`[data-reorder-field-id="${CSS.escape(fieldId)}"]`)
          ?.focus()
        return
      } else if (authoringState.selectedFieldId !== null) {
        elementId = `dg20-builder-editor-${authoringState.selectedFieldId}-${control}`
      }
      const target = elementId ? document.getElementById(elementId) : null
      if (target) {
        target.focus()
        return
      }
      if (control.startsWith('binding:') || control.startsWith('binding-summary:')) {
        const fieldId = control.startsWith('binding:')
          ? control.split(':')[1]
          : control.slice('binding-summary:'.length)
        document.getElementById(`dg20-builder-binding-summary-${fieldId}`)?.focus()
        return
      }
      if (control.startsWith('field:') || control.startsWith('bilingual-summary:')) {
        const fieldId = control.startsWith('field:')
          ? control.split(':')[1]
          : control.slice('bilingual-summary:'.length)
        document.getElementById(`dg20-builder-bilingual-summary-${fieldId}`)?.focus()
        return
      }
      if (control.startsWith('step:') || control.startsWith('bilingual-step-summary:')) {
        const stepId = control.startsWith('step:')
          ? control.split(':')[1]
          : control.slice('bilingual-step-summary:'.length)
        document.getElementById(`dg20-builder-bilingual-step-summary-${stepId}`)?.focus()
        return
      }
      if (authoringState.selectedFieldId !== null) {
        document
          .getElementById(`dg20-builder-property-summary-${authoringState.selectedFieldId}`)
          ?.focus()
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [uiState.pendingFocusEditorControl, authoringState.selectedFieldId, uiState.announcement?.id])

  const announcementText = uiState.announcement
    ? builderMessage(locale, uiState.announcement.key, uiState.announcement.vars)
    : ''
  const announcementIsAlert = uiState.announcement?.key === 'announceCanvasReorderCrossStepBlocked'

  const handleAddWidget = useCallback(
    (widgetType: string) => {
      if (isStructuralAddableWidgetType(widgetType)) {
        dispatch({ type: 'beginPageBreakAdd' })
        return
      }
      if (isConfiguredAddableWidgetType(widgetType)) {
        dispatch({ type: 'beginConfiguredAdd', widgetType })
        return
      }
      dispatch({ type: 'add', widgetType })
    },
    [dispatch],
  )

  const handleConfiguredAddPatch = useCallback(
    (patch: PendingConfiguredAddPatch) => {
      dispatch({ type: 'patchConfiguredAdd', patch })
    },
    [dispatch],
  )

  const handleConfiguredAddConfirm = useCallback(() => {
    dispatch({ type: 'confirmConfiguredAdd' })
  }, [dispatch])

  const handleConfiguredAddCancel = useCallback(() => {
    dispatch({ type: 'cancelConfiguredAdd' })
  }, [dispatch])

  const handlePageBreakAddPatch = useCallback(
    (patch: PendingStructuralAddPatch) => {
      dispatch({ type: 'patchPageBreakAdd', patch })
    },
    [dispatch],
  )

  const handlePageBreakAddConfirm = useCallback(() => {
    dispatch({ type: 'confirmPageBreakAdd' })
  }, [dispatch])

  const handlePageBreakAddCancel = useCallback(() => {
    dispatch({ type: 'cancelPageBreakAdd' })
  }, [dispatch])

  const pageBreakBoundaryOptions = useMemo(
    () => getPageBreakBoundaryOptions(authoringState.definition),
    [authoringState.definition],
  )
  const canCreatePageBreak = pageBreakBoundaryOptions.length > 0
  const authoringReadOnly = authoringState.definition.status !== 'draft'
  const canvasReorderActive = hasActiveCanvasReorderGesture(uiState)
  const canvasReorderTargets = useMemo(
    () =>
      uiState.canvasReorderGesture
        ? getCanvasReorderTargets(authoringState.definition, uiState.canvasReorderGesture.fieldId)
        : [],
    [authoringState.definition, uiState.canvasReorderGesture],
  )

  const prevStructuralPendingRef = useRef(uiState.pendingStructuralAdd)
  useEffect(() => {
    const wasOpen = prevStructuralPendingRef.current !== null
    prevStructuralPendingRef.current = uiState.pendingStructuralAdd
    if (wasOpen && uiState.pendingStructuralAdd === null && uiState.pendingFocusStep !== null) {
      setActiveTab('steps')
    }
  }, [uiState.pendingStructuralAdd, uiState.pendingFocusStep])

  const handleRemoveField = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'remove', fieldId })
    },
    [dispatch],
  )

  const handleMoveField = useCallback(
    (fieldId: string, direction: MoveDirection) => {
      dispatch({ type: 'move', fieldId, direction })
    },
    [dispatch],
  )

  const handleSelectField = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'select', fieldId })
    },
    [dispatch],
  )

  const handleFormDataChange = useCallback(
    (data: Readonly<Record<string, unknown>>) => {
      dispatch({ type: 'setPreviewFormData', formData: data })
    },
    [dispatch],
  )

  const handlePatchDraft = useCallback(
    (patch: Readonly<Record<string, string | boolean | number>>) => {
      if (selectedFieldId === null) return
      if (selectedRow?.widgetType === 'family-repeater') {
        dispatch({ type: 'patchFamilyRepeaterDraft', fieldId: selectedFieldId, patch })
        return
      }
      dispatch({ type: 'patchEditorDraft', fieldId: selectedFieldId, patch })
    },
    [selectedFieldId, selectedRow, dispatch],
  )

  const handleApplyDraft = useCallback(() => {
    if (selectedFieldId === null) return
    if (selectedRow?.widgetType === 'family-repeater') {
      dispatch({ type: 'applyFamilyRepeaterDraft', fieldId: selectedFieldId })
      return
    }
    dispatch({ type: 'applyEditorDraft', fieldId: selectedFieldId })
  }, [selectedFieldId, selectedRow, dispatch])

  const handleCancelDraft = useCallback(() => {
    if (selectedFieldId === null) return
    if (selectedRow?.widgetType === 'family-repeater') {
      dispatch({ type: 'cancelFamilyRepeaterDraft', fieldId: selectedFieldId })
      return
    }
    dispatch({ type: 'cancelEditorDraft', fieldId: selectedFieldId })
  }, [selectedFieldId, selectedRow, dispatch])

  const handlePatchFamilyRepeater = useCallback(
    (
      patch: Readonly<
        Partial<
          Pick<
            FamilyRepeaterDraftContent,
            'labelEn' | 'labelGu' | 'helpEn' | 'helpGu' | 'minItems' | 'maxItems'
          >
        > & {
          readonly memberPropertyName?: string
          readonly memberPatch?: Readonly<Record<string, string | boolean | number>>
        }
      >,
    ) => {
      if (selectedFieldId === null) return
      dispatch({ type: 'patchFamilyRepeaterDraft', fieldId: selectedFieldId, patch })
    },
    [selectedFieldId, dispatch],
  )

  const handleApplyFamilyRepeater = useCallback(() => {
    if (selectedFieldId === null) return
    dispatch({ type: 'applyFamilyRepeaterDraft', fieldId: selectedFieldId })
  }, [selectedFieldId, dispatch])

  const handleCancelFamilyRepeater = useCallback(() => {
    if (selectedFieldId === null) return
    dispatch({ type: 'cancelFamilyRepeaterDraft', fieldId: selectedFieldId })
  }, [selectedFieldId, dispatch])

  const handleAddFamilyMember = useCallback(
    (input: {
      readonly widgetType: FamilyMemberWidgetType
      readonly labelEn: string
      readonly labelGu: string
      readonly required: boolean
    }) => {
      if (selectedFieldId === null) return
      dispatch({ type: 'addFamilyRepeaterMemberDraft', fieldId: selectedFieldId, ...input })
    },
    [selectedFieldId, dispatch],
  )

  const handleRemoveFamilyMember = useCallback(
    (propertyName: string) => {
      if (selectedFieldId === null) return
      dispatch({
        type: 'removeFamilyRepeaterMemberDraft',
        fieldId: selectedFieldId,
        propertyName,
      })
    },
    [selectedFieldId, dispatch],
  )

  const handleMoveFamilyMember = useCallback(
    (propertyName: string, direction: 'earlier' | 'later') => {
      if (selectedFieldId === null) return
      dispatch({
        type: 'moveFamilyRepeaterMemberDraft',
        fieldId: selectedFieldId,
        propertyName,
        direction,
      })
    },
    [selectedFieldId, dispatch],
  )

  const handlePatchBilingualField = useCallback(
    (
      fieldId: string,
      patch: Readonly<{
        labelEn?: string
        labelGu?: string
        helpEn?: string
        helpGu?: string
        errorEn?: string
        errorGu?: string
      }>,
    ) => {
      dispatch({ type: 'patchFieldBilingual', fieldId, patch })
    },
    [dispatch],
  )

  const handleApplyBilingualField = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'applyFieldBilingual', fieldId })
    },
    [dispatch],
  )

  const handleCancelBilingualField = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'cancelFieldBilingual', fieldId })
    },
    [dispatch],
  )

  const handlePatchStep = useCallback(
    (stepId: string, patch: Readonly<Partial<{ labelEn: string; labelGu: string }>>) => {
      dispatch({ type: 'patchStepEditorDraft', stepId, patch })
    },
    [dispatch],
  )

  const handleApplyStep = useCallback(
    (stepId: string) => {
      dispatch({ type: 'applyStepBilingual', stepId })
    },
    [dispatch],
  )

  const handleCancelStep = useCallback(
    (stepId: string) => {
      dispatch({ type: 'cancelStepBilingual', stepId })
    },
    [dispatch],
  )

  const handlePatchBinding = useCallback(
    (fieldId: string, patch: Partial<{ cafAttribute: string; confidenceMin: string }>) => {
      dispatch({ type: 'patchBindingDraft', fieldId, patch })
    },
    [dispatch],
  )

  const handleApplyBinding = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'applyBindingDraft', fieldId })
    },
    [dispatch],
  )

  const handleCancelBinding = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'cancelBindingDraft', fieldId })
    },
    [dispatch],
  )

  const handleRemoveBinding = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'removeBinding', fieldId })
    },
    [dispatch],
  )

  const handleEnsureIntegrationDraft = useCallback(() => {
    dispatch({ type: 'ensureIntegrationBindingDraft' })
  }, [dispatch])

  const handleAddIntegrationRow = useCallback(() => {
    dispatch({ type: 'addIntegrationBindingRow' })
  }, [dispatch])

  const handlePatchIntegrationRow = useCallback(
    (rowKey: string, patch: Partial<Omit<IntegrationBindingDraftRow, 'rowKey'>>) => {
      dispatch({ type: 'patchIntegrationBindingRow', rowKey, patch })
    },
    [dispatch],
  )

  const handleRemoveIntegrationRow = useCallback(
    (rowKey: string) => {
      dispatch({ type: 'removeIntegrationBindingRow', rowKey })
    },
    [dispatch],
  )

  const handleApplyIntegration = useCallback(() => {
    dispatch({ type: 'applyIntegrationBindingDraft' })
  }, [dispatch])

  const handleCancelIntegration = useCallback(() => {
    dispatch({ type: 'cancelIntegrationBindingDraft' })
  }, [dispatch])

  const handleEnsureWorkflowDraft = useCallback(() => {
    dispatch({ type: 'ensureWorkflowBindingDraft' })
  }, [dispatch])

  const handleAddWorkflowRow = useCallback(() => {
    dispatch({ type: 'addWorkflowBindingRow' })
  }, [dispatch])

  const handlePatchWorkflowRow = useCallback(
    (rowKey: string, patch: Partial<Omit<WorkflowBindingDraftRow, 'rowKey'>>) => {
      dispatch({ type: 'patchWorkflowBindingRow', rowKey, patch })
    },
    [dispatch],
  )

  const handleRemoveWorkflowRow = useCallback(
    (rowKey: string) => {
      dispatch({ type: 'removeWorkflowBindingRow', rowKey })
    },
    [dispatch],
  )

  const handleApplyWorkflow = useCallback(() => {
    dispatch({ type: 'applyWorkflowBindingDraft' })
  }, [dispatch])

  const handleCancelWorkflow = useCallback(() => {
    dispatch({ type: 'cancelWorkflowBindingDraft' })
  }, [dispatch])

  const handleEnableProgressive = useCallback(() => {
    dispatch({ type: 'enableProgressiveSteps' })
  }, [dispatch])

  const handleSplitAfterField = useCallback(
    (stepId: string, fieldId: string) => {
      dispatch({ type: 'splitStepAfterField', stepId, fieldId })
    },
    [dispatch],
  )

  const handleMoveBoundary = useCallback(
    (previousStepId: string, direction: 'earlier' | 'later') => {
      dispatch({ type: 'moveStepBoundary', previousStepId, direction })
    },
    [dispatch],
  )

  const handleMergeBoundary = useCallback(
    (previousStepId: string) => {
      dispatch({ type: 'mergeStepBoundary', previousStepId })
    },
    [dispatch],
  )

  const handleClearStepsAlert = useCallback(() => {
    dispatch({ type: 'clearStepsActionAlert' })
  }, [dispatch])

  const handleEditStepLabels = useCallback(
    (stepId: string) => {
      setActiveTab('bilingual')
      dispatch({ type: 'focusBilingualStep', stepId })
    },
    [dispatch],
  )

  const rootClass =
    locale === 'gu'
      ? 'dg20-form-widgets dg20-locale-gu dg20-builder-app'
      : 'dg20-form-widgets dg20-builder-app'

  return (
    <div className={rootClass} lang={locale === 'gu' ? 'gu' : 'en'}>
      <p
        key={uiState.announcement ? `announce-${uiState.announcement.id}` : 'announce-idle'}
        className="dg20-builder-visually-hidden"
        role={announcementIsAlert ? 'alert' : 'status'}
        aria-live={announcementIsAlert ? 'assertive' : 'polite'}
        aria-atomic="true"
        data-announcement-id={uiState.announcement?.id ?? undefined}
      >
        {announcementText}
      </p>

      {uiState.pendingConfiguredAdd !== null && (
        <ConfiguredAddDialog
          locale={locale}
          pending={uiState.pendingConfiguredAdd}
          focusRequest={uiState.pendingFocusConfiguredAdd}
          onPatch={handleConfiguredAddPatch}
          onConfirm={handleConfiguredAddConfirm}
          onCancel={handleConfiguredAddCancel}
        />
      )}

      {uiState.pendingStructuralAdd !== null && (
        <PageBreakDialog
          locale={locale}
          pending={uiState.pendingStructuralAdd}
          options={pageBreakBoundaryOptions}
          focusRequest={uiState.pendingFocusStructuralAdd}
          onPatch={handlePageBreakAddPatch}
          onConfirm={handlePageBreakAddConfirm}
          onCancel={handlePageBreakAddCancel}
        />
      )}
      {lifecycleView.showConfirmation && (
        <SubmitConfirmDialog
          locale={locale}
          serviceId={authoringState.definition.serviceId}
          version={authoringState.definition.version}
          warningCount={lifecycleView.advisoryWarningCount}
          infoCount={lifecycleView.advisoryInfoCount}
          onConfirm={confirmSubmit}
          onCancel={cancelSubmitConfirmation}
        />
      )}
      {versionsView.showCloneConfirmation && versionsView.cloneSource !== null && (
        <CloneVersionConfirmDialog
          locale={locale}
          serviceId={versionsView.cloneSource.serviceId}
          sourceVersion={versionsView.cloneSource.version}
          sourceStatus={versionsView.cloneSource.status}
          canConfirm={versionsView.canConfirmClone}
          onConfirm={confirmClone}
          onCancel={cancelCloneConfirmation}
        />
      )}

      <div
        className="dg20-builder-shell-content"
        {...(uiState.pendingConfiguredAdd !== null ||
        uiState.pendingStructuralAdd !== null ||
        lifecycleView.showConfirmation ||
        versionsView.showCloneConfirmation
          ? { inert: true }
          : {})}
      >
        <a className="dg20-builder-skip-link" href="#dg20-builder-main">
          {builderMessage(locale, 'skipToMain')}
        </a>

        <BuilderHeader
          locale={locale}
          onLocaleChange={(next) => {
            if (hasActiveCanvasReorderGesture(uiState)) {
              dispatch({ type: 'cancelCanvasReorder' })
            }
            setLocale(next)
          }}
          definition={authoringState.definition}
          binding={persistenceView.binding}
          definitionDirty={persistenceView.definitionDirty}
          onOpenVersionHistory={openVersionHistory}
        />

        <main id="dg20-builder-main" className="dg20-builder-main">
          {versionsView.panelOpen && (
            <VersionHistoryPanel
              locale={locale}
              serviceIdInput={versionsView.serviceIdInput}
              items={versionsView.items}
              listBusy={versionsView.listBusy}
              canLoadMore={versionsView.canLoadMore}
              canRetry={versionsView.canRetry}
              failureKind={versionsView.failureKind}
              missingActorGuidance={versionsView.missingActorGuidance}
              onServiceIdChange={setVersionServiceIdInput}
              onLoad={loadVersions}
              onLoadMore={loadMoreVersions}
              onRetry={retryVersionFailure}
              onClose={closeVersionHistory}
              onOpenDraft={openDraftVersion}
              onCreateDraft={beginClone}
            />
          )}
          <div className="dg20-builder-grid">
            <PalettePane
              locale={locale}
              onAddWidget={handleAddWidget}
              canCreatePageBreak={canCreatePageBreak}
              readOnly={authoringReadOnly || canvasReorderActive}
              pageBreakDisabledReason={builderMessage(locale, 'pageBreakNoBoundaryGuidance')}
            />

            <div className="dg20-builder-centre">
              <div className="dg20-builder-pane dg20-builder-centre__canvas-block">
                {projection.ok ? (
                  <CanvasPane
                    locale={locale}
                    rows={rows}
                    selectedFieldId={authoringState.selectedFieldId}
                    dirtyFieldIds={dirtyFieldIds}
                    readOnly={authoringReadOnly}
                    gesture={uiState.canvasReorderGesture}
                    reorderTargets={canvasReorderTargets}
                    onSelectField={handleSelectField}
                    onBeginReorder={(fieldId, mode) =>
                      dispatch({ type: 'beginCanvasReorder', fieldId, mode })
                    }
                    onProposeReorder={(beforeFieldId) =>
                      dispatch({ type: 'proposeCanvasReorder', beforeFieldId })
                    }
                    onCommitReorder={() => dispatch({ type: 'commitCanvasReorder' })}
                    onCancelReorder={() => dispatch({ type: 'cancelCanvasReorder' })}
                  />
                ) : (
                  <section
                    className="dg20-builder-canvas dg20-builder-canvas--error"
                    aria-labelledby="dg20-builder-canvas-heading"
                  >
                    <h2 id="dg20-builder-canvas-heading" className="dg20-builder-pane__title">
                      {builderMessage(locale, 'canvasHeading')}
                    </h2>
                    <p role="alert" className="dg20-builder-canvas__error">
                      <strong>{builderMessage(locale, 'canvasErrorHeading')}</strong>
                      <br />
                      {builderMessage(locale, 'canvasErrorBody')}
                    </p>
                  </section>
                )}
                <FieldInspector
                  locale={locale}
                  row={selectedRow}
                  readOnly={authoringReadOnly}
                  canMoveUp={moveCapability.canMoveUp}
                  canMoveDown={moveCapability.canMoveDown}
                  canRemove={removeCapability.canRemove}
                  removeBlockingReason={removeCapability.blockingReason}
                  editorDraft={displayDraft}
                  familyRepeaterEntry={familyRepeaterEntry}
                  showValidation={
                    selectedRow?.widgetType === 'family-repeater'
                      ? (familyRepeaterEntry?.showValidation ?? false)
                      : (editorEntry?.propertyShowValidation ?? false)
                  }
                  showStaleGuidance={
                    selectedRow?.widgetType === 'family-repeater'
                      ? (familyRepeaterEntry?.showStaleGuidance ?? false)
                      : (editorEntry?.propertyShowStaleGuidance ?? false)
                  }
                  overallFieldDirty={overallFieldDirty}
                  propertyDirty={effectivePropertyDirty}
                  bilingualOnlyPending={bilingualOnlyPending}
                  previewWarning={previewWarning}
                  onMoveUp={() => {
                    if (authoringState.selectedFieldId !== null) {
                      handleMoveField(authoringState.selectedFieldId, 'up')
                    }
                  }}
                  onMoveDown={() => {
                    if (authoringState.selectedFieldId !== null) {
                      handleMoveField(authoringState.selectedFieldId, 'down')
                    }
                  }}
                  onRemove={() => {
                    if (authoringState.selectedFieldId !== null) {
                      handleRemoveField(authoringState.selectedFieldId)
                    }
                  }}
                  onPatchDraft={handlePatchDraft}
                  onApplyDraft={handleApplyDraft}
                  onCancelDraft={handleCancelDraft}
                  onPatchFamilyRepeater={handlePatchFamilyRepeater}
                  onApplyFamilyRepeater={handleApplyFamilyRepeater}
                  onCancelFamilyRepeater={handleCancelFamilyRepeater}
                  onAddFamilyMember={handleAddFamilyMember}
                  onRemoveFamilyMember={handleRemoveFamilyMember}
                  onMoveFamilyMember={handleMoveFamilyMember}
                />
              </div>
              <div className="dg20-builder-centre__footer">
                <BuilderTabs
                  locale={locale}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  bindingsPanel={
                    <BindingsWorkspace
                      locale={locale}
                      uiState={uiState}
                      readOnly={authoringReadOnly}
                      onPatch={handlePatchBinding}
                      onApply={handleApplyBinding}
                      onCancel={handleCancelBinding}
                      onRemove={handleRemoveBinding}
                      onEnsureIntegrationDraft={handleEnsureIntegrationDraft}
                      onAddIntegrationRow={handleAddIntegrationRow}
                      onPatchIntegrationRow={handlePatchIntegrationRow}
                      onRemoveIntegrationRow={handleRemoveIntegrationRow}
                      onApplyIntegration={handleApplyIntegration}
                      onCancelIntegration={handleCancelIntegration}
                      onEnsureWorkflowDraft={handleEnsureWorkflowDraft}
                      onAddWorkflowRow={handleAddWorkflowRow}
                      onPatchWorkflowRow={handlePatchWorkflowRow}
                      onRemoveWorkflowRow={handleRemoveWorkflowRow}
                      onApplyWorkflow={handleApplyWorkflow}
                      onCancelWorkflow={handleCancelWorkflow}
                    />
                  }
                  bilingualPanel={
                    <BilingualWorkspace
                      locale={locale}
                      uiState={uiState}
                      onPatchField={handlePatchBilingualField}
                      onApplyField={handleApplyBilingualField}
                      onCancelField={handleCancelBilingualField}
                      onPatchStep={handlePatchStep}
                      onApplyStep={handleApplyStep}
                      onCancelStep={handleCancelStep}
                    />
                  }
                  stepsPanel={
                    <StepsWorkspace
                      locale={locale}
                      uiState={uiState}
                      onEnableProgressive={handleEnableProgressive}
                      onSplitAfterField={handleSplitAfterField}
                      onMoveBoundary={handleMoveBoundary}
                      onMergeBoundary={handleMergeBoundary}
                      onEditStepLabels={handleEditStepLabels}
                      onClearAlert={handleClearStepsAlert}
                    />
                  }
                />
                <BuilderActions
                  locale={locale}
                  validation={validationView}
                  persistence={persistenceView}
                  lifecycle={lifecycleView}
                  definitionStatus={authoringState.definition.status}
                  onValidate={runValidation}
                  onSaveDraft={saveDraft}
                  onLoad={requestLoad}
                  onConfirmDiscard={confirmDiscardAndLoad}
                  onCancelDiscard={cancelDiscardConfirmation}
                  onPersistRetry={retryLastFailure}
                  onSubmit={requestSubmit}
                  onSubmitRetry={retrySubmit}
                  summaryRef={validationSummaryRef}
                  persistSummaryRef={persistSummaryRef}
                  lifecycleSummaryRef={lifecycleSummaryRef}
                />
              </div>
            </div>

            <PreviewPane
              locale={locale}
              definition={authoringState.definition}
              formData={authoringState.previewFormData}
              onFormDataChange={handleFormDataChange}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
