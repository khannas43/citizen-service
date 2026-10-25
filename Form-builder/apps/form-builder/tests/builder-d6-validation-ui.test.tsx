import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition, ValidationResult } from '@citizen/form-contract'

import { BuilderShell } from '../src/shell/BuilderShell.js'
import type { FormDefinitionValidationAdapter } from '../src/validation/index.js'

function createMockAdapter(
  impl: FormDefinitionValidationAdapter['validateDefinition'],
): FormDefinitionValidationAdapter {
  return { validateDefinition: impl }
}

function actionsRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-actions')
  if (!(el instanceof HTMLElement)) {
    throw new Error('actions root missing')
  }
  return el
}

describe('FB-D6 Builder UI — Form Definition validation', () => {
  it('does not call the adapter on mount and keeps Save/Submit disabled', () => {
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    expect(validateDefinition).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^submit draft$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeEnabled()
  })

  it('validates explicitly once under StrictMode and shows success', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    render(
      <StrictMode>
        <BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => {
      expect(screen.getByText(/definition is valid/i)).toBeInTheDocument()
    })
    expect(validateDefinition).toHaveBeenCalledTimes(1)
  })

  it('renders invalid issues in server order with counts and focuses the alert', async () => {
    const user = userEvent.setup()
    const result: ValidationResult = {
      valid: false,
      issues: [
        { code: 'first', message: 'First issue', severity: 'error', path: '/a' },
        { code: 'second', message: 'Second issue', severity: 'warning' },
        { code: 'third', message: 'Third issue', severity: 'info', path: '/c' },
      ],
    }
    const validateDefinition = vi.fn(async () => result)
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent(/1 error/)
    expect(summary).toHaveTextContent(/1 warning/)
    expect(summary).toHaveTextContent(/1 info/)
    const items = within(summary).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('first'),
      expect.stringContaining('second'),
      expect.stringContaining('third'),
    ])
    expect(items[0]).toHaveTextContent('/a')
    expect(items[0]).toHaveTextContent('First issue')
    await waitFor(() => {
      expect(document.activeElement).toBe(summary)
    })
  })

  it('shows generic failed alert with Retry and ignores raw exception text', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED secret-host:9999'))
      .mockResolvedValueOnce({ valid: true, issues: [] })
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not be completed/i)
    expect(alert).not.toHaveTextContent(/ECONNREFUSED|secret-host/i)
    await user.click(screen.getByRole('button', { name: /retry validation/i }))
    await waitFor(() => {
      expect(screen.getByText(/definition is valid/i)).toBeInTheDocument()
    })
    expect(validateDefinition).toHaveBeenCalledTimes(2)
  })

  it('blocks duplicate clicks while validating', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const validateDefinition = vi.fn(async () => {
      await gate
      return { valid: true, issues: [] }
    })
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    const button = screen.getByRole('button', { name: /^validate$/i })
    await user.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.click(button)
    expect(validateDefinition).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => {
      expect(screen.getByText(/definition is valid/i)).toBeInTheDocument()
    })
  })

  it('ignores stale success after definition change aborts in-flight work', async () => {
    const user = userEvent.setup()
    let release!: (result: ValidationResult) => void
    const gate = new Promise<ValidationResult>((resolve) => {
      release = resolve
    })
    const validateDefinition = vi.fn(async () => gate)
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    release({ valid: true, issues: [] })
    await waitFor(() => {
      expect(screen.queryByText(/definition is valid/i)).not.toBeInTheDocument()
    })
  })

  it('preserves settled validation across locale and preview edits without another call', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => {
      expect(screen.getByText(/definition is valid/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(screen.getByText(/વ્યાખ્યા માન્ય છે/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'EN' }))
    const previewInput = document.querySelector(
      '.dg20-builder-preview input, .dg20-builder-preview textarea',
    )
    if (previewInput instanceof HTMLElement) {
      await user.click(previewInput)
      if (previewInput instanceof HTMLInputElement || previewInput instanceof HTMLTextAreaElement) {
        await user.type(previewInput, 'x')
      }
    }
    expect(screen.getByText(/definition is valid/i)).toBeInTheDocument()
    expect(validateDefinition).toHaveBeenCalledTimes(1)
  })

  it('blocks Validate while a Property draft is dirty and restores after Cancel', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({ valid: true, issues: [] }))
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    await user.click(screen.getByRole('button', { name: 'Add Short text' }))
    await user.click(screen.getByRole('button', { name: /^short text/i }))
    await user.type(screen.getByLabelText('Label (English)'), ' Updated')
    expect(
      screen.getByText(/apply or cancel unsaved changes before validating/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeDisabled()
    expect(validateDefinition).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /cancel changes/i }))
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => {
      expect(validateDefinition).toHaveBeenCalledTimes(1)
    })
  })

  it('passes a detached committed definition snapshot to the adapter', async () => {
    const user = userEvent.setup()
    let seen: FormDefinition | null = null
    const validateDefinition = vi.fn(async ({ definition }) => {
      seen = definition
      ;(definition as { serviceId?: string }).serviceId = 'mutated'
      return { valid: true, issues: [] }
    })
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    const serviceMeta = document.querySelector('.dg20-builder-header')
    const before = serviceMeta?.textContent ?? ''
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await waitFor(() => {
      expect(validateDefinition).toHaveBeenCalledTimes(1)
    })
    expect(seen).not.toBeNull()
    expect(serviceMeta?.textContent).toBe(before)
    expect(seen!.serviceId).toBe('mutated')
  })

  it('is axe-clean in EN and GU with validation results', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => ({
      valid: false,
      issues: [{ code: 'demo', message: 'Demo issue', severity: 'error' as const }],
    }))
    const { container } = render(
      <BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />,
    )
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    await screen.findByRole('alert')
    expect(await axe(container)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'GU' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('keeps Validate/Retry on the 44px action target class with unique ids', async () => {
    const user = userEvent.setup()
    const validateDefinition = vi.fn(async () => {
      throw new Error('boom')
    })
    render(<BuilderShell validationAdapter={createMockAdapter(validateDefinition)} />)
    const validate = screen.getByRole('button', { name: /^validate$/i })
    expect(validate).toHaveClass('dg20-builder-action-btn')
    await user.click(validate)
    const retry = await screen.findByRole('button', { name: /retry validation/i })
    expect(retry).toHaveClass('dg20-builder-action-btn')
    const ids = Array.from(actionsRoot().querySelectorAll('[id]')).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
