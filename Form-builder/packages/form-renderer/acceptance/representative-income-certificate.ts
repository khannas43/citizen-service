import type { FormDefinition } from '@dg20/form-contract'

/**
 * FB-B6 / B6.1 representative Income Certificate acceptance fixture.
 *
 * NOT an authoritative DG Service Catalogue / DST-approved production form.
 * No versioned FormDefinition with traceable provenance was found in the
 * DG2.0 monorepo. This fixture exists only for package-level technical
 * acceptance of `@dg20/form-renderer`. Design-spec §5 live real-service
 * acceptance remains pending.
 *
 * Intentionally omitted from the package public exports and compiled
 * production surface.
 *
 * `required` lists below are **representative acceptance constraints** for
 * the technical journey — not approved Income Certificate business policy.
 */

export const REPRESENTATIVE_INCOME_CERTIFICATE_SERVICE_ID =
  'income-certificate-representative-acceptance' as const

export const REPRESENTATIVE_INCOME_CERTIFICATE_VERSION = 1 as const

/** Opaque CAF attributes used by the acceptance harness adapters. */
export const ACCEPTANCE_CAF_ATTRIBUTES = {
  fatherName: 'goldenRecord.fatherName',
  motherName: 'goldenRecord.motherName',
} as const

/**
 * Data-producing field keys expected in submitted / autosaved formData.
 * Section-header presentation fields are intentionally excluded.
 */
export const ACCEPTANCE_DATA_FIELD_KEYS = [
  'applicant_name',
  'gender',
  'caf_father_name',
  'caf_mother_name',
  'household_size',
  'contact_email',
  'annual_income',
  'purpose_statement',
  'agree_terms',
] as const

const CAF_VALUE_OBJECT_SCHEMA = {
  type: 'object',
  required: ['value', 'source'],
  properties: {
    value: { type: 'string', minLength: 1 },
    source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
  },
  additionalProperties: false,
} as const

/**
 * Recursively freeze a JSON-safe value without invoking accessors.
 * Own data properties only; getters/setters are skipped (not traversed).
 */
export function deepFreezeJsonSafe(value: unknown): void {
  if (value === null || typeof value !== 'object') {
    return
  }
  if (Object.isFrozen(value)) {
    return
  }

  for (const name of Object.getOwnPropertyNames(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, name)
    if (!desc || 'get' in desc || 'set' in desc || !('value' in desc)) {
      continue
    }
    deepFreezeJsonSafe(desc.value)
  }
  Object.freeze(value)
}

