/** @vitest-environment jsdom */
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import type { AccessTokenProvider } from '../src/auth/index.js'
import type { FormDefinitionValidationAdapter } from '../src/validation/index.js'

describe('FB-E5.4.2A BuilderShell accessTokenProvider', () => {
  it('rebuilds default adapters when provider identity changes and leaves injected adapters alone', async () => {
    const validate = vi.fn(async () => ({ valid: true, issues: [] }))
    const injected: FormDefinitionValidationAdapter = {
      validateDefinition: validate,
    }

    let provider: AccessTokenProvider = () => 'e542a-shell-token-1'
    const { rerender } = render(
      <StrictMode>
        <BuilderShell accessTokenProvider={provider} validationAdapter={injected} />
      </StrictMode>,
    )

    provider = () => 'e542a-shell-token-2'
    await act(async () => {
      rerender(
        <StrictMode>
          <BuilderShell accessTokenProvider={provider} validationAdapter={injected} />
        </StrictMode>,
      )
    })

    expect(validate).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(document.body.textContent ?? '').not.toContain('e542a-shell-token')
    })
  })

  it('keeps authoring available without a token provider', () => {
    const { container } = render(
      <StrictMode>
        <BuilderShell />
      </StrictMode>,
    )
    expect(container.textContent ?? '').toMatch(/Form Builder|Bindings|Preview/i)
    expect(container.textContent ?? '').not.toContain('Bearer')
  })
})
