import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    gender: { en: 'Gender', gu: 'લિંગ' },
  },
  help: {
    gender: { en: 'Select one option', gu: 'એક વિકલ્પ પસંદ કરો' },
  },
  errors: {
    gender: { en: 'Gender is required', gu: 'લિંગ જરૂરી છે' },
  },
}

const meta = {
  title: 'Widgets/Gender',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['gender'],
  properties: {
    gender: {
      type: 'string' as const,
      title: 'Gender',
      // Arbitrary enum must be ignored by the widget.
      enum: ['X', 'Y', 'Z'],
    },
  },
}

const uiSchema = { gender: { 'ui:widget': 'gender' } }

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const Selected: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ gender: 'F' }}
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
      formData={{ gender: 'M' }}
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
      formData={{ gender: 'OTHER' }}
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
    />
  ),
}
