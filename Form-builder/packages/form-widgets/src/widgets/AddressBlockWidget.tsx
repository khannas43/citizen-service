import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { validateMasterDataOptions } from '../runtime/master-data.js'
import type { GeographyLevel, MasterDataOption } from '../runtime/service-ports.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** Address cascade value — codes only, never translated labels. */
export interface AddressBlockValue {
  readonly stateCode?: string
  readonly districtCode?: string
  readonly talukaCode?: string
  readonly villageCode?: string
}

type LevelState = {
  readonly options: readonly MasterDataOption[]
  readonly status: 'idle' | 'loading' | 'empty' | 'error' | 'ready'
}

function asAddressValue(value: unknown): AddressBlockValue {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const record = value as Record<string, unknown>
  const next: {
    stateCode?: string
    districtCode?: string
    talukaCode?: string
    villageCode?: string
  } = {}
  if (typeof record.stateCode === 'string' && record.stateCode.length > 0) {
    next.stateCode = record.stateCode
  }
  if (typeof record.districtCode === 'string' && record.districtCode.length > 0) {
    next.districtCode = record.districtCode
  }
  if (typeof record.talukaCode === 'string' && record.talukaCode.length > 0) {
    next.talukaCode = record.talukaCode
  }
  if (typeof record.villageCode === 'string' && record.villageCode.length > 0) {
    next.villageCode = record.villageCode
  }
  return next
}

function emitAddress(value: AddressBlockValue): AddressBlockValue | undefined {
  if (!value.stateCode && !value.districtCode && !value.talukaCode && !value.villageCode) {
    return undefined
  }
  return value
}

function optionLabel(option: MasterDataOption, locale: 'en' | 'gu'): string {
  return locale === 'gu' ? option.labelGu : option.labelEn
}

const EMPTY_LEVEL: LevelState = { options: [], status: 'idle' }

/**
 * State → District → Taluka → Village cascade. Emits geography codes only.
 */
