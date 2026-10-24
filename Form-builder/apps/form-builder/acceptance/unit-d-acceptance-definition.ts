/**
 * FB-D22 Unit D package-level acceptance FormDefinition builder.
 *
 * Technical acceptance fixture only — not DG Service Catalogue / DST policy.
 * Not exported from any public package surface.
 */

import type { FormDefinition } from '@dg20/form-contract'

import {
  addFamilyMember,
  addField,
  assertDefinitionIntegrity,
  cloneJsonSafe,
  createAuthoringSession,
  createPageBreakBoundary,
  enableProgressiveSteps,
  familyMemberDefinitionPath,
  serializeFamilyRepeaterStructureBaseline,
  updateIntegrationBindings,
  updateWorkflowBindings,
  type BuilderAuthoringState,
} from '../src/authoring/index.js'
import { deepFreezeJsonSafe } from '../src/definition/deep-freeze.js'

export const UNIT_D_ACCEPTANCE_SERVICE_ID = 'unit-d-builder-acceptance' as const
export const UNIT_D_ACCEPTANCE_VERSION = 1 as const
export const UNIT_D_ACCEPTANCE_ACTOR = 'unit-d-acceptance-actor' as const

/** Minimal valid seed so authoring APIs can mint the representative draft. */
function seedDefinition(): FormDefinition {
  return {
    serviceId: UNIT_D_ACCEPTANCE_SERVICE_ID,
    version: UNIT_D_ACCEPTANCE_VERSION,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        seed_field: { type: 'string', maxLength: 40 },
      },
      required: [],
    },
    uiSchema: {
      'ui:order': ['seed_field'],
      seed_field: { 'ui:widget': 'text-short' },
    },
    meta: {
      paletteProvenance: [{ fieldId: 'seed_field', widgetType: 'text-short' }],
      bilingual: {
        labels: { seed_field: { en: 'Seed', gu: 'સીડ' } },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [],
    },
    audit: {
      createdBy: UNIT_D_ACCEPTANCE_ACTOR,
      createdAt: '2026-07-26T00:00:00.000Z',
    },
  }
}

function mustOk<T extends { ok: boolean }>(
  result: T,
  label: string,
): asserts result is T & {
  ok: true
} {
  if (!result.ok) {
    throw new Error(`Acceptance fixture build failed at ${label}`)
  }
}

