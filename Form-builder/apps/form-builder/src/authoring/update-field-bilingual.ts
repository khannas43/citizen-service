import type { FormDefinition } from '@dg20/form-contract'

import type { FieldBilingualContent } from './bilingual-types.js'
import { isFieldBilingualDirty, readFieldBilingualContent } from './bilingual-types.js'
import { cloneJsonSafeObject } from './clone.js'
import { assertDefinitionIntegrity } from './integrity.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'
import { validateFieldBilingualDraft } from './validate-field-bilingual.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function writeOptionalPair(
  bucket: Readonly<Record<string, { en: string; gu: string }>>,
  fieldId: string,
  en: string,
  gu: string,
): Record<string, { en: string; gu: string }> {
  const next: Record<string, { en: string; gu: string }> = { ...bucket }
  if (en.length === 0 && gu.length === 0) {
    delete next[fieldId]
  } else {
    next[fieldId] = { en, gu }
  }
  return next
}

/**
 * Apply validated bilingual field content only (labels / help / errors).
 * Does not mutate schema constraints, bindings, audit, or preview values.
 * Uses a genuine bilingual baseline for `stale_editor_draft` (FB-D3).
 */
export function updateFieldBilingualContent(
  state: BuilderAuthoringState,
  fieldId: string,
  content: FieldBilingualContent,
  expectedBaseline: FieldBilingualContent,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (content.fieldId !== fieldId || expectedBaseline.fieldId !== fieldId) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Bilingual content fieldId does not match Apply target',
      ),
    }
  }

  const validation = validateFieldBilingualDraft(content)
  if (!validation.ok) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        `Field bilingual content is invalid: ${validation.issues.map((i) => i.code).join(', ')}`,
      ),
    }
  }

  let committed: FieldBilingualContent
  try {
    committed = readFieldBilingualContent(state.definition, fieldId)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (committed.widgetType !== expectedBaseline.widgetType) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_widget_mismatch',
        'Bilingual update widgetType does not match provenance',
      ),
    }
  }

  if (isFieldBilingualDirty(committed, expectedBaseline)) {
    return {
      ok: false,
      error: new AuthoringError(
        'stale_editor_draft',
        'Committed bilingual content changed since this editor draft was opened',
      ),
    }
  }

  if (committed.widgetType !== validation.content.widgetType) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_widget_mismatch',
        'Bilingual update widgetType does not match provenance',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition

  const properties = nextDefinition.jsonSchema['properties']
  const isRootField =
    isPlainObject(properties) && Object.prototype.hasOwnProperty.call(properties, fieldId)
  const provenance = nextDefinition.meta.paletteProvenance.find(
    (entry) => entry.fieldId === fieldId,
  )
  if (!provenance) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
    }
  }
  if (!isRootField) {
    // Nested family-repeater member: provenance is sufficient (no root property).
  } else if (!isPlainObject(properties) || !(fieldId in properties)) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
    }
  }

  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      bilingual: {
        ...nextDefinition.meta.bilingual,
        labels: {
          ...nextDefinition.meta.bilingual.labels,
          [fieldId]: {
            en: validation.content.labelEn,
            gu: validation.content.labelGu,
          },
        },
        help: writeOptionalPair(
          nextDefinition.meta.bilingual.help,
          fieldId,
          validation.content.helpEn,
          validation.content.helpGu,
        ),
        errors: writeOptionalPair(
          nextDefinition.meta.bilingual.errors,
          fieldId,
          validation.content.errorEn,
          validation.content.errorGu,
        ),
      },
    },
  }

  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceChangesApplied',
    announcementVars: { label: validation.content.labelEn },
  }
}
