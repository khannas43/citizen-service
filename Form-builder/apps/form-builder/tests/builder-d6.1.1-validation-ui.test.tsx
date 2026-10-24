import { useEffect, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { FormDefinition, ValidationResult } from '@dg20/form-contract'

import {
  createAuthoringSession,
  createAuthoringUiState,
  type AuthoringUiState,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  useDefinitionValidation,
  type FormDefinitionValidationAdapter,
} from '../src/validation/index.js'

function createMockAdapter(
  impl: FormDefinitionValidationAdapter['validateDefinition'],
): FormDefinitionValidationAdapter {
  return { validateDefinition: impl }
}

function reorderObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => reorderObjectKeysDeep(item))
  }
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      return value
    }
    const keys = Object.keys(value as object).reverse()
    const out: Record<string, unknown> = {}
    for (const key of keys) {
      out[key] = reorderObjectKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function ValidationHarness(props: {
  readonly definition: FormDefinition
  readonly uiState: AuthoringUiState
  readonly adapter: FormDefinitionValidationAdapter | null
}) {
  const { view, validate } = useDefinitionValidation(props)
  useEffect(() => undefined, [view.phase, view.result])
  return (
    <div>
      <button type="button" onClick={validate}>
        Run validate
      </button>
      <span data-testid="phase">{view.phase}</span>
      <span data-testid="has-result">{String(view.result !== null)}</span>
    </div>
  )
}

describe('FB-D6.1.1 — reordered-equal definition lifecycle', () => {
  it('keeps settled validation across reordered-but-equal replacement', async () => {
    const user = userEvent.setup()
    const adapter = createMockAdapter(async () => ({ valid: true, issues: [] }))
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition

    function Host() {
      const [definition, setDefinition] = useState(base)
      const [ui] = useState(() => createAuthoringUiState(createAuthoringSession(base)))
      return (
        <div>
          <button
            type="button"
            onClick={() => setDefinition(reorderObjectKeysDeep(definition) as FormDefinition)}
          >
            Reorder equal
          </button>
          <ValidationHarness definition={definition} uiState={ui} adapter={adapter} />
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /run validate/i }))
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('valid')
    })
    await user.click(screen.getByRole('button', { name: /reorder equal/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('valid')
    expect(screen.getByTestId('has-result')).toHaveTextContent('true')
  })

  it('does not abort in-flight validation for reordered-but-equal replacement', async () => {
    const user = userEvent.setup()
    let release!: (result: ValidationResult) => void
    const gate = new Promise<ValidationResult>((resolve) => {
      release = resolve
    })
    const adapter = createMockAdapter(async () => gate)
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition

    function Host() {
      const [definition, setDefinition] = useState(base)
      const [ui] = useState(() => createAuthoringUiState(createAuthoringSession(base)))
      return (
        <div>
          <button
            type="button"
            onClick={() => setDefinition(reorderObjectKeysDeep(definition) as FormDefinition)}
          >
            Reorder equal
          </button>
          <ValidationHarness definition={definition} uiState={ui} adapter={adapter} />
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /run validate/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('validating')
    await user.click(screen.getByRole('button', { name: /reorder equal/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('validating')
    release({ valid: true, issues: [] })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('valid')
      expect(screen.getByTestId('has-result')).toHaveTextContent('true')
    })
  })

  it('aborts and clears on genuine semantic change', async () => {
    const user = userEvent.setup()
    let release!: (result: ValidationResult) => void
    const gate = new Promise<ValidationResult>((resolve) => {
      release = resolve
    })
    const adapter = createMockAdapter(async () => gate)
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition

    function Host() {
      const [definition, setDefinition] = useState(base)
      const [ui] = useState(() => createAuthoringUiState(createAuthoringSession(base)))
      return (
        <div>
          <button
            type="button"
            onClick={() => setDefinition({ ...definition, serviceId: 'genuinely-changed' })}
          >
            Change definition
          </button>
          <ValidationHarness definition={definition} uiState={ui} adapter={adapter} />
        </div>
      )
    }

    render(<Host />)
    await user.click(screen.getByRole('button', { name: /run validate/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('validating')
    await user.click(screen.getByRole('button', { name: /change definition/i }))
    expect(screen.getByTestId('phase')).toHaveTextContent('idle')
    expect(screen.getByTestId('has-result')).toHaveTextContent('false')
    release({ valid: true, issues: [] })
    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('idle')
      expect(screen.getByTestId('has-result')).toHaveTextContent('false')
    })
  })
})