export function AddressBlockWidget(props: Dg20FieldProps) {
  const { name, formData, required, disabled, readonly, onChange, schema, rawErrors, idSchema } =
    props

  const id = idSchema.$id
  const chrome = useFieldChrome({
    idSchema,
    name,
    label: schema.title,
    required: Boolean(required),
    rawErrors,
    schema,
  })

  const extensions = parseDg20Extensions(schema)
  const defaultStateCode = extensions.defaultStateCode
  const adapter = chrome.runtime.services?.geography
  const current = asAddressValue(formData)
  const isDisabled = Boolean(disabled || chrome.disabled || !adapter)
  const isReadOnly = Boolean(readonly || chrome.readOnly)
  const locale = chrome.runtime.locale

  const [stateLevel, setStateLevel] = useState<LevelState>(EMPTY_LEVEL)
  const [districtLevel, setDistrictLevel] = useState<LevelState>(EMPTY_LEVEL)
  const [talukaLevel, setTalukaLevel] = useState<LevelState>(EMPTY_LEVEL)
  const [villageLevel, setVillageLevel] = useState<LevelState>(EMPTY_LEVEL)

  const abortRefs = useRef<Partial<Record<GeographyLevel, AbortController>>>({})
  const seqRefs = useRef<Record<GeographyLevel, number>>({
    state: 0,
    district: 0,
    taluka: 0,
    village: 0,
  })
  const defaultApplied = useRef(false)

  function abortLevel(level: GeographyLevel) {
    abortRefs.current[level]?.abort()
    abortRefs.current[level] = undefined
    seqRefs.current[level] += 1
  }

  function abortFrom(level: GeographyLevel) {
    const order: GeographyLevel[] = ['state', 'district', 'taluka', 'village']
    const start = order.indexOf(level)
    for (let i = start; i < order.length; i += 1) {
      const key = order[i]
      if (key) {
        abortLevel(key)
      }
    }
  }

  useEffect(() => {
    const aborts = abortRefs.current
    const seqs = seqRefs.current
    return () => {
      for (const level of ['state', 'district', 'taluka', 'village'] as const) {
        aborts[level]?.abort()
        aborts[level] = undefined
        seqs[level] += 1
      }
    }
  }, [])

  async function loadLevel(
    level: GeographyLevel,
    parentCodes: AddressBlockValue,
    setLevel: (state: LevelState) => void,
  ) {
    if (!adapter) {
      setLevel({ options: [], status: 'idle' })
      return
    }
    if (level === 'district' && !parentCodes.stateCode) {
      setLevel(EMPTY_LEVEL)
      return
    }
    if (level === 'taluka' && (!parentCodes.stateCode || !parentCodes.districtCode)) {
      setLevel(EMPTY_LEVEL)
      return
    }
    if (
      level === 'village' &&
      (!parentCodes.stateCode || !parentCodes.districtCode || !parentCodes.talukaCode)
    ) {
      setLevel(EMPTY_LEVEL)
      return
    }

    abortLevel(level)
    const controller = new AbortController()
    abortRefs.current[level] = controller
    const seq = ++seqRefs.current[level]
    setLevel({ options: [], status: 'loading' })

    try {
      const raw = await adapter.listOptions({
        fieldId: chrome.instanceFieldId,
        level,
        parentCodes: {
          stateCode: parentCodes.stateCode,
          districtCode: parentCodes.districtCode,
          talukaCode: parentCodes.talukaCode,
        },
        signal: controller.signal,
      })
      if (seq !== seqRefs.current[level] || controller.signal.aborted) {
        return
      }
      const validated = validateMasterDataOptions(raw)
      if (!validated.ok) {
        setLevel({ options: [], status: 'error' })
        return
      }
      if (validated.options.length === 0) {
        setLevel({ options: [], status: 'empty' })
        return
      }
      setLevel({ options: validated.options, status: 'ready' })

      if (
        level === 'state' &&
        defaultStateCode &&
        !defaultApplied.current &&
        !parentCodes.stateCode &&
        validated.options.some((option) => option.code === defaultStateCode)
      ) {
        defaultApplied.current = true
        const next = { stateCode: defaultStateCode }
        onChange(emitAddress(next))
      }
    } catch {
      if (seq !== seqRefs.current[level] || controller.signal.aborted) {
        return
      }
      setLevel({ options: [], status: 'error' })
    }
  }

  useEffect(() => {
    defaultApplied.current = false
    void loadLevel('state', {}, setStateLevel)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on adapter change
  }, [adapter, chrome.instanceFieldId, defaultStateCode])

  useEffect(() => {
    if (current.stateCode) {
      void loadLevel('district', current, setDistrictLevel)
    } else {
      abortFrom('district')
      setDistrictLevel(EMPTY_LEVEL)
      setTalukaLevel(EMPTY_LEVEL)
      setVillageLevel(EMPTY_LEVEL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, current.stateCode, chrome.instanceFieldId])

  useEffect(() => {
    if (current.stateCode && current.districtCode) {
      void loadLevel('taluka', current, setTalukaLevel)
    } else {
      abortFrom('taluka')
      setTalukaLevel(EMPTY_LEVEL)
      setVillageLevel(EMPTY_LEVEL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, current.stateCode, current.districtCode, chrome.instanceFieldId])

  useEffect(() => {
    if (current.stateCode && current.districtCode && current.talukaCode) {
      void loadLevel('village', current, setVillageLevel)
    } else {
      abortFrom('village')
      setVillageLevel(EMPTY_LEVEL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, current.stateCode, current.districtCode, current.talukaCode, chrome.instanceFieldId])

  function selectState(code: string) {
    abortFrom('district')
    setDistrictLevel(EMPTY_LEVEL)
    setTalukaLevel(EMPTY_LEVEL)
    setVillageLevel(EMPTY_LEVEL)
    onChange(emitAddress(code ? { stateCode: code } : {}))
  }

  function selectDistrict(code: string) {
    abortFrom('taluka')
    setTalukaLevel(EMPTY_LEVEL)
    setVillageLevel(EMPTY_LEVEL)
    onChange(
      emitAddress({
        stateCode: current.stateCode,
        ...(code ? { districtCode: code } : {}),
      }),
    )
  }

  function selectTaluka(code: string) {
    abortFrom('village')
    setVillageLevel(EMPTY_LEVEL)
    onChange(
      emitAddress({
        stateCode: current.stateCode,
        districtCode: current.districtCode,
        ...(code ? { talukaCode: code } : {}),
      }),
    )
  }

  function selectVillage(code: string) {
    onChange(
      emitAddress({
        stateCode: current.stateCode,
        districtCode: current.districtCode,
        talukaCode: current.talukaCode,
        ...(code ? { villageCode: code } : {}),
      }),
    )
  }

  function renderSelect(options: {
    readonly levelId: string
    readonly label: string
    readonly value: string | undefined
    readonly level: LevelState
    readonly enabled: boolean
    readonly onSelect: (code: string) => void
    readonly onRetry: () => void
  }) {
    const selectId = `${id}__${options.levelId}`
    const statusId = `${selectId}__status`
    const status =
      options.level.status === 'loading'
        ? chrome.message('addressLoading')
        : options.level.status === 'empty'
          ? chrome.message('addressEmpty')
          : options.level.status === 'error'
            ? chrome.message('addressLoadFailed')
            : ''

    return (
      <div className="dg20-name-part">
        <label className="dg20-sublabel" htmlFor={selectId}>
          {options.label}
        </label>
        <select
          id={selectId}
          className="dg20-control"
          value={options.value ?? ''}
          disabled={
            isDisabled ||
            isReadOnly ||
            !options.enabled ||
            options.level.status === 'loading' ||
            options.level.status === 'error'
          }
          required={Boolean(required) && options.levelId === 'state'}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            options.onSelect(event.target.value)
          }}
          aria-describedby={status ? statusId : undefined}
        >
          <option value="">{chrome.message('addressSelectPlaceholder')}</option>
          {options.level.options.map((option) => (
            <option key={option.code} value={option.code}>
              {optionLabel(option, locale)}
            </option>
          ))}
        </select>
        {status ? (
          <p className="dg20-status" id={statusId} role="status" aria-live="polite">
            {status}
            {options.level.status === 'error' && !isReadOnly && !isDisabled ? (
              <>
                {' '}
                <button
                  type="button"
                  className="dg20-button dg20-button-secondary"
                  onClick={options.onRetry}
                >
                  {chrome.message('retry')}
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    )
  }

  const statusId = `${id}__address-status`

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled && Boolean(adapter)}
      data-dg20-widget="address-block"
      aria-describedby={
        [chrome.describedBy, !adapter ? statusId : undefined].filter(Boolean).join(' ') || undefined
      }
      aria-invalid={chrome.hasError || undefined}
    >
      <legend className="dg20-label">
        <span>{chrome.label.text}</span>
        {required ? (
          <span className="dg20-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>
      {chrome.help.text ? (
        <p className="dg20-help" id={chrome.helpId}>
          {chrome.help.text}
        </p>
      ) : null}
      {!adapter ? (
        <p className="dg20-status" id={statusId} role="status">
          {chrome.message('addressUnavailable')}
        </p>
      ) : null}
      <div className="dg20-name-grid">
        {renderSelect({
          levelId: 'state',
          label: chrome.message('addressState'),
          value: current.stateCode,
          level: stateLevel,
          enabled: Boolean(adapter),
          onSelect: selectState,
          onRetry: () => {
            void loadLevel('state', {}, setStateLevel)
          },
        })}
        {renderSelect({
          levelId: 'district',
          label: chrome.message('addressDistrict'),
          value: current.districtCode,
          level: districtLevel,
          enabled: Boolean(adapter && current.stateCode),
          onSelect: selectDistrict,
          onRetry: () => {
            void loadLevel('district', current, setDistrictLevel)
          },
        })}
        {renderSelect({
          levelId: 'taluka',
          label: chrome.message('addressTaluka'),
          value: current.talukaCode,
          level: talukaLevel,
          enabled: Boolean(adapter && current.stateCode && current.districtCode),
          onSelect: selectTaluka,
          onRetry: () => {
            void loadLevel('taluka', current, setTalukaLevel)
          },
        })}
        {renderSelect({
          levelId: 'village',
          label: chrome.message('addressVillage'),
          value: current.villageCode,
          level: villageLevel,
          enabled: Boolean(
            adapter && current.stateCode && current.districtCode && current.talukaCode,
          ),
          onSelect: selectVillage,
          onRetry: () => {
            void loadLevel('village', current, setVillageLevel)
          },
        })}
      </div>
      {chrome.hasError ? (
        <p className="dg20-error" id={chrome.errorId} role="alert">
          {chrome.errorMessages.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}
