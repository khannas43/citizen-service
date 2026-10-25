import type { FormDefinition, FormStatus } from '@citizen/form-contract'
import { isFormStatus } from '@citizen/form-contract'

import type {
  FormDefinitionAdmissionReason,
  FormDefinitionAdmissionResult,
  FormRendererMode,
} from './renderer-types.js'
import { buildProgressivePlan } from './progressive-steps.js'
import { tryCompileFormSchema } from './validator-2020.js'

/** Canonical JSON Schema Draft 2020-12 dialect URIs (trailing # optional). */
const SCHEMA_2020_12_URIS = new Set([
  'https://json-schema.org/draft/2020-12/schema',
  'https://json-schema.org/draft/2020-12/schema#',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isLocalizedPair(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false
  }
  return typeof value.en === 'string' && typeof value.gu === 'string'
}

function isSafeBilingualMap(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false
  }
  for (const entry of Object.values(value)) {
    if (!isLocalizedPair(entry)) {
      return false
    }
  }
  return true
}

/**
 * Lightweight structural safety for meta handed to WidgetRuntimeProvider.
 * Not Unit C bilingual-completeness or binding-integrity validation.
 */
function isSafeMeta(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false
  }
  const bilingual = value.bilingual
  if (!isPlainObject(bilingual)) {
    return false
  }
  if (
    !isSafeBilingualMap(bilingual.labels) ||
    !isSafeBilingualMap(bilingual.help) ||
    !isSafeBilingualMap(bilingual.errors)
  ) {
    return false
  }
  const prefillBindings = value.prefillBindings
  if (!Array.isArray(prefillBindings)) {
    return false
  }
  for (const binding of prefillBindings) {
    if (!isPlainObject(binding)) {
      return false
    }
    if (
      !isNonBlankString(binding.fieldId) ||
      !isNonBlankString(binding.cafAttribute) ||
      typeof binding.confidenceMin !== 'number' ||
      !Number.isFinite(binding.confidenceMin)
    ) {
      return false
    }
  }
  // Remaining meta arrays must at least be arrays if present (tolerant for FB-B0).
  for (const key of [
    'paletteProvenance',
    'integrationBindings',
    'workflowBindings',
    'progressiveSteps',
  ] as const) {
    if (value[key] !== undefined && !Array.isArray(value[key])) {
      return false
    }
  }
  return true
}

function publicKeyForReason(
  reason: FormDefinitionAdmissionReason,
): 'formUnpublished' | 'formUnavailable' {
  if (reason === 'citizen_status_not_published') {
    return 'formUnpublished'
  }
  return 'formUnavailable'
}

function fail(reason: FormDefinitionAdmissionReason): FormDefinitionAdmissionResult {
  return {
    ok: false,
    reason,
    publicReasonKey: publicKeyForReason(reason),
  }
}

export interface AdmitFormDefinitionOptions {
  readonly mode: FormRendererMode
}

/**
 * Pure Form Definition admission for renderer safety only.
 * Does not run Unit C five-stage governance, does not silently repair input.
 */
export function admitFormDefinition(
  input: unknown,
  options: AdmitFormDefinitionOptions,
): FormDefinitionAdmissionResult {
  if (!isPlainObject(input)) {
    return fail('not_object')
  }

  if (!isNonBlankString(input.serviceId)) {
    return fail('missing_service_id')
  }

  if (!isPositiveSafeInteger(input.version)) {
    return fail('invalid_version')
  }

  if (typeof input.status !== 'string' || !isFormStatus(input.status)) {
    return fail('unrecognized_status')
  }

  const status: FormStatus = input.status
  if (options.mode === 'citizen' && status !== 'published') {
    return fail('citizen_status_not_published')
  }

  if (!isPlainObject(input.jsonSchema)) {
    return fail('json_schema_not_object')
  }

  if (input.jsonSchema.type !== 'object') {
    return fail('json_schema_root_not_object_type')
  }

  const dialect = input.jsonSchema.$schema
  if (typeof dialect !== 'string' || !SCHEMA_2020_12_URIS.has(dialect)) {
    return fail('unsupported_schema_dialect')
  }

  if (!isPlainObject(input.uiSchema)) {
    return fail('ui_schema_invalid')
  }

  if (!isSafeMeta(input.meta)) {
    return fail('meta_unsafe')
  }

  if (!isPlainObject(input.audit)) {
    // audit is required by FormDefinition; treat missing/unsafe as unavailable
    return fail('meta_unsafe')
  }

  const compile = tryCompileFormSchema(input.jsonSchema)
  if (!compile.ok) {
    return fail('schema_compile_failed')
  }

  const meta = input.meta as Record<string, unknown>
  const progressivePlan = buildProgressivePlan({
    jsonSchema: input.jsonSchema,
    uiSchema: input.uiSchema,
    progressiveSteps: meta.progressiveSteps,
  })
  if (!progressivePlan.ok) {
    return fail('progressive_steps_invalid')
  }

  // Compile every derived step schema before render — avoid late RJSF crashes.
  if (progressivePlan.plan.kind === 'progressive') {
    for (const step of progressivePlan.plan.steps) {
      const stepCompile = tryCompileFormSchema(step.schema)
      if (!stepCompile.ok) {
        return fail('progressive_steps_invalid')
      }
    }
  }

  return {
    ok: true,
    definition: input as unknown as FormDefinition,
    plan: progressivePlan.plan,
  }
}
