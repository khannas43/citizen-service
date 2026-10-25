import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { IdentityTokenizationAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

/** SYNTHETIC Storybook fixtures only — not real citizen identifiers. */
const SYNTHETIC_LAST_FOUR = '0000'

const bilingual: BilingualContent = {
  labels: {
    aadhaar_ref: { en: 'Aadhaar / VID', gu: 'આધાર / VID' },
  },
  help: {
    aadhaar_ref: {
      en: 'Enter a synthetic demo identifier for preview only.',
      gu: 'માત્ર પૂર્વાવલોકન માટે સિન્થેટિક ઓળખકર્તા દાખલ કરો.',
    },
  },
  errors: {},
}

const successAdapter: IdentityTokenizationAdapter = {
  async tokenizeIdentity({ identifierKind, rawIdentifier }) {
    await new Promise((r) => setTimeout(r, 250))
    return {
      referenceToken: `demo-ref-${identifierKind}`,
      lastFour: rawIdentifier.slice(-4),
    }
  },
}

const failAdapter: IdentityTokenizationAdapter = {
  async tokenizeIdentity() {
    await new Promise((r) => setTimeout(r, 100))
    throw new Error('demo-network')
  },
}

const meta = {
  title: 'Widgets/Aadhaar',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['aadhaar_ref'],
  properties: {
    aadhaar_ref: {
      type: 'object' as const,
      title: 'Aadhaar / VID',
      properties: {
        referenceToken: { type: 'string' as const },
        identifierKind: { type: 'string' as const, enum: ['AADHAAR', 'VID'] },
        lastFour: { type: 'string' as const, pattern: '^[0-9]{4}$' },
      },
      required: ['referenceToken', 'identifierKind', 'lastFour'],
      additionalProperties: false,
    },
  },
}

const uiSchema = { aadhaar_ref: { 'ui:field': 'aadhaar' } }

const securedFormData = {
  aadhaar_ref: {
    referenceToken: 'demo-ref-AADHAAR',
    identifierKind: 'AADHAAR' as const,
    lastFour: SYNTHETIC_LAST_FOUR,
  },
}

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ identityTokenization: successAdapter }}
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
      services={{ identityTokenization: successAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const TokenizationFailure: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ identityTokenization: failAdapter }}
    />
  ),
}

export const SecuredReference: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={securedFormData}
      services={{ identityTokenization: successAdapter }}
    />
  ),
}

export const ReadonlyMasked: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      readOnly
      formData={securedFormData}
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
      services={{ identityTokenization: successAdapter }}
    />
  ),
}
