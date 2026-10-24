import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { MasterDataAdapter, MasterDataOption } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    benefits: { en: 'Benefits', gu: 'લાભ' },
  },
  help: {
    benefits: { en: 'Select one or more', gu: 'એક અથવા વધુ પસંદ કરો' },
  },
  errors: {
    benefits: { en: 'Select at least one benefit', gu: 'ઓછામાં ઓછો એક લાભ પસંદ કરો' },
  },
}

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const masterData: MasterDataAdapter = {
  async listOptions() {
    return [
      opt('FOOD', 'Food', 'ખોરાક'),
      opt('SHELTER', 'Shelter', 'આશ્રય'),
      opt('HEALTH', 'Health', 'આરોગ્ય'),
      opt('EDU', 'Education', 'શિક્ષણ'),
    ]
  },
}

const meta = {
  title: 'Widgets/Multiselect',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['benefits'],
  properties: {
    benefits: {
      type: 'array' as const,
      title: 'Benefits',
      items: { type: 'string' as const },
      minItems: 1,
      maxItems: 3,
      'x-dg20': { masterListId: 'LIST_BENEFITS' },
    },
  },
}

const uiSchema = { benefits: { 'ui:widget': 'multiselect' } }

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
      formData={{ benefits: ['FOOD', 'HEALTH'] }}
      services={{ masterData }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const AtMaximum: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ benefits: ['FOOD', 'SHELTER', 'HEALTH'] }}
      services={{ masterData }}
    />
  ),
}
