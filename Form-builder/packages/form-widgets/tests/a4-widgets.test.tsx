import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent, PrefillBinding } from '@dg20/form-contract'

import { validateMasterDataOptions } from '../src/runtime/master-data.js'
import {
  acceptCafPrefillResult,
  resolvePrefillBindingForField,
} from '../src/runtime/prefill-bindings.js'
import type {
  CafPrefillAdapter,
  GeographyAdapter,
  MasterDataOption,
  PincodeLookupAdapter,
} from '../src/runtime/service-ports.js'
import {
  renderAddressBlockHarness,
  renderCafPrefillHarness,
  renderPincodeHarness,
} from './widget-harness.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingual: BilingualContent = {
  labels: {
    caf_field: { en: 'CAF field', gu: 'CAF ક્ષેત્ર' },
    address_block: { en: 'Address', gu: 'સરનામું' },
    pincode: { en: 'PIN code', gu: 'પિન કોડ' },
  },
  help: {},
  errors: {},
}

const CAF_BINDINGS: readonly PrefillBinding[] = [
  { fieldId: 'caf_field', cafAttribute: 'person.fullName', confidenceMin: 0.8 },
]

function option(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const GEO_TREE = {
  states: [option('GJ', 'Gujarat', 'ગુજરાત'), option('MH', 'Maharashtra', 'મહારાષ્ટ્ર')],
  districts: {
    GJ: [option('AHM', 'Ahmedabad', 'અમદાવાદ'), option('SRT', 'Surat', 'સુરત')],
  },
  talukas: {
    'GJ|AHM': [option('DASK', 'Daskroi', 'દસ્ક્રોઈ')],
  },
  villages: {
    'GJ|AHM|DASK': [option('V001', 'Village One', 'ગામ એક')],
  },
} as const

function createGeographyAdapter(overrides?: {
  readonly listOptions?: GeographyAdapter['listOptions']
}): GeographyAdapter {
  return {
    listOptions: async (request) => {
      if (overrides?.listOptions) {
        return overrides.listOptions(request)
      }
      if (request.level === 'state') {
        return GEO_TREE.states
      }
      if (request.level === 'district' && request.parentCodes.stateCode === 'GJ') {
        return GEO_TREE.districts.GJ
      }
      if (
        request.level === 'taluka' &&
        request.parentCodes.stateCode === 'GJ' &&
        request.parentCodes.districtCode === 'AHM'
      ) {
        return GEO_TREE.talukas['GJ|AHM']
      }
      if (
        request.level === 'village' &&
        request.parentCodes.stateCode === 'GJ' &&
        request.parentCodes.districtCode === 'AHM' &&
        request.parentCodes.talukaCode === 'DASK'
      ) {
        return GEO_TREE.villages['GJ|AHM|DASK']
      }
      return []
    },
  }
}

describe('validateMasterDataOptions', () => {
  it('rejects malformed and duplicate codes', () => {
    expect(validateMasterDataOptions(null).ok).toBe(false)
    expect(validateMasterDataOptions([{ code: 'A', labelEn: 'A', labelGu: '' }]).ok).toBe(false)
    expect(
      validateMasterDataOptions([
        { code: 'A', labelEn: 'A', labelGu: 'અ' },
        { code: 'A', labelEn: 'B', labelGu: 'બ' },
      ]).ok,
    ).toBe(false)
    const ok = validateMasterDataOptions([
      { code: 'A', labelEn: 'A', labelGu: 'અ' },
      { code: 'B', labelEn: 'B', labelGu: 'બ' },
    ])
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.options.map((item) => item.code)).toEqual(['A', 'B'])
    }
  })
})

