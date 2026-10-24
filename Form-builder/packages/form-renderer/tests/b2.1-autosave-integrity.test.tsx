import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormRenderer } from '../src/FormRenderer.js'
import type {
  ProgressiveAutosaveAdapter,
  ProgressiveAutosaveRequest,
  ProgressiveAutosaveStatusData,
} from '../src/progressive-autosave.js'
import { createProgressivePublishedDefinition } from './fixtures.js'

import '@dg20/form-widgets/styles/tokens.css'
import '@dg20/form-widgets/styles/widgets.css'
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
    }
  })
  return { calls, saveProgress }
}

describe('FB-B2.1 acknowledgement and disabled guards', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('controlled host that ignores onChange never autosaves or navigates', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    const onStepChange = vi.fn()
    const onAutosaveStatusChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{}}
        autosaveAdapter={adapter}
        onChange={vi.fn()}
        onStepChange={onStepChange}
        onAutosaveStatusChange={onAutosaveStatusChange}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'Asha Patel')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(document.querySelector('[data-dg20-autosave="awaiting_host"]')).toBeTruthy(),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(adapter.saveProgress).not.toHaveBeenCalled()
    expect(onStepChange).not.toHaveBeenCalled()
    expect(onAutosaveStatusChange).not.toHaveBeenCalled()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.queryByText(/Saving progress/i)).toBeNull()
  })

  it('controlled equal clone acknowledges once then saves', async () => {
    const user = userEvent.setup()
    const statuses: string[] = []
    const adapter = createRecordingAdapter()

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Temp',
      })
      return (
        <FormRenderer
          definition={createProgressivePublishedDefinition()}
          formData={formData}
          autosaveAdapter={adapter}
          onChange={({ formData: next }) => setFormData({ ...next })}
          onAutosaveStatusChange={(data) => {
            statuses.push(data.status)
          }}
        />
      )
    }

    render(<Harness />)
    const input = screen.getByRole('textbox', { name: /Applicant name/i })
    await user.clear(input)
    await user.type(input, 'Asha Patel')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(statuses).toEqual(['saving', 'saved'])
  })

  it('controlled different replacement cancels before adapter', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    const onAutosaveStatusChange = vi.fn()

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <div>
          <button
            type="button"
            onClick={() => setFormData({ applicant_name: 'Different Host Value' })}
          >
            Replace
          </button>
          <FormRenderer
            definition={createProgressivePublishedDefinition()}
            formData={formData}
            autosaveAdapter={adapter}
            onChange={({ formData: next }) => {
              // Intentionally do not echo — keep pending, then Replace with other value.
              void next
            }}
            onAutosaveStatusChange={onAutosaveStatusChange}
          />
        </div>
      )
    }

    render(<Harness />)
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'Asha Patel')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(document.querySelector('[data-dg20-autosave="awaiting_host"]')).toBeTruthy(),
    )
    await user.click(screen.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(document.querySelector('[data-dg20-autosave="idle"]')).toBeTruthy())
    expect(adapter.saveProgress).not.toHaveBeenCalled()
    expect(onAutosaveStatusChange).not.toHaveBeenCalled()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('uncontrolled mode commits internal state before adapter call', async () => {
    const user = userEvent.setup()
    let seenDuringSave: Record<string, unknown> | undefined
    const adapter = createRecordingAdapter(async (request) => {
      seenDuringSave = { ...request.formData }
    })
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        autosaveAdapter={adapter}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'Asha Patel')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalledTimes(1))
    expect(seenDuringSave).toMatchObject({ applicant_name: 'Asha Patel' })
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
  })

  it('pending intent cancelled by adapter swap without status leak', async () => {
    const user = userEvent.setup()
    const adapterA = createRecordingAdapter()
    const adapterB = createRecordingAdapter()
    const onAutosaveStatusChange = vi.fn()

    function Harness(): ReactElement {
      const [adapter, setAdapter] = useState<ProgressiveAutosaveAdapter>(adapterA)
      return (
        <div>
          <button type="button" onClick={() => setAdapter(adapterB)}>
            Swap
          </button>
          <FormRenderer
            definition={createProgressivePublishedDefinition()}
            formData={{}}
            autosaveAdapter={adapter}
            onChange={vi.fn()}
            onAutosaveStatusChange={onAutosaveStatusChange}
          />
        </div>
      )
    }

    render(<Harness />)
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'Asha Patel')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(document.querySelector('[data-dg20-autosave="awaiting_host"]')).toBeTruthy(),
    )
    await user.click(screen.getByRole('button', { name: 'Swap' }))
    await waitFor(() => expect(document.querySelector('[data-dg20-autosave="idle"]')).toBeTruthy())
    expect(adapterA.saveProgress).not.toHaveBeenCalled()
    expect(adapterB.saveProgress).not.toHaveBeenCalled()
    expect(onAutosaveStatusChange).not.toHaveBeenCalled()
  })

  it('pending intent cancelled by disabled; locale preserves pending', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    const onAutosaveStatusChange = vi.fn()

    function Harness(): ReactElement {
      const [disabled, setDisabled] = useState(false)
      const [formData, setFormData] = useState<Record<string, unknown>>({})
      return (
        <div>
          <button type="button" onClick={() => setDisabled(true)}>
            Disable
          </button>
          <FormRenderer
            definition={createProgressivePublishedDefinition()}
            formData={formData}
            disabled={disabled}
            autosaveAdapter={adapter}
            onChange={vi.fn()}
            onAutosaveStatusChange={onAutosaveStatusChange}
            defaultLocale="en"
          />
          <button type="button" onClick={() => setFormData({ applicant_name: 'Asha Patel' })}>
            Late echo
          </button>
        </div>
      )
    }

    render(<Harness />)
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'Asha Patel')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(document.querySelector('[data-dg20-autosave="awaiting_host"]')).toBeTruthy(),
    )
    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    expect(document.querySelector('[data-dg20-autosave="awaiting_host"]')).toBeTruthy()
    expect(adapter.saveProgress).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(document.querySelector('[data-dg20-autosave="idle"]')).toBeTruthy())
    expect(onAutosaveStatusChange).not.toHaveBeenCalled()
  })

  it('in-flight change back to pre-save aborts', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred()
    const adapter = createRecordingAdapter(async () => {
      await deferred.promise
    })

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Before',
      })
      return (
        <div>
          <button type="button" onClick={() => setFormData({ applicant_name: 'Before' })}>
            Revert pre-save
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

    render(<Harness />)
    const input = screen.getByRole('textbox', { name: /Applicant name/i })
    await user.clear(input)
    await user.type(input, 'After Save')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(adapter.saveProgress).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Revert pre-save' }))
    await waitFor(() => expect(adapter.calls[0]?.signal.aborted).toBe(true))
    deferred.resolve()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('disabled valid Next does nothing', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    const onChange = vi.fn()
    const onStepChange = vi.fn()
    const onAutosaveStatusChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        disabled
        autosaveAdapter={adapter}
        onChange={onChange}
        onStepChange={onStepChange}
        onAutosaveStatusChange={onAutosaveStatusChange}
      />,
    )
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeDisabled()
    await user.click(next)
    expect(adapter.saveProgress).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(onStepChange).not.toHaveBeenCalled()
    expect(onAutosaveStatusChange).not.toHaveBeenCalled()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('disabled Retry does nothing', async () => {
    const user = userEvent.setup()
    let shouldFail = true
    const adapter = createRecordingAdapter(async () => {
      if (shouldFail) {
        shouldFail = false
        throw new Error('fail')
      }
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
            disabled={disabled}
            autosaveAdapter={adapter}
            onAutosaveStatusChange={onAutosaveStatusChange}
          />
        </div>
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry saving/i })).toBeInTheDocument(),
    )
    onAutosaveStatusChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Disable' }))
    const retry = screen.getByRole('button', { name: /Retry saving/i })
    expect(retry).toBeDisabled()
    await user.click(retry)
    expect(adapter.saveProgress).toHaveBeenCalledTimes(1)
    expect(
      onAutosaveStatusChange.mock.calls.some(
        (call) => (call[0] as ProgressiveAutosaveStatusData).status === 'saving',
      ),
    ).toBe(false)
  })

  it('disabled + readOnly Next does nothing', async () => {
    const user = userEvent.setup()
    const adapter = createRecordingAdapter()
    const onStepChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel', agree_terms: true, household_size: 2 }}
        disabled
        readOnly
        autosaveAdapter={adapter}
        onStepChange={onStepChange}
      />,
    )
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeDisabled()
    await user.click(next)
    expect(adapter.saveProgress).not.toHaveBeenCalled()
    expect(onStepChange).not.toHaveBeenCalled()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })
})
