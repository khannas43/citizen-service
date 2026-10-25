import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    stepFamily: { en: 'Step: Family details', gu: 'પગલું: કુટુંબ વિગતો' },
  },
  help: {},
  errors: {},
}

const meta = {
  title: 'Fields/PageBreak',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    stepFamily: {
      type: 'object' as const,
      title: 'Step: Family details',
      properties: {},
    },
  },
}

const uiSchema = {
  stepFamily: { 'ui:field': 'page-break' },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}
