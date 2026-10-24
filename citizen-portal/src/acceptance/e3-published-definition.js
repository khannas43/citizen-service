/**
 * Illustrative, non-authoritative published Form Definition for FB-E3 tests/mocks.
 *
 * NOT an official service definition. Uses valid 30-widget contracts.
 * Never export this as an authoritative DG Service Catalogue form.
 */
export const E3_TECHNICAL_SERVICE_ID = 'dg20-technical-preview'

const CAF_VALUE_OBJECT_SCHEMA = {
  type: 'object',
  required: ['value', 'source'],
  properties: {
    value: { type: 'string', minLength: 1 },
    source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
  },
  additionalProperties: false,
}

export function createE3AcceptancePublishedDefinition(overrides = {}) {
  return {
    serviceId: E3_TECHNICAL_SERVICE_ID,
    version: 1,
    status: 'published',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['applicant_name', 'agree_terms'],
      properties: {
        section_identity: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        applicant_name: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
        },
        caf_father_name: { ...CAF_VALUE_OBJECT_SCHEMA },
        household_size: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
        },
        contact_email: {
          type: 'string',
          format: 'email',
          maxLength: 254,
        },
        agree_terms: {
          type: 'boolean',
          const: true,
        },
      },
      additionalProperties: false,
    },
    uiSchema: {
      'ui:order': [
        'section_identity',
        'applicant_name',
        'caf_father_name',
        'household_size',
        'contact_email',
        'agree_terms',
      ],
      section_identity: { 'ui:field': 'section-header' },
      applicant_name: { 'ui:widget': 'text-short' },
      caf_father_name: { 'ui:field': 'caf-prefill' },
      household_size: { 'ui:widget': 'number' },
      contact_email: { 'ui:widget': 'email' },
      agree_terms: { 'ui:widget': 'yesno' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'section_identity', widgetType: 'section-header' },
        { fieldId: 'applicant_name', widgetType: 'text-short' },
        { fieldId: 'caf_father_name', widgetType: 'caf-prefill' },
        { fieldId: 'household_size', widgetType: 'number' },
        { fieldId: 'contact_email', widgetType: 'email' },
        { fieldId: 'agree_terms', widgetType: 'yesno' },
      ],
      bilingual: {
        labels: {
          section_identity: { en: 'Identity details', gu: 'ઓળખ વિગતો' },
          applicant_name: { en: 'Applicant name', gu: 'અરજદારનું નામ' },
          caf_father_name: { en: 'Father name', gu: 'પિતાનું નામ' },
          household_size: { en: 'Household size', gu: 'પરિવારની સંખ્યા' },
          contact_email: { en: 'Email address', gu: 'ઈમેલ સરનામું' },
          agree_terms: { en: 'Declaration agreement', gu: 'ઘોષણા સંમતિ' },
        },
        help: {
          applicant_name: {
            en: 'Enter your full legal name.',
            gu: 'તમારું સંપૂર્ણ કાનૂની નામ દાખલ કરો.',
          },
          caf_father_name: {
            en: 'Pre-filled from citizen records when available.',
            gu: 'ઉપલબ્ધ હોય ત્યારે નાગરિક રેકોર્ડમાંથી પૂર્વ-ભરેલ.',
          },
        },
        errors: {
          applicant_name: {
            en: 'Applicant name is required.',
            gu: 'અરજદારનું નામ જરૂરી છે.',
          },
          agree_terms: {
            en: 'You must agree to the declaration.',
            gu: 'તમારે ઘોષણા સાથે સંમત થવું જરૂરી છે.',
          },
        },
      },
      prefillBindings: [
        {
          fieldId: 'caf_father_name',
          cafAttribute: 'goldenRecord.fatherName',
          confidenceMin: 0.8,
        },
      ],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [
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
      ],
    },
    audit: {
      createdBy: 'tech.author@example.gov.in',
      createdAt: '2026-07-26T10:00:00.000Z',
      publishedAt: '2026-07-26T12:00:00.000Z',
      approvedBy: 'tech.approver@example.gov.in',
    },
    ...overrides,
  }
}
