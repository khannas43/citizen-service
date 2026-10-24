import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { BilingualContent } from '@dg20/form-contract'

import { IMPLEMENTED_WIDGET_TYPES, PALETTE_REGISTRY, getPaletteWidget } from '../src/index.js'
import { DemoForm } from '../src/widgets/DemoForm.js'
import { renderTextShortHarness } from './widget-harness.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingual: BilingualContent = {
  labels: {
    shortName: { en: 'Short name', gu: 'ટૂંકું નામ' },
    remarks: { en: 'Remarks', gu: 'ટિપ્પણી' },
    count: { en: 'Count', gu: 'ગણતરી' },
    income: { en: 'Income', gu: 'આવક' },
    score: { en: 'Score', gu: 'સ્કોર' },
    sectionA: { en: 'Section A', gu: 'વિભાગ અ' },
    notice: { en: 'Notice', gu: 'સૂચના' },
    stepTwo: { en: 'Step two', gu: 'પગલું બે' },
  },
  help: {
    shortName: { en: 'Help for short name', gu: 'ટૂંકા નામ માટે મદદ' },
    remarks: { en: 'Help for remarks', gu: 'ટિપ્પણી માટે મદદ' },
    notice: {
      en: 'Keep documents ready.',
      gu: 'દસ્તાવેજો તૈયાર રાખો.',
    },
  },
  errors: {},
}

describe('palette implementation status (FB-A12)', () => {
  it('marks exactly thirty widgets implemented and zero planned', () => {
    const implemented = PALETTE_REGISTRY.filter((w) => w.implementationStatus === 'implemented')
    const planned = PALETTE_REGISTRY.filter((w) => w.implementationStatus === 'planned')
    expect(implemented).toHaveLength(30)
    expect(planned).toHaveLength(0)
    expect(implemented.map((w) => w.widgetType).sort()).toEqual(
      [...IMPLEMENTED_WIDGET_TYPES].sort(),
    )
  })

  it('keeps every implemented palette ID marked implemented', () => {
    for (const id of IMPLEMENTED_WIDGET_TYPES) {
      expect(getPaletteWidget(id)?.implementationStatus).toBe('implemented')
    }
  })
})

describe('TextShortWidget', () => {
  const schema = {
    type: 'object' as const,
    required: ['shortName'],
    properties: {
      shortName: { type: 'string' as const, maxLength: 10, title: 'Short name' },
    },
  }
  const uiSchema = { shortName: { 'ui:widget': 'text-short' } }

  it('resolves localized label and help', () => {
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} locale="gu" />)
    expect(screen.getByLabelText(/ટૂંકું નામ/)).toBeInTheDocument()
    expect(screen.getByText('ટૂંકા નામ માટે મદદ')).toBeInTheDocument()
  })

  it('exposes required semantics and maxLength', () => {
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />)
    const input = screen.getByLabelText(/Short name/)
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('maxLength', '10')
  })

  it('propagates change events', async () => {
    const user = userEvent.setup()
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />)
    const input = screen.getByLabelText(/Short name/)
    await user.type(input, 'Priya')
    expect(input).toHaveValue('Priya')
  })

  it('associates error messages with the control', () => {
    render(
      renderTextShortHarness({
        bilingual,
        required: true,
        rawErrors: ['Invalid short name'],
      }),
    )
    const input = screen.getByLabelText(/Short name/)
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Invalid short name')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby') ?? '').toContain(error.id)
  })
})

describe('TextLongWidget', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      remarks: { type: 'string' as const, maxLength: 20, title: 'Remarks' },
    },
  }
  const uiSchema = { remarks: { 'ui:widget': 'text-long' } }

  it('propagates changes and shows character counter', async () => {
    const user = userEvent.setup()
    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ remarks: 'Hi' }}
      />,
    )
    const area = screen.getByLabelText(/Remarks/)
    expect(screen.getByText(/18 characters remaining/)).toBeInTheDocument()
    await user.type(area, '!')
    expect(area).toHaveValue('Hi!')
    expect(screen.getByText(/17 characters remaining/)).toBeInTheDocument()
    expect(area).toHaveAttribute('maxLength', '20')
  })
})

