import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { FeeComputationAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const FEE_RULE = 'FEE_RULE_STORY_V1'
const CTX_REV = 'ctx-rev-story-001'

const bilingual: BilingualContent = {
  labels: {
    service_fee: { en: 'Service fee', gu: 'સેવા ફી' },
  },
  help: {
    service_fee: {
      en: 'Calculated from the current application context.',
      gu: 'વર્તમાન અરજી સંદર્ભમાંથી ગણાયેલું.',
    },
  },
  errors: {},
}

const feeAdapter: FeeComputationAdapter = {
  async computeFee(request) {
    return {
      feeRuleId: request.feeRuleId,
      contextRevision: request.contextRevision,
      currency: 'INR',
      amountMinor: 25000,
      quoteRef: `fee-quote:${request.feeRuleId}:${request.contextRevision}`,
    }
  },
}

const zeroAdapter: FeeComputationAdapter = {
  async computeFee(request) {
    return {
      feeRuleId: request.feeRuleId,
      contextRevision: request.contextRevision,
      currency: 'INR',
      amountMinor: 0,
      quoteRef: `fee-quote-zero:${request.contextRevision}`,
    }
  },
}

const delayedAdapter: FeeComputationAdapter = {
  async computeFee(request) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return {
      feeRuleId: request.feeRuleId,
      contextRevision: request.contextRevision,
      currency: 'INR',
      amountMinor: 12500,
      quoteRef: `fee-quote-delayed:${request.contextRevision}`,
    }
  },
}

const failingAdapter: FeeComputationAdapter = {
  async computeFee() {
    throw new Error('synthetic fee failure')
  },
}

const meta = {
  title: 'Widgets/FeeField',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    service_fee: {
      type: 'object' as const,
      title: 'Service fee',
      properties: {
        feeRuleId: { type: 'string' as const },
        contextRevision: { type: 'string' as const },
        currency: { type: 'string' as const },
        amountMinor: { type: 'integer' as const },
        quoteRef: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': { feeRuleId: FEE_RULE },
    },
  },
}

const uiSchema = { service_fee: { 'ui:field': 'fee-field' } }

const currentQuote = {
  feeRuleId: FEE_RULE,
  contextRevision: CTX_REV,
  currency: 'INR' as const,
  amountMinor: 25000,
  quoteRef: `fee-quote:${FEE_RULE}:${CTX_REV}`,
}

export const Calculating: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      feeContextRevision={CTX_REV}
      services={{ feeComputation: delayedAdapter }}
    />
  ),
}

export const ComputedEnglish: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      feeContextRevision={CTX_REV}
      formData={{ service_fee: currentQuote }}
      services={{ feeComputation: feeAdapter }}
    />
  ),
}

export const ComputedGujarati: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="gu"
      feeContextRevision={CTX_REV}
      formData={{ service_fee: currentQuote }}
      services={{ feeComputation: feeAdapter }}
    />
  ),
}

export const ZeroFee: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      feeContextRevision={CTX_REV}
      services={{ feeComputation: zeroAdapter }}
    />
  ),
}

export const StaleRevision: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      feeContextRevision="ctx-rev-story-002"
      formData={{
        service_fee: {
          ...currentQuote,
          contextRevision: 'ctx-rev-story-001',
        },
      }}
      services={{ feeComputation: feeAdapter }}
    />
  ),
}

export const FailureRetry: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      feeContextRevision={CTX_REV}
      services={{ feeComputation: failingAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      feeContextRevision={CTX_REV}
    />
  ),
}

export const MissingContextRevision: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ feeComputation: feeAdapter }}
    />
  ),
}

export const MalformedIncoming: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      feeContextRevision={CTX_REV}
      formData={{ service_fee: { amount: 250 } }}
      services={{ feeComputation: feeAdapter }}
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
      feeContextRevision={CTX_REV}
      formData={{ service_fee: currentQuote }}
      services={{ feeComputation: feeAdapter }}
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
      feeContextRevision={CTX_REV}
      formData={{ service_fee: currentQuote }}
      services={{ feeComputation: feeAdapter }}
    />
  ),
}
