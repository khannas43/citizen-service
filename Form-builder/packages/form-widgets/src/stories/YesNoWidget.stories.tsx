import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    consent: { en: 'Consent', gu: 'સંમતિ' },
  },
  help: {
    consent: { en: 'Confirm yes or no', gu: 'હા અથવા ના પસંદ કરો' },
  },
  errors: {
    consent: { en: 'Consent is required', gu: 'સંમતિ જરૂરી છે' },
  },
}

const meta = {
  title: 'Widgets/YesNo',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['consent'],
  properties: {
    consent: {
      type: 'boolean' as const,
      title: 'Consent',
      // Arbitrary enum must be ignored.
      enum: ['YES', 'NO', 1, 0],
    },
  },
}

const uiSchema = { consent: { 'ui:widget': 'yesno' } }

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const YesSelected: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ consent: true }}
    />
  ),
}

export const NoSelected: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ consent: false }}
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
      formData={{ consent: true }}
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
      formData={{ consent: false }}
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
