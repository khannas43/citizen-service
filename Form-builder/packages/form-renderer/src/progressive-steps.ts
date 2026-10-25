import type { ProgressiveStep } from '@citizen/form-contract'
import type { ErrorSchema, RJSFSchema, UiSchema } from '@rjsf/utils'

/**
 * FB-B1 progressive plan construction and step schema/uiSchema derivation.
 *
 * Validation split (documented contract):
 * - Field-local constraints on the current step schema are checked on Next.
 * - Original full-schema constraints (including cross-step rules) are checked on Finish.
 * - Cross-step conditionals/dependencies are therefore authoritative at final validation
 *   and are intentionally omitted from per-step schemas so absent future fields do not
 *   fail intermediate Next actions.
 */

export type ProgressivePlanFailureReason =
  | 'steps_not_array'
  | 'duplicate_step_id'
  | 'blank_step_id'
  | 'blank_step_label'
  | 'empty_field_ids'
  | 'blank_field_id'
  | 'duplicate_field_id_in_step'
  | 'unknown_field'
  | 'field_in_multiple_steps'
  | 'unassigned_root_field'
  | 'nested_path_field_id'
  | 'missing_root_properties'
  | 'step_schema_compile_failed'

export type ProgressivePlanResult =
  | { readonly ok: true; readonly plan: ProgressivePlan }
  | {
      readonly ok: false
      readonly reason: ProgressivePlanFailureReason
      readonly detail?: string
    }

export type ProgressivePlan =
  | { readonly kind: 'single_page' }
  | { readonly kind: 'progressive'; readonly steps: readonly ProgressiveStepPlan[] }

export interface ProgressiveStepPlan {
  readonly stepId: string
  readonly labelEn: string
  readonly labelGu: string
  readonly fieldIds: readonly string[]
  /** Immutable derived JSON Schema 2020-12 object schema for this step. */
  readonly schema: RJSFSchema
  /** Immutable derived uiSchema for this step. */
  readonly uiSchema: UiSchema
}

