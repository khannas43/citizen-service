import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@dg20/form-contract'

import type {
  EmailVerificationAdapter,
  NameTransliterationAdapter,
  WidgetClock,
} from '../src/runtime/service-ports.js'
import { DemoForm } from '../src/widgets/DemoForm.js'
import {
  renderDobHarness,
  renderEmailHarness,
  renderFullNameHarness,
  renderGenderHarness,
  renderTextShortHarness,
} from './widget-harness.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingual: BilingualContent = {
  labels: {
    contactEmail: { en: 'Email', gu: 'ઇમેઇલ' },
    applicant_full_name: { en: 'Full name', gu: 'પૂરું નામ' },
    date_of_birth: { en: 'DOB', gu: 'જન્મ તારીખ' },
    gender: { en: 'Gender', gu: 'લિંગ' },
    applicant_full_name_err: { en: 'Name error EN', gu: 'નામ ભૂલ' },
  },
  help: {},
  errors: {
    contactEmail: { en: 'Email metadata error', gu: 'ઇમેઇલ મેટા ભૂલ' },
    applicant_full_name: { en: 'Name is invalid', gu: 'નામ અમાન્ય છે' },
  },
}

describe('localized error rendering on widgets', () => {
  it('renders English/Gujarati metadata errors and GU→EN fallback for underscore IDs', () => {
    const { unmount } = render(
      renderTextShortHarness({
        bilingual,
        name: 'applicant_full_name',
        id: 'root_applicant_full_name',
        rawErrors: ['raw one', 'raw two'],
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Name is invalid')
    expect(screen.getByRole('alert').textContent).not.toContain('raw one')
    unmount()

    render(
      renderTextShortHarness({
        bilingual,
        name: 'applicant_full_name',
        id: 'root_applicant_full_name',
        locale: 'gu',
        rawErrors: ['raw'],
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('નામ અમાન્ય છે')
  })
})

describe('EmailWidget', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      contactEmail: {
        type: 'string' as const,
        format: 'email',
        title: 'Email',
        'x-dg20': { verifyEmail: true },
      },
    },
  }
  const uiSchema = { contactEmail: { 'ui:widget': 'email' } }

  it('emits string then undefined when cleared (harness)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderEmailHarness({ bilingual, onChange, verifyEmail: false }))
    const input = screen.getByLabelText(/Email/)
    await user.type(input, 'a@b.co')
    expect(onChange).toHaveBeenLastCalledWith('a@b.co')
    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('emits string/undefined and hides verification when flag off', async () => {
    const user = userEvent.setup()
    const offSchema = {
      type: 'object' as const,
      properties: {
        contactEmail: { type: 'string' as const, format: 'email', title: 'Email' },
      },
    }
    render(<DemoForm schema={offSchema} uiSchema={uiSchema} bilingual={bilingual} />)
    expect(screen.queryByRole('button', { name: /verification/i })).not.toBeInTheDocument()
    const input = screen.getByLabelText(/Email/)
    await user.type(input, 'a@b.co')
    expect(input).toHaveValue('a@b.co')
    await user.clear(input)
    expect(input).toHaveValue('')
  })

  it('requests verification, prevents duplicates, resets on email change', async () => {
    const user = userEvent.setup()
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: EmailVerificationAdapter = {
      async requestVerificationLink() {
        calls += 1
        await gate
        return { requestId: 'r1' }
      },
    }
    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ contactEmail: 'citizen@example.gov.in' }}
        services={{ emailVerification: adapter }}
      />,
    )
    const button = screen.getByRole('button', { name: /Send verification link/i })
    await user.click(button)
    await user.click(button)
    expect(calls).toBe(1)
    release()
    await waitFor(() => {
      expect(screen.getByText(/Verification link sent/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/Email/), 'x')
    expect(screen.queryByText(/Verification link sent/i)).not.toBeInTheDocument()
  })

  it('aborts and ignores stale verification when email changes mid-flight', async () => {
    const user = userEvent.setup()
    const signals: AbortSignal[] = []
    const emails: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let call = 0
    const adapter: EmailVerificationAdapter = {
      async requestVerificationLink({ email, signal }) {
        call += 1
        emails.push(email)
        signals.push(signal)
        if (call === 1) {
          await firstGate
        }
        return { requestId: `r${call}` }
      },
    }

    render(
      renderEmailHarness({
        bilingual,
        verifyEmail: true,
        value: 'first@example.gov.in',
        services: { emailVerification: adapter },
      }),
    )

    await user.click(screen.getByRole('button', { name: /Send verification link/i }))
    expect(call).toBe(1)
    expect(emails[0]).toBe('first@example.gov.in')

    const input = screen.getByLabelText(/Email/)
    await user.clear(input)
    await user.type(input, 'second@example.gov.in')

    releaseFirst()
    await new Promise((r) => setTimeout(r, 30))

    expect(signals[0]?.aborted).toBe(true)
    expect(screen.queryByText(/Verification link sent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Sending verification link/i)).not.toBeInTheDocument()
    expect(call).toBe(1)

    await user.click(screen.getByRole('button', { name: /Send verification link/i }))
    expect(call).toBe(2)
    expect(emails[1]).toBe('second@example.gov.in')
    await waitFor(() => {
      expect(screen.getByText(/Verification link sent/i)).toBeInTheDocument()
    })
  })

  it('shows missing adapter and safe failure states', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ contactEmail: 'citizen@example.gov.in' }}
      />,
    )
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    unmount()

    const failAdapter: EmailVerificationAdapter = {
      async requestVerificationLink() {
        throw new Error('boom')
      },
    }
    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ contactEmail: 'citizen@example.gov.in' }}
        services={{ emailVerification: failAdapter }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Send verification link/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
  })

  it('ignores stale async results after unmount', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: EmailVerificationAdapter = {
      async requestVerificationLink() {
        await gate
        return { requestId: 'late' }
      },
    }
    const user = userEvent.setup()
    const { unmount } = render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ contactEmail: 'citizen@example.gov.in' }}
        services={{ emailVerification: adapter }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Send verification link/i }))
    unmount()
    release()
    await new Promise((r) => setTimeout(r, 20))
  })
})

