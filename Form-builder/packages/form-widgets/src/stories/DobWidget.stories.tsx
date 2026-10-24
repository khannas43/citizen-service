import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    date_of_birth: { en: 'Date of birth', gu: 'જન્મ તારીખ' },
  },
  help: {
    date_of_birth: { en: 'As per Aadhaar', gu: 'આધાર મુજબ' },
  },
  errors: {},
}

const clock = { todayIso: () => '2026-07-20' }

const meta = {
  title: 'Widgets/Dob',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['date_of_birth'],
  properties: {
    date_of_birth: {
      type: 'string' as const,
      format: 'date',
      title: 'Date of birth',
      'x-dg20': { minAge: 18, maxAge: 60 },
    },
  },
}

const invalidConfigSchema = {
  type: 'object' as const,
  properties: {
    date_of_birth: {
      type: 'string' as const,
      format: 'date',
      title: 'Date of birth',
      'x-dg20': { minAge: 40, maxAge: 18 },
    },
  },
}

const uiSchema = { date_of_birth: { 'ui:widget': 'dob' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ clock }}
      formData={{ date_of_birth: '1990-01-15' }}
    />
  ),
}

export const Gujarati: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="gu"
      services={{ clock }}
      formData={{ date_of_birth: '1990-01-15' }}
    />
  ),
}

export const AgeBoundary: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ clock }}
      formData={{ date_of_birth: '2008-07-20' }}
    />
  ),
}

export const AgeGateViolation: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ clock }}
      formData={{ date_of_birth: '2015-01-01' }}
    />
  ),
}

export const InvalidConfiguration: Story = {
  render: () => (
    <DemoForm
      schema={invalidConfigSchema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ clock }}
    />
  ),
}

export const Empty: Story = {
  render: () => (
    <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} services={{ clock }} />
  ),
}