describe('CAF prefill validation (FB-A4.1)', () => {
  it('rejects confidenceMin outside 0..1 as invalid binding', () => {
    expect(
      resolvePrefillBindingForField(
        [{ fieldId: 'caf_field', cafAttribute: 'person.fullName', confidenceMin: -0.1 }],
        'caf_field',
      ).status,
    ).toBe('invalid')
    expect(
      resolvePrefillBindingForField(
        [{ fieldId: 'caf_field', cafAttribute: 'person.fullName', confidenceMin: 1.1 }],
        'caf_field',
      ).status,
    ).toBe('invalid')
    expect(
      resolvePrefillBindingForField(
        [{ fieldId: 'caf_field', cafAttribute: 'person.fullName', confidenceMin: 0 }],
        'caf_field',
      ).status,
    ).toBe('ok')
    expect(
      resolvePrefillBindingForField(
        [{ fieldId: 'caf_field', cafAttribute: 'person.fullName', confidenceMin: 1 }],
        'caf_field',
      ).status,
    ).toBe('ok')
  })

  it('rejects adapter confidence outside 0..1, NaN, and blank values', () => {
    expect(acceptCafPrefillResult({ value: 'X', confidence: -1 }, 0)).toBeNull()
    expect(acceptCafPrefillResult({ value: 'X', confidence: 2 }, 0)).toBeNull()
    expect(acceptCafPrefillResult({ value: 'X', confidence: Number.NaN }, 0)).toBeNull()
    expect(acceptCafPrefillResult({ value: '   ', confidence: 0.9 }, 0.5)).toBeNull()
    expect(acceptCafPrefillResult({ value: '', confidence: 0.9 }, 0.5)).toBeNull()
    expect(acceptCafPrefillResult({ value: 'Ok', confidence: 0.9 }, 0.8)).toEqual({
      value: 'Ok',
      confidence: 0.9,
    })
  })

  it('treats out-of-range binding as configuration error in the widget', async () => {
    const onChange = vi.fn()
    const adapter: CafPrefillAdapter = {
      async resolvePrefill() {
        return { value: 'Should not emit', confidence: 0.99 }
      },
    }
    render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: adapter },
        prefillBindings: [
          { fieldId: 'caf_field', cafAttribute: 'person.fullName', confidenceMin: 1.1 },
        ],
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/configuration is invalid/i)
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('never emits CAF for blank adapter value or out-of-range confidence', async () => {
    const onChange = vi.fn()
    const blankAdapter: CafPrefillAdapter = {
      async resolvePrefill() {
        return { value: '  ', confidence: 0.95 }
      },
    }
    const { unmount } = render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: blankAdapter },
        prefillBindings: CAF_BINDINGS,
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByText(/Enter this value manually/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
    unmount()

    const badConfidence: CafPrefillAdapter = {
      async resolvePrefill() {
        return { value: 'Name', confidence: 2 }
      },
    }
    render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: badConfidence },
        prefillBindings: CAF_BINDINGS,
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByText(/Enter this value manually/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('CafPrefillWidget', () => {
  it('emits CAF value when confidence meets threshold and shows indicator', async () => {
    const onChange = vi.fn()
    const adapter: CafPrefillAdapter = {
      async resolvePrefill() {
        return { value: 'Priya Shah', confidence: 0.95 }
      },
    }
    render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: adapter },
        prefillBindings: CAF_BINDINGS,
        onChange,
      }),
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ value: 'Priya Shah', source: 'CAF' })
    })
    expect(screen.getByText(/Pre-filled from citizen records/i)).toBeInTheDocument()
    expect(screen.queryByText(/0\.95|confidence/i)).not.toBeInTheDocument()
  })

  it('leaves blank for low confidence and requests manual entry', async () => {
    const onChange = vi.fn()
    const adapter: CafPrefillAdapter = {
      async resolvePrefill() {
        return { value: 'Low', confidence: 0.2 }
      },
    }
    render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: adapter },
        prefillBindings: CAF_BINDINGS,
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByText(/Enter this value manually/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('requires explicit Edit before OVERRIDE and emits OVERRIDE on change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: CafPrefillAdapter = {
      async resolvePrefill() {
        return { value: 'Priya', confidence: 0.9 }
      },
    }
    render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: adapter },
        prefillBindings: CAF_BINDINGS,
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByDisplayValue('Priya')).toBeInTheDocument()
    })
    const input = screen.getByLabelText(/CAF field/i)
    expect(input).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: /Edit/i }))
    expect(onChange).toHaveBeenCalledWith({ value: 'Priya', source: 'OVERRIDE' })
    await user.clear(input)
    await user.type(input, 'Manual')
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ value: 'Manual', source: 'OVERRIDE' })
  })

  it('permits manual entry when adapter is missing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderCafPrefillHarness({
        bilingual,
        prefillBindings: CAF_BINDINGS,
        onChange,
      }),
    )
    expect(screen.getByText(/Automatic pre-fill is temporarily unavailable/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/CAF field/i), 'Manual')
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ value: 'Manual', source: 'OVERRIDE' })
  })

  it('ignores stale CAF responses after binding change', async () => {
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: CafPrefillAdapter = {
      async resolvePrefill({ cafAttribute, signal }) {
        if (cafAttribute === 'person.fullName') {
          await gate
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }
          return { value: 'STALE', confidence: 0.99 }
        }
        return { value: 'Fresh', confidence: 0.99 }
      },
    }
    const { rerender } = render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: adapter },
        prefillBindings: CAF_BINDINGS,
        onChange,
      }),
    )
    rerender(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: adapter },
        prefillBindings: [
          { fieldId: 'caf_field', cafAttribute: 'person.other', confidenceMin: 0.8 },
        ],
        onChange,
      }),
    )
    release()
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ value: 'Fresh', source: 'CAF' })
    })
    expect(onChange.mock.calls.some((call) => call[0]?.value === 'STALE')).toBe(false)
  })

  it('renders Gujarati chrome and respects disabled/readonly', async () => {
    const adapter: CafPrefillAdapter = {
      async resolvePrefill() {
        return { value: 'પ્રિયા', confidence: 0.9 }
      },
    }
    const { unmount } = render(
      renderCafPrefillHarness({
        bilingual,
        locale: 'gu',
        services: { cafPrefill: adapter },
        prefillBindings: CAF_BINDINGS,
      }),
    )
    await waitFor(() => {
      expect(screen.getByDisplayValue('પ્રિયા')).toBeInTheDocument()
    })
    expect(screen.getByText(/CAF/i)).toBeInTheDocument()
    unmount()

    render(
      renderCafPrefillHarness({
        bilingual,
        services: { cafPrefill: adapter },
        prefillBindings: CAF_BINDINGS,
        formData: { value: 'Locked', source: 'CAF' },
        disabled: true,
      }),
    )
    expect(screen.getByLabelText(/CAF field/i)).toBeDisabled()
  })
})

