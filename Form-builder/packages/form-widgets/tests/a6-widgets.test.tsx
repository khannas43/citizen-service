import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@citizen/form-contract'

import type { MasterDataAdapter, MasterDataOption } from '../src/runtime/service-ports.js'
import { resolveMasterListId, validateMasterDataOptions } from '../src/runtime/master-data.js'
import {
  renderDropdownMasterHarness,
  renderRadioMasterHarness,
  renderYesNoHarness,
} from './widget-harness.js'

const bilingual: BilingualContent = {
  labels: {
    category: { en: 'Category', gu: 'શ્રેણી' },
    preference: { en: 'Preference', gu: 'પસંદગી' },
    consent: { en: 'Consent', gu: 'સંમતિ' },
    applicant_category: { en: 'Applicant category', gu: 'અરજદાર શ્રેણી' },
  },
  help: {
    category: { en: 'Choose one', gu: 'એક પસંદ કરો' },
  },
  errors: {
    category: { en: 'Category is required', gu: 'શ્રેણી જરૂરી છે' },
    consent: { en: 'Consent is required', gu: 'સંમતિ જરૂરી છે' },
  },
}

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const DEFAULT_OPTIONS = [
  opt('A', 'Alpha', 'આલ્ફા'),
  opt('B', 'Beta', 'બીટા'),
  opt('C', 'Gamma', 'ગામા'),
]

function memoryAdapter(
  lists: Record<string, readonly MasterDataOption[]> = { LIST_CATEGORY: DEFAULT_OPTIONS },
): MasterDataAdapter & { readonly calls: { masterListId: string; fieldId: string }[] } {
  const calls: { masterListId: string; fieldId: string }[] = []
  return {
    calls,
    async listOptions({ fieldId, masterListId }) {
      calls.push({ fieldId, masterListId })
      return lists[masterListId] ?? []
    },
  }
}

describe('FB-A6 master-data helpers', () => {
  it('resolves nonblank masterListId and rejects blank', () => {
    expect(resolveMasterListId('  LIST_A  ')).toEqual({ ok: true, masterListId: 'LIST_A' })
    expect(resolveMasterListId('')).toEqual({ ok: false })
    expect(resolveMasterListId(undefined)).toEqual({ ok: false })
  })

  it('rejects blank labels and duplicate codes in master-data options', () => {
    expect(validateMasterDataOptions([{ code: 'A', labelEn: '', labelGu: 'અ' }]).ok).toBe(false)
    expect(validateMasterDataOptions([opt('A', 'One', 'એક'), opt('A', 'Two', 'બે')]).ok).toBe(false)
  })
})