describe('FullNameWidget', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      applicant_full_name: {
        type: 'object' as const,
        title: 'Full name',
        properties: {
          en: { type: 'string' as const },
          gu: { type: 'string' as const },
        },
        required: ['en', 'gu'],
        additionalProperties: false,
      },
    },
  }
  const uiSchema = { applicant_full_name: { 'ui:field': 'full-name' } }

  it('emits EN/GU object and undefined when both empty', async () => {
    const user = userEvent.setup()
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />)
    const en = screen.getByLabelText(/Name in English/i)
    const gu = screen.getByLabelText(/Name in Gujarati/i)
    await user.type(en, 'Priya')
    expect(en).toHaveValue('Priya')
    await user.type(gu, 'પ્રિયા')
    expect(gu).toHaveValue('પ્રિયા')
    await user.clear(en)
    await user.clear(gu)
    expect(en).toHaveValue('')
    expect(gu).toHaveValue('')
  })

  it('transliterates explicitly without per-keystroke calls or silent overwrite', async () => {
    const user = userEvent.setup()
    const transliterate = vi.fn(async ({ englishName }: { englishName: string }) => ({
      gujaratiSuggested: `${englishName}-GU`,
    }))
    const adapter: NameTransliterationAdapter = {
      transliterateEnglishToGujarati: transliterate,
    }
    const { unmount } = render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ applicant_full_name: { en: 'Priya', gu: '' } }}
        services={{ nameTransliteration: adapter }}
      />,
    )
    const en = screen.getByLabelText(/Name in English/i)
    await user.type(en, 'a')
    expect(transliterate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Transliterate/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('Priyaa-GU')
    })
    unmount()

    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ applicant_full_name: { en: 'Priya', gu: 'મેન્યુઅલ' } }}
        services={{ nameTransliteration: adapter }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Transliterate/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Apply suggested/i })).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('મેન્યુઅલ')
  })

  it('aborts and ignores stale transliteration when English changes mid-flight', async () => {
    const user = userEvent.setup()
    const signals: AbortSignal[] = []
    const englishNames: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let call = 0
    const adapter: NameTransliterationAdapter = {
      async transliterateEnglishToGujarati({ englishName, signal }) {
        call += 1
        englishNames.push(englishName)
        signals.push(signal)
        if (call === 1) {
          await firstGate
          return { gujaratiSuggested: 'પ્રિયા' }
        }
        return { gujaratiSuggested: 'પ્રિયંકા' }
      },
    }

    const onChange = vi.fn()
    render(
      renderFullNameHarness({
        bilingual,
        formData: { en: 'Priya', gu: '' },
        services: { nameTransliteration: adapter },
        onChange,
      }),
    )

    await user.click(screen.getByRole('button', { name: /Transliterate/i }))
    expect(screen.getByText(/Transliteration in progress/i)).toBeInTheDocument()
    expect(call).toBe(1)

    const en = screen.getByLabelText(/Name in English/i)
    await user.type(en, 'nka')

    releaseFirst()
    await new Promise((r) => setTimeout(r, 30))

    expect(signals[0]?.aborted).toBe(true)
    expect(screen.queryByText(/પ્રિયા/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('')
    expect(screen.queryByText(/Transliteration in progress/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Transliterate/i }))
    expect(call).toBe(2)
    expect(englishNames[1]).toBe('Priyanka')
    await waitFor(() => {
      expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('પ્રિયંકા')
    })
  })

  it('supports missing adapter with manual entry', async () => {
    const user = userEvent.setup()
    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ applicant_full_name: { en: '', gu: '' } }}
      />,
    )
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Name in Gujarati/i), 'પ્રિયા')
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('પ્રિયા')
  })

  it('preserves sibling values across rapid EN→GU and GU→EN typing (FB-D5.1.1)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderFullNameHarness({ bilingual, onChange }))

    const en = screen.getByLabelText(/Name in English/i)
    const gu = screen.getByLabelText(/Name in Gujarati/i)
    await user.type(en, 'Sameer')
    await user.type(gu, 'સમીર')
    expect(en).toHaveValue('Sameer')
    expect(gu).toHaveValue('સમીર')
    expect(onChange).toHaveBeenLastCalledWith({ en: 'Sameer', gu: 'સમીર' })
    for (const emitted of onChange.mock.calls.map((call) => call[0])) {
      if (emitted !== undefined) {
        expect(Object.keys(emitted as object).sort()).toEqual(['en', 'gu'])
      }
    }
  })

  it('preserves siblings when GU is typed first, then EN', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderFullNameHarness({ bilingual, onChange }))
    const en = screen.getByLabelText(/Name in English/i)
    const gu = screen.getByLabelText(/Name in Gujarati/i)
    await user.type(gu, 'સમીર')
    await user.type(en, 'Sameer')
    expect(en).toHaveValue('Sameer')
    expect(gu).toHaveValue('સમીર')
    expect(onChange).toHaveBeenLastCalledWith({ en: 'Sameer', gu: 'સમીર' })
  })

  it('alternating EN/GU edits preserve the latest sibling', async () => {
    const user = userEvent.setup()
    render(renderFullNameHarness({ bilingual, formData: { en: '', gu: '' } }))
    const en = screen.getByLabelText(/Name in English/i)
    const gu = screen.getByLabelText(/Name in Gujarati/i)
    await user.type(en, 'Ab')
    await user.type(gu, 'ક')
    await user.type(en, 'c')
    await user.type(gu, 'ખ')
    expect(en).toHaveValue('Abc')
    expect(gu).toHaveValue('કખ')
  })

  it('clearing one side preserves the other; clearing both emits undefined', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderFullNameHarness({
        bilingual,
        formData: { en: 'Sameer', gu: 'સમીર' },
        onChange,
      }),
    )
    const en = screen.getByLabelText(/Name in English/i)
    const gu = screen.getByLabelText(/Name in Gujarati/i)
    await user.clear(en)
    expect(en).toHaveValue('')
    expect(gu).toHaveValue('સમીર')
    expect(onChange).toHaveBeenLastCalledWith({ en: '', gu: 'સમીર' })
    await user.clear(gu)
    expect(en).toHaveValue('')
    expect(gu).toHaveValue('')
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('external controlled remount replaces snapshot state', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      renderFullNameHarness({ bilingual, formData: { en: 'Old', gu: 'જુનું' } }),
    )
    await user.type(screen.getByLabelText(/Name in English/i), 'x')
    expect(screen.getByLabelText(/Name in English/i)).toHaveValue('Oldx')
    unmount()
    render(renderFullNameHarness({ bilingual, formData: { en: 'External', gu: 'બહાર' } }))
    expect(screen.getByLabelText(/Name in English/i)).toHaveValue('External')
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('બહાર')
    await user.type(screen.getByLabelText(/Name in Gujarati/i), 'ા')
    expect(screen.getByLabelText(/Name in English/i)).toHaveValue('External')
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('બહારા')
  })

  it('pending transliteration cannot emit stale sibling data after either-language edit', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: NameTransliterationAdapter = {
      async transliterateEnglishToGujarati() {
        await gate
        return { gujaratiSuggested: 'સ્ટેલ' }
      },
    }
    const onChange = vi.fn()
    render(
      renderFullNameHarness({
        bilingual,
        formData: { en: 'Priya', gu: '' },
        services: { nameTransliteration: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Transliterate/i }))
    await user.type(screen.getByLabelText(/Name in Gujarati/i), 'મેન્યુઅલ')
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByLabelText(/Name in English/i)).toHaveValue('Priya')
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('મેન્યુઅલ')
    expect(screen.queryByText(/સ્ટેલ/)).not.toBeInTheDocument()
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(last).toEqual({ en: 'Priya', gu: 'મેન્યુઅલ' })
  })

  it('preserves siblings under StrictMode', async () => {
    const { StrictMode } = await import('react')
    const user = userEvent.setup()
    render(
      <StrictMode>{renderFullNameHarness({ bilingual, formData: { en: '', gu: '' } })}</StrictMode>,
    )
    await user.type(screen.getByLabelText(/Name in English/i), 'Sameer')
    await user.type(screen.getByLabelText(/Name in Gujarati/i), 'સમીર')
    expect(screen.getByLabelText(/Name in English/i)).toHaveValue('Sameer')
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('સમીર')
  })

  it('preserves siblings when host formData echoes lag behind local edits', async () => {
    const react = await import('react')
    const { WidgetRuntimeProvider } = await import('../src/runtime/widget-context.js')
    const { FullNameWidget } = await import('../src/widgets/FullNameWidget.js')
    const user = userEvent.setup()
    const emissions: unknown[] = []

    function LaggingHost(): react.ReactElement {
      const [formData, setFormData] = react.useState<unknown>(undefined)
      return (
        <div className="dg20-form-widgets">
          <WidgetRuntimeProvider locale="en" bilingual={bilingual}>
            <FullNameWidget
              name="applicant_full_name"
              formData={formData}
              required={false}
              disabled={false}
              readonly={false}
              autofocus={false}
              onChange={(next) => {
                emissions.push(next)
                setTimeout(() => setFormData(next), 25)
              }}
              onBlur={() => undefined}
              onFocus={() => undefined}
              schema={{
                type: 'object',
                title: 'Full name',
                properties: {
                  en: { type: 'string' },
                  gu: { type: 'string' },
                },
              }}
              uiSchema={{}}
              idSchema={{ $id: 'root_applicant_full_name' }}
              registry={
                {
                  widgets: {},
                  fields: {},
                  templates: {},
                  formContext: {},
                  rootSchema: { type: 'object', properties: {} },
                  schemaUtils: {} as never,
                  translateString: (s: string) => s,
                  globalFormOptions: {},
                } as never
              }
              formContext={{}}
            />
          </WidgetRuntimeProvider>
        </div>
      )
    }

    render(<LaggingHost />)
    await user.type(screen.getByLabelText(/Name in English/i), 'Sameer')
    await user.type(screen.getByLabelText(/Name in Gujarati/i), 'સમીર')
    expect(screen.getByLabelText(/Name in English/i)).toHaveValue('Sameer')
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('સમીર')
    expect(emissions.at(-1)).toEqual({ en: 'Sameer', gu: 'સમીર' })
    await new Promise((r) => setTimeout(r, 40))
    expect(screen.getByLabelText(/Name in English/i)).toHaveValue('Sameer')
    expect(screen.getByLabelText(/Name in Gujarati/i)).toHaveValue('સમીર')
  })
})

