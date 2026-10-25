import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { CafPrefillAdapter, CafPrefillRequest } from '@citizen/form-widgets'

import {
  ACCEPTANCE_CAF_ATTRIBUTES,
  ACCEPTANCE_DATA_FIELD_KEYS,
  createRepresentativeIncomeCertificateDefinition,
} from '../acceptance/representative-income-certificate.js'
import { FormRenderer } from '../src/FormRenderer.js'
import type {
  ProgressiveAutosaveAdapter,
  ProgressiveAutosaveRequest,
} from '../src/progressive-autosave.js'
import type {
  ProgressiveResumeAdapter,
  ProgressiveResumeRequest,
  ProgressiveResumeResult,
  ProgressiveResumeStatusData,
} from '../src/progressive-resume.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

const definition = createRepresentativeIncomeCertificateDefinition()

const EXPECTED_SUBMITTED_FORM_DATA: Record<string, unknown> = {
  applicant_name: 'Asha Navin Patel',
  gender: 'F',
  caf_father_name: { value: 'Ramesh Patel', source: 'CAF' },
  caf_mother_name: { value: 'Sita Patel', source: 'OVERRIDE' },
  household_size: 4,
  contact_email: 'asha@example.gov.in',
  annual_income: 180000,
  purpose_statement: 'School fee concession application',
  agree_terms: true,
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createCafAdapter(
  impl: (
    request: CafPrefillRequest,
  ) => Promise<{ value: string; confidence: number } | { found: false }>,
): CafPrefillAdapter & { readonly resolvePrefill: ReturnType<typeof vi.fn> } {
  const resolvePrefill = vi.fn(async (request: CafPrefillRequest) => impl(request))
  return { resolvePrefill }
}

function createAcceptanceCafAdapter(): CafPrefillAdapter & {
  readonly resolvePrefill: ReturnType<typeof vi.fn>
} {
  return createCafAdapter(async (request) => {
    if (request.cafAttribute === ACCEPTANCE_CAF_ATTRIBUTES.fatherName) {
      return { value: 'Ramesh Patel', confidence: 0.95 }
    }
    if (request.cafAttribute === ACCEPTANCE_CAF_ATTRIBUTES.motherName) {
      return { value: 'LowConfidence', confidence: 0.2 }
    }
    return { found: false }
  })
}

function createAutosaveAdapter(
  impl?: (request: ProgressiveAutosaveRequest) => Promise<void>,
): ProgressiveAutosaveAdapter & {
  readonly calls: ProgressiveAutosaveRequest[]
  readonly saveProgress: ReturnType<typeof vi.fn>
} {
  const calls: ProgressiveAutosaveRequest[] = []
  const saveProgress = vi.fn(async (request: ProgressiveAutosaveRequest) => {
    calls.push({
      ...request,
      formData: structuredClone(request.formData),
    })
    if (impl) {
      await impl(request)
    }
  })
  return { calls, saveProgress }
}

function createResumeAdapter(
  impl: (request: ProgressiveResumeRequest) => Promise<ProgressiveResumeResult>,
): ProgressiveResumeAdapter & { readonly loadProgress: ReturnType<typeof vi.fn> } {
  const loadProgress = vi.fn(async (request: ProgressiveResumeRequest) => impl(request))
  return { loadProgress }
}

function assertExactDataBoundary(formData: Record<string, unknown>): void {
  expect(Object.keys(formData).sort()).toEqual([...ACCEPTANCE_DATA_FIELD_KEYS].sort())
  expect(formData).not.toHaveProperty('section_identity')
  expect(formData).not.toHaveProperty('section_household')
  expect(formData).not.toHaveProperty('section_declaration')
  const serialized = JSON.stringify(formData)
  expect(serialized).not.toMatch(
    /confidence|AbortSignal|settledEntry|awaiting_host|goldenRecord|resumeContextRevision|localStorage|sessionStorage|stack/i,
  )
}

function installBoundarySpies(): {
  restore: () => void
} {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('acceptance harness must not call fetch')
  })
  const lsGet = vi.spyOn(Storage.prototype, 'getItem')
  const lsSet = vi.spyOn(Storage.prototype, 'setItem')
  const lsRemove = vi.spyOn(Storage.prototype, 'removeItem')
  const lsClear = vi.spyOn(Storage.prototype, 'clear')
  return {
    restore() {
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(lsGet).not.toHaveBeenCalled()
      expect(lsSet).not.toHaveBeenCalled()
      expect(lsRemove).not.toHaveBeenCalled()
      expect(lsClear).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
      lsGet.mockRestore()
      lsSet.mockRestore()
      lsRemove.mockRestore()
      lsClear.mockRestore()
    },
  }
}

