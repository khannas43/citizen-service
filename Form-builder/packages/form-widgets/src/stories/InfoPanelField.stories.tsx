import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    notice: { en: 'Important notice', gu: 'મહત્વની સૂચના' },
  },
  help: {
    notice: {
      en: 'Please keep your Aadhaar ready before continuing.',
      gu: 'આગળ વધતા પહેલાં તમારું આધાર તૈયાર રાખો.',
    },
  },
  errors: {},
}

const meta = {
  title: 'Fields/InfoPanel',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    notice: {
      type: 'object' as const,
      title: 'Important notice',
      description: 'Please keep your Aadhaar ready before continuing.',
      properties: {},
    },
  },
}

const uiSchema = {
  notice: { 'ui:field': 'info-panel' },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}
