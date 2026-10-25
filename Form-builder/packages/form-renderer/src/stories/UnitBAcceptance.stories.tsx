import type { Meta, StoryObj } from '@storybook/react'
import { useMemo, useState, type ReactElement } from 'react'

import type { CafPrefillAdapter } from '@citizen/form-widgets'

import {
  ACCEPTANCE_CAF_ATTRIBUTES,
  createRepresentativeIncomeCertificateDefinition,
} from '../../acceptance/representative-income-certificate.js'
import { FormRenderer } from '../FormRenderer.js'
import type { ProgressiveAutosaveAdapter } from '../progressive-autosave.js'
import type { ProgressiveResumeAdapter } from '../progressive-resume.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../styles/renderer.css'

/**
 * FB-B6 Storybook acceptance surfaces — synthetic in-memory adapters only.
 * Representative fixture; not an approved production DG form.
 */

const definition = createRepresentativeIncomeCertificateDefinition()

function createStoryCaf(): CafPrefillAdapter {
  return {
    async resolvePrefill(request) {
      if (request.cafAttribute === ACCEPTANCE_CAF_ATTRIBUTES.fatherName) {
        return { value: 'Ramesh Patel', confidence: 0.95 }
      }
      if (request.cafAttribute === ACCEPTANCE_CAF_ATTRIBUTES.motherName) {
        return { value: 'LowConfidence', confidence: 0.2 }
      }
      return { found: false }
    },
  }
}

function createStoryAutosave(): ProgressiveAutosaveAdapter {
  return {
    async saveProgress() {
      // In-memory no-op for Storybook demos.
    },
  }
}

function createNotFoundResume(): ProgressiveResumeAdapter {
  return {
    async loadProgress(request) {
      return {
        status: 'not_found',
        serviceId: request.serviceId,
        formVersion: request.formVersion,
        resumeContextRevision: request.resumeContextRevision,
      }
    },
  }
}

function createFoundResume(): ProgressiveResumeAdapter {
  return {
    async loadProgress(request) {
      return {
        status: 'found',
        serviceId: request.serviceId,
        formVersion: request.formVersion,
        resumeContextRevision: request.resumeContextRevision,
        formData: {
          applicant_name: 'Asha Patel',
          gender: 'F',
          caf_father_name: { value: 'Restored Father', source: 'CAF' },
          caf_mother_name: { value: 'Restored Mother', source: 'OVERRIDE' },
          household_size: 3,
          contact_email: 'asha@example.gov.in',
          annual_income: 120000,
        },
        checkpoint: { completedStepId: 'identity', completedStepIndex: 0 },
      }
    },
  }
}

function AcceptanceShell(props: {
  readonly locale: 'en' | 'gu'
  readonly resumeAdapter: ProgressiveResumeAdapter
  readonly resumeContextRevision: string
  readonly initialFormData?: Record<string, unknown>
}): ReactElement {
  const [formData, setFormData] = useState<Record<string, unknown>>(
    () => props.initialFormData ?? {},
  )
  const caf = useMemo(() => createStoryCaf(), [])
  const autosave = useMemo(() => createStoryAutosave(), [])
  return (
    <FormRenderer
      definition={definition}
      formData={formData}
      onChange={({ formData: next }) => setFormData({ ...next })}
      onSubmit={() => {
        // Storybook demo — no network.
      }}
      autosaveAdapter={autosave}
      resumeAdapter={props.resumeAdapter}
      resumeContextRevision={props.resumeContextRevision}
      services={{ cafPrefill: caf }}
      locale={props.locale}
      showLocaleToggle
    />
  )
}

const meta = {
  title: 'Acceptance/Unit B Income Certificate',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Representative Income Certificate acceptance fixture (FB-B6). Not an authoritative DST-approved production form. Synthetic in-memory adapters only.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const FreshEnglish: Story = {
  name: 'Fresh English journey',
  render: () => (
    <AcceptanceShell
      locale="en"
      resumeAdapter={createNotFoundResume()}
      resumeContextRevision="story-fresh-en"
    />
  ),
}

export const GujaratiPresentation: Story = {
  name: 'Gujarati presentation',
  render: () => (
    <AcceptanceShell
      locale="gu"
      resumeAdapter={createNotFoundResume()}
      resumeContextRevision="story-fresh-gu"
    />
  ),
}

export const ResumedJourney: Story = {
  name: 'Resumed journey',
  render: () => (
    <AcceptanceShell
      locale="en"
      resumeAdapter={createFoundResume()}
      resumeContextRevision="story-resume"
      initialFormData={{
        applicant_name: 'Asha Patel',
        gender: 'F',
        caf_father_name: { value: 'Restored Father', source: 'CAF' },
        caf_mother_name: { value: 'Restored Mother', source: 'OVERRIDE' },
        household_size: 3,
        contact_email: 'asha@example.gov.in',
        annual_income: 120000,
      }}
    />
  ),
}
