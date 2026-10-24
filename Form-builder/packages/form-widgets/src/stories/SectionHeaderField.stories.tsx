import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    sectionIdentity: { en: 'Identity details', gu: 'ઓળખ વિગતો' },
  },
  help: {},
  errors: {},
}

const meta = {
  title: 'Fields/SectionHeader',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    sectionIdentity: {
      type: 'object' as const,
      title: 'Identity details',
      properties: {},
    },
  },
}

const uiSchema = {
  sectionIdentity: {
    'ui:field': 'section-header',
  },
}

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}