describe('AddressBlockWidget', () => {
  it('cascades State→District→Taluka→Village and emits codes only', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderAddressBlockHarness({
        bilingual,
        services: { geography: createGeographyAdapter() },
        onChange,
      }),
    )
    const state = await screen.findByLabelText(/^State$/i)
    await waitFor(() => {
      expect(within(state).getByRole('option', { name: 'Gujarat' })).toBeInTheDocument()
    })
    await user.selectOptions(state, 'GJ')
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ stateCode: 'GJ' })
    })
    const district = await screen.findByLabelText(/^District$/i)
    await waitFor(() => {
      expect(within(district).getByRole('option', { name: 'Ahmedabad' })).toBeInTheDocument()
    })
    await user.selectOptions(district, 'AHM')
    const taluka = await screen.findByLabelText(/^Taluka$/i)
    await waitFor(() => {
      expect(within(taluka).getByRole('option', { name: 'Daskroi' })).toBeInTheDocument()
    })
    await user.selectOptions(taluka, 'DASK')
    const village = await screen.findByLabelText(/^Village$/i)
    await waitFor(() => {
      expect(within(village).getByRole('option', { name: 'Village One' })).toBeInTheDocument()
    })
    await user.selectOptions(village, 'V001')
    const emitted = onChange.mock.calls.at(-1)?.[0] as Record<string, string>
    expect(emitted).toEqual({
      stateCode: 'GJ',
      districtCode: 'AHM',
      talukaCode: 'DASK',
      villageCode: 'V001',
    })
    expect(JSON.stringify(emitted)).not.toMatch(/Gujarat|Ahmedabad|Daskroi|Village One/)
  })

  it('clears descendants when parent changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderAddressBlockHarness({
        bilingual,
        services: { geography: createGeographyAdapter() },
        formData: {
          stateCode: 'GJ',
          districtCode: 'AHM',
          talukaCode: 'DASK',
          villageCode: 'V001',
        },
        onChange,
      }),
    )
    const state = await screen.findByLabelText(/^State$/i)
    await waitFor(() => {
      expect(state).toHaveValue('GJ')
    })
    await user.selectOptions(state, 'MH')
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ stateCode: 'MH' })
  })

  it('rejects malformed master-data options safely', async () => {
    const adapter = createGeographyAdapter({
      listOptions: async () =>
        [{ code: 'X', labelEn: 'X', labelGu: '' }] as unknown as MasterDataOption[],
    })
    render(renderAddressBlockHarness({ bilingual, services: { geography: adapter } }))
    await waitFor(() => {
      expect(screen.getByText(/Options could not be loaded/i)).toBeInTheDocument()
    })
  })

  it('applies defaultStateCode only when empty and option exists', async () => {
    const onChange = vi.fn()
    render(
      renderAddressBlockHarness({
        bilingual,
        services: { geography: createGeographyAdapter() },
        defaultStateCode: 'GJ',
        onChange,
      }),
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ stateCode: 'GJ' })
    })
  })

  it('ignores stale geography responses', async () => {
    const onChange = vi.fn()
    let releaseStale!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseStale = resolve
    })
    let districtCalls = 0
    const adapter: GeographyAdapter = {
      async listOptions(request) {
        if (request.level === 'state') {
          return GEO_TREE.states
        }
        if (request.level === 'district') {
          districtCalls += 1
          if (districtCalls === 1) {
            await gate
            return [option('STALE', 'Stale', 'સ્ટેલ')]
          }
          return GEO_TREE.districts.GJ
        }
        return []
      },
    }
    const user = userEvent.setup()
    render(renderAddressBlockHarness({ bilingual, services: { geography: adapter }, onChange }))
    const state = await screen.findByLabelText(/^State$/i)
    await waitFor(() => {
      expect(within(state).getByRole('option', { name: 'Gujarat' })).toBeInTheDocument()
    })
    await user.selectOptions(state, 'GJ')
    await user.selectOptions(state, '')
    await user.selectOptions(state, 'GJ')
    releaseStale()
    const district = await screen.findByLabelText(/^District$/i)
    await waitFor(() => {
      expect(within(district).getByRole('option', { name: 'Ahmedabad' })).toBeInTheDocument()
    })
    expect(within(district).queryByRole('option', { name: 'Stale' })).not.toBeInTheDocument()
  })

  it('disables selects when geography adapter is missing', () => {
    render(renderAddressBlockHarness({ bilingual }))
    expect(screen.getByText(/Address lookup is temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^State$/i)).toBeDisabled()
  })

  it('shows Gujarati labels and respects readonly', async () => {
    render(
      renderAddressBlockHarness({
        bilingual,
        locale: 'gu',
        services: { geography: createGeographyAdapter() },
        formData: { stateCode: 'GJ' },
        readonly: true,
      }),
    )
    const state = await screen.findByLabelText(/રાજ્ય|State/i)
    await waitFor(() => {
      expect(within(state).getByRole('option', { name: 'ગુજરાત' })).toBeInTheDocument()
    })
    expect(state).toBeDisabled()
  })
})

