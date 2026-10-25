import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@citizen/form-contract'

import type {
  MasterDataAdapter,
  MasterDataOption,
  MasterDataRequest,
} from '../src/runtime/service-ports.js'
import { renderCascadingDropdownHarness, renderMultiselectHarness } from './widget-harness.js'

const bilingual: BilingualContent = {
  labels: {
    benefits: { en: 'Benefits', gu: 'લાભ' },
    cascade_location: { en: 'Location', gu: 'સ્થાન' },
    applicant_benefits: { en: 'Applicant benefits', gu: 'અરજદાર લાભ' },
  },
  help: {},
  errors: {
    benefits: { en: 'Benefits are required', gu: 'લાભ જરૂરી છે' },
  },
}

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const BENEFIT_OPTIONS = [
  opt('FOOD', 'Food', 'ખોરાક'),
  opt('SHELTER', 'Shelter', 'આશ્રય'),
  opt('HEALTH', 'Health', 'આરોગ્ય'),
]

const PARENT_OPTIONS = [opt('GJ', 'Gujarat', 'ગુજરાત'), opt('MH', 'Maharashtra', 'મહારાષ્ટ્ર')]
const CHILD_BY_PARENT: Record<string, readonly MasterDataOption[]> = {
  GJ: [opt('AHM', 'Ahmedabad', 'અમદાવાદ'), opt('SRT', 'Surat', 'સુરત')],
  MH: [opt('MUM', 'Mumbai', 'મુંબઈ')],
}

function multiselectAdapter(
  options: readonly MasterDataOption[] = BENEFIT_OPTIONS,
): MasterDataAdapter & { readonly calls: MasterDataRequest[] } {
  const calls: MasterDataRequest[] = []
  return {
    calls,
    async listOptions(request) {
      calls.push(request)
      return options
    },
  }
}

function cascadingAdapter(): MasterDataAdapter & { readonly calls: MasterDataRequest[] } {
  const calls: MasterDataRequest[] = []
  return {
    calls,
    async listOptions(request) {
      calls.push(request)
      if (request.masterListId === 'LIST_PARENT') {
        expect(request.parentCode).toBeUndefined()
        return PARENT_OPTIONS
      }
      if (request.masterListId === 'LIST_CHILD') {
        return CHILD_BY_PARENT[request.parentCode ?? ''] ?? []
      }
      return []
    },
  }
}

