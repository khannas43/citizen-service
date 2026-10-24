import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@dg20/form-contract'

import type { ESignAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const CTX_REV = 'ctx-esign-story-001'
const CTX_STALE = 'ctx-esign-story-000'
const FIELD = 'applicant_signature'
const REF = `esign-artefact:${FIELD}:${CTX_REV}:001`

const bilingual: BilingualContent = {
  labels: {
    applicant_signature: {
      en: 'Applicant signature',
      gu: 'અરજદારની સહી',
    },
  },
  help: {
    applicant_signature: {
      en: 'Sign the application with eSign.',
      gu: 'eSign વડે અરજી પર સહી કરો.',
    },
  },
  errors: {},
}

const signingAdapter: ESignAdapter = {
  async requestSignature(request) {
    return {
      status: 'SIGNED',
      contextRevision: request.contextRevision,
      signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:ok`,
    }
  },
}

const delayedAdapter: ESignAdapter = {
  async requestSignature(request) {
    await new Promise((resolve) => setTimeout(resolve, 800))
    return {
      status: 'SIGNED',
      contextRevision: request.contextRevision,
      signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:delayed`,
    }
  },
}

const cancelAdapter: ESignAdapter = {
  async requestSignature(request) {
    return {
      status: 'CANCELLED',
      contextRevision: request.contextRevision,
    }
  },
}

const failingAdapter: ESignAdapter = {
  async requestSignature() {
    throw new Error('synthetic eSign failure')
  },
}

const meta = {
  title: 'Widgets/SignatureESign',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    applicant_signature: {
      type: 'object' as const,
      title: 'Applicant signature',
      properties: {
        contextRevision: { type: 'string' as const },
        signedArtefactRef: { type: 'string' as const },
      },
      additionalProperties: false,
    },
  },
}

const uiSchema = { applicant_signature: { 'ui:field': 'signature-esign' } }

export const UnsignedEnglish: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      eSignContextRevision={CTX_REV}
      services={{ eSign: signingAdapter }}
    />
  ),
}

export const UnsignedGujarati: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="gu"
      eSignContextRevision={CTX_REV}
      services={{ eSign: signingAdapter }}
    />
  ),
}

export const Signing: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      eSignContextRevision={CTX_REV}
      services={{ eSign: delayedAdapter }}
    />
  ),
}

export const Signed: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      eSignContextRevision={CTX_REV}
      formData={{
        applicant_signature: {
          contextRevision: CTX_REV,
          signedArtefactRef: REF,
        },
      }}
      services={{ eSign: signingAdapter }}
    />
  ),
}

export const Stale: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      eSignContextRevision={CTX_REV}
      formData={{
        applicant_signature: {
          contextRevision: CTX_STALE,
          signedArtefactRef: `esign-artefact:${FIELD}:${CTX_STALE}:001`,
        },
      }}
      services={{ eSign: signingAdapter }}
    />
  ),
}

export const CancelledRetry: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      eSignContextRevision={CTX_REV}
      services={{ eSign: cancelAdapter }}
    />
  ),
}

export const FailureRetry: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      eSignContextRevision={CTX_REV}
      services={{ eSign: failingAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      eSignContextRevision={CTX_REV}
    />
  ),
}

export const MissingContext: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ eSign: signingAdapter }}
    />
  ),
}

export const MalformedIncoming: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      eSignContextRevision={CTX_REV}
      formData={{ applicant_signature: true }}
      services={{ eSign: signingAdapter }}
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
      eSignContextRevision={CTX_REV}
      formData={{
        applicant_signature: {
          contextRevision: CTX_REV,
          signedArtefactRef: REF,
        },
      }}
      services={{ eSign: signingAdapter }}
    />
  ),
}

export const ReadOnly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      readOnly
      eSignContextRevision={CTX_REV}
      formData={{
        applicant_signature: {
          contextRevision: CTX_REV,
          signedArtefactRef: REF,
        },
      }}
      services={{ eSign: signingAdapter }}
    />
  ),
}