describe('PincodeWidget', () => {
  it('looks up six digits and emits codes not labels', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: PincodeLookupAdapter = {
      async lookupPincode() {
        return {
          found: true,
          cityCode: 'AHM',
          districtCode: 'D-AHM',
          cityLabelEn: 'Ahmedabad',
          cityLabelGu: 'અમદાવાદ',
          districtLabelEn: 'Ahmedabad Dist',
          districtLabelGu: 'અમદાવાદ જિલ્લો',
        }
      },
    }
    render(renderPincodeHarness({ bilingual, services: { pincodeLookup: adapter }, onChange }))
    await user.type(screen.getByLabelText(/PIN code/i), '380001')
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual({
        pincode: '380001',
        cityCode: 'AHM',
        districtCode: 'D-AHM',
      })
    })
    expect(screen.getAllByText(/Ahmedabad/).length).toBeGreaterThan(0)
    expect(JSON.stringify(onChange.mock.calls.at(-1)?.[0])).not.toContain('Ahmedabad')
  })

  it('shows not-found for found:false', async () => {
    const user = userEvent.setup()
    const adapter: PincodeLookupAdapter = {
      async lookupPincode() {
        return { found: false }
      },
    }
    render(renderPincodeHarness({ bilingual, services: { pincodeLookup: adapter } }))
    await user.type(screen.getByLabelText(/PIN code/i), '999999')
    await waitFor(() => {
      expect(
        screen.getByText(/No city or district was found for this PIN code/i),
      ).toBeInTheDocument()
    })
  })

  it('rejects letters rather than stripping them', async () => {
    const user = userEvent.setup()
    const lookup = vi.fn()
    const adapter: PincodeLookupAdapter = { lookupPincode: lookup }
    render(renderPincodeHarness({ bilingual, services: { pincodeLookup: adapter } }))
    await user.type(screen.getByLabelText(/PIN code/i), '38000A')
    expect(screen.getByText(/Enter a 6-digit PIN code/i)).toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('permits PIN entry when adapter missing and reports enrichment unavailable', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderPincodeHarness({ bilingual, onChange }))
    expect(screen.getByText(/PIN enrichment is temporarily unavailable/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/PIN code/i), '380001')
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ pincode: '380001' })
  })

  it('ignores stale PIN lookups after input change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: PincodeLookupAdapter = {
      async lookupPincode({ pincode, signal }) {
        if (pincode === '111111') {
          await gate
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }
          return {
            found: true,
            cityCode: 'STALE',
            districtCode: 'STALE',
            cityLabelEn: 'Stale',
            cityLabelGu: 'સ્ટેલ',
            districtLabelEn: 'Stale D',
            districtLabelGu: 'સ્ટેલ ડી',
          }
        }
        return {
          found: true,
          cityCode: 'FRESH',
          districtCode: 'FRESH-D',
          cityLabelEn: 'Fresh',
          cityLabelGu: 'તાજું',
          districtLabelEn: 'Fresh D',
          districtLabelGu: 'તાજું ડી',
        }
      },
    }
    render(renderPincodeHarness({ bilingual, services: { pincodeLookup: adapter }, onChange }))
    await user.type(screen.getByLabelText(/PIN code/i), '111111')
    await user.clear(screen.getByLabelText(/PIN code/i))
    await user.type(screen.getByLabelText(/PIN code/i), '222222')
    release()
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
        pincode: '222222',
        cityCode: 'FRESH',
      })
    })
    expect(onChange.mock.calls.some((call) => call[0]?.cityCode === 'STALE')).toBe(false)
  })

  it('handles lookup failure without technical errors', async () => {
    const user = userEvent.setup()
    const adapter: PincodeLookupAdapter = {
      async lookupPincode() {
        throw new Error('network-secret')
      },
    }
    render(renderPincodeHarness({ bilingual, services: { pincodeLookup: adapter } }))
    await user.type(screen.getByLabelText(/PIN code/i), '380001')
    await waitFor(() => {
      expect(screen.getByText(/The operation could not be completed/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/network-secret/i)).not.toBeInTheDocument()
  })

  it('shows readonly PIN without actions', () => {
    render(
      renderPincodeHarness({
        bilingual,
        formData: { pincode: '380001', cityCode: 'AHM', districtCode: 'D-AHM' },
        readonly: true,
      }),
    )
    expect(screen.getByLabelText(/PIN code/i)).toHaveAttribute('readonly')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('looks up when parent changes formData PIN with the same adapter', async () => {
    const onChange = vi.fn()
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const adapter: PincodeLookupAdapter = {
      async lookupPincode({ pincode, signal }) {
        if (pincode === '111111') {
          await gateA
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }
          return {
            found: true,
            cityCode: 'A-CITY',
            districtCode: 'A-DIST',
            cityLabelEn: 'City A',
            cityLabelGu: 'શહેર અ',
            districtLabelEn: 'Dist A',
            districtLabelGu: 'જિલ્લો અ',
          }
        }
        return {
          found: true,
          cityCode: 'B-CITY',
          districtCode: 'B-DIST',
          cityLabelEn: 'City B',
          cityLabelGu: 'શહેર બ',
          districtLabelEn: 'Dist B',
          districtLabelGu: 'જિલ્લો બ',
        }
      },
    }

    const { rerender } = render(
      renderPincodeHarness({
        bilingual,
        services: { pincodeLookup: adapter },
        formData: { pincode: '111111' },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/PIN code/i)).toHaveValue('111111')
    })

    rerender(
      renderPincodeHarness({
        bilingual,
        services: { pincodeLookup: adapter },
        formData: { pincode: '222222' },
        onChange,
      }),
    )
    releaseA()

    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
        pincode: '222222',
        cityCode: 'B-CITY',
      })
    })
    expect(onChange.mock.calls.some((call) => call[0]?.cityCode === 'A-CITY')).toBe(false)
    expect(screen.getByText(/City B/)).toBeInTheDocument()
  })

  it('switches displayed labels with locale without another lookup', async () => {
    const lookup = vi.fn(async () => ({
      found: true as const,
      cityCode: 'AHM',
      districtCode: 'D-AHM',
      cityLabelEn: 'Ahmedabad',
      cityLabelGu: 'અમદાવાદ',
      districtLabelEn: 'Ahmedabad Dist',
      districtLabelGu: 'અમદાવાદ જિલ્લો',
    }))
    const adapter: PincodeLookupAdapter = { lookupPincode: lookup }
    const onChange = vi.fn()

    const { rerender } = render(
      renderPincodeHarness({
        bilingual,
        locale: 'en',
        services: { pincodeLookup: adapter },
        formData: { pincode: '380001' },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
        pincode: '380001',
        cityCode: 'AHM',
      })
    })
    expect(screen.getByText(/Ahmedabad Dist/)).toBeInTheDocument()
    const callsAfterEn = lookup.mock.calls.length

    rerender(
      renderPincodeHarness({
        bilingual,
        locale: 'gu',
        services: { pincodeLookup: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(
        screen.getByText((_, node) => node?.textContent === 'શહેર: અમદાવાદ'),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText((_, node) => node?.textContent === 'જિલ્લો: અમદાવાદ જિલ્લો'),
    ).toBeInTheDocument()
    expect(lookup.mock.calls.length).toBe(callsAfterEn)
    expect(JSON.stringify(onChange.mock.calls.at(-1)?.[0])).not.toMatch(/Ahmedabad|અમદાવાદ/)
  })
})
