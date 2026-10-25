import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    remarks: { en: 'Remarks', gu: 'ટિપ્પણી' },
  },
  help: {
    remarks: { en: 'Provide additional details', gu: 'વધારાની વિગતો આપો' },
  },
  errors: {},
}

const meta = {
  title: 'Widgets/TextLong',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    remarks: {
      type: 'string' as const,
      maxLength: 120,
      title: 'Remarks',
    },
  },
}

const uiSchema = {
  remarks: {
    'ui:widget': 'text-long',
    'ui:placeholder': 'Describe your request…',
  },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const WithCounter: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ remarks: 'Initial remarks text' }}
    />
  ),
}

export const Disabled: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      disabled
      formData={{ remarks: 'Disabled text' }}
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
      extraErrors={{ remarks: { __errors: ['Remarks are required'] } }}
    />
  ),
}