/** Only approved top-level uiSchema presentation directive for derived step schemas. */
export const APPROVED_STEP_UI_ROOT_DIRECTIVES = ['ui:order'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function fail(reason: ProgressivePlanFailureReason, detail?: string): ProgressivePlanResult {
  return detail === undefined ? { ok: false, reason } : { ok: false, reason, detail }
}

/** Root property keys from jsonSchema.properties (top-level only). */
export function listRootPropertyKeys(jsonSchema: object): readonly string[] {
  if (!isPlainObject(jsonSchema)) {
    return []
  }
  const properties = jsonSchema.properties
  if (!isPlainObject(properties)) {
    return []
  }
  return Object.keys(properties)
}

/**
 * Builds an immutable per-step schema from the root schema.
 * Retains complete root `$defs` / `definitions` bags (transitive local refs safe).
 * Does not copy root if/then/else, dependencies, dependentRequired, allOf/anyOf/oneOf
 * that would incorrectly require fields from other steps.
 */
export function deriveStepSchema(rootSchema: object, fieldIds: readonly string[]): RJSFSchema {
  const root = rootSchema as Record<string, unknown>
  const properties = isPlainObject(root.properties) ? root.properties : {}
  const stepProperties: Record<string, unknown> = {}
  for (const fieldId of fieldIds) {
    if (Object.prototype.hasOwnProperty.call(properties, fieldId)) {
      stepProperties[fieldId] = properties[fieldId]
    }
  }

  const rootRequired = Array.isArray(root.required)
    ? root.required.filter((item): item is string => typeof item === 'string')
    : []
  const stepRequired = rootRequired.filter((id) => fieldIds.includes(id))

  const derived: Record<string, unknown> = {
    $schema:
      typeof root.$schema === 'string'
        ? root.$schema
        : 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: stepProperties,
  }

  if (stepRequired.length > 0) {
    derived.required = stepRequired
  }

  if (typeof root.additionalProperties === 'boolean' || isPlainObject(root.additionalProperties)) {
    derived.additionalProperties = root.additionalProperties
  }
  if (
    typeof root.unevaluatedProperties === 'boolean' ||
    isPlainObject(root.unevaluatedProperties)
  ) {
    derived.unevaluatedProperties = root.unevaluatedProperties
  }

  // Retain complete local definition bags so A→B transitive and cross-bag refs resolve.
  // Unused definitions are inert; bags are not mutated.
  if (isPlainObject(root.$defs)) {
    derived.$defs = root.$defs
  }
  if (isPlainObject(root.definitions)) {
    derived.definitions = root.definitions
  }

  return Object.freeze(derived) as RJSFSchema
}

/**
 * Normalizes a filtered ui:order for one step:
 * - drops non-strings / unknown fields
 * - dedupes field names
 * - at most one `*`
 * - without wildcard, appends every missing current-step field once
 * - never includes other-step fields
 */
export function normalizeStepUiOrder(
  order: unknown,
  fieldIds: readonly string[],
): readonly string[] {
  const fieldSet = new Set(fieldIds)
  const result: string[] = []
  const seenFields = new Set<string>()
  let hasWildcard = false

  if (Array.isArray(order)) {
    for (const entry of order) {
      if (typeof entry !== 'string') {
        continue
      }
      if (entry === '*') {
        if (!hasWildcard) {
          result.push('*')
          hasWildcard = true
        }
        continue
      }
      if (!fieldSet.has(entry) || seenFields.has(entry)) {
        continue
      }
      seenFields.add(entry)
      result.push(entry)
    }
  }

  if (!hasWildcard) {
    for (const fieldId of fieldIds) {
      if (!seenFields.has(fieldId)) {
        seenFields.add(fieldId)
        result.push(fieldId)
      }
    }
  }

  return Object.freeze(result)
}

/**
 * Derives an immutable per-step uiSchema.
 * Root: only approved presentation directives (currently `ui:order`).
 * Field-level entries for current step fields are preserved.
 */
export function deriveStepUiSchema(rootUiSchema: object, fieldIds: readonly string[]): UiSchema {
  const root = rootUiSchema as Record<string, unknown>
  const fieldSet = new Set(fieldIds)
  const derived: Record<string, unknown> = {}

  for (const directive of APPROVED_STEP_UI_ROOT_DIRECTIVES) {
    if (directive === 'ui:order' && fieldIds.length > 0) {
      derived['ui:order'] = normalizeStepUiOrder(root['ui:order'], fieldIds)
    }
  }

  for (const [key, value] of Object.entries(root)) {
    if (key.startsWith('ui:')) {
      // Strict allow-list only — arbitrary root ui:* keys are dropped.
      continue
    }
    if (fieldSet.has(key)) {
      derived[key] = value
    }
  }

  return Object.freeze(derived) as UiSchema
}

/**
 * Builds a progressive plan from schema + uiSchema + progressiveSteps.
 * Empty progressiveSteps → single-page plan (FB-B0.1 behavior).
 */
export function buildProgressivePlan(input: {
  readonly jsonSchema: object
  readonly uiSchema: object
  readonly progressiveSteps: unknown
}): ProgressivePlanResult {
  const { jsonSchema, uiSchema, progressiveSteps } = input

  if (progressiveSteps === undefined || progressiveSteps === null) {
    return { ok: true, plan: { kind: 'single_page' } }
  }
  if (!Array.isArray(progressiveSteps)) {
    return fail('steps_not_array')
  }
  if (progressiveSteps.length === 0) {
    return { ok: true, plan: { kind: 'single_page' } }
  }

  const rootKeys = listRootPropertyKeys(jsonSchema)
  if (rootKeys.length === 0) {
    return fail('missing_root_properties')
  }
  const rootKeySet = new Set(rootKeys)
  const seenStepIds = new Set<string>()
  const assignedFields = new Map<string, string>()
  const steps: ProgressiveStepPlan[] = []

  for (const raw of progressiveSteps) {
    if (!isPlainObject(raw)) {
      return fail('blank_step_id')
    }
    if (!isNonBlankString(raw.stepId)) {
      return fail('blank_step_id')
    }
    const stepId = raw.stepId.trim()
    if (seenStepIds.has(stepId)) {
      return fail('duplicate_step_id', stepId)
    }
    seenStepIds.add(stepId)

    if (!isNonBlankString(raw.labelEn) || !isNonBlankString(raw.labelGu)) {
      return fail('blank_step_label', stepId)
    }

    if (!Array.isArray(raw.fieldIds) || raw.fieldIds.length === 0) {
      return fail('empty_field_ids', stepId)
    }

    const fieldIds: string[] = []
    const seenInStep = new Set<string>()
    for (const fieldIdRaw of raw.fieldIds) {
      if (!isNonBlankString(fieldIdRaw)) {
        return fail('blank_field_id', stepId)
      }
      const fieldId = fieldIdRaw.trim()
      if (fieldId.includes('.') || fieldId.includes('/') || fieldId.includes('[')) {
        return fail('nested_path_field_id', fieldId)
      }
      if (seenInStep.has(fieldId)) {
        return fail('duplicate_field_id_in_step', fieldId)
      }
      seenInStep.add(fieldId)
      if (!rootKeySet.has(fieldId)) {
        return fail('unknown_field', fieldId)
      }
      const prior = assignedFields.get(fieldId)
      if (prior !== undefined) {
        return fail('field_in_multiple_steps', fieldId)
      }
      assignedFields.set(fieldId, stepId)
      fieldIds.push(fieldId)
    }

    const schema = deriveStepSchema(jsonSchema, fieldIds)
    const stepUi = deriveStepUiSchema(uiSchema, fieldIds)
    steps.push(
      Object.freeze({
        stepId,
        labelEn: raw.labelEn.trim(),
        labelGu: raw.labelGu.trim(),
        fieldIds: Object.freeze([...fieldIds]),
        schema,
        uiSchema: stepUi,
      }),
    )
  }

  for (const key of rootKeys) {
    if (!assignedFields.has(key)) {
      return fail('unassigned_root_field', key)
    }
  }

  return {
    ok: true,
    plan: Object.freeze({
      kind: 'progressive' as const,
      steps: Object.freeze(steps),
    }),
  }
}

/** Picks only the given step's fields from complete form data. */
export function pickStepFormData(
  complete: Readonly<Record<string, unknown>>,
  fieldIds: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const fieldId of fieldIds) {
    if (Object.prototype.hasOwnProperty.call(complete, fieldId)) {
      out[fieldId] = complete[fieldId]
    }
  }
  return out
}

