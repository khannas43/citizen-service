import Ajv2020 from 'ajv/dist/2020.js'
import { customizeValidator } from '@rjsf/validator-ajv8'
import type { RJSFSchema, ValidatorType } from '@rjsf/utils'

/**
 * Creates an RJSF validator backed by Ajv2020 for JSON Schema Draft 2020-12.
 *
 * The default `@rjsf/validator-ajv8` singleton uses the normal Ajv class, which
 * does not enforce 2020-12-only keywords such as `unevaluatedProperties`.
 *
 * Remote schema loading is not configured. Unknown keywords (e.g. `x-dg20`)
 * remain allowed via Ajv `strict: false` (RJSF default override).
 */
export function createDg20FormValidator(): ValidatorType {
  return customizeValidator({
    AjvClass: Ajv2020,
    // RJSF defaults include strict:false (unknown keywords like x-dg20 allowed).
    // Do not configure loadSchema — remote $ref fetching stays disabled.
    ajvOptionsOverrides: {
      validateSchema: true,
    },
  })
}

/**
 * Schema-identity-scoped validator cache.
 * Distinct jsonSchema object references never share compiled `$id` state.
 * The same schema object reuses one validator across renders/admissions.
 */
let validatorBySchema: WeakMap<object, ValidatorType> = new WeakMap()

/**
 * Returns the Ajv2020 validator for this exact schema object identity.
 * Do not share validators across different schema objects (even if `$id` matches).
 */
export function getDg20FormValidator(schema: object): ValidatorType {
  const cached = validatorBySchema.get(schema)
  if (cached) {
    return cached
  }
  const created = createDg20FormValidator()
  validatorBySchema.set(schema, created)
  return created
}

/** Test helper: replace the WeakMap so suites can isolate cache state. */
export function resetDg20FormValidatorForTests(): void {
  validatorBySchema = new WeakMap()
}

/**
 * Attempts to compile a schema with the validator scoped to that schema object.
 * Data validity is irrelevant — only compile success matters for admission.
 */
export function tryCompileFormSchema(schema: object): {
  readonly ok: boolean
  readonly errorMessage?: string
} {
  const validator = getDg20FormValidator(schema)
  const { validationError } = validator.rawValidation(schema as RJSFSchema, {})
  if (validationError) {
    return {
      ok: false,
      errorMessage: validationError.message || 'schema compilation failed',
    }
  }
  return { ok: true }
}
