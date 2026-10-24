import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { MasterDataAdapter, MasterDataOption } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    category: { en: 'Category', gu: 'શ્રેણી' },
  },
  help: {
    category: { en: 'Choose one master-data option', gu: 'એક માસ્ટર-ડેટા વિકલ્પ પસંદ કરો' },
  },
  errors: {
    category: { en: 'Category is required', gu: 'શ્રેણી જરૂરી છે' },
  },
}

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const masterData: MasterDataAdapter = {
  async listOptions({ masterListId }) {
    if (masterListId === 'LIST_CATEGORY') {
      return [
        opt('GEN', 'General', 'સામાન્ય'),
        opt('OBC', 'OBC', 'ઓબીસી'),
        opt('SC', 'Scheduled Caste', 'અનુસૂચિત જાતિ'),
      ]
    }
    return []
  },
}

const meta = {
  title: 'Widgets/DropdownMaster',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['category'],
  properties: {
    category: {
      type: 'string' as const,
      title: 'Category',
      enum: ['IGNORE_ME'],
      'x-dg20': { masterListId: 'LIST_CATEGORY' },
    },
  },
}

const uiSchema = { category: { 'ui:widget': 'dropdown-master' } }

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
      formData={{ category: 'OBC' }}
      services={{ masterData }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const InvalidConfig: Story = {
  render: () => (
    <DemoForm
      schema={{
        type: 'object',
        properties: {
          category: { type: 'string', title: 'Category', 'x-dg20': { masterListId: '' } },
        },
      }}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ masterData }}
    />
  ),
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
