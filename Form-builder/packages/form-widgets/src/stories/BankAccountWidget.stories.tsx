import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { BankAccountVerificationAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    bank_account: { en: 'Bank account', gu: 'બેંક ખાતું' },
  },
  help: {
    bank_account: {
      en: 'Enter account details and verify the account holder name.',
      gu: 'ખાતાની વિગતો દાખલ કરો અને ખાતાધારકનું નામ ચકાસો.',
    },
  },
  errors: {},
}

const SYNTHETIC_ACCOUNT = '001234567890'
const SYNTHETIC_IFSC = 'SBIN0001234'
const SYNTHETIC_NAME = 'Priya Sharma'

const matchingAdapter: BankAccountVerificationAdapter = {
  async verifyAccountName() {
    return { verified: true, verificationRef: 'bank-ref-story-001' }
  },
}

const mismatchAdapter: BankAccountVerificationAdapter = {
  async verifyAccountName() {
    return { verified: false }
  },
}

const delayedAdapter: BankAccountVerificationAdapter = {
  async verifyAccountName() {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return { verified: true, verificationRef: 'bank-ref-delayed-001' }
  },
}

const meta = {
  title: 'Widgets/BankAccount',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    bank_account: {
      type: 'object' as const,
      title: 'Bank account',
      properties: {
        accountNumber: { type: 'string' as const },
        ifsc: { type: 'string' as const },
        accountHolderName: { type: 'string' as const },
        verified: { type: 'boolean' as const },
        verificationRef: { type: 'string' as const },
      },
      additionalProperties: false,
    },
  },
}

const uiSchema = { bank_account: { 'ui:field': 'bank-account' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ bankAccountVerification: matchingAdapter }}
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
      services={{ bankAccountVerification: matchingAdapter }}
    />
  ),
}

export const Partial: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        bank_account: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          verified: false,
        },
      }}
      services={{ bankAccountVerification: matchingAdapter }}
    />
  ),
}

export const Verified: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        bank_account: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: 'bank-ref-story-001',
        },
      }}
      services={{ bankAccountVerification: matchingAdapter }}
    />
  ),
}

export const Mismatch: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        bank_account: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: false,
        },
      }}
      services={{ bankAccountVerification: mismatchAdapter }}
    />
  ),
}

export const Delayed: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        bank_account: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: false,
        },
      }}
      services={{ bankAccountVerification: delayedAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const Disabled: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      disabled
      formData={{
        bank_account: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: false,
        },
      }}
      services={{ bankAccountVerification: matchingAdapter }}
    />
  ),
}

export const ReadonlyMasked: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      readOnly
      formData={{
        bank_account: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: 'bank-ref-story-001',
        },
      }}
      services={{ bankAccountVerification: matchingAdapter }}
    />
  ),
}
