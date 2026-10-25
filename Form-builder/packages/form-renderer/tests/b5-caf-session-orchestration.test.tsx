import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { CafPrefillAdapter, CafPrefillRequest } from '@citizen/form-widgets'

import { FormRenderer } from '../src/FormRenderer.js'
import type {
  ProgressiveResumeAdapter,
  ProgressiveResumeRequest,
  ProgressiveResumeResult,
} from '../src/progressive-resume.js'
import {
  createProgressivePublishedDefinition,
  createSamplePublishedDefinition,
} from './fixtures.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

function createCafAdapter(
  impl: (
    request: CafPrefillRequest,
  ) => Promise<{ value: string; confidence: number } | { found: false }>,
): CafPrefillAdapter & { readonly resolvePrefill: ReturnType<typeof vi.fn> } {
  const resolvePrefill = vi.fn(async (request: CafPrefillRequest) => impl(request))
  return { resolvePrefill }
}

function createResumeAdapter(
  impl: (request: ProgressiveResumeRequest) => Promise<ProgressiveResumeResult>,
): ProgressiveResumeAdapter & { readonly loadProgress: ReturnType<typeof vi.fn> } {
  const loadProgress = vi.fn(async (request: ProgressiveResumeRequest) => impl(request))
  return { loadProgress }
}

