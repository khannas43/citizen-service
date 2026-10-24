import type { FormDefinition } from '@dg20/form-contract'

import { deepFreezeJsonSafe } from './deep-freeze.js'

/**
 * FB-D0 illustrative draft FormDefinition.
 *
 * NOT an authoritative DG Service Catalogue / DST-approved production form.
 * App-local only — not exported by any public package.
 * Suitable for Builder shell / live preview only.
 */

export const ILLUSTRATIVE_DRAFT_SERVICE_ID = 'illustrative-builder-d0-preview' as const
export const ILLUSTRATIVE_DRAFT_SERVICE_NAME_EN = 'Illustrative technical preview form' as const
export const ILLUSTRATIVE_DRAFT_SERVICE_NAME_GU = 'ઉદાહરણ તકનીકી પૂર્વાવલોકન ફોર્મ' as const
export const ILLUSTRATIVE_DRAFT_VERSION = 1 as const

function buildIllustrativeDraftDefinition(): FormDefinition {
  return {
    serviceId: ILLUSTRATIVE_DRAFT_SERVICE_ID,
    version: ILLUSTRATIVE_DRAFT_VERSION,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['applicant_name', 'gender', 'household_size', 'agree_terms'],
      additionalProperties: false,
      properties: {
        section_identity: {
          type: 'object',
          additionalProperties: false,
          properties: {},
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
        info_guidance: {
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
        household_size: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
        },
        purpose_statement: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
        },
        agree_terms: {
          type: 'boolean',
          const: true,
        },
      },
    },
    uiSchema: {
      'ui:order': [
        'section_identity',
        'applicant_name',
        'gender',
        'info_guidance',
        'household_size',
        'purpose_statement',
        'agree_terms',
      ],
      section_identity: { 'ui:field': 'section-header' },
      applicant_name: { 'ui:widget': 'text-short' },
      gender: { 'ui:widget': 'gender' },
      info_guidance: { 'ui:field': 'info-panel' },
      household_size: { 'ui:widget': 'number' },
      purpose_statement: { 'ui:widget': 'text-long' },
      agree_terms: { 'ui:widget': 'yesno' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'section_identity', widgetType: 'section-header' },
        { fieldId: 'applicant_name', widgetType: 'text-short' },
        { fieldId: 'gender', widgetType: 'gender' },
        { fieldId: 'info_guidance', widgetType: 'info-panel' },
        { fieldId: 'household_size', widgetType: 'number' },
        { fieldId: 'purpose_statement', widgetType: 'text-long' },
        { fieldId: 'agree_terms', widgetType: 'yesno' },
      ],
      bilingual: {
        labels: {
          section_identity: { en: 'Applicant identity', gu: 'અરજદારની ઓળખ' },
          applicant_name: { en: 'Applicant full name', gu: 'અરજદારનું પૂરું નામ' },
          gender: { en: 'Gender', gu: 'લિંગ' },
          info_guidance: {
            en: 'Provide accurate household details for this technical preview.',
            gu: 'આ તકનીકી પૂર્વાવલોકન માટે સચોટ ઘરની વિગતો આપો.',
          },
          household_size: { en: 'Household size', gu: 'ઘરના સભ્યોની સંખ્યા' },
          purpose_statement: { en: 'Purpose statement', gu: 'હેતુનું વિધાન' },
          agree_terms: { en: 'I agree to the declaration', gu: 'હું ઘોષણા સાથે સંમત છું' },
        },
        help: {
          applicant_name: {
            en: 'Enter the applicant name as it appears on identity documents.',
            gu: 'ઓળખ દસ્તાવેજોમાં દેખાતું અરજદારનું નામ દાખલ કરો.',
          },
          info_guidance: {
            en: 'Static help or notice content; produces no form data.',
            gu: 'સ્થિર મદદ અથવા સૂચના સામગ્રી; કોઈ ફોર્મ ડેટા ઉત્પન્ન કરતું નથી.',
          },
          household_size: {
            en: 'Count all people living in the household.',
            gu: 'ઘરમાં રહેતી તમામ વ્યક્તિઓની ગણતરી કરો.',
          },
        },
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [
        {
          stepId: 'identity',
          labelEn: 'Identity',
          labelGu: 'ઓળખ',
          fieldIds: ['section_identity', 'applicant_name', 'gender', 'info_guidance'],
        },
        {
          stepId: 'household',
          labelEn: 'Household',
          labelGu: 'પરિવાર',
          fieldIds: ['household_size', 'purpose_statement', 'agree_terms'],
        },
      ],
    },
    audit: {
      createdBy: 'builder-d0-illustrative',
      createdAt: '2026-07-24T00:00:00Z',
    },
  }
}

const definition = buildIllustrativeDraftDefinition()
deepFreezeJsonSafe(definition)

/** Deeply frozen illustrative singleton. Do not mutate. */
export const ILLUSTRATIVE_DRAFT_DEFINITION: FormDefinition = definition
