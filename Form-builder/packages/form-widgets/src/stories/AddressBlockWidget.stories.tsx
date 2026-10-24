import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { GeographyAdapter, MasterDataOption } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    address_block: { en: 'Residential address', gu: 'રહેઠાણનું સરનામું' },
  },
  help: {
    address_block: {
      en: 'Select State → District → Taluka → Village from master data.',
      gu: 'માસ્ટર-ડેટામાંથી રાજ્ય → જિલ્લો → તાલુકો → ગામ પસંદ કરો.',
    },
  },
  errors: {},
}

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const syntheticGeography: GeographyAdapter = {
  async listOptions(request) {
    await new Promise((r) => setTimeout(r, 120))
    if (request.level === 'state') {
      return [opt('GJ', 'Gujarat', 'ગુજરાત'), opt('MH', 'Maharashtra', 'મહારાષ્ટ્ર')]
    }
    if (request.level === 'district' && request.parentCodes.stateCode === 'GJ') {
      return [opt('AHM', 'Ahmedabad', 'અમદાવાદ'), opt('SRT', 'Surat', 'સુરત')]
    }
    if (
      request.level === 'taluka' &&
      request.parentCodes.stateCode === 'GJ' &&
      request.parentCodes.districtCode === 'AHM'
    ) {
      return [opt('DASK', 'Daskroi', 'દસ્ક્રોઈ')]
    }
    if (
      request.level === 'village' &&
      request.parentCodes.stateCode === 'GJ' &&
      request.parentCodes.districtCode === 'AHM' &&
      request.parentCodes.talukaCode === 'DASK'
    ) {
      return [opt('V001', 'Village One', 'ગામ એક')]
    }
    return []
  },
}

const meta = {
  title: 'Widgets/Address Block',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    address_block: {
      type: 'object' as const,
      title: 'Residential address',
      properties: {
        stateCode: { type: 'string' as const },
        districtCode: { type: 'string' as const },
        talukaCode: { type: 'string' as const },
        villageCode: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': { defaultStateCode: 'GJ' },
    },
  },
}

const uiSchema = { address_block: { 'ui:field': 'address-block' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ geography: syntheticGeography }}
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
      services={{ geography: syntheticGeography }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const PrefillChain: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ geography: syntheticGeography }}
      formData={{
        address_block: {
          stateCode: 'GJ',
          districtCode: 'AHM',
          talukaCode: 'DASK',
          villageCode: 'V001',
        },
      }}
    />
  ),
}

export const Readonly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ geography: syntheticGeography }}
      formData={{
        address_block: {
          stateCode: 'GJ',
          districtCode: 'AHM',
          talukaCode: 'DASK',
          villageCode: 'V001',
        },
      }}
      readOnly
    />
  ),
}