function buildUnitDAcceptanceDefinition(): FormDefinition {
  let state: BuilderAuthoringState = createAuthoringSession(seedDefinition())

  const addImmediate = (widgetType: string) => {
    const result = addField(state, widgetType)
    mustOk(result, `add ${widgetType}`)
    state = result.state
    return state.selectedFieldId!
  }

  const applicantName = addImmediate('text-short')
  const contactEmail = addImmediate('email')
  const dateOfBirth = addImmediate('dob')
  const sectionIdentity = addImmediate('section-header')
  const infoGuidance = addImmediate('info-panel')
  const signature = addImmediate('signature-esign')

  let result = addField(state, 'dropdown-master', {
    configured: {
      widgetType: 'dropdown-master',
      masterListId: 'acceptance-citizen-status',
    },
  })
  mustOk(result, 'add dropdown-master')
  state = result.state
  const statusDropdown = state.selectedFieldId!

  result = addField(state, 'caf-prefill', {
    configured: {
      widgetType: 'caf-prefill',
      cafAttribute: 'acceptance.citizen.fullName',
      confidenceMin: 0.8,
    },
  })
  mustOk(result, 'add caf-prefill')
  state = result.state
  const cafPrefill = state.selectedFieldId!

  result = addField(state, 'doc-upload', {
    configured: {
      widgetType: 'doc-upload',
      allowedMimeTypes: ['application/pdf'],
      maxFileSizeBytes: 1_048_576,
    },
  })
  mustOk(result, 'add doc-upload')
  state = result.state
  const docUpload = state.selectedFieldId!

  result = addField(state, 'family-repeater', {
    configured: {
      widgetType: 'family-repeater',
      maxItems: 4,
      minItems: 1,
      initialMember: {
        widgetType: 'text-short',
        labelEn: 'Member name',
        labelGu: 'સભ્યનું નામ',
        required: true,
      },
    },
  })
  mustOk(result, 'add family-repeater')
  state = result.state
  const familyRepeater = state.selectedFieldId!
  const nestedMember = familyMemberDefinitionPath(familyRepeater, 'text_short_1')

  const familyBaseline = serializeFamilyRepeaterStructureBaseline(state.definition, familyRepeater)
  result = addFamilyMember(
    state,
    familyRepeater,
    {
      widgetType: 'number',
      labelEn: 'Member age',
      labelGu: 'સભ્યની ઉંમર',
      required: false,
    },
    familyBaseline,
  )
  mustOk(result, 'add family member number')
  state = result.state

  result = addField(state, 'eligibility-declaration', {
    configured: {
      widgetType: 'eligibility-declaration',
      declarationId: 'ACCEPTANCE_DECL_001',
      declarationTextEn: 'I confirm the acceptance declaration text.',
      declarationTextGu: 'હું સ્વીકૃતિ ઘોષણા લખાણની પુષ્ટિ કરું છું.',
    },
  })
  mustOk(result, 'add eligibility-declaration')
  state = result.state
  const eligibility = state.selectedFieldId!

  result = addField(state, 'fee-field', {
    configured: {
      widgetType: 'fee-field',
      feeRuleId: 'acceptance-fee-rule-1',
    },
  })
  mustOk(result, 'add fee-field')
  state = result.state
  const feeField = state.selectedFieldId!

  // Drop the temporary seed field last among removals would empty a step — remove early
  // by rebuilding ui:order/properties without seed via a fresh session after strip.
  // Instead: replace seed label content is fine; we remove seed by filtering through clone.
  const withoutSeed = stripField(state.definition, 'seed_field')
  state = createAuthoringSession(withoutSeed)

  result = enableProgressiveSteps(state)
  mustOk(result, 'enable progressive steps')
  state = result.state

  // Split into three steps: identity | household | declaration
  const order = state.definition.uiSchema['ui:order'] as string[]
  const afterIdentity =
    order.find((id) => id === statusDropdown) ??
    order.find((id) => id === cafPrefill) ??
    order[Math.floor(order.length / 3)]!
  result = createPageBreakBoundary(state, {
    stepId: state.definition.meta.progressiveSteps[0]!.stepId,
    afterFieldId: afterIdentity,
    nextStepLabelEn: 'Household and documents',
    nextStepLabelGu: 'પરિવાર અને દસ્તાવેજો',
  })
  mustOk(result, 'page break after identity')
  state = result.state

  const order2 = state.definition.uiSchema['ui:order'] as string[]
  const afterHousehold =
    order2.find((id) => id === familyRepeater) ?? order2[Math.floor((order2.length * 2) / 3)]!
  const secondStep = state.definition.meta.progressiveSteps[1]!
  result = createPageBreakBoundary(state, {
    stepId: secondStep.stepId,
    afterFieldId: afterHousehold,
    nextStepLabelEn: 'Declaration and fee',
    nextStepLabelGu: 'ઘોષણા અને ફી',
  })
  mustOk(result, 'page break after household')
  state = result.state

  // Relabel first step
  const steps = state.definition.meta.progressiveSteps.map((step, index) => {
    if (index === 0) {
      return { ...step, labelEn: 'Identity', labelGu: 'ઓળખ' }
    }
    return step
  })
  state = {
    ...state,
    definition: {
      ...state.definition,
      meta: { ...state.definition.meta, progressiveSteps: steps },
    },
  }
  assertDefinitionIntegrity(state.definition)

  // Integration + workflow bindings (opaque synthetic ids)
  result = updateIntegrationBindings(
    state,
    {
      rows: [
        {
          rowKey: 'integration-row-1',
          fieldId: applicantName,
          adapterId: 'acceptance-adapter-citizen',
          param: 'fullName',
          direction: 'in',
        },
        {
          rowKey: 'integration-row-2',
          fieldId: nestedMember,
          adapterId: 'acceptance-adapter-family',
          param: 'memberName',
          direction: 'out',
        },
      ],
    },
    [],
  )
  mustOk(result, 'integration bindings')
  state = result.state

  result = updateWorkflowBindings(
    state,
    {
      rows: [
        {
          rowKey: 'workflow-row-1',
          fieldId: eligibility,
          stage: 'acceptance-review',
        },
        {
          rowKey: 'workflow-row-2',
          fieldId: feeField,
          stage: 'acceptance-payment',
        },
      ],
    },
    [],
  )
  mustOk(result, 'workflow bindings')
  state = result.state

  // Ensure bilingual completeness for info-panel help already seeded; stamp stable audit.
  const definition: FormDefinition = {
    ...cloneJsonSafe(state.definition),
    serviceId: UNIT_D_ACCEPTANCE_SERVICE_ID,
    version: UNIT_D_ACCEPTANCE_VERSION,
    status: 'draft',
    audit: {
      createdBy: UNIT_D_ACCEPTANCE_ACTOR,
      createdAt: '2026-07-26T00:00:00.000Z',
    },
  }

  // Touch referenced locals so tree-shaking / unused-lint stays quiet for field inventory.
  void contactEmail
  void dateOfBirth
  void sectionIdentity
  void infoGuidance
  void signature
  void docUpload

  assertDefinitionIntegrity(definition)
  return definition
}

