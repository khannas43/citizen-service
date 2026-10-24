import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { ConsentLoggingAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const DECL_ID = 'DECL_ELIG_STORY_V1'

const bilingual: BilingualContent = {
  labels: {
    eligibility_declaration: {
      en: 'Eligibility declaration',
      gu: 'પાત્રતા ઘોષણા',
    },
  },
  help: {
    eligibility_declaration: {
      en: 'I confirm that the information provided is true and that I meet the eligibility criteria for this service.',
      gu: 'હું પુષ્ટિ કરું છું કે આપેલી માહિતી સાચી છે અને હું આ સેવા માટેની પાત્રતા શરતો પૂરી કરું છું.',
    },
  },
  errors: {},
}

const loggingAdapter: ConsentLoggingAdapter = {
  async recordDecision(request) {
    return {
      declarationId: request.declarationId,
      accepted: request.accepted,
      locale: request.locale,
      consentReceiptRef: `consent-receipt-${request.accepted ? 'accept' : 'decline'}-001`,
    }
  },
}

const delayedAdapter: ConsentLoggingAdapter = {
  async recordDecision(request) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return {
      declarationId: request.declarationId,
      accepted: request.accepted,
      locale: request.locale,
      consentReceiptRef: 'consent-receipt-delayed-001',
    }
  },
}

const failingAdapter: ConsentLoggingAdapter = {
  async recordDecision() {
    throw new Error('synthetic ledger failure')
  },
}

const meta = {
  title: 'Widgets/EligibilityDeclaration',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    eligibility_declaration: {
      type: 'object' as const,
      title: 'Eligibility declaration',
      properties: {
        declarationId: { type: 'string' as const },
        accepted: { type: 'boolean' as const },
        locale: { type: 'string' as const },
        consentReceiptRef: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': { declarationId: DECL_ID },
    },
  },
}

const uiSchema = { eligibility_declaration: { 'ui:field': 'eligibility-declaration' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ consentLogging: loggingAdapter }}
    />
  ),
}

export const Gujarati: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="gu"
      services={{ consentLogging: loggingAdapter }}
    />
  ),
}

export const Accepted: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        eligibility_declaration: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: 'consent-receipt-accept-001',
        },
      }}
      services={{ consentLogging: loggingAdapter }}
    />
  ),
}

export const Declined: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        eligibility_declaration: {
          declarationId: DECL_ID,
          accepted: false,
          locale: 'en',
          consentReceiptRef: 'consent-receipt-decline-001',
        },
      }}
      services={{ consentLogging: loggingAdapter }}
    />
  ),
}

export const Recording: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ consentLogging: delayedAdapter }}
    />
  ),
}

export const FailureRetry: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ consentLogging: failingAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const MalformedIncoming: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ eligibility_declaration: true }}
      services={{ consentLogging: loggingAdapter }}
    />
  ),
}

export const Disabled: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      disabled
      formData={{
        eligibility_declaration: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: 'consent-receipt-accept-001',
        },
      }}
      services={{ consentLogging: loggingAdapter }}
    />
  ),
}

export const Readonly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      readOnly
      formData={{
        eligibility_declaration: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'gu',
          consentReceiptRef: 'consent-receipt-accept-001',
        },
      }}
      services={{ consentLogging: loggingAdapter }}
    />
  ),
}
