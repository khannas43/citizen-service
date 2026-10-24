import { describe, expect, it } from 'vitest'

import type {
  FormDefinition,
  FormStatus,
  IntegrationBinding,
  Iso8601DateTimeString,
  ProgressiveStep,
} from '../src/index.js'
import { FORM_STATUSES, isFormStatus } from '../src/index.js'

describe('FormDefinition contract', () => {
  it('allows construction of a valid minimal draft FormDefinition', () => {
    const definition: FormDefinition = {
      serviceId: 'caste-certificate',
      version: 1,
      status: 'draft',
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          fullName: { type: 'string' },
        },
        additionalProperties: false,
      },
      uiSchema: {
        'ui:order': ['fullName'],
        fullName: {
          'ui:widget': 'full-name',
        },
      },
      meta: {
        paletteProvenance: [{ fieldId: 'fullName', widgetType: 'full-name' }],
        bilingual: {
          labels: {
            fullName: { en: 'Full name', gu: 'પૂરું નામ' },
          },
          help: {},
          errors: {},
        },
        prefillBindings: [],
        integrationBindings: [],
        workflowBindings: [],
        progressiveSteps: [],
      },
      audit: {
        createdBy: 'dept.author@example.gov.in',
        createdAt: '2026-07-20T10:00:00.000Z',
      },
    }

    expect(definition.status).toBe('draft')
    expect(definition.version).toBe(1)
    expect(definition.meta.paletteProvenance).toHaveLength(1)
    expect(definition.audit.submittedBy).toBeUndefined()
    expect(definition.audit.approvedBy).toBeUndefined()
    expect(definition.audit.publishedAt).toBeUndefined()
  })

  it('restricts lifecycle status to the five allowed states', () => {
    expect(FORM_STATUSES).toEqual(['draft', 'submitted', 'approved', 'published', 'retired'])

    const statuses: FormStatus[] = [...FORM_STATUSES]
    expect(statuses).toHaveLength(5)

    for (const status of FORM_STATUSES) {
      expect(isFormStatus(status)).toBe(true)
    }

    expect(isFormStatus('archived')).toBe(false)
    expect(isFormStatus('pending')).toBe(false)
  })

  it('shapes bindings and progressive steps per the specification', () => {
    const integration: IntegrationBinding = {
      fieldId: 'aadhaarRef',
      adapterId: 'uidai-verify',
      param: 'aadhaarNumber',
      direction: 'out',
    }

    const step: ProgressiveStep = {
      stepId: 'identity',
      labelEn: 'Identity',
      labelGu: 'ઓળખ',
      fieldIds: ['aadhaarRef', 'fullName'],
    }

    const definition: FormDefinition = {
      serviceId: 'pension',
      version: 2,
      status: 'submitted',
      jsonSchema: { type: 'object' },
      uiSchema: {},
      meta: {
        paletteProvenance: [
          { fieldId: 'aadhaarRef', widgetType: 'aadhaar' },
          { fieldId: 'fullName', widgetType: 'full-name' },
        ],
        bilingual: {
          labels: {
            aadhaarRef: { en: 'Aadhaar', gu: 'આધાર' },
            fullName: { en: 'Full name', gu: 'પૂરું નામ' },
          },
          help: {},
          errors: {},
        },
        prefillBindings: [
          {
            fieldId: 'fullName',
            cafAttribute: 'person.fullName',
            confidenceMin: 0.8,
          },
        ],
        integrationBindings: [integration],
        workflowBindings: [{ fieldId: 'aadhaarRef', stage: 'talati-verification' }],
        progressiveSteps: [step],
      },
      audit: {
        createdBy: 'author-1',
        createdAt: '2026-07-20T10:00:00.000Z',
        submittedBy: 'author-1',
      },
    }

    expect(definition.meta.integrationBindings[0]?.direction).toBe('out')
    expect(definition.meta.prefillBindings[0]?.cafAttribute).toBe('person.fullName')
    expect(definition.meta.workflowBindings[0]?.stage).toBe('talati-verification')
    expect(definition.meta.progressiveSteps[0]?.fieldIds).toEqual(['aadhaarRef', 'fullName'])
  })

  it('uses ISO 8601 strings for audit timestamps, not Date instances', () => {
    const createdAt: Iso8601DateTimeString = '2026-07-20T12:30:00.000Z'
    const publishedAt: Iso8601DateTimeString = '2026-07-21T09:00:00.000Z'

    const definition: FormDefinition = {
      serviceId: 'scheme-x',
      version: 3,
      status: 'published',
      jsonSchema: { type: 'object' },
      uiSchema: {},
      meta: {
        paletteProvenance: [],
        bilingual: { labels: {}, help: {}, errors: {} },
        prefillBindings: [],
        integrationBindings: [],
        workflowBindings: [],
        progressiveSteps: [],
      },
      audit: {
        createdBy: 'author-1',
        createdAt,
        submittedBy: 'author-1',
        approvedBy: 'dst-1',
        publishedAt,
      },
    }

    expect(typeof definition.audit.createdAt).toBe('string')
    expect(typeof definition.audit.publishedAt).toBe('string')
    expect(definition.audit.createdAt).not.toBeInstanceOf(Date)
    expect(definition.audit.publishedAt).not.toBeInstanceOf(Date)
    expect(Number.isNaN(Date.parse(definition.audit.createdAt))).toBe(false)
    expect(Number.isNaN(Date.parse(definition.audit.publishedAt ?? ''))).toBe(false)
  })
})
