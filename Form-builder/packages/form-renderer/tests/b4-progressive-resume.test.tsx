import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { FormRenderer } from '../src/FormRenderer.js'
import type {
  ProgressiveResumeAdapter,
  ProgressiveResumeRequest,
  ProgressiveResumeResult,
  ProgressiveResumeStatusData,
} from '../src/progressive-resume.js'
import type { ProgressiveAutosaveAdapter } from '../src/progressive-autosave.js'
import {
  createProgressivePublishedDefinition,
  createSamplePublishedDefinition,
} from './fixtures.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

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

function createResumeAdapter(
  impl: (request: ProgressiveResumeRequest) => Promise<ProgressiveResumeResult>,
): ProgressiveResumeAdapter & {
  readonly calls: ProgressiveResumeRequest[]
  readonly loadProgress: ReturnType<typeof vi.fn>
} {
  const calls: ProgressiveResumeRequest[] = []
  const loadProgress = vi.fn(async (request: ProgressiveResumeRequest) => {
    calls.push(request)
    return impl(request)
  })
  return { calls, loadProgress }
}

describe('FB-B4 progressive resume', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  const progressiveDefinition = createProgressivePublishedDefinition()
  const singlePageDefinition = createSamplePublishedDefinition()

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('no adapter preserves immediate step-0 behavior', () => {
    render(<FormRenderer definition={progressiveDefinition} />)
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(document.querySelector('[data-dg20-resume]')).toBeNull()
  })

  it('single-page form never calls resume adapter', async () => {
    const adapter = createResumeAdapter(async () => {
      throw new Error('should not be called')
    })
    render(
      <FormRenderer
        definition={singlePageDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
      />,
    )
    await waitFor(() => expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0))
    expect(adapter.loadProgress).not.toHaveBeenCalled()
  })

  it('uncontrolled found with null checkpoint mounts step 0 without onChange', async () => {
    const onChange = vi.fn()
    const onStepChange = vi.fn()
    const statuses: ProgressiveResumeStatusData['status'][] = []
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Restored' },
      checkpoint: null,
    }))

    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        onChange={onChange}
        onStepChange={onStepChange}
        onResumeStatusChange={(data) => statuses.push(data.status)}
      />,
    )

    expect(screen.getByText(/Loading saved progress/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(screen.getByDisplayValue('Restored')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(onStepChange).not.toHaveBeenCalled()
    expect(statuses).toEqual(['loading', 'loaded'])
    expect(JSON.stringify(statuses)).not.toMatch(/rev-1|formData|signal|stack/i)
  })

  it('uncontrolled valid checkpoint resumes at next step', async () => {
    const statuses: ProgressiveResumeStatusData[] = []
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Asha Patel' },
      checkpoint: { completedStepId: 'identity', completedStepIndex: 0 },
    }))

    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        onResumeStatusChange={(data) => statuses.push(data)}
      />,
    )

    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(statuses.at(-1)).toEqual({
      status: 'loaded',
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      stepId: 'household',
      stepIndex: 1,
    })
  })

  it('not_found renders fresh step 0', async () => {
    const adapter = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    const statuses: string[] = []
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        onResumeStatusChange={(data) => statuses.push(data.status)}
      />,
    )
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(statuses).toEqual(['loading', 'not_found'])
  })

  it('controlled equal data requires no onChange', async () => {
    const onChange = vi.fn()
    const formData = { applicant_name: 'Same' }
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData,
      checkpoint: null,
    }))
    render(
      <FormRenderer
        definition={progressiveDefinition}
        formData={formData}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        onChange={onChange}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Same')).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('controlled changed data waits for semantic echo before mounting Form', async () => {
    const deferred = createDeferred<ProgressiveResumeResult>()
    const adapter = createResumeAdapter(async () => deferred.promise)
    const events: string[] = []

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({ applicant_name: 'Host' })
      return (
        <FormRenderer
          definition={progressiveDefinition}
          formData={formData}
          resumeAdapter={adapter}
          resumeContextRevision="rev-1"
          onChange={({ formData: next }) => {
            events.push('onChange')
            setFormData({ ...next })
          }}
          onResumeStatusChange={(data) => events.push(data.status)}
        />
      )
    }

    render(<Harness />)
    expect(document.querySelector('form')).toBeNull()
    deferred.resolve({
      status: 'found',
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-1',
      formData: { applicant_name: 'Resumed' },
      checkpoint: null,
    })
    await waitFor(() => expect(events).toEqual(['loading', 'onChange', 'loaded']))
    expect(screen.getByDisplayValue('Resumed')).toBeInTheDocument()
  })

  it('ignored controlled onChange does not mount Form or claim loaded', async () => {
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Resumed' },
      checkpoint: null,
    }))
    const statuses: string[] = []
    render(
      <FormRenderer
        definition={progressiveDefinition}
        formData={{ applicant_name: 'Host' }}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        onChange={vi.fn()}
        onResumeStatusChange={(data) => statuses.push(data.status)}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('[data-dg20-resume="awaiting_host"]')).toBeTruthy(),
    )
    expect(document.querySelector('form')).toBeNull()
    expect(statuses).toEqual(['loading'])
    expect(statuses).not.toContain('loaded')
  })

  it('different controlled replacement discards candidate', async () => {
    const statuses: string[] = []
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Resumed' },
      checkpoint: null,
    }))

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Host',
      })
      return (
        <div>
          <button type="button" onClick={() => setFormData({ applicant_name: 'Newer' })}>
            replace
          </button>
          <FormRenderer
            definition={progressiveDefinition}
            formData={formData}
            resumeAdapter={adapter}
            resumeContextRevision="rev-1"
            onChange={vi.fn()}
            onResumeStatusChange={(data) => statuses.push(data.status)}
          />
        </div>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)
    await waitFor(() =>
      expect(document.querySelector('[data-dg20-resume="awaiting_host"]')).toBeTruthy(),
    )
    await user.click(screen.getByRole('button', { name: 'replace' }))
    await waitFor(() => expect(statuses).toContain('discarded'))
    expect(screen.getByDisplayValue('Newer')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('no controlled onChange discards instead of waiting forever', async () => {
    const statuses: string[] = []
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Resumed' },
      checkpoint: null,
    }))
    render(
      <FormRenderer
        definition={progressiveDefinition}
        formData={{ applicant_name: 'Host' }}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        onResumeStatusChange={(data) => statuses.push(data.status)}
      />,
    )
    await waitFor(() => expect(statuses).toEqual(['loading', 'discarded']))
    expect(screen.getByDisplayValue('Host')).toBeInTheDocument()
  })

  it('StrictMode invokes adapter once', async () => {
    const adapter = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    render(
      <StrictMode>
        <FormRenderer
          definition={progressiveDefinition}
          resumeAdapter={adapter}
          resumeContextRevision="rev-1"
        />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(adapter.loadProgress).toHaveBeenCalledTimes(1)
  })

  it('locale switch does not restart loading', async () => {
    const deferred = createDeferred<ProgressiveResumeResult>()
    const adapter = createResumeAdapter(async () => deferred.promise)
    const user = userEvent.setup()
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        defaultLocale="en"
        showLocaleToggle
      />,
    )
    expect(screen.getByText(/Loading saved progress/i)).toBeInTheDocument()
    await waitFor(() => expect(adapter.loadProgress).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: /Gujarati|ગુજરાતી/i }))
    expect(adapter.loadProgress).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/સાચવેલી પ્રગતિ લોડ/i)).toBeInTheDocument()
    deferred.resolve({
      status: 'not_found',
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-1',
    })
    await waitFor(() => expect(screen.getByText(/પગલું 1/)).toBeInTheDocument())
  })

  it('adapter change after settlement does not reload', async () => {
    const first = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    const second = createResumeAdapter(async () => {
      throw new Error('must not reload')
    })
    function Harness(): ReactElement {
      const [adapter, setAdapter] = useState(first)
      return (
        <div>
          <button type="button" onClick={() => setAdapter(second)}>
            swap
          </button>
          <FormRenderer
            definition={progressiveDefinition}
            resumeAdapter={adapter}
            resumeContextRevision="rev-1"
          />
        </div>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'swap' }))
    expect(second.loadProgress).not.toHaveBeenCalled()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('stale success after revision swap is ignored', async () => {
    const deferred = createDeferred<ProgressiveResumeResult>()
    const slow = createResumeAdapter(async () => deferred.promise)
    function Harness(): ReactElement {
      const [revision, setRevision] = useState('rev-a')
      const [adapter] = useState(() => slow)
      return (
        <div>
          <button type="button" onClick={() => setRevision('rev-b')}>
            bump
          </button>
          <FormRenderer
            definition={progressiveDefinition}
            resumeAdapter={adapter}
            resumeContextRevision={revision}
          />
        </div>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    await waitFor(() => expect(slow.loadProgress).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'bump' }))
    deferred.resolve({
      status: 'found',
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-a',
      formData: { applicant_name: 'STALE' },
      checkpoint: null,
    })
    await waitFor(() => expect(slow.loadProgress.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(screen.queryByDisplayValue('STALE')).toBeNull()
  })

  it('retry succeeds after failure', async () => {
    const user = userEvent.setup()
    let shouldFail = true
    const adapter = createResumeAdapter(async (request) => {
      if (shouldFail) {
        throw new Error('network')
      }
      return {
        status: 'not_found',
        serviceId: request.serviceId,
        formVersion: request.formVersion,
        resumeContextRevision: request.resumeContextRevision,
      }
    })
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
      />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText(/network/i)).toBeNull()
    shouldFail = false
    await user.click(screen.getByRole('button', { name: /Retry loading/i }))
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
  })

  it('invalid revision shows config copy and recovers when valid', async () => {
    const adapter = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    function Harness(): ReactElement {
      const [revision, setRevision] = useState('   ')
      return (
        <div>
          <button type="button" onClick={() => setRevision('rev-ok')}>
            fix
          </button>
          <FormRenderer
            definition={progressiveDefinition}
            resumeAdapter={adapter}
            resumeContextRevision={revision}
          />
        </div>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'fix' }))
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
  })

  it('resumed data participates in next B2.1 autosave', async () => {
    const user = userEvent.setup()
    const resume = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Asha Patel', household_size: 2 },
      checkpoint: null,
    }))
    const saves: unknown[] = []
    const autosave: ProgressiveAutosaveAdapter = {
      async saveProgress(request) {
        saves.push(request.formData)
      },
    }
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={resume}
        resumeContextRevision="rev-1"
        autosaveAdapter={autosave}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(saves.length).toBe(1))
    expect(saves[0]).toMatchObject({
      applicant_name: 'Asha Patel',
      household_size: 2,
    })
  })

  it('EN/GU axe coverage for loading, failure, and restored form', async () => {
    const deferred = createDeferred<ProgressiveResumeResult>()
    const adapter = createResumeAdapter(async () => deferred.promise)
    const { container, rerender } = render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        defaultLocale="en"
      />,
    )
    expect(await axe(container)).toHaveNoViolations()

    deferred.reject(new Error('boom'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()

    const okAdapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Ok' },
      checkpoint: null,
    }))
    rerender(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={okAdapter}
        resumeContextRevision="rev-2"
        defaultLocale="gu"
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Ok')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()

    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('adapter mutation after resolve cannot affect restored state', async () => {
    const mutable: ProgressiveResumeResult = {
      status: 'found',
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-1',
      formData: { applicant_name: 'Safe' },
      checkpoint: null,
    }
    const adapter = createResumeAdapter(async () => mutable)
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Safe')).toBeInTheDocument())
    Object.assign(mutable.formData as Record<string, unknown>, { applicant_name: 'MUTATED' })
    expect(screen.getByDisplayValue('Safe')).toBeInTheDocument()
  })

  it('disabled restoration still loads then keeps navigation protections', async () => {
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Asha Patel' },
      checkpoint: null,
    }))
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        disabled
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
