import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import type { CafPrefillAdapter, WidgetServicePorts } from '@citizen/form-widgets'

import { admitFormDefinition } from '../src/definition-admission.js'
import { FormRenderer } from '../src/FormRenderer.js'
import {
  getDg20FormValidator,
  resetDg20FormValidatorForTests,
  tryCompileFormSchema,
} from '../src/validator-2020.js'
import { createSamplePublishedDefinition } from './fixtures.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

function sharedIdSchemas(versionRules: {
  readonly minLength: number
  readonly title: string
}): object {
  return {
    $id: 'https://dg20.example/forms/shared-income.schema.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: versionRules.title,
    properties: {
      code: { type: 'string', minLength: versionRules.minLength },
    },
    required: ['code'],
    additionalProperties: false,
  }
}

describe('FB-B0.1 schema-scoped validators', () => {
  beforeEach(() => {
    resetDg20FormValidatorForTests()
  })

  it('returns the same validator for the same schema object', () => {
    const schema = sharedIdSchemas({ minLength: 1, title: 'v1' })
    expect(getDg20FormValidator(schema)).toBe(getDg20FormValidator(schema))
  })

  it('returns different validators for different schema objects', () => {
    const a = sharedIdSchemas({ minLength: 1, title: 'a' })
    const b = sharedIdSchemas({ minLength: 1, title: 'b' })
    expect(getDg20FormValidator(a)).not.toBe(getDg20FormValidator(b))
  })

  it('validates two incompatible schemas with the same $id independently', () => {
    const shortOk = sharedIdSchemas({ minLength: 1, title: 'short' })
    const longRequired = sharedIdSchemas({ minLength: 5, title: 'long' })

    const shortValidator = getDg20FormValidator(shortOk)
    const longValidator = getDg20FormValidator(longRequired)

    const shortResult = shortValidator.rawValidation(shortOk, { code: 'ab' })
    expect(shortResult.validationError).toBeUndefined()
    expect(shortResult.errors ?? []).toHaveLength(0)

    const longResult = longValidator.rawValidation(longRequired, { code: 'ab' })
    expect(longResult.validationError).toBeUndefined()
    expect((longResult.errors ?? []).length).toBeGreaterThan(0)

    // Short schema still accepts short values after the long schema compiled.
    const shortAgain = shortValidator.rawValidation(shortOk, { code: 'xy' })
    expect(shortAgain.errors ?? []).toHaveLength(0)
  })

  it('sequential admission of same-$id form versions does not reuse stale rules', () => {
    const v1Schema = sharedIdSchemas({ minLength: 1, title: 'version-1' })
    const v2Schema = sharedIdSchemas({ minLength: 8, title: 'version-2' })

    const v1 = createSamplePublishedDefinition({
      version: 1,
      jsonSchema: v1Schema as never,
    })
    const v2 = createSamplePublishedDefinition({
      version: 2,
      jsonSchema: v2Schema as never,
    })

    expect(admitFormDefinition(v1, { mode: 'citizen' }).ok).toBe(true)
    expect(admitFormDefinition(v2, { mode: 'citizen' }).ok).toBe(true)

    const v1Check = getDg20FormValidator(v1Schema).rawValidation(v1Schema, { code: 'short' })
    expect(v1Check.errors ?? []).toHaveLength(0)

    const v2Check = getDg20FormValidator(v2Schema).rawValidation(v2Schema, { code: 'short' })
    expect((v2Check.errors ?? []).length).toBeGreaterThan(0)

    expect(tryCompileFormSchema(v1Schema).ok).toBe(true)
    expect(tryCompileFormSchema(v2Schema).ok).toBe(true)
  })

  it('unrelated Renderer rerender reuses its schema-scoped validator', () => {
    const definition = createSamplePublishedDefinition()
    const schema = definition.jsonSchema
    const before = getDg20FormValidator(schema)

    const { rerender } = render(
      <FormRenderer definition={definition} defaultLocale="en" formData={{}} />,
    )
    expect(getDg20FormValidator(schema)).toBe(before)

    rerender(<FormRenderer definition={definition} defaultLocale="gu" formData={{}} />)
    expect(getDg20FormValidator(schema)).toBe(before)
  })
})

