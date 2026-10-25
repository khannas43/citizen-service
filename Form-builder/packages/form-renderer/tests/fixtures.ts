import type { FormDefinition } from '@citizen/form-contract'

/**
 * Representative published FormDefinition for FB-B0 renderer tests.
 * Not a claim that §5 real-service acceptance is complete.
 */
export function createSamplePublishedDefinition(
  overrides?: Partial<FormDefinition> & {
    readonly status?: FormDefinition['status']
  },
): FormDefinition {
  const base: FormDefinition = {
    serviceId: 'income-certificate-sample',
    version: 1,
    status: 'published',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      title: 'Income certificate sample',
      required: ['applicant_name', 'agree_terms'],
      properties: {
        section_identity: {
          type: 'object',
          title: 'Identity',
          properties: {},
          additionalProperties: false,
        },
        applicant_name: {
          type: 'string',
          title: 'Applicant name',
          minLength: 1,
          maxLength: 120,
        },
        household_size: {
          type: 'integer',
          title: 'Household size',
          minimum: 1,
          maximum: 30,
        },
        contact_email: {
          type: 'string',
          title: 'Email',
          format: 'email',
        },
        caf_father_name: {
          type: 'object',
          title: 'Father name (CAF)',
          properties: {
            value: { type: 'string' },
            source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
          },
          additionalProperties: false,
        },
        agree_terms: {
          type: 'boolean',
          title: 'I agree to the declaration',
          const: true,
        },
      },
      additionalProperties: false,
    },
    uiSchema: {
      'ui:order': [
        'section_identity',
        'applicant_name',
        'household_size',
        'contact_email',
        'caf_father_name',
        'agree_terms',
      ],
      section_identity: {
        'ui:field': 'section-header',
      },
      applicant_name: {
        'ui:widget': 'text-short',
      },
      household_size: {
        'ui:widget': 'number',
      },
      contact_email: {
        'ui:widget': 'email',
      },
      caf_father_name: {
        'ui:field': 'caf-prefill',
      },
      agree_terms: {
        'ui:widget': 'yesno',
      },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'section_identity', widgetType: 'section-header' },
        { fieldId: 'applicant_name', widgetType: 'text-short' },
        { fieldId: 'household_size', widgetType: 'number' },
        { fieldId: 'contact_email', widgetType: 'email' },
        { fieldId: 'caf_father_name', widgetType: 'caf-prefill' },
        { fieldId: 'agree_terms', widgetType: 'yesno' },
      ],
      bilingual: {
        labels: {
          section_identity: { en: 'Identity details', gu: 'ઓળખ વિગતો' },
          applicant_name: { en: 'Applicant name', gu: 'અરજદારનું નામ' },
          household_size: { en: 'Household size', gu: 'પરિવારની સંખ્યા' },
          contact_email: { en: 'Email address', gu: 'ઈમેલ સરનામું' },
          caf_father_name: { en: 'Father name', gu: 'પિતાનું નામ' },
          agree_terms: { en: 'Declaration agreement', gu: 'ઘોષણા સંમતિ' },
        },
        help: {
          applicant_name: {
            en: 'Enter your full legal name.',
            gu: 'તમારું સંપૂર્ણ કાનૂની નામ દાખલ કરો.',
          },
          household_size: {
            en: 'Count of family members.',
            gu: 'પરિવારના સભ્યોની સંખ્યા.',
          },
        },
        errors: {},
      },
      prefillBindings: [
        {
          fieldId: 'caf_father_name',
          cafAttribute: 'fatherName',
          confidenceMin: 0.8,
        },
      ],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [],
    },
    audit: {
      createdBy: 'dept.author@example.gov.in',
      createdAt: '2026-07-16T10:00:00.000Z',
      publishedAt: '2026-07-16T12:00:00.000Z',
      approvedBy: 'dst.approver@example.gov.in',
    },
  }

  return {
    ...base,
    ...overrides,
    jsonSchema: (overrides?.jsonSchema ?? base.jsonSchema) as FormDefinition['jsonSchema'],
    uiSchema: (overrides?.uiSchema ?? base.uiSchema) as FormDefinition['uiSchema'],
    meta: overrides?.meta ? { ...base.meta, ...overrides.meta } : base.meta,
    audit: overrides?.audit ? { ...base.audit, ...overrides.audit } : base.audit,
  }
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child)
    }
  }
  return value
}

/**
 * Published definition with a valid two-step progressive plan for FB-B1.
 * Root fields are fully assigned; nested paths are not used.
 */
