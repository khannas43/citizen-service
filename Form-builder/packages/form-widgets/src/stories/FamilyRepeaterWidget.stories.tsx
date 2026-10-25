import type { Meta, StoryObj } from '@storybook/react'

import type { BilingualContent } from '@citizen/form-contract'

import { DemoForm } from '../widgets/DemoForm'

const bilingual: BilingualContent = {
  labels: {
    family_members: {
      en: 'Family members',
      gu: 'કુટુંબ સભ્યો',
    },
    member_name: {
      en: 'Name',
      gu: 'નામ',
    },
    relationship: {
      en: 'Relationship',
      gu: 'સંબંધ',
    },
  },
  help: {
    family_members: {
      en: 'Add each dependent family member.',
      gu: 'દરેક આશ્રિત કુટુંબ સભ્ય ઉમેરો.',
    },
  },
  errors: {},
}

const memberSchema = {
  type: 'object' as const,
  additionalProperties: false as const,
  properties: {
    member_name: { type: 'string' as const, title: 'Name' },
    relationship: { type: 'string' as const, title: 'Relationship' },
  },
}

const schema = {
  type: 'object' as const,
  properties: {
    family_members: {
      type: 'array' as const,
      title: 'Family members',
      minItems: 0,
      maxItems: 5,
      items: memberSchema,
    },
  },
}

const uiSchema = {
  family_members: {
    'ui:field': 'family-repeater',
    items: {
      member_name: { 'ui:widget': 'text-short' },
      relationship: { 'ui:widget': 'text-short' },
      'ui:order': ['member_name', 'relationship'],
    },
  },
}

const meta = {
  title: 'Widgets/FamilyRepeater',
  parameters: { bilingual },
} satisfies Meta

export default meta
type Story = StoryObj

export const EmptyEnglish: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="en" />,
}

export const EmptyGujarati: Story = {
  render: () => <DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />,
}

export const WithMembers: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        family_members: [
          { member_name: 'Asha', relationship: 'Spouse' },
          { member_name: 'Rohit', relationship: 'Child' },
        ],
      }}
    />
  ),
}

export const BelowMinimum: Story = {
  render: () => (
    <DemoForm
      schema={{
        ...schema,
        properties: {
          family_members: {
            ...schema.properties.family_members,
            minItems: 2,
            maxItems: 5,
          },
        },
      }}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ family_members: [{ member_name: 'Only one', relationship: 'Child' }] }}
    />
  ),
}

export const AtMaximum: Story = {
  render: () => (
    <DemoForm
      schema={{
        ...schema,
        properties: {
          family_members: {
            ...schema.properties.family_members,
            minItems: 0,
            maxItems: 2,
          },
        },
      }}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{
        family_members: [
          { member_name: 'One', relationship: 'Spouse' },
          { member_name: 'Two', relationship: 'Child' },
        ],
      }}
    />
  ),
}

export const InvalidConfig: Story = {
  render: () => (
    <DemoForm
      schema={{
        type: 'object' as const,
        properties: {
          family_members: {
            type: 'array' as const,
            title: 'Family members',
            maxItems: 5,
            items: { type: 'string' as const },
          },
        },
      }}
      uiSchema={uiSchema}
      bilingual={bilingual}
    />
  ),
}

export const MalformedIncoming: Story = {
  render: () => (
    <DemoForm
      schema={schema}
      uiSchema={uiSchema}
      bilingual={bilingual}
      formData={{ family_members: true }}
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
      formData={{
        family_members: [{ member_name: 'Asha', relationship: 'Spouse' }],
      }}
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
      formData={{
        family_members: [{ member_name: 'Asha', relationship: 'Spouse' }],
      }}
    />
  ),
}
