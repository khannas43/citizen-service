import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { EmailVerificationAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    contactEmail: { en: 'Email address', gu: 'ઇમેઇલ સરનામું' },
  },
  help: {
    contactEmail: { en: 'Official contact email', gu: 'અધિકૃત સંપર્ક ઇમેઇલ' },
  },
  errors: {
    contactEmail: { en: 'Enter a valid email', gu: 'માન્ય ઇમેઇલ દાખલ કરો' },
  },
}

const successAdapter: EmailVerificationAdapter = {
  async requestVerificationLink() {
    await new Promise((r) => setTimeout(r, 200))
    return { requestId: 'demo-1' }
  },
}

const failAdapter: EmailVerificationAdapter = {
  async requestVerificationLink() {
    await new Promise((r) => setTimeout(r, 100))
    throw new Error('network')
  },
}

const meta = {
  title: 'Widgets/Email',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const baseSchema = {
  type: 'object' as const,
  required: ['contactEmail'],
  properties: {
    contactEmail: {
      type: 'string' as const,
      format: 'email',
      title: 'Email address',
    },
  },
}

const verifySchema = {
  ...baseSchema,
  properties: {
    contactEmail: {
      ...baseSchema.properties.contactEmail,
      'x-dg20': { verifyEmail: true },
    },
  },
}

const uiSchema = { contactEmail: { 'ui:widget': 'email' } }

export const English: Story = {
  render: () => (
    <DemoForm schema={baseSchema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />
  ),
}

export const Gujarati: Story = {
  render: () => (
    <DemoForm schema={baseSchema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />
  ),
}

export const WithVerificationSuccess: Story = {
  render: () => (
    <DemoForm
      schema={verifySchema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ contactEmail: 'citizen@example.gov.in' }}
      services={{ emailVerification: successAdapter }}
    />
  ),
}

export const WithVerificationFailure: Story = {
  render: () => (
    <DemoForm
      schema={verifySchema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ contactEmail: 'citizen@example.gov.in' }}
      services={{ emailVerification: failAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => (
    <DemoForm
      schema={verifySchema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ contactEmail: 'citizen@example.gov.in' }}
    />
  ),
}

export const Disabled: Story = {
  render: () => (
    <DemoForm
      schema={baseSchema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      disabled
      formData={{ contactEmail: 'locked@example.gov.in' }}
    />
  ),
}

export const WithError: Story = {
  render: () => (
    <DemoForm
      schema={baseSchema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      liveValidate
      formData={{ contactEmail: 'not-an-email' }}
    />
  ),
}