describe('FB-B5 CAF session orchestration', () => {
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
    cleanup()
  })

  it('StrictMode invokes host CAF adapter once', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'Strict', confidence: 0.95 }))
    render(
      <StrictMode>
        <FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Strict')).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
    expect(adapter.resolvePrefill.mock.calls[0]![0].fieldId).toBe('caf_father_name')
  })

  it('cancelled pre-microtask setup invokes nothing', () => {
    const adapter = createCafAdapter(async () => ({ value: 'X', confidence: 0.95 }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      const root = createRoot(container)
      root.render(
        <FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />,
      )
      root.unmount()
    })
    expect(adapter.resolvePrefill).not.toHaveBeenCalled()
    container.remove()
  })

  it('found:false is cached across Back/Next remount', async () => {
    const user = userEvent.setup()
    const adapter = createCafAdapter(async () => ({ found: false }))
    render(<FormRenderer definition={progressiveDefinition} services={{ cafPrefill: adapter }} />)
    await waitFor(() => expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText(/Enter this value manually/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/Applicant name/i), {
      target: { value: 'Asha Patel' },
    })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/Enter this value manually/i)).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('low-confidence result is cached but remains manual entry', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'Low', confidence: 0.1 }))
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={singlePageDefinition}
        services={{ cafPrefill: adapter }}
        onChange={onChange}
      />,
    )
    await waitFor(() => expect(screen.getByText(/Enter this value manually/i)).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
    const cafChanges = onChange.mock.calls.filter((call) => {
      const data = call[0]?.formData?.caf_father_name
      return data != null
    })
    expect(cafChanges).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Gujarati|ગુજરાતી/i }))
    await waitFor(() => expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1))
    // Still manual — no CAF value emitted after locale switch.
    expect(screen.queryByDisplayValue('Low')).toBeNull()
  })

  it('accepted result emits only { value, source: "CAF" }', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'Priya Shah', confidence: 0.95 }))
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={singlePageDefinition}
        services={{ cafPrefill: adapter }}
        onChange={onChange}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Priya Shah')).toBeInTheDocument())
    const emitted = onChange.mock.calls
      .map((call) => call[0]?.formData?.caf_father_name)
      .find(Boolean)
    expect(emitted).toEqual({ value: 'Priya Shah', source: 'CAF' })
    expect(emitted).not.toHaveProperty('confidence')
    expect(JSON.stringify(emitted)).not.toMatch(/fatherName|instanceFieldId|cache/i)
  })

  it('rejected adapter result is not cached and can retry after remount', async () => {
    let shouldFail = true
    const adapter = createCafAdapter(async () => {
      if (shouldFail) {
        throw new Error('boom')
      }
      return { value: 'Recovered', confidence: 0.95 }
    })
    function Harness(): ReactElement {
      const [nonce, setNonce] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setNonce((n) => n + 1)}>
            remount
          </button>
          <FormRenderer
            key={nonce}
            definition={singlePageDefinition}
            services={{ cafPrefill: adapter }}
          />
        </div>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'remount' }))
    await waitFor(() => expect(screen.getByDisplayValue('Recovered')).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(2)
  })

  it('structurally malformed result is not cached', async () => {
    let calls = 0
    const adapter = createCafAdapter(async () => {
      calls += 1
      if (calls === 1) {
        return { found: false, extra: true } as never
      }
      return { value: 'Ok', confidence: 0.95 }
    })
    function Harness(): ReactElement {
      const [nonce, setNonce] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setNonce((n) => n + 1)}>
            remount
          </button>
          <FormRenderer
            key={nonce}
            definition={singlePageDefinition}
            services={{ cafPrefill: adapter }}
          />
        </div>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'remount' }))
    await waitFor(() => expect(screen.getByDisplayValue('Ok')).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(2)
  })

  it('host mutation after resolution cannot mutate widget data', async () => {
    const mutable = { value: 'Safe', confidence: 0.95 }
    const adapter = createCafAdapter(async () => mutable)
    render(<FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />)
    await waitFor(() => expect(screen.getByDisplayValue('Safe')).toBeInTheDocument())
    mutable.value = 'MUTATED'
    expect(screen.getByDisplayValue('Safe')).toBeInTheDocument()
  })

  it('locale switch and unrelated rerender do not refetch', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'Stable', confidence: 0.95 }))
    function Harness(): ReactElement {
      const [tick, setTick] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setTick((n) => n + 1)}>
            tick-{tick}
          </button>
          <FormRenderer
            definition={singlePageDefinition}
            services={{ cafPrefill: adapter }}
            showLocaleToggle
          />
        </div>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    await waitFor(() => expect(screen.getByDisplayValue('Stable')).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: /Gujarati|ગુજરાતી/i }))
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /tick-/i }))
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('adapter swap resets cache and ignores stale result', async () => {
    let resolveFirst!: (value: { value: string; confidence: number }) => void
    const firstPromise = new Promise<{ value: string; confidence: number }>((resolve) => {
      resolveFirst = resolve
    })
    const first = createCafAdapter(async () => firstPromise)
    const second = createCafAdapter(async () => ({ value: 'Second', confidence: 0.95 }))

    function Harness(): ReactElement {
      const [adapter, setAdapter] = useState(first)
      return (
        <div>
          <button type="button" onClick={() => setAdapter(second)}>
            swap
          </button>
          <FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />
        </div>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(first.resolvePrefill).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'swap' }))
    await waitFor(() => expect(screen.getByDisplayValue('Second')).toBeInTheDocument())
    resolveFirst({ value: 'STALE', confidence: 0.99 })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByDisplayValue('STALE')).toBeNull()
    expect(screen.getByDisplayValue('Second')).toBeInTheDocument()
    expect(second.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('canonical resume-revision change resets the session cache', async () => {
    const caf = createCafAdapter(async () => ({ value: 'Rev', confidence: 0.95 }))
    const resume = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    function Harness(): ReactElement {
      const [revision, setRevision] = useState('rev-a')
      return (
        <div>
          <button type="button" onClick={() => setRevision('rev-b')}>
            bump
          </button>
          <FormRenderer
            definition={progressiveDefinition}
            resumeAdapter={resume}
            resumeContextRevision={revision}
            services={{ cafPrefill: caf }}
          />
        </div>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(screen.getByDisplayValue('Rev')).toBeInTheDocument())
    expect(caf.resolvePrefill).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'bump' }))
    await waitFor(() => expect(caf.resolvePrefill).toHaveBeenCalledTimes(2))
  })

  it('resume with existing CAF or OVERRIDE makes zero CAF calls', async () => {
    const caf = createCafAdapter(async () => {
      throw new Error('must not call')
    })
    const resumeCaf = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: {
        applicant_name: 'Asha Patel',
        caf_father_name: { value: 'Resumed CAF', source: 'CAF' },
      },
      checkpoint: null,
    }))
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={resumeCaf}
        resumeContextRevision="rev-1"
        services={{ cafPrefill: caf }}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Resumed CAF')).toBeInTheDocument())
    expect(caf.resolvePrefill).not.toHaveBeenCalled()

    cleanup()
    const resumeOverride = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: {
        applicant_name: 'Asha Patel',
        caf_father_name: { value: 'Resumed Override', source: 'OVERRIDE' },
      },
      checkpoint: null,
    }))
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={resumeOverride}
        resumeContextRevision="rev-1"
        services={{ cafPrefill: caf }}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Resumed Override')).toBeInTheDocument())
    expect(caf.resolvePrefill).not.toHaveBeenCalled()
  })

  it('resume not_found then unanswered active CAF field resolves once', async () => {
    const caf = createCafAdapter(async () => ({ value: 'AfterResume', confidence: 0.95 }))
    const resume = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={resume}
        resumeContextRevision="rev-1"
        services={{ cafPrefill: caf }}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('AfterResume')).toBeInTheDocument())
    expect(caf.resolvePrefill).toHaveBeenCalledTimes(1)
    expect(resume.loadProgress).toHaveBeenCalledTimes(1)
  })

  it('resume pending/failure does not mount CAF or invoke adapter', async () => {
    const caf = createCafAdapter(async () => ({ value: 'X', confidence: 0.95 }))
    let resolveResume!: (value: ProgressiveResumeResult) => void
    const pending = new Promise<ProgressiveResumeResult>((resolve) => {
      resolveResume = resolve
    })
    const resume = createResumeAdapter(async () => pending)
    const { unmount } = render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={resume}
        resumeContextRevision="rev-1"
        services={{ cafPrefill: caf }}
      />,
    )
    expect(screen.getByText(/Loading saved progress/i)).toBeInTheDocument()
    expect(caf.resolvePrefill).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dg20-widget="caf-prefill"]')).toBeNull()
    unmount()

    const failing = createResumeAdapter(async () => {
      throw new Error('resume boom')
    })
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={failing}
        resumeContextRevision="rev-1"
        services={{ cafPrefill: caf }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(caf.resolvePrefill).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dg20-widget="caf-prefill"]')).toBeNull()
    resolveResume({
      status: 'not_found',
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-1',
    })
  })

  it('separate FormRenderer instances do not share cache', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'Shared?', confidence: 0.95 }))
    render(
      <div>
        <FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />
        <FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />
      </div>,
    )
    await waitFor(() => expect(screen.getAllByDisplayValue('Shared?')).toHaveLength(2))
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(2)
  })

  it('invalid/duplicate binding makes zero host calls', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'X', confidence: 0.95 }))
    const bad = createSamplePublishedDefinition({
      meta: {
        ...createSamplePublishedDefinition().meta,
        prefillBindings: [
          { fieldId: 'caf_father_name', cafAttribute: 'fatherName', confidenceMin: 0.8 },
          { fieldId: 'caf_father_name', cafAttribute: 'other', confidenceMin: 0.8 },
        ],
      },
    })
    render(<FormRenderer definition={bad} services={{ cafPrefill: adapter }} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(adapter.resolvePrefill).not.toHaveBeenCalled()
  })

  it('no cache/identity/confidence metadata enters formData or DOM', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'Clean', confidence: 0.95 }))
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={singlePageDefinition}
        services={{ cafPrefill: adapter }}
        onChange={onChange}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Clean')).toBeInTheDocument())
    const payload = JSON.stringify(onChange.mock.calls)
    expect(payload).not.toMatch(/confidence|fatherName|settledEntry|cache/i)
    expect(document.body.innerHTML).not.toMatch(/confidence|fatherName|settledEntry/i)
  })

  it('EN/GU axe coverage for CAF restored field', async () => {
    const adapter = createCafAdapter(async () => ({ value: 'Axe', confidence: 0.95 }))
    const { container } = render(
      <FormRenderer
        definition={singlePageDefinition}
        services={{ cafPrefill: adapter }}
        defaultLocale="en"
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Axe')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(screen.getByRole('button', { name: /Gujarati|ગુજરાતી/i }))
    await waitFor(() => expect(within(container).getByDisplayValue('Axe')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
