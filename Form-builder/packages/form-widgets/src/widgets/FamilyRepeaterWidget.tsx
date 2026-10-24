import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ErrorSchema, IdSchema, RJSFSchema, UiSchema } from '@rjsf/utils'

import {
  assessFamilyRepeaterIncomingValue,
  buildFamilyRepeaterItemIdentity,
  emitFamilyRepeaterValue,
  reconcileFamilyRepeaterRowKeys,
  regenerateFamilyRepeaterRowKeys,
  resolveFamilyRepeaterConfig,
} from '../runtime/family-repeater.js'
import {
  appendArrayIndexToResolvedPath,
  appendArrayTemplateToResolvedPath,
} from '../runtime/field-id.js'
import { NestedFieldIdentityScope } from '../runtime/nested-field-identity.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Family member repeater (FB-A12 / A12.1 / FB-B3 / B3.1).
 * Array JSON Schema is authoritative; rows render via registry.fields.SchemaField.
 * Row NestedFieldIdentityScope extends the repeater's resolved FieldIdentity
 * (`chrome.definitionFieldId` / `chrome.instanceFieldId`) — never reconstruct from
 * raw `name`. React row keys remain UI-only.
 */
export function FamilyRepeaterWidget(props: Dg20FieldProps): ReactElement {
  const {
    formData,
    disabled,
    readonly,
    onChange,
    schema,
    uiSchema,
    rawErrors,
    idSchema,
    name,
    registry,
    errorSchema,
    onBlur,
    onFocus,
    idPrefix,
    idSeparator,
  } = props

  const id = idSchema.$id
  const chrome = useFieldChrome({
    idSchema,
    id,
    name,
    label: schema.title,
    required: false,
    rawErrors,
    schema,
  })
  const definitionArrayPrefix = appendArrayTemplateToResolvedPath(chrome.definitionFieldId)

  const config = resolveFamilyRepeaterConfig(schema)
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)
  const mutationAllowed = !isDisabled && !isReadOnly
  const SchemaField = registry.fields.SchemaField
  const schemaFieldAvailable = typeof SchemaField === 'function'

  const incoming = config.ok
    ? assessFamilyRepeaterIncomingValue(formData, config.maxItems)
    : ({ kind: 'unanswered' } as const)

  const rows: readonly Record<string, unknown>[] =
    config.ok && schemaFieldAvailable && incoming.kind === 'valid' ? incoming.value : []

  const keySeedRef = useRef(0)
  const [rowKeys, setRowKeys] = useState<string[]>(() =>
    regenerateFamilyRepeaterRowKeys(rows.length, () => ++keySeedRef.current),
  )
  /** Distinguishes our controlled emissions from genuine external replacements. */
  const lastEmittedRef = useRef(formData)

  useEffect(() => {
    if (formData === lastEmittedRef.current) {
      // Own controlled update (or identical ref): preserve surviving keys; only adjust length.
      setRowKeys((prev) =>
        reconcileFamilyRepeaterRowKeys(prev, rows.length, () => ++keySeedRef.current),
      )
      return
    }
    // Genuine external replacement — regenerate all keys; never emit.
    lastEmittedRef.current = formData
    setRowKeys(regenerateFamilyRepeaterRowKeys(rows.length, () => ++keySeedRef.current))
  }, [formData, rows.length])

  function handleAdd() {
    if (!config.ok || !mutationAllowed || !schemaFieldAvailable) {
      return
    }
    if (rows.length >= config.maxItems) {
      return
    }
    let defaults: unknown
    try {
      defaults = registry.schemaUtils.getDefaultFormState(config.itemsSchema)
    } catch {
      defaults = {}
    }
    const newRow =
      typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults)
        ? { ...(defaults as Record<string, unknown>) }
        : {}
    const nextRows = [...rows, newRow]
    setRowKeys((prev) =>
      reconcileFamilyRepeaterRowKeys(prev, nextRows.length, () => ++keySeedRef.current),
    )
    const emitted = emitFamilyRepeaterValue(nextRows)
    lastEmittedRef.current = emitted
    onChange(emitted)
  }

  function handleRemove(index: number) {
    if (!config.ok || !mutationAllowed || !schemaFieldAvailable) {
      return
    }
    if (rows.length <= config.minItems) {
      return
    }
    const nextRows = rows.filter((_, i) => i !== index)
    setRowKeys((prev) => prev.filter((_, i) => i !== index))
    const emitted = emitFamilyRepeaterValue(nextRows)
    lastEmittedRef.current = emitted
    onChange(emitted)
  }

  function handleRowChange(index: number, nextRow: unknown) {
    if (!config.ok || !mutationAllowed || !schemaFieldAvailable) {
      return
    }
    // Ignore invalid nested emissions — do not replace the row with {} or call onChange.
    if (typeof nextRow !== 'object' || nextRow === null || Array.isArray(nextRow)) {
      return
    }
    const plain = { ...(nextRow as Record<string, unknown>) }
    const nextRows = rows.map((row, i) => (i === index ? plain : row))
    const emitted = emitFamilyRepeaterValue(nextRows)
    lastEmittedRef.current = emitted
    onChange(emitted)
  }

  const statusId = `${id}__family-status`
  const errorId = `${id}__error`

  if (!config.ok || !schemaFieldAvailable) {
    return (
      <fieldset
        className="dg20-field dg20-fieldset dg20-family-repeater"
        lang={chrome.lang}
        data-dg20-widget="family-repeater"
        aria-invalid="true"
      >
        <legend className="dg20-label">
          <span>{chrome.label.text}</span>
        </legend>
        <p className="dg20-error" id={errorId} role="alert">
          {chrome.message('familyRepeaterConfigInvalid')}
        </p>
      </fieldset>
    )
  }

  const malformed = incoming.kind === 'malformed' || incoming.kind === 'oversized'
  const currentCount = incoming.kind === 'valid' ? incoming.value.length : 0
  const belowMin = !malformed && currentCount < config.minItems
  const atMax = rows.length >= config.maxItems
  const canRemove = mutationAllowed && rows.length > config.minItems
  const canAdd = mutationAllowed && !atMax && !malformed

  const alertMessages = [
    ...chrome.errorMessages,
    ...(malformed ? [chrome.message('familyRepeaterInvalidValue')] : []),
  ]
  const uniqueAlerts = [...new Set(alertMessages)]
  const hasError = uniqueAlerts.length > 0

  const guidanceMessages = [
    ...(belowMin ? [chrome.message('familyRepeaterBelowMinimum', { count: config.minItems })] : []),
    ...(atMax && !malformed
      ? [chrome.message('familyRepeaterMaxReached', { count: config.maxItems })]
      : []),
  ]

  const childUiSchema = (uiSchema?.items ?? {}) as UiSchema
  const resolvedSeparator = idSeparator ?? '_'

  const describedBy =
    [
      chrome.helpId,
      guidanceMessages.length > 0 ? statusId : undefined,
      hasError ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <fieldset
      className="dg20-field dg20-fieldset dg20-family-repeater"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="family-repeater"
      aria-describedby={describedBy}
      aria-invalid={hasError || undefined}
    >
      <legend className="dg20-label">
        <span>{chrome.label.text}</span>
      </legend>
      {chrome.help.text ? (
        <p className="dg20-help" id={chrome.helpId}>
          {chrome.help.text}
        </p>
      ) : null}

      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {uniqueAlerts.join(' ')}
        </p>
      ) : null}

      {guidanceMessages.length > 0 ? (
        <p className="dg20-status" id={statusId} role="status" aria-live="polite">
          {guidanceMessages.join(' ')}
        </p>
      ) : null}

      {!malformed
        ? rows.map((row, index) => {
            const rowKey = rowKeys[index] ?? `fr-fallback-${index}`
            const rowNumber = index + 1
            const identity = buildFamilyRepeaterItemIdentity({
              schemaUtils: registry.schemaUtils,
              itemsSchema: config.itemsSchema,
              row,
              parentId: id,
              index,
              idPrefix,
              idSeparator: resolvedSeparator,
            })
            const itemErrorSchema =
              errorSchema && typeof errorSchema === 'object'
                ? ((errorSchema as Record<string, ErrorSchema | undefined>)[String(index)] as
                    ErrorSchema | undefined)
                : undefined

            return (
              <div className="dg20-family-row" key={rowKey} data-dg20-family-row={rowNumber}>
                <div className="dg20-family-row-header">
                  <h3 className="dg20-family-row-title" id={`${id}__row-${index}-title`}>
                    {chrome.message('familyRepeaterMemberHeading', { number: rowNumber })}
                  </h3>
                  {canRemove ? (
                    <button
                      type="button"
                      className="dg20-button dg20-button-secondary"
                      onClick={() => handleRemove(index)}
                    >
                      {chrome.message('familyRepeaterRemoveAction', { number: rowNumber })}
                    </button>
                  ) : null}
                </div>
                <NestedFieldIdentityScope
                  definitionPrefix={definitionArrayPrefix}
                  instancePrefix={appendArrayIndexToResolvedPath(chrome.instanceFieldId, index)}
                >
                  <SchemaField
                    name={`${name}_${index}`}
                    required={false}
                    schema={identity.resolvedItemSchema as RJSFSchema}
                    uiSchema={childUiSchema}
                    idSchema={identity.itemIdSchema as IdSchema}
                    formData={row}
                    errorSchema={itemErrorSchema}
                    registry={registry}
                    disabled={isDisabled}
                    readonly={isReadOnly}
                    autofocus={false}
                    idPrefix={idPrefix}
                    idSeparator={resolvedSeparator}
                    onChange={(next) => handleRowChange(index, next)}
                    onBlur={onBlur}
                    onFocus={onFocus}
                  />
                </NestedFieldIdentityScope>
              </div>
            )
          })
        : null}

      {canAdd ? (
        <div className="dg20-action-row">
          <button type="button" className="dg20-button" onClick={handleAdd}>
            {chrome.message('familyRepeaterAddAction')}
          </button>
        </div>
      ) : null}
    </fieldset>
  )
}
