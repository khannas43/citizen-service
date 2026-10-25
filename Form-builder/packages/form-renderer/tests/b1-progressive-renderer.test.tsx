import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'vitest-axe'

import type { CafPrefillAdapter, WidgetServicePorts } from '@citizen/form-widgets'

import { FormRenderer } from '../src/FormRenderer.js'
import type { FormRendererStepChangeData } from '../src/renderer-types.js'
import {
  createProgressivePublishedDefinition,
  createSamplePublishedDefinition,
} from './fixtures.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

function stepHeading(): HTMLElement {
  const heading = document.querySelector('.dg20-renderer-step-heading')
  if (!(heading instanceof HTMLElement)) {
    throw new Error('missing step heading')
  }
  return heading
}

function guidanceAlert(): HTMLElement {
  const alert = document.querySelector('.dg20-renderer-validation-guidance')
  if (!(alert instanceof HTMLElement)) {
    throw new Error('missing validation guidance')
  }
  return alert
}

describe('FB-B1 progressive FormRenderer', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('renders only the first step initially', () => {
    render(<FormRenderer definition={createProgressivePublishedDefinition()} />)
    expect(stepHeading()).toHaveTextContent('Identity')
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(document.querySelector('[data-dg20-widget="yesno"]')).toBeNull()
  })

  it('current-step change emits complete merged data and preserves other steps', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ household_size: 5, agree_terms: true }}
        onChange={onChange}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'Asha')
    expect(onChange).toHaveBeenCalled()
    const latest = onChange.mock.calls.at(-1)?.[0] as { formData: Record<string, unknown> }
    expect(latest.formData.applicant_name).toBe('Asha')
    expect(latest.formData.household_size).toBe(5)
    expect(latest.formData.agree_terms).toBe(true)
    expect(latest.formData).not.toHaveProperty('stepIndex')
    expect(latest.formData).not.toHaveProperty('activeStep')
  })

  it('cleared current field is removed from complete data', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Temp', household_size: 2 }}
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('textbox', { name: /Applicant name/i })
    await user.clear(input)
    const latest = onChange.mock.calls.at(-1)?.[0] as { formData: Record<string, unknown> }
    expect(latest.formData).not.toHaveProperty('applicant_name')
    expect(latest.formData.household_size).toBe(2)
  })

  it('invalid Next does not advance', async () => {
    const user = userEvent.setup()
    const onStepChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        onStepChange={onStepChange}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(onStepChange).not.toHaveBeenCalled()
  })

  it('valid Next advances once and Back does not validate or emit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onStepChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha Patel' }}
        onChange={onChange}
        onStepChange={onStepChange}
      />,
    )
    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
    })
    expect(onStepChange).toHaveBeenCalledWith({
      stepId: 'household',
      stepIndex: 1,
      totalSteps: 2,
      direction: 'next',
    } satisfies FormRendererStepChangeData)

    onChange.mockClear()
    onStepChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => {
      expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(onStepChange).toHaveBeenCalledWith({
      stepId: 'identity',
      stepIndex: 0,
      totalSteps: 2,
      direction: 'back',
    })
  })

  it('does not call step callback on initial mount', () => {
    const onStepChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        onStepChange={onStepChange}
      />,
    )
    expect(onStepChange).not.toHaveBeenCalled()
  })

  it('localizes EN/GU step labels and controls', async () => {
    const user = userEvent.setup()
    render(<FormRenderer definition={createProgressivePublishedDefinition()} defaultLocale="en" />)
    expect(stepHeading()).toHaveTextContent('Identity')
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    expect(stepHeading()).toHaveTextContent('ઓળખ')
    expect(screen.getByRole('button', { name: 'આગળ' })).toBeInTheDocument()
  })

  it('locale switch retains active step and data', async () => {
    const user = userEvent.setup()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Kept' }}
        defaultLocale="en"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    expect(screen.getByText(/પગલું 2/)).toBeInTheDocument()
    expect(stepHeading()).toHaveTextContent('પરિવાર')
    await user.click(screen.getByRole('button', { name: 'પાછળ' }))
    expect(screen.getByRole('textbox', { name: /અરજદારનું નામ/i })).toHaveValue('Kept')
  })

  it('moves focus to heading after navigation', async () => {
    const user = userEvent.setup()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha' }}
      />,
    )
    const initialHeading = stepHeading()
    expect(document.activeElement).not.toBe(initialHeading)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(document.activeElement).toBe(stepHeading())
    })
  })

  it('allows readOnly review navigation without submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onChange = vi.fn()
    const onStepChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Review', household_size: 2, agree_terms: true }}
        readOnly
        onSubmit={onSubmit}
        onChange={onChange}
        onStepChange={onStepChange}
      />,
    )
    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(onStepChange).toHaveBeenCalledWith({
      stepId: 'household',
      stepIndex: 1,
      totalSteps: 2,
      direction: 'next',
    })
  })

  it('readOnly Next bypasses validation for incomplete required steps', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const onStepChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{}}
        readOnly
        onChange={onChange}
        onSubmit={onSubmit}
        onStepChange={onStepChange}
      />,
    )
    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'next', stepIndex: 1 }),
    )
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('unchanged Next and Submit do not emit onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const formData = {
      applicant_name: 'Asha Patel',
      household_size: 4,
      contact_email: 'asha@example.gov.in',
      agree_terms: true,
    }
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={formData}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    )
    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()

    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onChange).not.toHaveBeenCalled()
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ formData })
  })

  it('changed final-step data emits once before validated submit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn()

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Asha Patel',
        household_size: 2,
        contact_email: 'asha@example.gov.in',
        agree_terms: true,
      })
      return (
        <FormRenderer
          definition={createProgressivePublishedDefinition()}
          formData={formData}
          onChange={(payload) => {
            onChange(payload)
            setFormData({ ...payload.formData })
          }}
          onSubmit={onSubmit}
        />
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument())
    onChange.mockClear()

    const size = screen.getByRole('spinbutton', { name: /Household size/i })
    await user.clear(size)
    await user.type(size, '5')
    expect(onChange).toHaveBeenCalled()
    const edited = onChange.mock.calls.at(-1)?.[0] as { formData: Record<string, unknown> }
    expect(edited.formData.household_size).toBe(5)

    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0].formData.household_size).toBe(5)
    // Host kept controlled data in sync — Submit must not re-emit unchanged data.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('service/version change returns to first step', async () => {
    const user = userEvent.setup()
    const v1 = createProgressivePublishedDefinition({ version: 1 })
    const v2 = createProgressivePublishedDefinition({
      version: 2,
      meta: {
        ...createProgressivePublishedDefinition().meta,
        progressiveSteps: [
          {
            stepId: 'identity',
            labelEn: 'Identity V2',
            labelGu: 'ઓળખ ૨',
            fieldIds: ['section_identity', 'applicant_name', 'caf_father_name'],
          },
          {
            stepId: 'household',
            labelEn: 'Household V2',
            labelGu: 'પરિવાર ૨',
            fieldIds: ['household_size', 'contact_email', 'agree_terms'],
          },
        ],
      },
    })

    function Harness(): ReactElement {
      const [definition, setDefinition] = useState(v1)
      return (
        <div>
          <button type="button" onClick={() => setDefinition(v2)}>
            Bump version
          </button>
          <FormRenderer definition={definition} formData={{ applicant_name: 'Asha' }} />
        </div>
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Bump version' }))
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(stepHeading()).toHaveTextContent('Identity V2')
  })

  it('leaving a step aborts pending async widget work', async () => {
    let resolvePrefill!: (value: { value: string; confidence: number }) => void
    const pending = new Promise<{ value: string; confidence: number }>((resolve) => {
      resolvePrefill = resolve
    })
    const resolvePrefillFn = vi.fn(() => pending)
    const services: WidgetServicePorts = {
      cafPrefill: { resolvePrefill: resolvePrefillFn } satisfies CafPrefillAdapter,
    }
    const onChange = vi.fn()

    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha' }}
        services={services}
        onChange={onChange}
      />,
    )
    await waitFor(() => expect(resolvePrefillFn).toHaveBeenCalled())
    onChange.mockClear()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())

    resolvePrefill({ value: 'STALE_FATHER', confidence: 0.99 })
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByDisplayValue('STALE_FATHER')).toBeNull()
    const stale = onChange.mock.calls.filter((call) => {
      const data = call[0]?.formData as { caf_father_name?: { value?: string } }
      return data?.caf_father_name?.value === 'STALE_FATHER'
    })
    expect(stale).toHaveLength(0)
  })

  it('final valid submission contains complete form data', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{
          applicant_name: 'Asha Patel',
          household_size: 4,
          contact_email: 'asha@example.gov.in',
          agree_terms: true,
        }}
        onSubmit={onSubmit}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      formData: {
        applicant_name: 'Asha Patel',
        household_size: 4,
        contact_email: 'asha@example.gov.in',
        agree_terms: true,
      },
    })
  })

  it('final full-schema failure does not submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{
          applicant_name: 'Asha Patel',
          household_size: 2,
          agree_terms: false,
        }}
        onSubmit={onSubmit}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
    expect(guidanceAlert()).toBeInTheDocument()
  })

  it('controlled external invalidation of an earlier step redirects there', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onStepChange = vi.fn()

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Valid Name',
        household_size: 3,
        contact_email: 'ok@example.gov.in',
        agree_terms: true,
      })
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              setFormData({
                household_size: 3,
                contact_email: 'ok@example.gov.in',
                agree_terms: true,
              })
            }
          >
            Invalidate identity
          </button>
          <FormRenderer
            definition={createProgressivePublishedDefinition()}
            formData={formData}
            onSubmit={onSubmit}
            onStepChange={onStepChange}
          />
        </div>
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Invalidate identity' }))
    onStepChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled()
      expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    })
    expect(onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: 'identity',
        stepIndex: 0,
        direction: 'validation_redirect',
      }),
    )
    expect(guidanceAlert()).toHaveTextContent(/Some answers need correction/i)
  })

  it('editing clears stale injected errors and retry revalidates', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    function Harness(): ReactElement {
      const [formData, setFormData] = useState<Record<string, unknown>>({
        applicant_name: 'Valid Name',
        household_size: 3,
        agree_terms: true,
      })
      return (
        <FormRenderer
          definition={createProgressivePublishedDefinition()}
          formData={formData}
          onChange={({ formData: next }) => setFormData({ ...next })}
          onSubmit={onSubmit}
        />
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument())

    // Invalidate by clearing agree_terms via UI then submit → stay/redirect with guidance.
    // agree_terms const:true — select No then Submit.
    await user.click(screen.getByRole('radio', { name: /^No$/i }))
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())

    // Fix and retry.
    await user.click(screen.getByRole('radio', { name: /^Yes$/i }))
    expect(document.querySelector('.dg20-renderer-validation-guidance')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  it('navigation state is absent from formData payloads', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha' }}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    for (const call of onChange.mock.calls) {
      const data = call[0]?.formData as Record<string, unknown>
      expect(Object.keys(data).some((key) => /step|progress|active/i.test(key))).toBe(false)
    }
  })

  it('two progressive Renderers retain globally unique IDs', () => {
    render(
      <>
        <FormRenderer definition={createProgressivePublishedDefinition()} formData={{}} />
        <FormRenderer
          definition={createProgressivePublishedDefinition({ serviceId: 'other-progressive' })}
          formData={{}}
        />
      </>,
    )
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('empty progressiveSteps keeps single-page UI with no step chrome', () => {
    render(<FormRenderer definition={createSamplePublishedDefinition()} onSubmit={vi.fn()} />)
    expect(document.querySelector('[data-dg20-progressive="false"]')).toBeTruthy()
    expect(screen.queryByText(/Step 1 of/)).toBeNull()
    expect(screen.getByRole('button', { name: /^Submit$/i })).toBeInTheDocument()
  })
})

describe('FB-B1 progressive accessibility', () => {
  it('has no axe violations in English', async () => {
    const { container } = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        formData={{ applicant_name: 'Asha', agree_terms: true, household_size: 2 }}
        onSubmit={vi.fn()}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in Gujarati', async () => {
    const { container } = render(
      <FormRenderer
        definition={createProgressivePublishedDefinition()}
        defaultLocale="gu"
        formData={{ applicant_name: 'Asha', agree_terms: true, household_size: 2 }}
        onSubmit={vi.fn()}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('marks the active step with aria-current', () => {
    render(<FormRenderer definition={createProgressivePublishedDefinition()} />)
    const nav = screen.getByRole('navigation', { name: 'Form steps' })
    const current = within(nav).getByText('Identity').closest('li')
    expect(current).toHaveAttribute('aria-current', 'step')
  })
})
