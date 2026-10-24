import type { FormDefinition } from '@dg20/form-contract'
import type { PaletteWidgetDefinition, WidgetCategory } from '@dg20/form-widgets'
import { getPaletteGroup, getPaletteWidget } from '@dg20/form-widgets'

export type CanvasProjectionFailureReason =
  | 'missing_properties'
  | 'missing_ui_order'
  | 'ui_order_not_array'
  | 'ui_order_incomplete'
  | 'ui_order_unknown_key'
  | 'ui_order_duplicate'
  | 'missing_provenance'
  | 'provenance_unknown_field'
  | 'provenance_duplicate_field'
  | 'provenance_widget_mismatch'
  | 'unknown_widget_type'

export class CanvasProjectionError extends Error {
  readonly reason: CanvasProjectionFailureReason

  constructor(reason: CanvasProjectionFailureReason, message: string) {
    super(message)
    this.name = 'CanvasProjectionError'
    this.reason = reason
  }
}

export interface CanvasFieldRow {
  readonly order: number
  readonly fieldId: string
  readonly widgetType: string
  readonly category: WidgetCategory
  readonly labelEn: string
  readonly labelGu: string
  readonly required: boolean
  readonly supportsRequired: boolean
  readonly groupId: string
  readonly groupLabelEn: string
  readonly groupLabelGu: string
  readonly configurableProperties: readonly string[]
  readonly bakedInBehaviours: readonly string[]
  readonly palette: PaletteWidgetDefinition
  readonly stepId: string | null
  readonly stepLabelEn: string | null
  readonly stepLabelGu: string | null
  /** Family-repeater member field count; null for other widgets (FB-D16). */
  readonly memberCount: number | null
}

/**
 * Pure canvas projection from a FormDefinition.
 * Does not mutate the definition. Never parses DOM IDs.
 * Inconsistent mappings throw {@link CanvasProjectionError} rather than silently repairing.
 */
