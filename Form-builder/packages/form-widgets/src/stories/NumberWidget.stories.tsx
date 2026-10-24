import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    dependents: { en: 'Number of dependents', gu: 'આશ્રિતોની સંખ્યા' },
  },
  help: {
    dependents: { en: 'Whole numbers only', gu: 'ફક્ત પૂર્ણાંકો' },
  },
  errors: {},
}

const meta = {
  title: 'Widgets/Number',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    dependents: {
      type: 'number' as const,
      minimum: 0,
      maximum: 20,
      multipleOf: 1,
      title: 'Number of dependents',
    },
  },
}

const uiSchema = {
  dependents: { 'ui:widget': 'number' },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const Boundary: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ dependents: 20 }}
    />
  ),
}

export const Empty: Story = {
  render: () => (
    <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} formData={{}} />
  ),
}

export const WithError: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ dependents: 99 }}
      liveValidate
    />
  ),
}