describe('DobWidget', () => {
  const clock: WidgetClock = { todayIso: () => '2026-07-20' }
  const schema = {
    type: 'object' as const,
    properties: {
      date_of_birth: {
        type: 'string' as const,
        format: 'date',
        title: 'DOB',
        'x-dg20': { minAge: 18, maxAge: 60 },
      },
    },
  }
  const uiSchema = { date_of_birth: { 'ui:widget': 'dob' } }

  it('emits YYYY-MM-DD string then undefined when cleared, never Date', () => {
    const onChange = vi.fn()
    render(
      renderDobHarness({
        bilingual,
        minAge: 18,
        maxAge: 60,
        services: { clock },
        onChange,
      }),
    )
    const input = screen.getByLabelText(/DOB/)
    fireEvent.change(input, { target: { value: '2000-07-20' } })
    expect(onChange).toHaveBeenLastCalledWith('2000-07-20')
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(typeof last).toBe('string')
    expect(last instanceof Date).toBe(false)
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    for (const emitted of onChange.mock.calls.map((call) => call[0])) {
      expect(emitted instanceof Date).toBe(false)
    }
  })

  it('emits ISO strings, shows age, and enforces boundaries with injected clock', () => {
    const { unmount } = render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        services={{ clock }}
        formData={{ date_of_birth: '2000-07-20' }}
      />,
    )
    expect(screen.getByLabelText(/DOB/)).toHaveValue('2000-07-20')
    expect(screen.getByText(/Age: 26 years/)).toBeInTheDocument()
    const dobInput = screen.getByLabelText(/DOB/)
    expect(dobInput).toHaveAttribute('max', '2008-07-20')
    expect(dobInput).toHaveAttribute('min', '1965-07-21')
    unmount()

    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        services={{ clock }}
        formData={{ date_of_birth: '2010-07-21' }}
      />,
    )
    expect(screen.getByText(/outside the allowed age range/i)).toBeInTheDocument()
  })

  it('handles birthday boundary, future DOB, and citizen-safe invalid configuration', () => {
    const { unmount } = render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        services={{ clock }}
        formData={{ date_of_birth: '2008-07-20' }}
      />,
    )
    expect(screen.getByText(/Age: 18 years/)).toBeInTheDocument()
    unmount()

    render(
      renderDobHarness({
        bilingual,
        minAge: 18,
        maxAge: 60,
        services: { clock },
        value: '2026-07-21',
      }),
    )
    expect(screen.getByText(/cannot be in the future/i)).toBeInTheDocument()
    expect(screen.queryByText(/Unit C/i)).not.toBeInTheDocument()
  })

  it('sets max to today when minAge absent and shows citizen-safe config error', () => {
    const { unmount } = render(
      renderDobHarness({
        bilingual,
        services: { clock },
        value: '2026-07-20',
      }),
    )
    expect(screen.getByLabelText(/DOB/)).toHaveAttribute('max', '2026-07-20')
    expect(screen.getByLabelText(/DOB/)).not.toHaveAttribute('min')
    unmount()

    render(
      <DemoForm
        schema={{
          type: 'object',
          properties: {
            date_of_birth: {
              type: 'string',
              format: 'date',
              title: 'DOB',
              'x-dg20': { minAge: 40, maxAge: 18 },
            },
          },
        }}
        uiSchema={uiSchema}
        bilingual={bilingual}
        services={{ clock }}
      />,
    )
    expect(
      screen.getByText(/temporarily unavailable because its configuration is invalid/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Unit C/i)).not.toBeInTheDocument()
  })
})

