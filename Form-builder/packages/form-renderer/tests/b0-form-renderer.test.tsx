import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'vitest-axe'

import type { CafPrefillAdapter, WidgetServicePorts } from '@citizen/form-widgets'

import { FormRenderer } from '../src/FormRenderer.js'
import type { FormRendererProps } from '../src/renderer-types.js'
import { createSamplePublishedDefinition, deepFreeze } from './fixtures.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

function ControlledLocaleHarness({
  initialLocale = 'en',
  onLocaleChange,
  ...props
}: Omit<FormRendererProps, 'locale'> & {
  readonly initialLocale?: 'en' | 'gu'
}): ReactElement {
  const [locale, setLocale] = useState<'en' | 'gu'>(initialLocale)
  return (
    <FormRenderer
      {...props}
      locale={locale}
      onLocaleChange={(next) => {
        setLocale(next)
        onLocaleChange?.(next)
      }}
    />
  )
}

describe('FB-B0 FormRenderer', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('renders admitted published definition with dg20 widgets/fields', () => {
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        mode="citizen"
        showLocaleToggle
      />,
    )
    expect(document.querySelectorAll('.dg20-field').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-dg20-widget="yesno"]')).toBeTruthy()
    expect(document.querySelector('[data-dg20-widget="section-header"]')).toBeTruthy()
    expect(document.querySelector('[data-dg20-widget="caf-prefill"]')).toBeTruthy()
    expect(document.querySelector('[data-dg20-renderer]')).toHaveAttribute(
      'data-dg20-admission',
      'admitted',
    )
  })

  it('shows preview banner for draft in preview mode', () => {
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition({ status: 'draft' })}
        mode="preview"
      />,
    )
    const banner = document.querySelector('.dg20-renderer-preview-banner')
    expect(banner).toHaveTextContent(/Preview mode/i)
    expect(banner).toHaveAttribute('role', 'status')
    expect(document.querySelector('[data-dg20-widget="yesno"]')).toBeTruthy()
  })

  it('rejects draft in citizen mode with unpublished copy', () => {
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition({ status: 'draft' })}
        mode="citizen"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/not available for submission/i)
    expect(document.querySelector('[data-dg20-widget="text-short"]')).toBeNull()
  })

  it('fails closed on malformed definition without crashing', () => {
    render(<FormRenderer definition={{ broken: true }} mode="citizen" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i)
  })

  it('switches bilingual labels and help EN ↔ GU', async () => {
    const user = userEvent.setup()
    render(<FormRenderer definition={createSamplePublishedDefinition()} defaultLocale="en" />)

    expect(screen.getByText('Enter your full legal name.')).toBeInTheDocument()
    expect(screen.getByText('Identity details')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Gujarati' }))

    expect(screen.getByText('તમારું સંપૂર્ણ કાનૂની નામ દાખલ કરો.')).toBeInTheDocument()
    expect(screen.getByText('ઓળખ વિગતો')).toBeInTheDocument()
  })

  it('supports controlled locale without resetting form data or calling onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onLocaleChange = vi.fn()
    render(
      <ControlledLocaleHarness
        definition={createSamplePublishedDefinition()}
        formData={{ applicant_name: 'Kept Name' }}
        onChange={onChange}
        onLocaleChange={onLocaleChange}
        initialLocale="en"
      />,
    )

    const nameInput = screen.getByRole('textbox', { name: /Applicant name/i })
    expect(nameInput).toHaveValue('Kept Name')
    onChange.mockClear()

    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    expect(onLocaleChange).toHaveBeenCalledWith('gu')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: /અરજદારનું નામ/i })).toHaveValue('Kept Name')
  })

  it('supports uncontrolled locale initialized from defaultLocale', async () => {
    const user = userEvent.setup()
    render(<FormRenderer definition={createSamplePublishedDefinition()} defaultLocale="gu" />)
    expect(screen.getByText('ઓળખ વિગતો')).toBeInTheDocument()
    const guButton = screen.getByRole('button', { name: 'ગુજરાતી' })
    expect(guButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'અંગ્રેજી' }))
    expect(screen.getByText('Identity details')).toBeInTheDocument()
  })

  it('preserves uncontrolled formData across locale switch without onChange from locale alone', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        defaultLocale="en"
        onChange={onChange}
      />,
    )

    const nameInput = screen.getByRole('textbox', { name: /Applicant name/i })
    await user.clear(nameInput)
    await user.type(nameInput, 'Local User')
    expect(onChange).toHaveBeenCalled()
    onChange.mockClear()

    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: /અરજદારનું નામ/i })).toHaveValue('Local User')
  })

  it('wires WidgetRuntimeProvider with prefill bindings and service ports', async () => {
    const resolvePrefill = vi.fn(async () => ({
      value: 'Ramesh',
      confidence: 0.95,
    }))
    const cafPrefill: CafPrefillAdapter = { resolvePrefill }
    const services: WidgetServicePorts = { cafPrefill }

    render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        services={services}
        formData={{}}
      />,
    )

    await waitFor(() => {
      expect(resolvePrefill).toHaveBeenCalled()
    })
    expect(resolvePrefill.mock.calls.some((call) => call[0]?.cafAttribute === 'fatherName')).toBe(
      true,
    )
  })

  it('propagates disabled and readOnly', () => {
    const { rerender } = render(
      <FormRenderer definition={createSamplePublishedDefinition()} disabled />,
    )
    const nameInput = screen.getByRole('textbox', { name: /Applicant name/i })
    expect(nameInput).toBeDisabled()

    rerender(<FormRenderer definition={createSamplePublishedDefinition()} readOnly />)
    expect(screen.getByRole('textbox', { name: /Applicant name/i })).toHaveAttribute('readonly')
  })

  it('renders no submit control when onSubmit is absent', () => {
    render(<FormRenderer definition={createSamplePublishedDefinition()} />)
    expect(screen.queryByRole('button', { name: /^Submit$/i })).toBeNull()
  })

  it('does not call onSubmit for an invalid form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      render(<FormRenderer definition={createSamplePublishedDefinition()} onSubmit={onSubmit} />)
      await user.click(screen.getByRole('button', { name: /^Submit$/i }))
      expect(onSubmit).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('submits exact form data when valid', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const formData = {
      applicant_name: 'Asha Patel',
      household_size: 4,
      contact_email: 'asha@example.gov.in',
      agree_terms: true,
    }
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        formData={formData}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ formData })
    const payload = onSubmit.mock.calls[0]?.[0] as { formData: unknown }
    expect(payload).not.toHaveProperty('registry')
    expect(payload).not.toHaveProperty('validator')
    expect(Object.keys(payload)).toEqual(['formData'])
  })

  it('emits change callback with data only', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        formData={{}}
        onChange={onChange}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /Applicant name/i }), 'X')
    expect(onChange).toHaveBeenCalled()
    const payload = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['formData'])
    expect(payload).not.toHaveProperty('errorSchema')
    expect(payload).not.toHaveProperty('idSchema')
  })

  it('does not mutate definition objects', () => {
    const definition = deepFreeze(createSamplePublishedDefinition())
    expect(() => render(<FormRenderer definition={definition} mode="citizen" />)).not.toThrow()
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.jsonSchema)).toBe(true)
    expect(Object.isFrozen(definition.uiSchema)).toBe(true)
  })

  it('makes no direct network call', async () => {
    const user = userEvent.setup()
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        formData={{
          applicant_name: 'Asha',
          agree_terms: true,
        }}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps unique DOM IDs', () => {
    render(<FormRenderer definition={createSamplePublishedDefinition()} />)
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id).filter(Boolean)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sets lang on the renderer root and aria-pressed on locale toggle', () => {
    render(<FormRenderer definition={createSamplePublishedDefinition()} defaultLocale="en" />)
    const root = document.querySelector('[data-dg20-renderer]')
    expect(root).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Gujarati' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('announces preview banner as status without aria-live', () => {
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition({ status: 'approved' })}
        mode="preview"
      />,
    )
    const banner = document.querySelector('.dg20-renderer-preview-banner')
    expect(banner).toHaveAttribute('role', 'status')
    expect(banner).not.toHaveAttribute('aria-live')
  })
})

describe('FB-B0 FormRenderer accessibility', () => {
  it('has no axe violations in English', async () => {
    const { container } = render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        formData={{ applicant_name: 'Asha', agree_terms: true }}
        onSubmit={vi.fn()}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in Gujarati', async () => {
    const { container } = render(
      <FormRenderer
        definition={createSamplePublishedDefinition()}
        defaultLocale="gu"
        formData={{ applicant_name: 'Asha', agree_terms: true }}
        onSubmit={vi.fn()}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('FB-B0 locale toggle a11y structure', () => {
  it('exposes a labeled locale group', () => {
    render(<FormRenderer definition={createSamplePublishedDefinition()} />)
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Language' })).getAllByRole('button'),
    ).toHaveLength(2)
  })
})