describe('MultiselectWidget', () => {
  it('emits code arrays in adapter order and undefined when emptied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = multiselectAdapter()
    render(
      renderMultiselectHarness({
        bilingual,
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Food' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('checkbox', { name: 'Health' }))
    await user.click(screen.getByRole('checkbox', { name: 'Food' }))
    expect(onChange).toHaveBeenLastCalledWith(['FOOD', 'HEALTH'])
    await user.click(screen.getByRole('checkbox', { name: 'Health' }))
    await user.click(screen.getByRole('checkbox', { name: 'Food' }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('enforces minItems/maxItems and invalid min > max config', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = multiselectAdapter()
    const { unmount } = render(
      renderMultiselectHarness({
        bilingual,
        services: { masterData: adapter },
        minItems: 2,
        maxItems: 2,
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Food' })).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 2/i)
    await user.click(screen.getByRole('checkbox', { name: 'Food' }))
    await user.click(screen.getByRole('checkbox', { name: 'Shelter' }))
    expect(onChange).toHaveBeenLastCalledWith(['FOOD', 'SHELTER'])
    expect(screen.getByRole('checkbox', { name: 'Health' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Food' })).not.toBeDisabled()
    unmount()

    render(
      renderMultiselectHarness({
        bilingual,
        services: { masterData: adapter },
        minItems: 3,
        maxItems: 1,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/configuration is invalid/i)
  })

  it('rejects malformed incoming values without rewriting', async () => {
    const onChange = vi.fn()
    for (const value of ['FOOD', [42], ['FOOD', 'FOOD'], ['ZZZ']] as const) {
      const { unmount } = render(
        renderMultiselectHarness({
          bilingual,
          value,
          services: { masterData: multiselectAdapter() },
          onChange,
        }),
      )
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
      })
      unmount()
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses ordinal DOM IDs for special codes and preserves underscore field ids', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const special = 'A B/ગુજરાત'
    const adapter = multiselectAdapter([opt(special, 'Special', 'વિશેષ')])
    render(
      renderMultiselectHarness({
        bilingual,
        name: 'applicant_benefits',
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Special' })).toBeInTheDocument()
    })
    const box = screen.getByRole('checkbox', { name: 'Special' })
    expect(box.id).toBe('root_applicant_benefits__option_0')
    expect(box.id).not.toContain(special)
    expect(adapter.calls[0]?.fieldId).toBe('applicant_benefits')
    await user.click(box)
    expect(onChange).toHaveBeenCalledWith([special])
  })

  it('retries after failure and ignores stale loads without onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let attempt = 0
    let releaseStale!: () => void
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve
    })
    const adapter: MasterDataAdapter = {
      async listOptions({ masterListId }) {
        if (masterListId === 'OLD') {
          await staleGate
          return [opt('STALE', 'Stale', 'જૂનું')]
        }
        attempt += 1
        if (attempt === 1) {
          throw new Error('fail')
        }
        return BENEFIT_OPTIONS
      },
    }
    const { rerender } = render(
      renderMultiselectHarness({
        bilingual,
        masterListId: 'LIST_BENEFITS',
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i)
    })
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Food' })).toBeInTheDocument()
    })

    rerender(
      renderMultiselectHarness({
        bilingual,
        masterListId: 'OLD',
        services: { masterData: adapter },
        onChange,
      }),
    )
    rerender(
      renderMultiselectHarness({
        bilingual,
        masterListId: 'LIST_BENEFITS',
        locale: 'gu',
        services: { masterData: adapter },
        onChange,
      }),
    )
    releaseStale()
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'ખોરાક' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('checkbox', { name: 'Stale' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('CascadingDropdownWidget', () => {
  it('loads parent without parentCode and child only after parent selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = cascadingAdapter()
    render(
      renderCascadingDropdownHarness({
        bilingual,
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/^Parent$/i)).toBeInTheDocument()
    })
    expect(adapter.calls.every((c) => c.masterListId !== 'LIST_CHILD')).toBe(true)
    await user.selectOptions(screen.getByLabelText(/^Parent$/i), 'GJ')
    expect(onChange).toHaveBeenCalledWith({ parentCode: 'GJ' })
    await waitFor(() => {
      expect(
        adapter.calls.some((c) => c.masterListId === 'LIST_CHILD' && c.parentCode === 'GJ'),
      ).toBe(true)
    })
    await user.selectOptions(screen.getByLabelText(/^Child$/i), 'AHM')
    expect(onChange).toHaveBeenLastCalledWith({ parentCode: 'GJ', childCode: 'AHM' })
  })

  it('clears child on parent change and emits undefined when parent cleared', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = cascadingAdapter()
    render(
      renderCascadingDropdownHarness({
        bilingual,
        formData: { parentCode: 'GJ', childCode: 'AHM' },
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/^Child$/i)).toHaveValue('AHM')
    })
    await user.selectOptions(screen.getByLabelText(/^Parent$/i), 'MH')
    expect(onChange).toHaveBeenCalledWith({ parentCode: 'MH' })
    await waitFor(() => {
      expect(screen.getByLabelText(/^Child$/i)).toHaveValue('')
    })
    await user.selectOptions(screen.getByLabelText(/^Parent$/i), '')
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('emits parent-only when child is cleared', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderCascadingDropdownHarness({
        bilingual,
        formData: { parentCode: 'GJ', childCode: 'AHM' },
        services: { masterData: cascadingAdapter() },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/^Child$/i)).toHaveValue('AHM')
    })
    await user.selectOptions(screen.getByLabelText(/^Child$/i), '')
    expect(onChange).toHaveBeenCalledWith({ parentCode: 'GJ' })
  })

  it('rejects malformed shapes and unknown codes without rewriting', async () => {
    const onChange = vi.fn()
    for (const formData of [
      { parentCode: 'GJ', childCode: 'AHM', labelEn: 'nope' },
      { parentCode: 1 },
      'GJ',
      { parentCode: 'ZZ' },
    ] as const) {
      const { unmount } = render(
        renderCascadingDropdownHarness({
          bilingual,
          formData,
          services: { masterData: cascadingAdapter() },
          onChange,
        }),
      )
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
      })
      unmount()
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores stale child results and does not emit on locale or load', async () => {
    const onChange = vi.fn()
    let releaseChild!: () => void
    const childGate = new Promise<void>((resolve) => {
      releaseChild = resolve
    })
    const adapter: MasterDataAdapter = {
      async listOptions(request) {
        if (request.masterListId === 'LIST_PARENT') {
          return PARENT_OPTIONS
        }
        if (request.parentCode === 'GJ') {
          await childGate
          return [opt('STALE', 'Stale child', 'જૂનું')]
        }
        return CHILD_BY_PARENT[request.parentCode ?? ''] ?? []
      },
    }
    const { rerender } = render(
      renderCascadingDropdownHarness({
        bilingual,
        formData: { parentCode: 'GJ' },
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/^Parent$/i)).toHaveValue('GJ')
    })
    rerender(
      renderCascadingDropdownHarness({
        bilingual,
        formData: { parentCode: 'MH' },
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/^Parent$/i)).toHaveValue('MH')
    })
    releaseChild()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Mumbai' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('option', { name: 'Stale child' })).not.toBeInTheDocument()

    const callsBeforeLocale = onChange.mock.calls.length
    rerender(
      renderCascadingDropdownHarness({
        bilingual,
        locale: 'gu',
        formData: { parentCode: 'MH' },
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'મુંબઈ' })).toBeInTheDocument()
    })
    expect(onChange.mock.calls.length).toBe(callsBeforeLocale)
  })

  it('recovers when adapter becomes available', async () => {
    const onChange = vi.fn()
    const adapter = cascadingAdapter()
    const { rerender } = render(renderCascadingDropdownHarness({ bilingual, onChange }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    rerender(
      renderCascadingDropdownHarness({
        bilingual,
        services: { masterData: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Gujarat' })).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})
