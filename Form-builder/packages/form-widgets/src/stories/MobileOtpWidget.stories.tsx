import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { MobileOtpAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

/** SYNTHETIC Storybook mobile — not a real citizen number. */
const SYNTHETIC_MOBILE = '9876543210'

const bilingual: BilingualContent = {
  labels: {
    mobile_otp: { en: 'Mobile number', gu: 'મોબાઇલ નંબર' },
  },
  help: {
    mobile_otp: {
      en: 'Demo SMS OTP only — synthetic adapter.',
      gu: 'ડેમો SMS OTP — સિન્થેટિક એડેપ્ટર.',
    },
  },
  errors: {},
}

const successAdapter: MobileOtpAdapter = {
  async sendOtp() {
    await new Promise((r) => setTimeout(r, 200))
    return { challengeId: 'demo-chal', otpLength: 6 }
  },
  async verifyOtp() {
    await new Promise((r) => setTimeout(r, 200))
    return { verificationRef: 'demo-ver-ref' }
  },
}

const failVerifyAdapter: MobileOtpAdapter = {
  async sendOtp() {
    await new Promise((r) => setTimeout(r, 100))
    return { challengeId: 'demo-chal-fail', otpLength: 4 }
  },
  async verifyOtp() {
    await new Promise((r) => setTimeout(r, 100))
    throw new Error('demo-verify-fail')
  },
}

const meta = {
  title: 'Widgets/Mobile OTP',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['mobile_otp'],
  properties: {
    mobile_otp: {
      type: 'object' as const,
      title: 'Mobile number',
      properties: {
        mobileNumber: { type: 'string' as const },
        verified: { type: 'boolean' as const },
        verificationRef: { type: 'string' as const },
      },
      required: ['mobileNumber', 'verified'],
      additionalProperties: false,
      'x-dg20': { otpChannels: ['sms'] },
    },
  },
}

const uiSchema = { mobile_otp: { 'ui:field': 'mobile-otp' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ mobileOtp: successAdapter }}
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
      services={{ mobileOtp: successAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const PrefilledUnverified: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ mobile_otp: { mobileNumber: SYNTHETIC_MOBILE, verified: false } }}
      services={{ mobileOtp: successAdapter }}
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
        mobile_otp: {
          mobileNumber: SYNTHETIC_MOBILE,
          verified: true,
          verificationRef: 'demo-ver-ref',
        },
      }}
      services={{ mobileOtp: successAdapter }}
    />
  ),
}

export const VerifyFailure: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ mobile_otp: { mobileNumber: SYNTHETIC_MOBILE, verified: false } }}
      services={{ mobileOtp: failVerifyAdapter }}
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
      formData={{
        mobile_otp: {
          mobileNumber: SYNTHETIC_MOBILE,
          verified: true,
          verificationRef: 'demo-ver-ref',
        },
      }}
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
      formData={{ mobile_otp: { mobileNumber: SYNTHETIC_MOBILE, verified: false } }}
      services={{ mobileOtp: successAdapter }}
    />
  ),
}
