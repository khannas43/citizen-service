import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import type { NameTransliterationAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    applicant_full_name: { en: 'Full name', gu: 'પૂરું નામ' },
  },
  help: {
    applicant_full_name: {
      en: 'Enter English and Gujarati names',
      gu: 'અંગ્રેજી અને ગુજરાતી નામ દાખલ કરો',
    },
  },
  errors: {},
}

const adapter: NameTransliterationAdapter = {
  async transliterateEnglishToGujarati({ englishName }) {
    await new Promise((r) => setTimeout(r, 150))
    return { gujaratiSuggested: `${englishName} (ગુ)` }
  },
}

const meta = {
  title: 'Widgets/FullName',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  required: ['applicant_full_name'],
  properties: {
    applicant_full_name: {
      type: 'object' as const,
      title: 'Full name',
      properties: {
        en: { type: 'string' as const },
        gu: { type: 'string' as const },
      },
      required: ['en', 'gu'],
      additionalProperties: false,
    },
  },
}

const uiSchema = { applicant_full_name: { 'ui:field': 'full-name' } }

export const English: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const Gujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const WithTransliteration: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ applicant_full_name: { en: 'Priya Patel', gu: '' } }}
      services={{ nameTransliteration: adapter }}
    />
  ),
}

export const ManualGujaratiProtected: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ applicant_full_name: { en: 'Priya Patel', gu: 'પ્રિયા પટેલ' } }}
      services={{ nameTransliteration: adapter }}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ applicant_full_name: { en: 'Priya', gu: '' } }}
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
      formData={{ applicant_full_name: { en: 'Priya Patel', gu: 'પ્રિયા પટેલ' } }}
    />
  ),
}