export function projectCanvasRows(definition: FormDefinition): readonly CanvasFieldRow[] {
  const properties = definition.jsonSchema['properties']
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new CanvasProjectionError(
      'missing_properties',
      'jsonSchema.properties must be a non-array object',
    )
  }
  const propertyKeys = Object.keys(properties as Record<string, unknown>)

  const uiOrderRaw = definition.uiSchema['ui:order']
  if (uiOrderRaw === undefined) {
    throw new CanvasProjectionError('missing_ui_order', 'uiSchema.ui:order is required')
  }
  if (!Array.isArray(uiOrderRaw)) {
    throw new CanvasProjectionError('ui_order_not_array', 'uiSchema.ui:order must be an array')
  }
  const uiOrder = uiOrderRaw.map((item, index) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new CanvasProjectionError(
        'ui_order_unknown_key',
        `ui:order[${index}] must be a non-empty string`,
      )
    }
    return item
  })

  const seenOrder = new Set<string>()
  for (const key of uiOrder) {
    if (seenOrder.has(key)) {
      throw new CanvasProjectionError('ui_order_duplicate', `Duplicate ui:order entry: ${key}`)
    }
    seenOrder.add(key)
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      throw new CanvasProjectionError(
        'ui_order_unknown_key',
        `ui:order references unknown property: ${key}`,
      )
    }
  }
  if (uiOrder.length !== propertyKeys.length) {
    throw new CanvasProjectionError(
      'ui_order_incomplete',
      'ui:order must list every root property exactly once',
    )
  }

  const provenance = definition.meta.paletteProvenance
  if (!Array.isArray(provenance) || provenance.length === 0) {
    throw new CanvasProjectionError('missing_provenance', 'meta.paletteProvenance is required')
  }

  const provenanceByField = new Map<string, string>()
  for (const entry of provenance) {
    if (provenanceByField.has(entry.fieldId)) {
      throw new CanvasProjectionError(
        'provenance_duplicate_field',
        `Duplicate palette provenance for field: ${entry.fieldId}`,
      )
    }
    provenanceByField.set(entry.fieldId, entry.widgetType)
  }

  for (const key of propertyKeys) {
    if (!provenanceByField.has(key)) {
      throw new CanvasProjectionError(
        'provenance_unknown_field',
        `Missing palette provenance for field: ${key}`,
      )
    }
  }
  for (const fieldId of provenanceByField.keys()) {
    if (Object.prototype.hasOwnProperty.call(properties, fieldId)) {
      continue
    }
    // Nested family-repeater member paths are provenance-only (not root properties).
    if (!fieldId.includes('[].')) {
      throw new CanvasProjectionError(
        'provenance_unknown_field',
        `Palette provenance references unknown field: ${fieldId}`,
      )
    }
  }

  const requiredList = Array.isArray(definition.jsonSchema['required'])
    ? (definition.jsonSchema['required'] as unknown[]).filter(
        (item): item is string => typeof item === 'string',
      )
    : []
  const requiredSet = new Set(requiredList)

  const labels = definition.meta.bilingual.labels
  const steps = definition.meta.progressiveSteps
  const stepByField = new Map<string, { stepId: string; labelEn: string; labelGu: string }>()
  for (const step of steps) {
    for (const id of step.fieldIds) {
      stepByField.set(id, {
        stepId: step.stepId,
        labelEn: step.labelEn,
        labelGu: step.labelGu,
      })
    }
  }

  return uiOrder.map((fieldId, index) => {
    const widgetType = provenanceByField.get(fieldId)
    if (widgetType === undefined) {
      throw new CanvasProjectionError(
        'provenance_unknown_field',
        `Missing palette provenance for field: ${fieldId}`,
      )
    }
    const palette = getPaletteWidget(widgetType)
    if (palette === undefined) {
      throw new CanvasProjectionError(
        'unknown_widget_type',
        `Unknown palette widget type: ${widgetType}`,
      )
    }

    const uiEntry = definition.uiSchema[fieldId]
    if (uiEntry !== null && typeof uiEntry === 'object' && !Array.isArray(uiEntry)) {
      const record = uiEntry as Record<string, unknown>
      const declared =
        typeof record['ui:widget'] === 'string'
          ? record['ui:widget']
          : typeof record['ui:field'] === 'string'
            ? record['ui:field']
            : undefined
      if (declared !== undefined && declared !== widgetType) {
        throw new CanvasProjectionError(
          'provenance_widget_mismatch',
          `uiSchema widget/field for ${fieldId} (${declared}) does not match provenance (${widgetType})`,
        )
      }
    }

    const group = getPaletteGroup(palette.groupId)
    const bilingual = labels[fieldId]
    const labelEn = bilingual?.en ?? palette.labelEn
    const labelGu = bilingual?.gu ?? palette.labelGu
    const step = stepByField.get(fieldId)

    let memberCount: number | null = null
    if (widgetType === 'family-repeater') {
      const rootSchema = (properties as Record<string, unknown>)[fieldId]
      if (rootSchema !== null && typeof rootSchema === 'object' && !Array.isArray(rootSchema)) {
        const items = (rootSchema as Record<string, unknown>)['items']
        if (items !== null && typeof items === 'object' && !Array.isArray(items)) {
          const memberProperties = (items as Record<string, unknown>)['properties']
          if (
            memberProperties !== null &&
            typeof memberProperties === 'object' &&
            !Array.isArray(memberProperties)
          ) {
            memberCount = Object.keys(memberProperties as Record<string, unknown>).length
          }
        }
      }
      if (memberCount === null) {
        memberCount = 0
      }
    }

    return {
      order: index + 1,
      fieldId,
      widgetType,
      category: palette.category,
      labelEn,
      labelGu,
      required: requiredSet.has(fieldId),
      supportsRequired: palette.supportsRequired,
      groupId: palette.groupId,
      groupLabelEn: group?.labelEn ?? palette.groupId,
      groupLabelGu: group?.labelGu ?? palette.groupId,
      configurableProperties: palette.configurableProperties,
      bakedInBehaviours: palette.bakedInBehaviours,
      palette,
      stepId: step?.stepId ?? null,
      stepLabelEn: step?.labelEn ?? null,
      stepLabelGu: step?.labelGu ?? null,
      memberCount,
    }
  })
}
