import type { FormDefinition } from '@dg20/form-contract'
import type {
  FieldIdResolver,
  WidgetMessageOverrides,
  WidgetServicePorts,
} from '@dg20/form-widgets'

import type {
  ProgressiveAutosaveAdapter,
  ProgressiveAutosaveStatusData,
} from './progressive-autosave.js'
import type { ProgressiveResumeAdapter, ProgressiveResumeStatusData } from './progressive-resume.js'
import type { ProgressivePlan } from './progressive-steps.js'

/** Host-facing render mode for the shared Form Renderer. */
export type FormRendererMode = 'citizen' | 'preview'

/** Supported renderer locales (EN / GU). */
export type FormRendererLocale = 'en' | 'gu'

/**
 * Change payload owned by the host. Contains form data only —
 * never RJSF registry, validator, DOM event, or internal objects.
 */
export interface FormRendererChangeData {
  readonly formData: Readonly<Record<string, unknown>>
}

/**
 * Validated submit payload. Form data only.
 */
export interface FormRendererSubmitData {
  readonly formData: Readonly<Record<string, unknown>>
}

/** Progressive step navigation callback payload (FB-B1). No RJSF/DOM/internal state. */
export interface FormRendererStepChangeData {
  readonly stepId: string
  readonly stepIndex: number
  readonly totalSteps: number
  readonly direction: 'next' | 'back' | 'validation_redirect'
}

/**
 * Public FormRenderer props. Deliberately excludes raw RJSF registry,
 * validator, widgets, and fields — the controlled palette is fixed.
 */
export interface FormRendererProps {
  readonly definition: FormDefinition | unknown
  readonly mode?: FormRendererMode
  readonly formData?: Readonly<Record<string, unknown>>
  readonly onChange?: (data: FormRendererChangeData) => void
  readonly onSubmit?: (data: FormRendererSubmitData) => void
  /** Optional progressive-step navigation callback (no mount emission). */
  readonly onStepChange?: (data: FormRendererStepChangeData) => void
  /**
   * Host-owned progressive autosave adapter (FB-B2).
   * Renderer never performs HTTP/storage; omit to keep B1.1 advance-on-Next.
   */
  readonly autosaveAdapter?: ProgressiveAutosaveAdapter
  /** Autosave status notifications only (never formData / errors / signals). */
  readonly onAutosaveStatusChange?: (data: ProgressiveAutosaveStatusData) => void
  /**
   * Host-owned progressive resume adapter (FB-B4).
   * Loads saved progress before mounting the active step; omit for immediate step 0.
   */
  readonly resumeAdapter?: ProgressiveResumeAdapter
  /**
   * Host-owned opaque resume context revision (FB-B4).
   * Required (valid nonblank, ≤256 trimmed chars) when resumeAdapter is present.
   * Never a citizen ID, application number, token, or credential.
   */
  readonly resumeContextRevision?: string
  /** Resume status notifications only (never formData / revision / errors / signals). */
  readonly onResumeStatusChange?: (data: ProgressiveResumeStatusData) => void
  /** Controlled locale. When set, internal locale state is unused. */
  readonly locale?: FormRendererLocale
  /** Initial locale when `locale` is omitted (uncontrolled). */
  readonly defaultLocale?: FormRendererLocale
  readonly onLocaleChange?: (locale: FormRendererLocale) => void
  /** Show EN/GU toggle. Defaults to true. */
  readonly showLocaleToggle?: boolean
  readonly disabled?: boolean
  readonly readOnly?: boolean
  readonly services?: WidgetServicePorts
  readonly messageOverrides?: WidgetMessageOverrides
  readonly resolveFieldId?: FieldIdResolver
  readonly feeContextRevision?: string
  readonly eSignContextRevision?: string
}

/** Machine-readable Form Definition admission failure reasons (renderer-safety only). */
export type FormDefinitionAdmissionReason =
  | 'not_object'
  | 'missing_service_id'
  | 'invalid_version'
  | 'unrecognized_status'
  | 'citizen_status_not_published'
  | 'json_schema_not_object'
  | 'json_schema_root_not_object_type'
  | 'unsupported_schema_dialect'
  | 'ui_schema_invalid'
  | 'meta_unsafe'
  | 'schema_compile_failed'
  | 'progressive_steps_invalid'

export type FormDefinitionAdmissionResult =
  | {
      readonly ok: true
      readonly definition: FormDefinition
      /** Validated progressive or single-page plan — reuse; do not rebuild in FormRenderer. */
      readonly plan: ProgressivePlan
    }
  | {
      readonly ok: false
      readonly reason: FormDefinitionAdmissionReason
      /** Citizen-safe; never includes schema dump or stack traces. */
      readonly publicReasonKey: FormRendererMessageKey
    }

export type FormRendererMessageKey =
  | 'localeEnglish'
  | 'localeGujarati'
  | 'localeToggleGroup'
  | 'previewBanner'
  | 'submit'
  | 'formUnavailable'
  | 'formUnpublished'
  | 'validationGuidance'
  | 'stepValidationGuidance'
  | 'fullValidationGuidance'
  | 'stepProgress'
  | 'navBack'
  | 'navNext'
  | 'stepNavLabel'
  | 'activeStepHeading'
  | 'autosaveSaving'
  | 'autosaveSaved'
  | 'autosaveFailed'
  | 'autosaveRetry'
  | 'resumeLoading'
  | 'resumeFailed'
  | 'resumeRetry'
  | 'resumeConfigUnavailable'
