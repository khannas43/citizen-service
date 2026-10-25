import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { DigiLockerAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    digilocker_doc: { en: 'Issued document', gu: 'જારી દસ્તાવેજ' },
  },
  help: {
    digilocker_doc: {
      en: 'Synthetic DigiLocker adapter demo — not a live DigiLocker integration.',
      gu: 'સિન્થેટિક DigiLocker એડેપ્ટર ડેમો — લાઇવ DigiLocker એકીકરણ નથી.',
    },
  },
  errors: {},
}

const successAdapter: DigiLockerAdapter = {
  async fetchIssuedDocument({ documentTypeCode }) {
    await new Promise((r) => setTimeout(r, 250))
    return {
      issuerSignedRef: `demo-issuer-${documentTypeCode}`,
      documentTypeCode,
    }
  },
}

const failAdapter: DigiLockerAdapter = {
  async fetchIssuedDocument() {
    await new Promise((r) => setTimeout(r, 150))
    throw new Error('demo-network')
  },
}

const meta = {
  title: 'Widgets/DigiLocker Fetch',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    digilocker_doc: {
      type: 'object' as const,
      title: 'Issued document',
      properties: {
        issuerSignedRef: { type: 'string' as const },
        documentTypeCode: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': { digiLockerDocumentTypeCode: 'PAN' },
    },
  },
}

const uiSchema = { digilocker_doc: { 'ui:field': 'digilocker-fetch' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ digiLocker: successAdapter }}
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
      services={{ digiLocker: successAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const Failure: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ digiLocker: failAdapter }}
    />
  ),
}

export const Readonly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ digiLocker: successAdapter }}
      formData={{
        digilocker_doc: {
          issuerSignedRef: 'demo-issuer-PAN',
          documentTypeCode: 'PAN',
        },
      }}
      readOnly
    />
  ),
}