async function fillIdentityStep(
  user: ReturnType<typeof userEvent.setup>,
  options?: { readonly motherManual?: string },
): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText(/Applicant name/i)).toBeInTheDocument())
  await user.type(screen.getByLabelText(/Applicant name/i), 'Asha Patel')
  await user.click(screen.getByRole('radio', { name: /^Female$/i }))
  await waitFor(() => expect(screen.getByDisplayValue('Ramesh Patel')).toBeInTheDocument())
  await waitFor(() => expect(screen.getByText(/Enter this value manually/i)).toBeInTheDocument())
  const motherInput = screen.getByLabelText(/Mother name/i)
  await user.type(motherInput, options?.motherManual ?? 'Sita Patel')
}

async function fillHouseholdStep(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())
  await user.type(screen.getByLabelText(/Household size/i), '4')
  await user.type(screen.getByLabelText(/Email address/i), 'asha@example.gov.in')
  await user.type(screen.getByLabelText(/Annual income/i), '180000')
}

async function fillDeclarationStep(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await waitFor(() => expect(screen.getByText('Step 3 of 3')).toBeInTheDocument())
  await user.type(
    screen.getByLabelText(/Purpose of certificate/i),
    'School fee concession application',
  )
  await user.click(screen.getByRole('radio', { name: /^Yes$/i }))
}

