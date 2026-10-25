import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent, PrefillBinding } from '@citizen/form-contract'

import type { CafPrefillAdapter } from '../runtime/service-ports'
import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    caf_name: { en: 'Citizen name', gu: 'નાગરિકનું નામ' },
  },
  help: {
    caf_name: {
      en: 'Prefill from CAF / Golden Record when confidence is sufficient.',
      gu: 'પર્યાપ્ત વિશ્વાસ સાથે CAF / Golden Record થી પૂર્વ-ભરણ.',
    },
  },
  errors: {},
}

const bindings: readonly PrefillBinding[] = [
  { fieldId: 'caf_name', cafAttribute: 'person.fullName', confidenceMin: 0.8 },
]

const highConfidence: CafPrefillAdapter = {
  async resolvePrefill() {
    await new Promise((r) => setTimeout(r, 200))
    return { value: 'Demo Citizen', confidence: 0.95 }
  },
}

const lowConfidence: CafPrefillAdapter = {
  async resolvePrefill() {
    await new Promise((r) => setTimeout(r, 150))
    return { value: 'Hidden', confidence: 0.2 }
  },
}

const meta = {
  title: 'Widgets/CAF Prefill',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

const schema = {
  type: 'object' as const,
  properties: {
    caf_name: {
      type: 'object' as const,
      title: 'Citizen name',
      properties: {
        value: { type: 'string' as const },
        source: { type: 'string' as const, enum: ['CAF', 'OVERRIDE'] },
      },
      required: ['value', 'source'],
      additionalProperties: false,
    },
  },
}

const uiSchema = { caf_name: { 'ui:field': 'caf-prefill' } }

export const English: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      locale="en"
      services={{ cafPrefill: highConfidence }}
      prefillBindings={bindings}
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
      services={{ cafPrefill: highConfidence }}
      prefillBindings={bindings}
    />
  ),
}

export const LowConfidence: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ cafPrefill: lowConfidence }}
      prefillBindings={bindings}
    />
  ),
}

export const MissingAdapter: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      prefillBindings={bindings}
    />
  ),
}

export const Disabled: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ cafPrefill: highConfidence }}
      prefillBindings={bindings}
      formData={{ caf_name: { value: 'Demo Citizen', source: 'CAF' } }}
      disabled
    />
  ),
}

export const Readonly: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      services={{ cafPrefill: highConfidence }}
      prefillBindings={bindings}
      formData={{ caf_name: { value: 'Demo Citizen', source: 'CAF' } }}
      readOnly
    />
  ),
}