describe('GenderWidget', () => {
  const schema = {
    type: 'object' as const,
    required: ['gender'],
    properties: {
      gender: {
        type: 'string' as const,
        title: 'Gender',
        enum: ['X', 'Y'],
      },
    },
  }
  const uiSchema = { gender: { 'ui:widget': 'gender' } }

  it('emits F/M/OTHER codes not translated labels (harness)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderGenderHarness({ bilingual, locale: 'gu', onChange }))
    await user.click(screen.getByLabelText('સ્ત્રી'))
    expect(onChange).toHaveBeenLastCalledWith('F')
    await user.click(screen.getByLabelText('પુરુષ'))
    expect(onChange).toHaveBeenLastCalledWith('M')
    await user.click(screen.getByLabelText('અન્ય'))
    expect(onChange).toHaveBeenLastCalledWith('OTHER')
  })

  it('renders fixed three codes with localized labels and emits codes', async () => {
    const user = userEvent.setup()
    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        locale="gu"
        formData={{}}
      />,
    )
    expect(screen.getByLabelText('પુરુષ')).toBeInTheDocument()
    expect(screen.getByLabelText('સ્ત્રી')).toBeInTheDocument()
    expect(screen.getByLabelText('અન્ય')).toBeInTheDocument()
    expect(screen.queryByLabelText('X')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('સ્ત્રી'))
    expect(screen.getByLabelText('સ્ત્રી')).toBeChecked()
  })

  it('readonly keeps selected value and cannot emit a change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderGenderHarness({ bilingual, value: 'M', readonly: true, onChange }))
    expect(screen.getByLabelText('Male')).toBeChecked()
    await user.click(screen.getByLabelText('Female'))
    expect(screen.getByLabelText('Male')).toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports readonly and keyboard radio group', async () => {
    const user = userEvent.setup()
    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        readOnly
        formData={{ gender: 'M' }}
      />,
    )
    expect(screen.getByLabelText('Male')).toBeChecked()
    await user.click(screen.getByLabelText('Female'))
    expect(screen.getByLabelText('Male')).toBeChecked()
  })
})