export function createProgressivePublishedDefinition(
  overrides?: Partial<FormDefinition>,
): FormDefinition {
  const base = createSamplePublishedDefinition()
  const progressiveSteps = [
    {
      stepId: 'identity',
      labelEn: 'Identity',
      labelGu: 'ઓળખ',
      fieldIds: ['section_identity', 'applicant_name', 'caf_father_name'],
    },
    {
      stepId: 'household',
      labelEn: 'Household',
      labelGu: 'પરિવાર',
      fieldIds: ['household_size', 'contact_email', 'agree_terms'],
    },
  ]

  return {
    ...base,
    ...overrides,
    jsonSchema: (overrides?.jsonSchema ?? base.jsonSchema) as FormDefinition['jsonSchema'],
    uiSchema: (overrides?.uiSchema ?? base.uiSchema) as FormDefinition['uiSchema'],
    meta: {
      ...base.meta,
      ...(overrides?.meta ?? {}),
      progressiveSteps:
        overrides?.meta?.progressiveSteps !== undefined
          ? overrides.meta.progressiveSteps
          : progressiveSteps,
    },
    audit: overrides?.audit ? { ...base.audit, ...overrides.audit } : base.audit,
  }
}

/** Minimal progressive fixture with local $defs/$ref for step schema tests. */
export function createProgressiveDefWithLocalRef(): FormDefinition {
  return createProgressivePublishedDefinition({
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['code_a', 'code_b'],
      properties: {
        code_a: { $ref: '#/$defs/code' },
        code_b: { $ref: '#/$defs/code' },
      },
      additionalProperties: false,
      $defs: {
        code: { type: 'string', minLength: 2 },
      },
    },
    uiSchema: {
      'ui:order': ['code_a', 'code_b'],
      code_a: { 'ui:widget': 'text-short' },
      code_b: { 'ui:widget': 'text-short' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'code_a', widgetType: 'text-short' },
        { fieldId: 'code_b', widgetType: 'text-short' },
      ],
      bilingual: {
        labels: {
          code_a: { en: 'Code A', gu: 'કોડ અ' },
          code_b: { en: 'Code B', gu: 'કોડ બ' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [
        {
          stepId: 'a',
          labelEn: 'First',
          labelGu: 'પ્રથમ',
          fieldIds: ['code_a'],
        },
        {
          stepId: 'b',
          labelEn: 'Second',
          labelGu: 'બીજું',
          fieldIds: ['code_b'],
        },
      ],
    },
  })
}

/**
 * Progressive fixture with transitive $defs (A→B) and nested pointer refs.
 * Unused sibling defs remain in the bag (inert).
 */
export function createProgressiveDefWithTransitiveDefs(): FormDefinition {
  return createProgressivePublishedDefinition({
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['token', 'note'],
      properties: {
        token: { $ref: '#/$defs/wrapper' },
        note: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
      $defs: {
        wrapper: {
          type: 'object',
          required: ['inner'],
          properties: {
            inner: { $ref: '#/$defs/leaf' },
          },
          additionalProperties: false,
        },
        leaf: {
          type: 'string',
          minLength: 2,
          maxLength: 40,
        },
        unusedSibling: {
          type: 'integer',
          minimum: 0,
        },
      },
    },
    uiSchema: {
      'ui:order': ['token', 'note'],
      token: { 'ui:widget': 'text-short' },
      note: { 'ui:widget': 'text-short' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'token', widgetType: 'text-short' },
        { fieldId: 'note', widgetType: 'text-short' },
      ],
      bilingual: {
        labels: {
          token: { en: 'Token', gu: 'ટોકન' },
          note: { en: 'Note', gu: 'નોંધ' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [
        {
          stepId: 'tokens',
          labelEn: 'Tokens',
          labelGu: 'ટોકન્સ',
          fieldIds: ['token'],
        },
        {
          stepId: 'notes',
          labelEn: 'Notes',
          labelGu: 'નોંધો',
          fieldIds: ['note'],
        },
      ],
    },
  })
}

/** Progressive fixture using legacy `definitions` bag with a local $ref. */
export function createProgressiveDefWithLegacyDefinitions(): FormDefinition {
  return createProgressivePublishedDefinition({
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['legacy_code', 'other'],
      properties: {
        legacy_code: { $ref: '#/definitions/legacyCode' },
        other: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
      definitions: {
        legacyCode: { type: 'string', minLength: 3 },
      },
    },
    uiSchema: {
      'ui:order': ['legacy_code', 'other'],
      legacy_code: { 'ui:widget': 'text-short' },
      other: { 'ui:widget': 'text-short' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'legacy_code', widgetType: 'text-short' },
        { fieldId: 'other', widgetType: 'text-short' },
      ],
      bilingual: {
        labels: {
          legacy_code: { en: 'Legacy code', gu: 'લેગસી કોડ' },
          other: { en: 'Other', gu: 'અન્ય' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [
        {
          stepId: 'legacy',
          labelEn: 'Legacy',
          labelGu: 'લેગસી',
          fieldIds: ['legacy_code'],
        },
        {
          stepId: 'rest',
          labelEn: 'Rest',
          labelGu: 'બાકી',
          fieldIds: ['other'],
        },
      ],
    },
  })
}