describe('FB-B0.1 instance ID isolation', () => {
  it('two mounted Renderers have globally unique DOM IDs', () => {
    render(
      <>
        <FormRenderer definition={createSamplePublishedDefinition()} formData={{}} />
        <FormRenderer
          definition={createSamplePublishedDefinition({ serviceId: 'other-service' })}
          formData={{}}
        />
      </>,
    )

    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id).filter(Boolean)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)

    const roots = [...document.querySelectorAll('[data-dg20-renderer]')]
    expect(roots).toHaveLength(2)
    expect(roots[0]?.id).not.toBe(roots[1]?.id)
  })

  it('each instance’s IDs remain stable after locale switch', async () => {
    const user = userEvent.setup()
    render(<FormRenderer definition={createSamplePublishedDefinition()} defaultLocale="en" />)

    const before = [...document.querySelectorAll('[id]')].map((el) => el.id).sort()
    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    const after = [...document.querySelectorAll('[id]')].map((el) => el.id).sort()
    expect(after).toEqual(before)
  })
})

describe('FB-B0.1 service/version form-data isolation', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('uncontrolled service/version switch clears old data before new widgets observe it', async () => {
    const user = userEvent.setup()
    const v1 = createSamplePublishedDefinition({ serviceId: 'svc-a', version: 1 })
    const v2 = createSamplePublishedDefinition({
      serviceId: 'svc-a',
      version: 2,
      meta: {
        ...createSamplePublishedDefinition().meta,
        bilingual: {
          ...createSamplePublishedDefinition().meta.bilingual,
          labels: {
            ...createSamplePublishedDefinition().meta.bilingual.labels,
            section_identity: { en: 'Version two section', gu: 'સંસ્કરણ બે વિભાગ' },
          },
        },
      },
    })

    function Harness(): ReactElement {
      const [definition, setDefinition] = useState(v1)
      return (
        <div>
          <button type="button" onClick={() => setDefinition(v2)}>
            Switch version
          </button>
          <FormRenderer definition={definition} defaultLocale="en" />
        </div>
      )
    }

    render(<Harness />)
    const nameInput = screen.getByRole('textbox', { name: /Applicant name/i })
    await user.type(nameInput, 'Legacy Citizen')
    expect(nameInput).toHaveValue('Legacy Citizen')

    await user.click(screen.getByRole('button', { name: 'Switch version' }))

    // Immediate assertion — keyed remount must not paint old data under v2.
    expect(screen.getByText('Version two section')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Applicant name/i })).toHaveValue('')
    expect(screen.queryByDisplayValue('Legacy Citizen')).toBeNull()
  })

  it('old async widget completion cannot affect the new definition', async () => {
    let resolvePrefill!: (value: { value: string; confidence: number }) => void
    const pending = new Promise<{ value: string; confidence: number }>((resolve) => {
      resolvePrefill = resolve
    })
    const resolvePrefillFn = vi.fn(() => pending)
    const cafPrefill: CafPrefillAdapter = { resolvePrefill: resolvePrefillFn }
    const services: WidgetServicePorts = { cafPrefill }

    const v1 = createSamplePublishedDefinition({ serviceId: 'async-svc', version: 1 })
    const v2 = createSamplePublishedDefinition({
      serviceId: 'async-svc',
      version: 2,
      meta: {
        ...createSamplePublishedDefinition().meta,
        prefillBindings: [
          {
            fieldId: 'caf_father_name',
            cafAttribute: 'fatherNameV2',
            confidenceMin: 0.8,
          },
        ],
      },
    })

    const onChange = vi.fn()

    function Harness(): ReactElement {
      const [definition, setDefinition] = useState(v1)
      return (
        <div>
          <button type="button" onClick={() => setDefinition(v2)}>
            Switch async version
          </button>
          <FormRenderer
            definition={definition}
            services={services}
            onChange={onChange}
            defaultLocale="en"
          />
        </div>
      )
    }

    render(<Harness />)
    await waitFor(() => expect(resolvePrefillFn).toHaveBeenCalled())
    onChange.mockClear()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Switch async version' }))

    // Complete the OLD request after remount.
    resolvePrefill({ value: 'STALE_FATHER', confidence: 0.99 })
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByDisplayValue('STALE_FATHER')).toBeNull()
    const staleWrites = onChange.mock.calls.filter((call) => {
      const data = call[0]?.formData as { caf_father_name?: { value?: string } } | undefined
      return data?.caf_father_name?.value === 'STALE_FATHER'
    })
    expect(staleWrites).toHaveLength(0)
  })

  it('controlled definition switch shows only the host-provided data', async () => {
    const v1 = createSamplePublishedDefinition({ serviceId: 'ctl', version: 1 })
    const v2 = createSamplePublishedDefinition({ serviceId: 'ctl', version: 2 })

    function Harness(): ReactElement {
      const [definition, setDefinition] = useState(v1)
      const formData =
        definition.version === 1
          ? { applicant_name: 'Host V1', agree_terms: true }
          : { applicant_name: 'Host V2 Only', agree_terms: true }
      return (
        <div>
          <button type="button" onClick={() => setDefinition(v2)}>
            Switch controlled
          </button>
          <FormRenderer definition={definition} formData={formData} />
        </div>
      )
    }

    render(<Harness />)
    expect(screen.getByRole('textbox', { name: /Applicant name/i })).toHaveValue('Host V1')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Switch controlled' }))
    expect(screen.getByRole('textbox', { name: /Applicant name/i })).toHaveValue('Host V2 Only')
    expect(screen.queryByDisplayValue('Host V1')).toBeNull()
  })

  it('identity switch does not call onChange or onSubmit', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const v1 = createSamplePublishedDefinition({ serviceId: 'quiet', version: 1 })
    const v2 = createSamplePublishedDefinition({ serviceId: 'quiet', version: 2 })

    function Harness(): ReactElement {
      const [definition, setDefinition] = useState(v1)
      return (
        <div>
          <button type="button" onClick={() => setDefinition(v2)}>
            Quiet switch
          </button>
          <FormRenderer
            definition={definition}
            formData={{ applicant_name: 'Steady', agree_terms: true }}
            onChange={onChange}
            onSubmit={onSubmit}
          />
        </div>
      )
    }

    render(<Harness />)
    onChange.mockClear()
    onSubmit.mockClear()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Quiet switch' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('locale persists across identity switch', async () => {
    const user = userEvent.setup()
    const v1 = createSamplePublishedDefinition({ serviceId: 'locale-keep', version: 1 })
    const v2 = createSamplePublishedDefinition({
      serviceId: 'locale-keep',
      version: 2,
      meta: {
        ...createSamplePublishedDefinition().meta,
        bilingual: {
          ...createSamplePublishedDefinition().meta.bilingual,
          labels: {
            ...createSamplePublishedDefinition().meta.bilingual.labels,
            section_identity: { en: 'Second EN', gu: 'બીજું ગુજ' },
          },
        },
      },
    })

    function Harness(): ReactElement {
      const [definition, setDefinition] = useState(v1)
      return (
        <div>
          <button type="button" onClick={() => setDefinition(v2)}>
            Keep locale switch
          </button>
          <FormRenderer definition={definition} defaultLocale="en" />
        </div>
      )
    }

    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Gujarati' }))
    expect(screen.getByRole('button', { name: 'ગુજરાતી' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Keep locale switch' }))
    expect(screen.getByRole('button', { name: 'ગુજરાતી' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('બીજું ગુજ')).toBeInTheDocument()
  })
})

describe('FB-B0.1 preview banner accuracy', () => {
  it('published definition in preview mode gets accurate neutral preview copy', () => {
    render(
      <FormRenderer
        definition={createSamplePublishedDefinition({ status: 'published' })}
        mode="preview"
      />,
    )
    const banner = document.querySelector('.dg20-renderer-preview-banner')
    expect(banner).toHaveTextContent(
      /Preview mode — changes and submissions here are not sent to production/i,
    )
    expect(banner).not.toHaveTextContent(/not in production for citizens/i)
  })
})