describe('FB-B6 / B6.1 Unit B acceptance — fresh session', () => {
  let boundary: ReturnType<typeof installBoundarySpies>

  beforeEach(() => {
    boundary = installBoundarySpies()
  })

  afterEach(() => {
    boundary.restore()
  })

  it('completes bilingual progressive journey with exact autosave order and data boundary', async () => {
    const user = userEvent.setup()
    const caf = createAcceptanceCafAdapter()
    const timeline: string[] = []
    const resumeStatuses: ProgressiveResumeStatusData['status'][] = []
    const submits: unknown[] = []
    const onChange = vi.fn()
    const onStepChange = vi.fn((data: unknown) => {
      timeline.push('onStepChange')
      void data
    })
    const echoHostRef = { current: true }

    const autosave = createAutosaveAdapter(async () => {
      timeline.push('saveProgress')
    })

    const resume = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <FormRenderer
          definition={definition}
          formData={formData}
          onChange={(event) => {
            timeline.push('onChange')
            onChange(event)
            if (echoHostRef.current) {
              setFormData({ ...event.formData })
              timeline.push('host_echo')
            }
          }}
          onSubmit={(data) => submits.push(data)}
          onStepChange={onStepChange}
          autosaveAdapter={autosave}
          onAutosaveStatusChange={(data) => {
            if (data.status === 'saving') {
              timeline.push('saving')
            } else if (data.status === 'saved') {
              timeline.push('saved')
            }
          }}
          resumeAdapter={resume}
          resumeContextRevision="acceptance-rev-1"
          onResumeStatusChange={(data) => resumeStatuses.push(data.status)}
          services={{ cafPrefill: caf }}
          defaultLocale="en"
          showLocaleToggle
        />
      )
    }

    render(<Harness />)

    expect(screen.getByText(/Loading saved progress/i)).toBeInTheDocument()
    expect(caf.resolvePrefill).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dg20-widget="caf-prefill"]')).toBeNull()

    await waitFor(() => expect(resumeStatuses).toEqual(['loading', 'not_found']))
    await waitFor(() => expect(screen.getByText('Step 1 of 3')).toBeInTheDocument())
    await waitFor(() => expect(caf.resolvePrefill).toHaveBeenCalled())
    expect(resume.loadProgress.mock.invocationCallOrder[0]!).toBeLessThan(
      caf.resolvePrefill.mock.invocationCallOrder[0]!,
    )

    await fillIdentityStep(user)
    expect(screen.getByDisplayValue('Ramesh Patel')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Sita Patel')).toBeInTheDocument()

    const cafCallsAfterIdentity = caf.resolvePrefill.mock.calls.length
    await user.click(screen.getByRole('button', { name: /Gujarati|ગુજરાતી/i }))
    await waitFor(() => expect(screen.getByText(/પગલું 1/)).toBeInTheDocument())

    // Citizen-entered values may remain Latin script; fixture EN labels/help must not.
    expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument()
    expect(screen.getByText('અરજદારનું નામ')).toBeInTheDocument()
    expect(screen.getByText('ઓળખ વિગતો')).toBeInTheDocument()
    expect(screen.getByText('પિતાનું નામ')).toBeInTheDocument()
    expect(screen.getByText('માતાનું નામ')).toBeInTheDocument()
    expect(
      screen.getByText('સત્તાવાર રેકોર્ડ પરના તમારા સંપૂર્ણ કાનૂની નામ દાખલ કરો.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Applicant name')).toBeNull()
    expect(screen.queryByText('Identity details')).toBeNull()
    expect(screen.queryByText('Father name')).toBeNull()
    expect(screen.queryByText('Mother name')).toBeNull()
    expect(screen.queryByText('Enter your full legal name as on official records.')).toBeNull()
    expect(caf.resolvePrefill).toHaveBeenCalledTimes(cafCallsAfterIdentity)
    expect(autosave.saveProgress).not.toHaveBeenCalled()
    expect(submits).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /English|અંગ્રેજી/i }))
    await waitFor(() => expect(screen.getByText('Step 1 of 3')).toBeInTheDocument())
    expect(caf.resolvePrefill).toHaveBeenCalledTimes(cafCallsAfterIdentity)

    await user.clear(screen.getByLabelText(/Applicant name/i))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(autosave.saveProgress).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText(/Applicant name/i), 'Asha Patel')

    // Desync controlled host from step form so validated Next must emit onChange → echo → save.
    echoHostRef.current = false
    await user.clear(screen.getByLabelText(/Applicant name/i))
    await user.type(screen.getByLabelText(/Applicant name/i), 'Asha Navin Patel')
    echoHostRef.current = true

    timeline.length = 0
    onChange.mockClear()
    onStepChange.mockClear()
    autosave.saveProgress.mockClear()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(timeline).toEqual([
        'onChange',
        'host_echo',
        'saving',
        'saveProgress',
        'saved',
        'onStepChange',
      ]),
    )
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())
    expect(autosave.saveProgress).toHaveBeenCalledTimes(1)
    expect(onStepChange).toHaveBeenCalledTimes(1)
    expect(timeline.indexOf('saveProgress')).toBeGreaterThan(timeline.indexOf('host_echo'))
    expect(timeline.indexOf('onStepChange')).toBeGreaterThan(timeline.indexOf('saved'))
    expect(timeline.at(-1)).toBe('onStepChange')

    const firstAutosaveData = autosave.calls[0]!.formData as Record<string, unknown>
    expect(Object.keys(firstAutosaveData).sort()).toEqual(
      ['applicant_name', 'gender', 'caf_father_name', 'caf_mother_name'].sort(),
    )
    expect(firstAutosaveData).toEqual({
      applicant_name: 'Asha Navin Patel',
      gender: 'F',
      caf_father_name: { value: 'Ramesh Patel', source: 'CAF' },
      caf_mother_name: { value: 'Sita Patel', source: 'OVERRIDE' },
    })
    expect(firstAutosaveData).not.toHaveProperty('section_identity')

    await fillHouseholdStep(user)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByText('Step 1 of 3')).toBeInTheDocument())
    expect(screen.getByDisplayValue('Asha Navin Patel')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Ramesh Patel')).toBeInTheDocument()
    expect(autosave.saveProgress).toHaveBeenCalledTimes(1)
    expect(caf.resolvePrefill).toHaveBeenCalledTimes(cafCallsAfterIdentity)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(autosave.saveProgress).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())
    expect(screen.getByDisplayValue('4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(autosave.saveProgress).toHaveBeenCalledTimes(3))
    const householdAutosave = autosave.calls[2]!.formData as Record<string, unknown>
    expect(householdAutosave).toMatchObject({
      household_size: 4,
      contact_email: 'asha@example.gov.in',
      annual_income: 180000,
    })
    expect(householdAutosave).not.toHaveProperty('section_household')

    await fillDeclarationStep(user)
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await waitFor(() => expect(submits).toHaveLength(1))

    const payload = submits[0] as { formData: Record<string, unknown> }
    expect(Object.keys(payload)).toEqual(['formData'])
    expect(payload.formData).toEqual(EXPECTED_SUBMITTED_FORM_DATA)
    assertExactDataBoundary(payload.formData)
    expect(document.body.innerHTML).not.toMatch(/confidence|settledEntry|AbortSignal/i)
  })

  it('StrictMode invokes resume, CAF, and a single autosave path once', async () => {
    const user = userEvent.setup()
    const caf = createAcceptanceCafAdapter()
    const autosave = createAutosaveAdapter()
    const resume = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <StrictMode>
          <FormRenderer
            definition={definition}
            formData={formData}
            onChange={({ formData: next }) => setFormData({ ...next })}
            autosaveAdapter={autosave}
            resumeAdapter={resume}
            resumeContextRevision="strict-rev"
            services={{ cafPrefill: caf }}
          />
        </StrictMode>
      )
    }

    render(<Harness />)
    await waitFor(() => expect(screen.getByDisplayValue('Ramesh Patel')).toBeInTheDocument())
    expect(resume.loadProgress).toHaveBeenCalledTimes(1)
    expect(caf.resolvePrefill).toHaveBeenCalledTimes(2)

    await fillIdentityStep(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())
    expect(autosave.saveProgress).toHaveBeenCalledTimes(1)
  })
})