/**
 * Merges step form emissions into complete application data.
 * - Only allowed step field IDs are written
 * - Cleared/absent step fields are removed from complete data
 * - Unexpected keys from the step form are ignored
 * - Other steps' fields are preserved
 */
export function mergeStepFormData(
  complete: Readonly<Record<string, unknown>>,
  fieldIds: readonly string[],
  stepData: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...complete }
  for (const fieldId of fieldIds) {
    delete next[fieldId]
  }
  for (const fieldId of fieldIds) {
    if (!Object.prototype.hasOwnProperty.call(stepData, fieldId)) {
      continue
    }
    const value = stepData[fieldId]
    if (value === undefined) {
      continue
    }
    next[fieldId] = value
  }
  return next
}

/**
 * Maps a full-schema ErrorSchema / error property path to the earliest step index
 * containing that top-level field. Root/unmapped errors → 0.
 */
export function earliestStepIndexForErrors(
  steps: readonly ProgressiveStepPlan[],
  errorSchema: ErrorSchema | undefined,
  errorPropertyNames: readonly string[],
): number {
  if (steps.length === 0) {
    return 0
  }
  const fieldToIndex = new Map<string, number>()
  steps.forEach((step, index) => {
    for (const fieldId of step.fieldIds) {
      fieldToIndex.set(fieldId, index)
    }
  })

  let earliest = Number.POSITIVE_INFINITY

  if (errorSchema && typeof errorSchema === 'object') {
    for (const key of Object.keys(errorSchema)) {
      if (key === '__errors') {
        continue
      }
      const index = fieldToIndex.get(key)
      if (index !== undefined && index < earliest) {
        earliest = index
      }
    }
  }

  for (const name of errorPropertyNames) {
    const top = name.replace(/^\./, '').split(/[./[]/)[0]
    if (!top) {
      continue
    }
    const index = fieldToIndex.get(top)
    if (index !== undefined && index < earliest) {
      earliest = index
    }
  }

  if (!Number.isFinite(earliest)) {
    return 0
  }
  return earliest
}

/** Filters a full ErrorSchema down to fields belonging to one step. */
export function filterErrorSchemaForStep(
  errorSchema: ErrorSchema | undefined,
  fieldIds: readonly string[],
): ErrorSchema | undefined {
  if (!errorSchema || typeof errorSchema !== 'object') {
    return undefined
  }
  const fieldSet = new Set(fieldIds)
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(errorSchema as Record<string, unknown>)) {
    if (key === '__errors') {
      continue
    }
    if (fieldSet.has(key)) {
      filtered[key] = value
    }
  }
  return Object.keys(filtered).length > 0 ? (filtered as ErrorSchema) : undefined
}

/** Narrow type guard for ProgressiveStep[] from FormDefinition meta. */
export function asProgressiveSteps(value: unknown): readonly ProgressiveStep[] {
  return Array.isArray(value) ? (value as readonly ProgressiveStep[]) : []
}
