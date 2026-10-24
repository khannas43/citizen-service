import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useLayoutEffect, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormRenderer } from '../src/FormRenderer.js'
import {
  RESUME_CONTEXT_REVISION_MAX_LENGTH,
  RESUME_SESSION_TOKEN_INVALID,
  RESUME_SESSION_TOKEN_NONE,
  resumeSessionTokenForKey,
  type ProgressiveResumeAdapter,
  type ProgressiveResumeRequest,
  type ProgressiveResumeResult,
  type ProgressiveResumeStatusData,
} from '../src/progressive-resume.js'
import { createProgressivePublishedDefinition } from './fixtures.js'

import '@dg20/form-widgets/styles/tokens.css'
import '@dg20/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

function createResumeAdapter(
  impl: (request: ProgressiveResumeRequest) => Promise<ProgressiveResumeResult>,
): ProgressiveResumeAdapter & {
  readonly loadProgress: ReturnType<typeof vi.fn>
} {
  const loadProgress = vi.fn(async (request: ProgressiveResumeRequest) => impl(request))
  return { loadProgress }
}

describe('FB-B4.1 resume integrity', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  const progressiveDefinition = createProgressivePublishedDefinition()

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    cleanup()
  })

  it('StrictMode: adapter once and statuses exactly loading then not_found', async () => {
    const statuses: ProgressiveResumeStatusData['status'][] = []
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
          onResumeStatusChange={(data) => statuses.push(data.status)}
        />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(adapter.loadProgress).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['loading', 'not_found'])
  })

  it('StrictMode: adapter once and statuses exactly loading then loaded', async () => {
    const statuses: ProgressiveResumeStatusData['status'][] = []
    const adapter = createResumeAdapter(async (request) => ({
      status: 'found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
      formData: { applicant_name: 'Strict' },
      checkpoint: null,
    }))
    render(
      <StrictMode>
        <FormRenderer
          definition={progressiveDefinition}
          resumeAdapter={adapter}
          resumeContextRevision="rev-1"
          onResumeStatusChange={(data) => statuses.push(data.status)}
        />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Strict')).toBeInTheDocument())
    expect(adapter.loadProgress).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['loading', 'loaded'])
  })

  it('cancelled pre-microtask setup emits no public loading', () => {
    const statuses: ProgressiveResumeStatusData['status'][] = []
    const adapter = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      const root = createRoot(container)
      root.render(
        <FormRenderer
          definition={progressiveDefinition}
          resumeAdapter={adapter}
          resumeContextRevision="rev-1"
          onResumeStatusChange={(data) => statuses.push(data.status)}
        />,
      )
      root.unmount()
    })
    expect(adapter.loadProgress).not.toHaveBeenCalled()
    expect(statuses).toEqual([])
    container.remove()
  })

  it('adapter swap before invocation emits loading only for the live adapter', async () => {
    const statuses: ProgressiveResumeStatusData['status'][] = []
    const first = createResumeAdapter(async () => {
      throw new Error('discarded adapter must not run')
    })
    const second = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))

    function Harness(): ReactElement {
      const [adapter, setAdapter] = useState<ProgressiveResumeAdapter>(first)
      useLayoutEffect(() => {
        setAdapter(second)
      }, [])
      return (
        <FormRenderer
          definition={progressiveDefinition}
          resumeAdapter={adapter}
          resumeContextRevision="rev-1"
          onResumeStatusChange={(data) => statuses.push(data.status)}
        />
      )
    }

    render(<Harness />)

    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(first.loadProgress).not.toHaveBeenCalled()
    expect(second.loadProgress).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['loading', 'not_found'])
  })

  it('synchronous adapter throw produces loading then failed', async () => {
    const statuses: ProgressiveResumeStatusData['status'][] = []
    const adapter: ProgressiveResumeAdapter = {
      loadProgress: vi.fn(() => {
        throw new Error('sync boom')
      }),
    }
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision="rev-1"
        onResumeStatusChange={(data) => statuses.push(data.status)}
      />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(statuses).toEqual(['loading', 'failed'])
    expect(screen.queryByText(/sync boom/i)).toBeNull()
  })

  it('whitespace-only revision change does not remount or reload', async () => {
    const adapter = createResumeAdapter(async (request) => ({
      status: 'not_found',
      serviceId: request.serviceId,
      formVersion: request.formVersion,
      resumeContextRevision: request.resumeContextRevision,
    }))
    function Harness(): ReactElement {
      const [revision, setRevision] = useState(' rev-1 ')
      return (
        <div>
          <button type="button" onClick={() => setRevision('rev-1')}>
            trim
          </button>
          <FormRenderer
            definition={progressiveDefinition}
            resumeAdapter={adapter}
            resumeContextRevision={revision}
          />
        </div>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(adapter.loadProgress).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'trim' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(adapter.loadProgress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('canonical revision change remounts and aborts the old request', async () => {
    let resolveFirst!: (value: ProgressiveResumeResult) => void
    const firstPromise = new Promise<ProgressiveResumeResult>((resolve) => {
      resolveFirst = resolve
    })
    const adapter = createResumeAdapter(async (request) => {
      if (request.resumeContextRevision === 'rev-a') {
        return firstPromise
      }
      return {
        status: 'not_found',
        serviceId: request.serviceId,
        formVersion: request.formVersion,
        resumeContextRevision: request.resumeContextRevision,
      }
    })
    function Harness(): ReactElement {
      const [revision, setRevision] = useState('rev-a')
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
    render(<Harness />)
    await waitFor(() => expect(adapter.loadProgress).toHaveBeenCalledTimes(1))
    const firstSignal = adapter.loadProgress.mock.calls[0]![0].signal as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: 'bump' }))
    await waitFor(() => expect(adapter.loadProgress).toHaveBeenCalledTimes(2))
    expect(firstSignal.aborted).toBe(true)
    expect(adapter.loadProgress.mock.calls[1]![0].resumeContextRevision).toBe('rev-b')
    resolveFirst({
      status: 'found',
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-a',
      formData: { applicant_name: 'STALE' },
      checkpoint: null,
    })
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(screen.queryByDisplayValue('STALE')).toBeNull()
  })

  it('invalid raw revision variants use stable config state and never invoke adapter', async () => {
    const adapter = createResumeAdapter(async () => {
      throw new Error('must not load')
    })
    const overLong = `raw-${'x'.repeat(RESUME_CONTEXT_REVISION_MAX_LENGTH)}`
    expect(resumeSessionTokenForKey(adapter, '  ')).toBe(RESUME_SESSION_TOKEN_INVALID)
    expect(resumeSessionTokenForKey(adapter, overLong)).toBe(RESUME_SESSION_TOKEN_INVALID)
    expect(resumeSessionTokenForKey(adapter, '')).toBe(RESUME_SESSION_TOKEN_INVALID)
    expect(resumeSessionTokenForKey(adapter, 12)).toBe(RESUME_SESSION_TOKEN_INVALID)

    function Harness(): ReactElement {
      const [revision, setRevision] = useState<unknown>('   ')
      return (
        <div>
          <button type="button" onClick={() => setRevision(overLong)}>
            next-invalid
          </button>
          <FormRenderer
            definition={progressiveDefinition}
            resumeAdapter={adapter}
            resumeContextRevision={revision as string}
          />
        </div>
      )
    }

    render(<Harness />)
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(adapter.loadProgress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'next-invalid' }))
    expect(adapter.loadProgress).not.toHaveBeenCalled()
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(overLong)
  })

  it('over-length raw revision is absent from DOM and status payloads', async () => {
    const statuses: ProgressiveResumeStatusData[] = []
    const overLong = `secret-${'z'.repeat(RESUME_CONTEXT_REVISION_MAX_LENGTH)}`
    const adapter = createResumeAdapter(async () => {
      throw new Error('must not load')
    })
    render(
      <FormRenderer
        definition={progressiveDefinition}
        resumeAdapter={adapter}
        resumeContextRevision={overLong}
        onResumeStatusChange={(data) => statuses.push(data)}
      />,
    )
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(overLong)
    expect(document.body.innerHTML).not.toContain('secret-')
    expect(JSON.stringify(statuses)).not.toContain(overLong)
    expect(statuses).toEqual([])
  })

  it('without resume adapter, revision changes do not remount the session', async () => {
    expect(resumeSessionTokenForKey(undefined, 'rev-a')).toBe(RESUME_SESSION_TOKEN_NONE)
    expect(resumeSessionTokenForKey(undefined, 'rev-b')).toBe(RESUME_SESSION_TOKEN_NONE)

    function Harness(): ReactElement {
      const [revision, setRevision] = useState('rev-a')
      return (
        <div>
          <button type="button" onClick={() => setRevision('rev-b')}>
            bump
          </button>
          <FormRenderer definition={progressiveDefinition} resumeContextRevision={revision} />
        </div>
      )
    }
    render(<Harness />)
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/Applicant name/i)
    fireEvent.change(nameInput, { target: { value: 'KeepMe' } })
    fireEvent.click(screen.getByRole('button', { name: 'bump' }))
    expect(screen.getByDisplayValue('KeepMe')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })
})
