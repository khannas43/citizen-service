import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { MasterDataAdapter, MasterDataOption } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    cascade_location: { en: 'Service area', gu: 'સેવા વિસ્તાર' },
  },
  help: {
    cascade_location: {
      en: 'Choose parent then child',
      gu: 'પહેલા પેરેન્ટ પછી ચાઇલ્ડ પસંદ કરો',
    },
  },
  errors: {},
}

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const masterData: MasterDataAdapter = {
  async listOptions(request) {
    if (request.masterListId === 'LIST_STATE') {
      return [opt('GJ', 'Gujarat', 'ગુજરાત'), opt('RJ', 'Rajasthan', 'રાજસ્થાન')]
    }
    if (request.parentCode === 'GJ') {
      return [opt('AHM', 'Ahmedabad', 'અમદાવાદ'), opt('SRT', 'Surat', 'સુરત')]
    }
    if (request.parentCode === 'RJ') {
      return [opt('JPR', 'Jaipur', 'જયપુર')]
    }
    return []
  },
}

const delayedMasterData: MasterDataAdapter = {
  async listOptions(request) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    return masterData.listOptions(request)
  },
}

const meta = {
  title: 'Widgets/CascadingDropdown',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    cascade_location: {
      type: 'object' as const,
      title: 'Service area',
      properties: {
        parentCode: { type: 'string' as const },
        childCode: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': {
        parentMasterListId: 'LIST_STATE',
        childMasterListId: 'LIST_DISTRICT',
      },
    },
  },
}

const uiSchema = { cascade_location: { 'ui:field': 'cascading-dropdown' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ masterData }}
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
      services={{ masterData }}
    />
  ),
}

export const Selected: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ cascade_location: { parentCode: 'GJ', childCode: 'AHM' } }}
      services={{ masterData }}
    />
  ),
}

export const DelayedChild: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ cascade_location: { parentCode: 'GJ' } }}
      services={{ masterData: delayedMasterData }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const InvalidConfig: Story = {
  render: () => (
    <DemoForm
      schema={{
        type: 'object',
        properties: {
          cascade_location: {
            type: 'object',
            title: 'Service area',
            properties: {},
            'x-dg20': { parentMasterListId: '', childMasterListId: 'LIST_DISTRICT' },
          },
        },
      }}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ masterData }}
    />
  ),
}
