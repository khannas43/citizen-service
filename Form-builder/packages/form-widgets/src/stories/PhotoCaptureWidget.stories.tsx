import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { FileStorageAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    photo_capture: { en: 'Applicant photo', gu: 'અરજદારનો ફોટો' },
  },
  help: {
    photo_capture: {
      en: 'Synthetic photo upload demo. Provisional policy: JPEG/PNG, ≤5 MiB, 300–4096 px.',
      gu: 'સિન્થેટિક ફોટો અપલોડ ડેમો. અસ્થાયી નીતિ: JPEG/PNG, ≤5 MiB, 300–4096 px.',
    },
  },
  errors: {},
}

const successAdapter: FileStorageAdapter = {
  async storeFile({ file, purpose }) {
    await new Promise((r) => setTimeout(r, 200))
    return {
      status: 'CLEAN',
      objectRef: `demo-photo-${purpose}`,
      mimeType: file.type || 'image/jpeg',
      sizeBytes: file.size,
      width: 640,
      height: 480,
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
  title: 'Widgets/Photo Capture',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    photo_capture: {
      type: 'object' as const,
      title: 'Applicant photo',
      properties: {
        objectRef: { type: 'string' as const },
        mimeType: { type: 'string' as const },
        sizeBytes: { type: 'number' as const },
        width: { type: 'number' as const },
        height: { type: 'number' as const },
        scanStatus: { type: 'string' as const, enum: ['CLEAN'] },
      },
      additionalProperties: false,
    },
  },
}

const uiSchema = { photo_capture: { 'ui:field': 'photo-capture' } }

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
        photo_capture: {
          objectRef: 'demo-photo-PHOTO',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          width: 640,
          height: 480,
          scanStatus: 'CLEAN',
        },
      }}
      readOnly
    />
  ),
}