describe('DropdownMasterWidget', () => {
  it('emits option codes only and empty selection as undefined', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = memoryAdapter()
    render(
      renderDropdownMasterHarness({
        bilingual,
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    })
    await user.selectOptions(screen.getByLabelText(/Category/i), 'B')
    expect(onChange).toHaveBeenCalledWith('B')
    expect(onChange.mock.calls.at(-1)?.[0]).not.toEqual(
      expect.objectContaining({ labelEn: 'Beta' }),
    )
    await user.selectOptions(screen.getByLabelText(/Category/i), '')
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('shows invalid configuration for missing masterListId', () => {
    render(
      renderDropdownMasterHarness({
        bilingual,
        masterListId: '',
        services: { masterData: memoryAdapter() },
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/configuration is invalid/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('recovers when adapter becomes available and ignores stale list results', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const stale: MasterDataAdapter = {
      async listOptions({ masterListId }) {
        if (masterListId === 'OLD') {
          await gate
          return [opt('OLD1', 'Stale', 'જૂનું')]
        }
        return DEFAULT_OPTIONS
      },
    }
    const { rerender } = render(
      renderDropdownMasterHarness({
        bilingual,
        masterListId: 'OLD',
        services: { masterData: stale },
        onChange,
      }),
    )
    expect(screen.getByText(/Loading options/i)).toBeInTheDocument()
    rerender(
      renderDropdownMasterHarness({
        bilingual,
        masterListId: 'LIST_CATEGORY',
        services: { masterData: stale },
        onChange,
      }),
    )
    release()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('option', { name: 'Stale' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Category/i), 'A')
    expect(onChange).toHaveBeenCalledWith('A')
  })

  it('recovers from missing adapter and does not refetch on locale change', async () => {
    const adapter = memoryAdapter()
    const { rerender } = render(renderDropdownMasterHarness({ bilingual }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()

    rerender(
      renderDropdownMasterHarness({
        bilingual,
        services: { masterData: adapter },
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    })
    const callsAfterLoad = adapter.calls.length
    rerender(
      renderDropdownMasterHarness({
        bilingual,
        locale: 'gu',
        services: { masterData: adapter },
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'આલ્ફા' })).toBeInTheDocument()
    })
    expect(adapter.calls.length).toBe(callsAfterLoad)
  })

  it('handles adapter failure, empty lists, and malformed options', async () => {
    const failing: MasterDataAdapter = {
      async listOptions() {
        throw new Error('boom')
      },
    }
    const { unmount } = render(
      renderDropdownMasterHarness({ bilingual, services: { masterData: failing } }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i)
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()

    render(
      renderDropdownMasterHarness({
        bilingual,
        services: {
          masterData: {
            async listOptions() {
              return []
            },
          },
        },
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/No options are available/i)
    })

    const { unmount: unmountDup } = render(
      renderDropdownMasterHarness({
        bilingual,
        services: {
          masterData: {
            async listOptions() {
              return [opt('A', 'One', 'એક'), opt('A', 'Two', 'બે')]
            },
          },
        },
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i)
    })
    unmountDup()
  })

  it('does not present unknown incoming codes as a valid selection', async () => {
    const onChange = vi.fn()
    render(
      renderDropdownMasterHarness({
        bilingual,
        value: 'ZZZ',
        services: { masterData: memoryAdapter() },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByText(/not in the current option list/i)).toBeInTheDocument()
    })
    expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports required and underscore field ids', async () => {
    const onChange = vi.fn()
    const adapter = memoryAdapter()
    render(
      renderDropdownMasterHarness({
        bilingual,
        name: 'applicant_category',
        services: { masterData: adapter },
        required: true,
        rawErrors: ['Category is required'],
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/Applicant category/i)).toBeRequired()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/Category is required/i)
    expect(adapter.calls[0]?.fieldId).toBe('applicant_category')
  })

  it('supports disabled and readonly', async () => {
    const onChange = vi.fn()
    const adapter = memoryAdapter()
    const { rerender } = render(
      renderDropdownMasterHarness({
        bilingual,
        services: { masterData: adapter },
        disabled: true,
        value: 'A',
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/Category/i)).toBeDisabled()
    })

    rerender(
      renderDropdownMasterHarness({
        bilingual,
        services: { masterData: adapter },
        readonly: true,
        value: 'A',
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/Category/i)).toBeDisabled()
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('RadioMasterWidget', () => {
  it('emits selected codes only', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderRadioMasterHarness({
        bilingual,
        services: {
          masterData: memoryAdapter({ LIST_PREF: DEFAULT_OPTIONS }),
        },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Beta' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('radio', { name: 'Beta' }))
    expect(onChange).toHaveBeenCalledWith('B')
  })

  it('does not present unknown incoming codes as checked', async () => {
    render(
      renderRadioMasterHarness({
        bilingual,
        value: 'MISSING',
        services: {
          masterData: memoryAdapter({ LIST_PREF: DEFAULT_OPTIONS }),
        },
      }),
    )
    await waitFor(() => {
      expect(screen.getByText(/not in the current option list/i)).toBeInTheDocument()
    })
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
  })
})

describe('YesNoWidget', () => {
  it('emits true, false, and leaves unanswered as undefined', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderYesNoHarness({ bilingual, onChange }))
    await user.click(screen.getByRole('radio', { name: /^Yes$/i }))
    expect(onChange).toHaveBeenCalledWith(true)
    await user.click(screen.getByRole('radio', { name: /^No$/i }))
    expect(onChange).toHaveBeenCalledWith(false)
    expect(typeof onChange.mock.calls[0]?.[0]).toBe('boolean')
  })

  it('does not present invalid incoming non-boolean values', () => {
    const onChange = vi.fn()
    render(renderYesNoHarness({ bilingual, value: 'YES', onChange }))
    expect(screen.getByText(/not a valid Yes\/No choice/i)).toBeInTheDocument()
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports required disabled and readonly', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      renderYesNoHarness({
        bilingual,
        required: true,
        rawErrors: ['Consent is required'],
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Consent is required/i)

    rerender(renderYesNoHarness({ bilingual, disabled: true, value: true, onChange }))
    expect(screen.getByRole('radio', { name: /^Yes$/i })).toBeDisabled()

    rerender(renderYesNoHarness({ bilingual, readonly: true, value: false, onChange }))
    expect(screen.getByRole('radio', { name: /^No$/i })).toBeDisabled()
  })
})

describe('FB-A6.1 validation and accessibility', () => {
  it('treats numeric boolean and object incoming values as malformed for dropdown and radio', async () => {
    const onChange = vi.fn()
    for (const value of [42, true, { code: 'A' }] as const) {
      const { unmount } = render(
        renderDropdownMasterHarness({
          bilingual,
          value,
          services: { masterData: memoryAdapter() },
          onChange,
        }),
      )
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/not in the current option list/i)
      })
      expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('')
      unmount()
    }

    for (const value of [0, false, ['A']] as const) {
      const { unmount } = render(
        renderRadioMasterHarness({
          bilingual,
          value,
          services: { masterData: memoryAdapter({ LIST_PREF: DEFAULT_OPTIONS }) },
          onChange,
        }),
      )
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/not in the current option list/i)
      })
      for (const radio of screen.getAllByRole('radio')) {
        expect(radio).not.toBeChecked()
      }
      unmount()
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses ordinal-safe radio DOM IDs for codes with spaces and Unicode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const specialCode = 'A B/ગુજરાત'
    render(
      renderRadioMasterHarness({
        bilingual,
        name: 'preference',
        services: {
          masterData: {
            async listOptions() {
              return [opt(specialCode, 'Gujarat special', 'ગુજરાત વિશેષ'), opt('B', 'Beta', 'બીટા')]
            },
          },
        },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Gujarat special' })).toBeInTheDocument()
    })
    const radio = screen.getByRole('radio', { name: 'Gujarat special' })
    expect(radio.id).toBe('root_preference__option_0')
    expect(radio.id).not.toContain(specialCode)
    expect(radio.id).not.toContain('/')
    const ids = screen.getAllByRole('radio').map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    await user.click(radio)
    expect(onChange).toHaveBeenCalledWith(specialCode)
  })

  it('retries after failure through the shared loader without emitting onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let attempt = 0
    const adapter: MasterDataAdapter = {
      async listOptions() {
        attempt += 1
        if (attempt === 1) {
          throw new Error('transient')
        }
        return DEFAULT_OPTIONS
      },
    }
    render(
      renderDropdownMasterHarness({
        bilingual,
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i)
    })
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(attempt).toBe(2)
  })

  it('ignores stale rejection after masterListId change while keeping new ready options', async () => {
    const onChange = vi.fn()
    let rejectOld!: (error: Error) => void
    const oldGate = new Promise<readonly MasterDataOption[]>((_, reject) => {
      rejectOld = reject
    })
    const adapter: MasterDataAdapter = {
      async listOptions({ masterListId }) {
        if (masterListId === 'OLD') {
          return oldGate
        }
        return DEFAULT_OPTIONS
      },
    }
    const { rerender } = render(
      renderDropdownMasterHarness({
        bilingual,
        masterListId: 'OLD',
        services: { masterData: adapter },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/Loading options/i)
    rerender(
      renderDropdownMasterHarness({
        bilingual,
        masterListId: 'LIST_CATEGORY',
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    })
    rejectOld(new Error('stale failure'))
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