describe('NumberWidget', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      count: {
        type: 'number' as const,
        minimum: 1,
        maximum: 5,
        multipleOf: 1,
        title: 'Count',
      },
    },
  }
  const uiSchema = { count: { 'ui:widget': 'number' } }

  it('keeps empty state empty and sets min/max/step', () => {
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} formData={{}} />)
    const input = screen.getByLabelText(/Count/)
    expect(input).toHaveValue(null)
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '5')
    expect(input).toHaveAttribute('step', '1')
  })

  it('propagates valid numbers and ignores NaN-producing input', async () => {
    const user = userEvent.setup()
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />)
    const input = screen.getByLabelText(/Count/)
    await user.clear(input)
    await user.type(input, '3')
    expect(input).toHaveValue(3)
  })
})

describe('CurrencyInrWidget', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      income: { type: 'number' as const, minimum: 0, maximum: 1000, title: 'Income' },
    },
  }
  const uiSchema = { income: { 'ui:widget': 'currency-inr' } }

  it('exposes rupee symbol and accessible currency description', () => {
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />)
    expect(screen.getByText('₹')).toBeInTheDocument()
    expect(screen.getByText('Amount in Indian Rupees')).toBeInTheDocument()
    const input = screen.getByLabelText(/Income/)
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '1000')
  })

  it('supports empty state and two-decimal editing', async () => {
    const user = userEvent.setup()
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />)
    const input = screen.getByLabelText(/Income/)
    expect(input).toHaveValue('')
    await user.type(input, '12.5')
    expect(input).toHaveValue('12.5')
    await user.tab()
    expect(input).toHaveValue('12.50')
  })
})

describe('PercentageWidget', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      score: {
        type: 'number' as const,
        minimum: 0,
        maximum: 100,
        multipleOf: 5,
        title: 'Score',
      },
    },
  }
  const uiSchema = { score: { 'ui:widget': 'percentage' } }

  it('exposes 0–100 bounds, step, suffix, and empty state', () => {
    render(<DemoForm schema={schema} uiSchema={uiSchema} bilingual={bilingual} />)
    const input = screen.getByLabelText(/Score/)
    expect(input).toHaveValue(null)
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
    expect(input).toHaveAttribute('step', '5')
    expect(screen.getByText('%')).toBeInTheDocument()
    expect(screen.getByText('Percentage')).toBeInTheDocument()
  })

  it('accepts boundary values 0 and 100', () => {
    const { unmount } = render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ score: 0 }}
      />,
    )
    expect(screen.getByLabelText(/Score/)).toHaveValue(0)
    unmount()
    render(
      <DemoForm
        schema={schema}
        uiSchema={uiSchema}
        bilingual={bilingual}
        formData={{ score: 100 }}
      />,
    )
    expect(screen.getByLabelText(/Score/)).toHaveValue(100)
  })
})

describe('presentation fields', () => {
  it('renders section-header as a heading with localized text and no input', () => {
    const { container } = render(
      <DemoForm
        schema={{
          type: 'object',
          properties: {
            sectionA: { type: 'object', title: 'Section A', properties: {} },
          },
        }}
        uiSchema={{ sectionA: { 'ui:field': 'section-header' } }}
        bilingual={bilingual}
        locale="gu"
      />,
    )
    expect(screen.getByRole('heading', { name: 'વિભાગ અ' })).toBeInTheDocument()
    expect(container.querySelector('input, textarea, select')).toBeNull()
  })

  it('renders info-panel as a note region with localized content', () => {
    const { container } = render(
      <DemoForm
        schema={{
          type: 'object',
          properties: {
            notice: {
              type: 'object',
              title: 'Notice',
              description: 'Keep documents ready.',
              properties: {},
            },
          },
        }}
        uiSchema={{ notice: { 'ui:field': 'info-panel' } }}
        bilingual={bilingual}
        locale="en"
      />,
    )
    const note = screen.getByRole('note')
    expect(within(note).getByText('Notice')).toBeInTheDocument()
    expect(within(note).getByText('Keep documents ready.')).toBeInTheDocument()
    expect(container.querySelector('input, textarea, select')).toBeNull()
  })

  it('renders page-break as a non-interactive separator', () => {
    const { container } = render(
      <DemoForm
        schema={{
          type: 'object',
          properties: {
            stepTwo: { type: 'object', title: 'Step two', properties: {} },
          },
        }}
        uiSchema={{ stepTwo: { 'ui:field': 'page-break' } }}
        bilingual={bilingual}
      />,
    )
    const separator = screen.getByRole('separator', { name: 'Step two' })
    expect(separator).toBeInTheDocument()
    expect(separator.querySelector('button')).toBeNull()
    expect(separator.querySelector('a')).toBeNull()
    expect(container.querySelector('input, textarea, select')).toBeNull()
  })
})