function buildRepresentativeIncomeCertificateDefinition(): FormDefinition {
  return {
    serviceId: REPRESENTATIVE_INCOME_CERTIFICATE_SERVICE_ID,
    version: REPRESENTATIVE_INCOME_CERTIFICATE_VERSION,
    status: 'published',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      // No root/property `title` — visible copy comes from meta.bilingual only
      // so Gujarati mode cannot surface English JSON Schema titles via RJSF.
      required: [
        'applicant_name',
        'gender',
        'caf_father_name',
        'caf_mother_name',
        'household_size',
        'contact_email',
        'annual_income',
        'purpose_statement',
        'agree_terms',
      ],
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
        gender: {
          type: 'string',
          enum: ['M', 'F', 'OTHER'],
        },
        caf_father_name: { ...CAF_VALUE_OBJECT_SCHEMA },
        caf_mother_name: { ...CAF_VALUE_OBJECT_SCHEMA },
        section_household: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
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
        annual_income: {
          type: 'integer',
          minimum: 0,
          maximum: 10_000_000,
        },
        section_declaration: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        purpose_statement: {
          type: 'string',
          minLength: 10,
          maxLength: 500,
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
        'gender',
        'caf_father_name',
        'caf_mother_name',
        'section_household',
        'household_size',
        'contact_email',
        'annual_income',
        'section_declaration',
        'purpose_statement',
        'agree_terms',
      ],
      section_identity: { 'ui:field': 'section-header' },
      applicant_name: { 'ui:widget': 'text-short' },
      gender: { 'ui:widget': 'gender' },
      caf_father_name: { 'ui:field': 'caf-prefill' },
      caf_mother_name: { 'ui:field': 'caf-prefill' },
      section_household: { 'ui:field': 'section-header' },
      household_size: { 'ui:widget': 'number' },
      contact_email: { 'ui:widget': 'email' },
      annual_income: { 'ui:widget': 'number' },
      section_declaration: { 'ui:field': 'section-header' },
      purpose_statement: { 'ui:widget': 'text-long' },
      agree_terms: { 'ui:widget': 'yesno' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'section_identity', widgetType: 'section-header' },
        { fieldId: 'applicant_name', widgetType: 'text-short' },
        { fieldId: 'gender', widgetType: 'gender' },
        { fieldId: 'caf_father_name', widgetType: 'caf-prefill' },
        { fieldId: 'caf_mother_name', widgetType: 'caf-prefill' },
        { fieldId: 'section_household', widgetType: 'section-header' },
        { fieldId: 'household_size', widgetType: 'number' },
        { fieldId: 'contact_email', widgetType: 'email' },
        { fieldId: 'annual_income', widgetType: 'number' },
        { fieldId: 'section_declaration', widgetType: 'section-header' },
        { fieldId: 'purpose_statement', widgetType: 'text-long' },
        { fieldId: 'agree_terms', widgetType: 'yesno' },
      ],
      bilingual: {
        labels: {
          section_identity: { en: 'Identity details', gu: 'ઓળખ વિગતો' },
          applicant_name: { en: 'Applicant name', gu: 'અરજદારનું નામ' },
          gender: { en: 'Gender', gu: 'લિંગ' },
          caf_father_name: { en: 'Father name', gu: 'પિતાનું નામ' },
          caf_mother_name: { en: 'Mother name', gu: 'માતાનું નામ' },
          section_household: { en: 'Household and income', gu: 'પરિવાર અને આવક' },
          household_size: { en: 'Household size', gu: 'પરિવારની સંખ્યા' },
          contact_email: { en: 'Email address', gu: 'ઈમેલ સરનામું' },
          annual_income: { en: 'Annual income (INR)', gu: 'વાર્ષિક આવક (INR)' },
          section_declaration: { en: 'Declaration', gu: 'ઘોષણા' },
          purpose_statement: {
            en: 'Purpose of certificate',
            gu: 'પ્રમાણપત્રનો હેતુ',
          },
          agree_terms: { en: 'Declaration agreement', gu: 'ઘોષણા સંમતિ' },
        },
        help: {
          applicant_name: {
            en: 'Enter your full legal name as on official records.',
            gu: 'સત્તાવાર રેકોર્ડ પરના તમારા સંપૂર્ણ કાનૂની નામ દાખલ કરો.',
          },
          gender: {
            en: 'Select the gender recorded for this application.',
            gu: 'આ અરજી માટે નોંધાયેલ લિંગ પસંદ કરો.',
          },
          caf_father_name: {
            en: 'Pre-filled from citizen records when available.',
            gu: 'ઉપલબ્ધ હોય ત્યારે નાગરિક રેકોર્ડમાંથી પૂર્વ-ભરેલ.',
          },
          caf_mother_name: {
            en: 'Enter manually when automatic pre-fill is unavailable.',
            gu: 'સ્વયંસંચાલિત પૂર્વ-ભરણ અનુપલબ્ધ હોય ત્યારે જાતે દાખલ કરો.',
          },
          household_size: {
            en: 'Total number of family members in the household.',
            gu: 'પરિવારના સભ્યોની કુલ સંખ્યા.',
          },
          contact_email: {
            en: 'Official contact email for this application.',
            gu: 'આ અરજી માટે સત્તાવાર સંપર્ક ઈમેલ.',
          },
          annual_income: {
            en: 'Total annual household income in Indian Rupees.',
            gu: 'ભારતીય રૂપિયામાં કુલ વાર્ષિક પારિવારિક આવક.',
          },
          purpose_statement: {
            en: 'Briefly state why you need this income certificate.',
            gu: 'તમને આ આવક પ્રમાણપત્રની શા માટે જરૂર છે તે સંક્ષિપ્તમાં જણાવો.',
          },
          agree_terms: {
            en: 'Confirm that the information provided is true.',
            gu: 'પૂરી પાડેલી માહિતી સાચી છે તેની પુષ્ટિ કરો.',
          },
        },
        errors: {
          applicant_name: {
            en: 'Applicant name is required.',
            gu: 'અરજદારનું નામ જરૂરી છે.',
          },
          gender: {
            en: 'Gender is required.',
            gu: 'લિંગ જરૂરી છે.',
          },
          household_size: {
            en: 'Enter a household size between 1 and 30.',
            gu: '1 થી 30 વચ્ચેની પરિવાર સંખ્યા દાખલ કરો.',
          },
          contact_email: {
            en: 'Enter a valid email address.',
            gu: 'માન્ય ઈમેલ સરનામું દાખલ કરો.',
          },
          annual_income: {
            en: 'Enter a non-negative annual income.',
            gu: 'ઋણાત્મક ન હોય તેવી વાર્ષિક આવક દાખલ કરો.',
          },
          purpose_statement: {
            en: 'Describe the purpose in at least 10 characters.',
            gu: 'હેતુ ઓછામાં ઓછા 10 અક્ષરોમાં વર્ણવો.',
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
          cafAttribute: ACCEPTANCE_CAF_ATTRIBUTES.fatherName,
          confidenceMin: 0.8,
        },
        {
          fieldId: 'caf_mother_name',
          cafAttribute: ACCEPTANCE_CAF_ATTRIBUTES.motherName,
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
          fieldIds: [
            'section_identity',
            'applicant_name',
            'gender',
            'caf_father_name',
            'caf_mother_name',
          ],
        },
        {
          stepId: 'household',
          labelEn: 'Household',
          labelGu: 'પરિવાર',
          fieldIds: ['section_household', 'household_size', 'contact_email', 'annual_income'],
        },
        {
          stepId: 'declaration',
          labelEn: 'Declaration',
          labelGu: 'ઘોષણા',
          fieldIds: ['section_declaration', 'purpose_statement', 'agree_terms'],
        },
      ],
    },
    audit: {
      createdBy: 'form-builder.acceptance@example.gov.in',
      createdAt: '2026-07-23T00:00:00.000Z',
      submittedBy: 'form-builder.acceptance@example.gov.in',
      approvedBy: 'not-a-dst-approval',
      publishedAt: '2026-07-23T00:00:00.000Z',
    },
  }
}

const FROZEN_REPRESENTATIVE_DEFINITION: FormDefinition = (() => {
  const definition = buildRepresentativeIncomeCertificateDefinition()
  deepFreezeJsonSafe(definition)
  return definition
})()

/**
 * Returns the deeply frozen published representative FormDefinition singleton.
 * Outside package public exports — acceptance / Storybook / tests only.
 */
export function createRepresentativeIncomeCertificateDefinition(): FormDefinition {
  return FROZEN_REPRESENTATIVE_DEFINITION
}