describe('FB-B6 / B6.1 Unit B acceptance — resume session', () => {
  let boundary: ReturnType<typeof installBoundarySpies>

  beforeEach(() => {
    boundary = installBoundarySpies()
  })

  afterEach(() => {
    boundary.restore()
  })

  it('restores checkpoint, skips CAF for restored values, and finishes', async () => {
    const user = userEvent.setup()
    const caf = createAcceptanceCafAdapter()
    const autosave = createAutosaveAdapter()
    const stepChanges: unknown[] = []
    const submits: unknown[] = []
    const resumeStatuses: ProgressiveResumeStatusData['status'][] = []

    const restored = {
      applicant_name: 'Asha Patel',
      gender: 'F',
      caf_father_name: { value: 'Restored Father', source: 'CAF' as const },
      caf_mother_name: { value: 'Restored Mother', source: 'OVERRIDE' as const },
      household_size: 3,
      contact_email: 'asha@example.gov.in',
      annual_income: 120000,
    }

    const resume = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: restored,
      checkpoint: { completedStepId: 'identity', completedStepIndex: 0 },
    }))

    const onChange = vi.fn()
    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>(restored)
      return (
        <FormRenderer
          definition={definition}
          formData={formData}
          onChange={(event) => {
            onChange(event)
            setFormData({ ...event.formData })
          }}
          onSubmit={(data) => submits.push(data)}
          onStepChange={(data) => stepChanges.push(data)}
          autosaveAdapter={autosave}
          resumeAdapter={resume}
          resumeContextRevision="resume-rev-1"
          onResumeStatusChange={(data) => resumeStatuses.push(data.status)}
          services={{ cafPrefill: caf }}
          showLocaleToggle
        />
      )
    }

    render(<Harness />)
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())
    expect(resumeStatuses.at(-1)).toBe('loaded')
    expect(caf.resolvePrefill).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(autosave.saveProgress).not.toHaveBeenCalled()
    expect(stepChanges).toHaveLength(0)
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/Household size/i))
    await user.type(screen.getByLabelText(/Household size/i), '5')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(autosave.saveProgress).toHaveBeenCalledTimes(1))
    const saved = autosave.calls[0]!.formData as Record<string, unknown>
    expect(saved).toEqual({
      applicant_name: 'Asha Patel',
      gender: 'F',
      caf_father_name: { value: 'Restored Father', source: 'CAF' },
      caf_mother_name: { value: 'Restored Mother', source: 'OVERRIDE' },
      household_size: 5,
      contact_email: 'asha@example.gov.in',
      annual_income: 120000,
    })
    expect(saved).not.toHaveProperty('section_household')
    expect(autosave.calls[0]!.completedStepId).toBe('household')

    await fillDeclarationStep(user)
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await waitFor(() => expect(submits).toHaveLength(1))
    const payload = submits[0] as { formData: Record<string, unknown> }
    expect(Object.keys(payload)).toEqual(['formData'])
    expect(payload.formData).toEqual({
      applicant_name: 'Asha Patel',
      gender: 'F',
      caf_father_name: { value: 'Restored Father', source: 'CAF' },
      caf_mother_name: { value: 'Restored Mother', source: 'OVERRIDE' },
      household_size: 5,
      contact_email: 'asha@example.gov.in',
      annual_income: 120000,
      purpose_statement: 'School fee concession application',
      agree_terms: true,
    })
    assertExactDataBoundary(payload.formData)
  })
})

