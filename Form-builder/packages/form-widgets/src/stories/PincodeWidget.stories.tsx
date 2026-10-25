import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { PincodeLookupAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    pincode: { en: 'PIN code', gu: 'પિન કોડ' },
  },
  help: {
    pincode: {
      en: 'Enter a 6-digit PIN to enrich city and district.',
      gu: 'શહેર અને જિલ્લો ભરવા માટે 6-અંકીય પિન દાખલ કરો.',
    },
  },
  errors: {},
}

const foundAdapter: PincodeLookupAdapter = {
  async lookupPincode({ pincode }) {
    await new Promise((r) => setTimeout(r, 200))
    if (pincode === '380001') {
      return {
        found: true,
        cityCode: 'AHM',
        districtCode: 'D-AHM',
        cityLabelEn: 'Ahmedabad',
        cityLabelGu: 'અમદાવાદ',
        districtLabelEn: 'Ahmedabad',
        districtLabelGu: 'અમદાવાદ',
      }
    }
    return { found: false }
  },
}

const failAdapter: PincodeLookupAdapter = {
  async lookupPincode() {
    await new Promise((r) => setTimeout(r, 100))
    throw new Error('demo-network')
  },
}

const meta = {
  title: 'Widgets/PIN Code',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    pincode: {
      type: 'object' as const,
      title: 'PIN code',
      properties: {
        pincode: { type: 'string' as const },
        cityCode: { type: 'string' as const },
        districtCode: { type: 'string' as const },
      },
      required: ['pincode'],
      additionalProperties: false,
    },
  },
}

const uiSchema = { pincode: { 'ui:field': 'pincode' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ pincodeLookup: foundAdapter }}
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
      services={{ pincodeLookup: foundAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const LookupFailure: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ pincodeLookup: failAdapter }}
    />
  ),
}

export const Resolved: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ pincodeLookup: foundAdapter }}
      formData={{ pincode: { pincode: '380001', cityCode: 'AHM', districtCode: 'D-AHM' } }}
    />
  ),
}

export const Readonly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ pincodeLookup: foundAdapter }}
      formData={{ pincode: { pincode: '380001', cityCode: 'AHM', districtCode: 'D-AHM' } }}
      readOnly
    />
  ),
}
