import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    shortName: { en: 'Short name', gu: 'ટૂંકું નામ' },
  },
  help: {
    shortName: { en: 'Enter a short name', gu: 'ટૂંકું નામ દાખલ કરો' },
  },
  errors: {},
}

const meta = {
  title: 'Widgets/TextShort',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['shortName'],
  properties: {
    shortName: {
      type: 'string' as const,
      maxLength: 40,
      pattern: '^[A-Za-z ]*$',
      title: 'Short name',
    },
  },
}

const uiSchema = {
  shortName: {
    'ui:widget': 'text-short',
    'ui:placeholder': 'Priya Patel',
  },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const Required: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      liveValidate
      formData={{}}
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
      formData={{ shortName: 'Locked' }}
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
      formData={{ shortName: 'Read only value' }}
    />
  ),
}

export const WithError: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ shortName: '123' }}
      liveValidate
      extraErrors={{ shortName: { __errors: ['Must contain letters only'] } }}
    />
  ),
}
