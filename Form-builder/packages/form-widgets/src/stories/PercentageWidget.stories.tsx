import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    disability: { en: 'Disability percentage', gu: 'વિકલાંગતા ટકાવારી' },
  },
  help: {
    disability: { en: 'Between 0 and 100', gu: '0 થી 100 વચ્ચે' },
  },
  errors: {},
}

const meta = {
  title: 'Widgets/Percentage',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    disability: {
      type: 'number' as const,
      minimum: 0,
      maximum: 100,
      multipleOf: 0.5,
      title: 'Disability percentage',
    },
  },
}

const uiSchema = {
  disability: { 'ui:widget': 'percentage' },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const BoundaryZero: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ disability: 0 }}
    />
  ),
}

export const BoundaryHundred: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ disability: 100 }}
    />
  ),
}

export const WithError: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ disability: 150 }}
      liveValidate
    />
  ),
}
