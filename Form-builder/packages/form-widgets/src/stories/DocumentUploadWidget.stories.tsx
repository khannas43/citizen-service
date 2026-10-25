import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { FileStorageAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    doc_upload: { en: 'Supporting document', gu: 'સહાયક દસ્તાવેજ' },
  },
  help: {
    doc_upload: {
      en: 'Synthetic demo upload only — host adapter stores an object reference.',
      gu: 'માત્ર સિન્થેટિક ડેમો અપલોડ — હોસ્ટ એડેપ્ટર ઑબ્જેક્ટ સંદર્ભ સાચવે છે.',
    },
  },
  errors: {},
}

const successAdapter: FileStorageAdapter = {
  async storeFile({ file, purpose }) {
    await new Promise((r) => setTimeout(r, 200))
    return {
      status: 'CLEAN',
      objectRef: `demo-doc-${purpose}`,
      mimeType: file.type || 'application/pdf',
      sizeBytes: file.size,
    }
  },
}

const rejectAdapter: FileStorageAdapter = {
  async storeFile() {
    await new Promise((r) => setTimeout(r, 150))
    return { status: 'REJECTED' }
  },
}

const meta = {
  title: 'Widgets/Document Upload',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    doc_upload: {
      type: 'object' as const,
      title: 'Supporting document',
      properties: {
        objectRef: { type: 'string' as const },
        fileName: { type: 'string' as const },
        mimeType: { type: 'string' as const },
        sizeBytes: { type: 'number' as const },
        scanStatus: { type: 'string' as const, enum: ['CLEAN'] },
      },
      additionalProperties: false,
      'x-dg20': {
        allowedMimeTypes: ['application/pdf', 'image/jpeg'],
        maxFileSizeBytes: 2_097_152,
      },
    },
  },
}

const uiSchema = { doc_upload: { 'ui:field': 'doc-upload' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ fileStorage: successAdapter }}
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
      services={{ fileStorage: successAdapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />,
}

export const Rejected: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ fileStorage: rejectAdapter }}
    />
  ),
}

export const Readonly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ fileStorage: successAdapter }}
      formData={{
        doc_upload: {
          objectRef: 'demo-doc-DOCUMENT',
          fileName: 'sample.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          scanStatus: 'CLEAN',
        },
      }}
      readOnly
    />
  ),
}
