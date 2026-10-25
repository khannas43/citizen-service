import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { MasterDataAdapter, MasterDataOption } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    preference: { en: 'Preference', gu: 'પસંદગી' },
  },
  help: {
    preference: { en: 'Select one option', gu: 'એક વિકલ્પ પસંદ કરો' },
  },
  errors: {
    preference: { en: 'Preference is required', gu: 'પસંદગી જરૂરી છે' },
  },
}

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const masterData: MasterDataAdapter = {
  async listOptions() {
    return [
      opt('ONLINE', 'Online', 'ઓનલાઇન'),
      opt('OFFICE', 'In office', 'કચેરીમાં'),
      opt('POST', 'By post', 'ટપાલ દ્વારા'),
    ]
  },
}

const meta = {
  title: 'Widgets/Radio',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['preference'],
  properties: {
    preference: {
      type: 'string' as const,
      title: 'Preference',
      enum: ['X', 'Y'],
      'x-dg20': { masterListId: 'LIST_CHANNEL' },
    },
  },
}

const uiSchema = { preference: { 'ui:widget': 'radio' } }

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
      formData={{ preference: 'OFFICE' }}
      services={{ masterData }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const RequiredError: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      liveValidate
      formData={{}}
      services={{ masterData }}
    />
  ),
}
