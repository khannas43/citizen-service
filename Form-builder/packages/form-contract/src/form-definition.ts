import type { JsonObject } from './json-types.js'
import type { FormStatus } from './form-status.js'

/**
 * ISO 8601 timestamp string at the Form Definition contract boundary.
 *
 * Persisted and exchanged forms use strings (e.g. `"2026-07-20T17:00:00.000Z"`),
 * never JavaScript `Date` objects. Callers may parse to Date in application
 * code; the contract itself remains JSON-serialisable.
 */
export type Iso8601DateTimeString = string

/** EN + GU pair for a single user-visible string (spec §2 meta.bilingual). */
export interface LocalizedValue {
  readonly en: string
  readonly gu: string
}

/**
 * Provenance of a field on the canvas: which palette widgetType produced it.
 * Server-side checks reject any widgetType not in the controlled palette registry.
 */
export interface PaletteProvenance {
  readonly fieldId: string
  readonly widgetType: string
}

/** Bilingual labels, help text, and error messages keyed by fieldId. */
export interface BilingualContent {
  readonly labels: Readonly<Record<string, LocalizedValue>>
  readonly help: Readonly<Record<string, LocalizedValue>>
  readonly errors: Readonly<Record<string, LocalizedValue>>
}

/** CAF / Golden Record pre-fill binding (SI-3.2.1-17). */
export interface PrefillBinding {
  readonly fieldId: string
  readonly cafAttribute: string
  readonly confidenceMin: number
}

/** Integration Hub field binding direction (spec §2). */
export type IntegrationDirection = 'in' | 'out'

/** Field value fed to / from an Integration Hub adapter. */
export interface IntegrationBinding {
  readonly fieldId: string
  readonly adapterId: string
  readonly param: string
  readonly direction: IntegrationDirection
}

/** Field surfaced at a named workflow stage (engine-agnostic opaque stage id). */
export interface WorkflowBinding {
  readonly fieldId: string
  readonly stage: string
}

/** Ordered progressive-profiling step boundary. */
export interface ProgressiveStep {
  readonly stepId: string
  readonly labelEn: string
  readonly labelGu: string
  readonly fieldIds: readonly string[]
}

/** Governance and presentation metadata on a Form Definition. */
export interface FormDefinitionMeta {
  readonly paletteProvenance: readonly PaletteProvenance[]
  readonly bilingual: BilingualContent
  readonly prefillBindings: readonly PrefillBinding[]
  readonly integrationBindings: readonly IntegrationBinding[]
  readonly workflowBindings: readonly WorkflowBinding[]
  readonly progressiveSteps: readonly ProgressiveStep[]
}

/**
 * Audit trail for Form Definition lifecycle events (spec §2).
 *
 * `createdBy` / `createdAt` are required at creation.
 * `submittedBy`, `approvedBy`, and `publishedAt` are optional until those
 * lifecycle events occur. All timestamps are ISO 8601 strings — not Date.
 */
export interface FormAudit {
  readonly createdBy: string
  readonly createdAt: Iso8601DateTimeString
  readonly submittedBy?: string
  readonly approvedBy?: string
  readonly publishedAt?: Iso8601DateTimeString
}

/**
 * Canonical Form Definition (spec §2).
 *
 * Stored as JSONB keyed by `(serviceId, version)`. Published versions are
 * immutable (DR-023). `jsonSchema` is JSON Schema Draft 2020-12; `uiSchema`
 * is RJSF uiSchema limited to widget selection and field order.
 *
 * This type is framework-agnostic: no React, RJSF runtime, database, or
 * Spring types appear here.
 */
export interface FormDefinition {
  readonly serviceId: string
  readonly version: number
  readonly status: FormStatus
  /** JSON Schema Draft 2020-12 document describing form data shape + validation. */
  readonly jsonSchema: JsonObject
  /** RJSF uiSchema — widget selection + field order only (v1). */
  readonly uiSchema: JsonObject
  readonly meta: FormDefinitionMeta
  readonly audit: FormAudit
}
