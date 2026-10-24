import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    income: { en: 'Annual income', gu: 'વાર્ષિક આવક' },
  },
  help: {
    income: { en: 'Enter amount in rupees', gu: 'રૂપિયામાં રકમ દાખલ કરો' },
  },
  errors: {},
}

const meta = {
  title: 'Widgets/CurrencyInr',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    income: {
      type: 'number' as const,
      minimum: 0,
      maximum: 1000000,
      title: 'Annual income',
    },
  },
}

const uiSchema = {
  income: { 'ui:widget': 'currency-inr' },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const WithValue: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ income: 12500.5 }}
    />
  ),
}

export const Readonly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      readOnly
      formData={{ income: 1000 }}
    />
  ),
}

export const WithError: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      liveValidate
      extraErrors={{ income: { __errors: ['Income is required'] } }}
    />
  ),
}