describe('FB-B6 / B6.1 Unit B acceptance — validation and failure', () => {
  let boundary: ReturnType<typeof installBoundarySpies>

  beforeEach(() => {
    boundary = installBoundarySpies()
  })

  afterEach(() => {
    boundary.restore()
  })

  it('Finish full-schema failure routes to earliest step; edit clears guidance', async () => {
    const user = userEvent.setup()
    const submits: unknown[] = []
    const stepChanges: unknown[] = []
    const caf = createAcceptanceCafAdapter()
    const autosave = createAutosaveAdapter()
    const resume = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              setFormData((prev) => {
                const next = { ...prev }
                delete next.applicant_name
                return next
              })
            }
          >
            Invalidate identity
          </button>
          <FormRenderer
            definition={definition}
            formData={formData}
            onChange={({ formData: next }) => setFormData({ ...next })}
            onSubmit={(data) => submits.push(data)}
            onStepChange={(data) => stepChanges.push(data)}
            autosaveAdapter={autosave}
            resumeAdapter={resume}
            resumeContextRevision="val-rev"
            services={{ cafPrefill: caf }}
          />
        </div>
      )
    }

    render(<Harness />)

    await fillIdentityStep(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())
    await fillHouseholdStep(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 3 of 3')).toBeInTheDocument())

    await user.type(screen.getByLabelText(/Purpose of certificate/i), 'short')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await waitFor(() =>
      expect(document.querySelector('.dg20-renderer-validation-guidance')).toBeTruthy(),
    )
    expect(submits).toHaveLength(0)
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/Purpose of certificate/i))
    await user.type(
      screen.getByLabelText(/Purpose of certificate/i),
      'School fee concession application',
    )
    await waitFor(() => {
      expect(screen.queryByText(/at least 10 characters/i)).toBeNull()
    })
    await user.click(screen.getByRole('radio', { name: /^Yes$/i }))
    expect(document.querySelector('.dg20-renderer-validation-guidance')).toBeNull()

    stepChanges.length = 0
    await user.click(screen.getByRole('button', { name: 'Invalidate identity' }))
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await waitFor(() => {
      expect(submits).toHaveLength(0)
      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    })
    expect(stepChanges).toContainEqual(
      expect.objectContaining({
        stepId: 'identity',
        stepIndex: 0,
        direction: 'validation_redirect',
      }),
    )
  })

  it('autosave failure stays on step; Retry saves latest acknowledged data', async () => {
    const user = userEvent.setup()
    const caf = createAcceptanceCafAdapter()
    let shouldFail = true
    const autosave = createAutosaveAdapter(async () => {
      if (shouldFail) {
        throw new Error('network')
      }
    })
    const resume = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <FormRenderer
          definition={definition}
          formData={formData}
          onChange={({ formData: next }) => setFormData({ ...next })}
          autosaveAdapter={autosave}
          resumeAdapter={resume}
          resumeContextRevision="fail-rev"
          services={{ cafPrefill: caf }}
        />
      )
    }

    render(<Harness />)
    await fillIdentityStep(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.queryByText(/network/i)).toBeNull()
    shouldFail = false
    await user.click(screen.getByRole('button', { name: /Retry/i }))
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())
    expect(document.activeElement).toBe(document.querySelector('.dg20-renderer-step-heading'))
    expect(autosave.saveProgress.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('stale resume success after revision bump is ignored', async () => {
    const deferred = createDeferred<ProgressiveResumeResult>()
    const caf = createAcceptanceCafAdapter()
    const slow = createResumeAdapter(async () => deferred.promise)
    function Harness(): ReactElement {
      const [revision, setRevision] = useState('rev-a')
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <div>
          <button type="button" onClick={() => setRevision('rev-b')}>
            bump
          </button>
          <FormRenderer
            definition={definition}
            formData={formData}
            onChange={({ formData: next }) => setFormData({ ...next })}
            resumeAdapter={slow}
            resumeContextRevision={revision}
            services={{ cafPrefill: caf }}
          />
        </div>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(slow.loadProgress).toHaveBeenCalled())
    screen.getByRole('button', { name: 'bump' }).click()
    deferred.resolve({
      status: 'found',
      serviceId: definition.serviceId,
      formVersion: definition.version,
      resumeContextRevision: 'rev-a',
      formData: { applicant_name: 'STALE' },
      checkpoint: null,
    })
    await waitFor(() => expect(slow.loadProgress.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(screen.queryByDisplayValue('STALE')).toBeNull()
  })
})

describe('FB-B6 / B6.1 Unit B acceptance — accessibility', () => {
  let boundary: ReturnType<typeof installBoundarySpies>

  beforeEach(() => {
    boundary = installBoundarySpies()
  })

  afterEach(() => {
    boundary.restore()
  })

  it('EN/GU axe, unique IDs, aria-current, and loading/failure states', async () => {
    const user = userEvent.setup()
    const caf = createAcceptanceCafAdapter()
    const resumeDeferred = createDeferred<ProgressiveResumeResult>()
    const resume = createResumeAdapter(async () => resumeDeferred.promise)
    const autosave = createAutosaveAdapter(async () => {
      throw new Error('save failed')
    })

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <FormRenderer
          definition={definition}
          formData={formData}
          onChange={({ formData: next }) => setFormData({ ...next })}
          autosaveAdapter={autosave}
          resumeAdapter={resume}
          resumeContextRevision="a11y-rev"
          services={{ cafPrefill: caf }}
          showLocaleToggle
        />
      )
    }

    const { container } = render(<Harness />)

    expect(screen.getByText(/Loading saved progress/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()

    resumeDeferred.resolve({
      status: 'not_found',
      serviceId: definition.serviceId,
      formVersion: definition.version,
      resumeContextRevision: 'a11y-rev',
    })
    await waitFor(() => expect(screen.getByText('Step 1 of 3')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()

    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)

    const activeStep = container.querySelector('[aria-current="step"]')
    expect(activeStep).toBeTruthy()
    expect(within(activeStep as HTMLElement).getByText(/Identity|ઓળખ/)).toBeInTheDocument()

    await fillIdentityStep(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole('button', { name: /Gujarati|ગુજરાતી/i }))
    await waitFor(() => expect(screen.getByText(/પગલું 1/)).toBeInTheDocument())
    expect(screen.queryByText('Applicant name')).toBeNull()
    expect(screen.getByText('અરજદારનું નામ')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})