function stripField(definition: FormDefinition, fieldId: string): FormDefinition {
  const properties = {
    ...(definition.jsonSchema.properties as Record<string, unknown>),
  }
  delete properties[fieldId]
  const uiSchema = { ...(definition.uiSchema as Record<string, unknown>) }
  delete uiSchema[fieldId]
  const order = (definition.uiSchema['ui:order'] as string[]).filter((id) => id !== fieldId)
  const labels = { ...definition.meta.bilingual.labels }
  delete labels[fieldId]
  const help = { ...definition.meta.bilingual.help }
  delete help[fieldId]
  const errors = { ...definition.meta.bilingual.errors }
  delete errors[fieldId]
  const next: FormDefinition = {
    ...definition,
    jsonSchema: {
      ...definition.jsonSchema,
      properties,
      required: Array.isArray(definition.jsonSchema.required)
        ? definition.jsonSchema.required.filter((id) => id !== fieldId)
        : [],
    },
    uiSchema: {
      ...uiSchema,
      'ui:order': order,
    },
    meta: {
      ...definition.meta,
      paletteProvenance: definition.meta.paletteProvenance.filter(
        (entry) => entry.fieldId !== fieldId,
      ),
      bilingual: { labels, help, errors },
      progressiveSteps: definition.meta.progressiveSteps.map((step) => ({
        ...step,
        fieldIds: step.fieldIds.filter((id) => id !== fieldId),
      })),
    },
  }
  assertDefinitionIntegrity(next)
  return next
}

const built = buildUnitDAcceptanceDefinition()
deepFreezeJsonSafe(built)

/**
 * Frozen representative Builder acceptance FormDefinition (FB-D22).
 * Detached technical fixture — never mutate; clone via createAuthoringSession.
 */
export const UNIT_D_ACCEPTANCE_DEFINITION: FormDefinition = built

/** Stable field inventory derived once from the frozen fixture. */
export const UNIT_D_ACCEPTANCE_FIELD_IDS = Object.freeze([
  ...((UNIT_D_ACCEPTANCE_DEFINITION.uiSchema['ui:order'] as string[]) ?? []),
])

export const UNIT_D_ACCEPTANCE_WIDGET_TYPES = Object.freeze(
  UNIT_D_ACCEPTANCE_DEFINITION.meta.paletteProvenance.map((entry) => entry.widgetType),
)
