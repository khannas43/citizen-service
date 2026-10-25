import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { FormRenderer } from '../src/FormRenderer.js'
import type {
  ProgressiveAutosaveAdapter,
  ProgressiveAutosaveRequest,
  ProgressiveAutosaveStatusData,
} from '../src/progressive-autosave.js'
import { resolveRendererMessage } from '../src/renderer-messages.js'
import {
  createProgressivePublishedDefinition,
  createSamplePublishedDefinition,
} from './fixtures.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

function createDeferred<T = void>(): {
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

function createRecordingAdapter(
  impl?: (request: ProgressiveAutosaveRequest) => Promise<void>,
): ProgressiveAutosaveAdapter & {
  readonly calls: ProgressiveAutosaveRequest[]
  readonly saveProgress: ReturnType<typeof vi.fn>
} {
  const calls: ProgressiveAutosaveRequest[] = []
  const saveProgress = vi.fn(async (request: ProgressiveAutosaveRequest) => {
    calls.push(request)
    if (impl) {
      await impl(request)
      return
    }
  })
  return { calls, saveProgress }
}

describe('FB-B2 progressive autosave', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('single-page never autosaves', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        formData={{ applicant_name: 'Asha', agree_terms: true }}
        autosaveAdapter={adapter}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    expect(adapter.saveProgress).not.toHaveBeenCalled()
  })

  it('mount and typing never autosave', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        autosaveAdapter={adapter}
      />,
    )
    expect(adapter.saveProgress).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'A')
    expect(adapter.saveProgress).not.toHaveBeenCalled()
  })

  it('invalid Next never autosaves', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        autosaveAdapter={adapter}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(adapter.saveProgress).not.toHaveBeenCalled()
  })

  it('valid Next without adapter advances immediately', async () => {
    const user = userEvent.setup()
    const onStepChange = vi.fn()
    const onAutosaveStatusChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        onStepChange={onStepChange}
        onAutosaveStatusChange={onAutosaveStatusChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(onAutosaveStatusChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/Progress saved/i)).toBeNull()
  })

  it('valid Next with adapter saves full merged data and advances after success', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const statuses: ProgressiveAutosaveStatusData['status'][] = []
    const steps: string[] = []
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    const onChange = vi.fn()
    const onStepChange = vi.fn()

    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel', household_size: 3 }}
        autosaveAdapter={adapter}
        onChange={onChange}
        onStepChange={onStepChange}
        onAutosaveStatusChange={(data) => {
          statuses.push(data.status)
          steps.push(`${data.status}:${data.stepId}`)
        }}
      />,
    )

    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText(/Saving progress/i)).toBeInTheDocument()
    expect(onStepChange).not.toHaveBeenCalled()
    // Unchanged complete data must not emit onChange before/during save.
    expect(onChange).not.toHaveBeenCalled()

    const request = adapter.calls[0]!
    expect(request.serviceId).toBe('income-certificate-sample')
    expect(request.formVersion).toBe(1)
    expect(request.completedStepId).toBe('identity')
    expect(request.completedStepIndex).toBe(0)
    expect(request.formData).toMatchObject({
      applicant_name: 'Asha Patel',
      household_size: 3,
    })
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(statuses).toEqual(['saving'])
    expect(JSON.stringify(statuses)).not.toMatch(/signal|formData|stack/i)

    deferred.resolve()
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(statuses).toEqual(['saving', 'saved'])
    expect(onStepChange).toHaveBeenCalledTimes(1)
    expect(onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'next', stepIndex: 1 }),
    )
    expect(screen.getByText(/Progress saved/i)).toBeInTheDocument()
  })

  it('onChange occurs before autosave when data changed', async () => {
    const user = userEvent.setup()
    const events: string[] = []
    const adapter = createRecordingAdapter(async () => {
      events.push('adapter')
    })

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <FormRenderer
          definition={createProgressivePublishedDefinition()}
          formData={formData}
          autosaveAdapter={adapter}
          onChange={({ formData: next }) => {
            events.push('onChange')
            setFormData({ ...next })
          }}
          onAutosaveStatusChange={(data) => {
            events.push(data.status)
          }}
        />
      )
    }

    render(<Harness />)
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'Asha Patel')
    events.length = 0
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(events).toContain('saved'))
    const savingIdx = events.indexOf('saving')
    const adapterIdx = events.indexOf('adapter')
    expect(savingIdx).toBeGreaterThanOrEqual(0)
    expect(adapterIdx).toBeGreaterThan(savingIdx)
    // Any Next-time onChange must precede public saving (post-advance onChange ignored).
    const changeBeforeSaving = events.slice(0, savingIdx).lastIndexOf('onChange')
    if (changeBeforeSaving >= 0) {
      expect(changeBeforeSaving).toBeLessThan(savingIdx)
    }
  })

  it('failure stays on step with one Retry and no raw adapter error', async () => {
    const user = userEvent.setup()
    const onStepChange = vi.fn()
    const onSubmit = vi.fn()
    const adapter = createRecordingAdapter(async () => {
      throw new Error('SECRET_BACKEND_STACK_TRACE')
    })
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
        onStepChange={onStepChange}
        onSubmit={onSubmit}
        onAutosaveStatusChange={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText(/Progress could not be saved/i)).toBeInTheDocument()
    expect(screen.queryByText(/SECRET_BACKEND/i)).toBeNull()
    expect(screen.getAllByRole('button', { name: /Retry saving/i })).toHaveLength(1)
    expect(onStepChange).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Retry uses latest data and succeeds with correct callback order', async () => {
    const user = userEvent.setup()
    let shouldFail = true
    const statuses: string[] = []
    const adapter = createRecordingAdapter(async () => {
      if (shouldFail) {
        shouldFail = false
        throw new Error('transient')
      }
    })
    const onStepChange = vi.fn()

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Asha',
      })
      return (
        <FormRenderer
          definition={createProgressivePublishedDefinition()}
          formData={formData}
          onChange={({ formData: next }) => setFormData({ ...next })}
          autosaveAdapter={adapter}
          onStepChange={onStepChange}
          onAutosaveStatusChange={(data) => {
            statuses.push(data.status)
          }}
        />
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry saving/i })).toBeInTheDocument(),
    )

    const input = screen.getByRole('textbox', { name: /Applicant name/i })
    await user.clear(input)
    await user.type(input, 'Asha Patel Updated')
    expect(screen.queryByRole('button', { name: /Retry saving/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(adapter.calls.at(-1)?.formData).toMatchObject({
      applicant_name: 'Asha Patel Updated',
    })
    expect(statuses).toEqual(['saving', 'failed', 'saving', 'saved'])
    expect(onStepChange).toHaveBeenCalledTimes(1)
  })

  it('Retry button revalidates and saves without requiring an edit', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const statuses: string[] = []
    const adapter = createRecordingAdapter(async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('transient')
      }
    })
    const onStepChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
        onStepChange={onStepChange}
        onAutosaveStatusChange={(data) => {
          statuses.push(data.status)
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry saving/i })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: /Retry saving/i }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(adapter.saveProgress).toHaveBeenCalledTimes(2)
    expect(statuses).toEqual(['saving', 'failed', 'saving', 'saved'])
    expect(onStepChange).toHaveBeenCalledTimes(1)
  })

  it('duplicate Next clicks produce one request', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
      />,
    )
    const next = screen.getByRole('button', { name: 'Next' })
    await user.click(next)
    await waitFor(() => expect(next).toBeDisabled())
    await user.click(next)
    expect(adapter.saveProgress).toHaveBeenCalledTimes(1)
    deferred.resolve()
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
  })

  it('Back and controls are disabled while saving', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const threeStep = createProgressivePublishedDefinition({
      meta: {
        ...createProgressivePublishedDefinition().meta,
        progressiveSteps: [
          {
            stepId: 'identity',
            labelEn: 'Identity',
            labelGu: 'ઓળખ',
            fieldIds: ['section_identity', 'applicant_name', 'caf_father_name'],
          },
          {
            stepId: 'household',
            labelEn: 'Household',
            labelGu: 'પરિવાર',
            fieldIds: ['household_size', 'contact_email'],
          },
          {
            stepId: 'declare',
            labelEn: 'Declare',
            labelGu: 'ઘોષણા',
            fieldIds: ['agree_terms'],
          },
        ],
      },
    })
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    render(
      <FormRenderer
        definition={threeStep}
        formData={{ applicant_name: 'Asha Patel', household_size: 2 }}
        autosaveAdapter={adapter}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    deferred.resolve()
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeInTheDocument())

    const deferred2 = createDeferred()
    adapter.saveProgress.mockImplementation(async (request: ProgressiveAutosaveRequest) => {
      adapter.calls.push(request)
      await deferred2.promise
    })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
      expect(document.querySelector('[data-dg20-autosave="saving"]')).toBeTruthy()
    })
    expect(screen.getByRole('spinbutton', { name: /Household size/i })).toBeDisabled()
    deferred2.resolve()
    await waitFor(() => expect(screen.getByText('Step 3 of 3')).toBeInTheDocument())
  })

  it('readOnly Next and Back never autosave; final Submit never autosaves', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    const { rerender } = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{
          applicant_name: 'Asha Patel',
          household_size: 2,
          agree_terms: true,
        }}
        readOnly
        autosaveAdapter={adapter}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(adapter.saveProgress).not.toHaveBeenCalled()

    rerender(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{
          applicant_name: 'Asha Patel',
          household_size: 2,
          contact_email: 'a@example.gov.in',
          agree_terms: true,
        }}
        autosaveAdapter={adapter}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(adapter.saveProgress).toHaveBeenCalledTimes(1)
  })

  it('adapter swap aborts and ignores stale success', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapterA = createRecordingAdapter(async () => {
      await deferred.promise
    })
    const adapterB = createRecordingAdapter()
    const onAutosaveStatusChange = vi.fn()
    const onStepChange = vi.fn()

    function Harness(): ReactElement {
      const [adapter, setAdapter] = useState<ProgressiveAutosaveAdapter>(adapterA)
      return (
        <div>
          <button type="button" onClick={() => setAdapter(adapterB)}>
            Swap adapter
          </button>
          <FormRenderer
            definition={createProgressivePublishedDefinition()}
            formData={{ applicant_name: 'Asha Patel' }}
            autosaveAdapter={adapter}
            onAutosaveStatusChange={onAutosaveStatusChange}
            onStepChange={onStepChange}
          />
        </div>
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapterA.saveProgress).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Swap adapter' }))
    deferred.resolve()
    await waitFor(() => expect(adapterA.calls[0]?.signal.aborted).toBe(true))
    expect(onStepChange).not.toHaveBeenCalled()
    expect(
      onAutosaveStatusChange.mock.calls.some(
        (call) => (call[0] as ProgressiveAutosaveStatusData).status === 'failed',
      ),
    ).toBe(false)
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('service/version switch aborts in-flight save', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    const onStepChange = vi.fn()
    const v1 = createProgressivePublishedDefinition({ version: 1 })
    const v2 = createProgressivePublishedDefinition({ version: 2 })

    function Harness(): ReactElement {
      const [definition, setDefinition] = useState(v1)
      return (
        <div>
          <button type="button" onClick={() => setDefinition(v2)}>
            Bump version
          </button>
          <FormRenderer
            definition={definition}
            formData={{ applicant_name: 'Asha Patel' }}
            autosaveAdapter={adapter}
            onStepChange={onStepChange}
          />
        </div>
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Bump version' }))
    deferred.resolve()
    await waitFor(() => expect(adapter.calls[0]?.signal.aborted).toBe(true))
    expect(onStepChange).not.toHaveBeenCalled()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('disabled/readOnly mid-flight aborts without failed callback', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    const onAutosaveStatusChange = vi.fn()

    function Harness(): ReactElement {
      const [disabled, setDisabled] = useState(false)
      return (
        <div>
          <button type="button" onClick={() => setDisabled(true)}>
            Disable
          </button>
          <FormRenderer
            definition={createProgressivePublishedDefinition()}
            formData={{ applicant_name: 'Asha Patel' }}
            autosaveAdapter={adapter}
            disabled={disabled}
            onAutosaveStatusChange={onAutosaveStatusChange}
          />
        </div>
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalled())
    onAutosaveStatusChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Disable' }))
    deferred.reject(new Error('aborted-by-host'))
    await waitFor(() => expect(adapter.calls[0]?.signal.aborted).toBe(true))
    expect(
      onAutosaveStatusChange.mock.calls.some(
        (call) => (call[0] as ProgressiveAutosaveStatusData).status === 'failed',
      ),
    ).toBe(false)
  })

  it('semantic external data change aborts; equal cloned echo does not', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Asha Patel',
      })
      return (
        <div>
          <button
            type="button"
            onClick={() => setFormData({ applicant_name: 'Asha Patel', household_size: 9 })}
          >
            Semantic change
          </button>
          <button type="button" onClick={() => setFormData({ applicant_name: 'Asha Patel' })}>
            Echo clone
          </button>
          <FormRenderer
            definition={createProgressivePublishedDefinition()}
            formData={formData}
            onChange={({ formData: next }) => setFormData({ ...next })}
            autosaveAdapter={adapter}
          />
        </div>
      )
    }

    const { unmount } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Echo clone' }))
    expect(adapter.calls[0]?.signal.aborted).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Semantic change' }))
    await waitFor(() => expect(adapter.calls[0]?.signal.aborted).toBe(true))
    deferred.resolve()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    unmount()
  })

  it('locale switch does not abort or restart save', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
        defaultLocale="en"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText(/Saving progress/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    expect(adapter.saveProgress).toHaveBeenCalledTimes(1)
    expect(adapter.calls[0]?.signal.aborted).toBe(false)
    expect(screen.getByText(resolveRendererMessage('autosaveSaving', 'gu'))).toBeInTheDocument()
    deferred.resolve()
    await waitFor(() => expect(screen.getByText(/પગલું 2/)).toBeInTheDocument())
  })

  it('unmount aborts and stale completion never navigates or fails', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    const onAutosaveStatusChange = vi.fn()
    const onStepChange = vi.fn()
    const { unmount } = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
        onAutosaveStatusChange={onAutosaveStatusChange}
        onStepChange={onStepChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalled())
    onAutosaveStatusChange.mockClear()
    unmount()
    deferred.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(adapter.calls[0]?.signal.aborted).toBe(true)
    expect(onStepChange).not.toHaveBeenCalled()
    expect(
      onAutosaveStatusChange.mock.calls.some(
        (call) => (call[0] as ProgressiveAutosaveStatusData).status === 'failed',
      ),
    ).toBe(false)
  })

  it('saved state is absent from formData payloads', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = createRecordingAdapter()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    for (const call of onChange.mock.calls) {
      const data = call[0]?.formData as Record<string, unknown>
      expect(Object.keys(data).some((key) => /save|autosave|progress/i.test(key))).toBe(false)
    }
    expect(document.querySelector('form')).toBeTruthy()
  })

  it('localizes EN/GU autosave copy', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    const { unmount } = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
        defaultLocale="en"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Saving progress…')).toBeInTheDocument()
    deferred.resolve()
    expect(await screen.findByText('Progress saved.')).toBeInTheDocument()
    unmount()

    const failAdapter = createRecordingAdapter(async () => {
      throw new Error('nope')
    })
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={failAdapter}
        defaultLocale="gu"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'આગળ' }))
    expect(
      await screen.findByText(resolveRendererMessage('autosaveFailed', 'gu')),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: resolveRendererMessage('autosaveRetry', 'gu') }),
    ).toBeInTheDocument()
  })
})

describe('FB-B2 autosave accessibility', () => {
  it('has no axe violations for idle, saving, and failure (EN)', async () => {
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })
    const { container, unmount } = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText(/Saving progress/i)).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
    deferred.resolve()
    await waitFor(() => expect(screen.getByText(/Progress saved/i)).toBeInTheDocument())
    unmount()

    const failAdapter = createRecordingAdapter(async () => {
      throw new Error('fail')
    })
    const failed = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={failAdapter}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(await axe(failed.container)).toHaveNoViolations()
  })

  it('has no axe violations for failure in Gujarati', async () => {
    const adapter = createRecordingAdapter(async () => {
      throw new Error('fail')
    })
    const { container } = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        autosaveAdapter={adapter}
        defaultLocale="gu"
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'આગળ' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
    const nav = screen.getByRole('navigation', {
      name: resolveRendererMessage('stepNavLabel', 'gu'),
    })
    expect(within(nav).getByText('ઓળખ').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})
