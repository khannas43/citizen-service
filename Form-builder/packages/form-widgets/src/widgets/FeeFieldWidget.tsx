import { useEffect, useRef, useState } from 'react'

import {
  acceptFeeComputationResult,
  assessFeeFieldIncomingValue,
  emitFeeFieldValue,
  formatFeeAmountInr,
  resolveFeeContextRevision,
  resolveFeeRuleId,
  type FeeFieldValue,
} from '../runtime/fee-field.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

export type { FeeFieldValue }

type UiState =
  | 'idle'
  | 'calculating'
  | 'unavailable-adapter'
  | 'unavailable-revision'
  | 'invalid-config'
  | 'failed'

function baseUiState(
  configOk: boolean,
  revisionOk: boolean,
  adapterPresent: boolean,
): Exclude<UiState, 'calculating' | 'failed'> {
  if (!configOk) {
    return 'invalid-config'
  }
  if (!revisionOk) {
    return 'unavailable-revision'
  }
  if (!adapterPresent) {
    return 'unavailable-adapter'
  }
  return 'idle'
}

/**
 * Read-only fee quote bound to a host fee-engine rule (provisional FB-A10 / A10.1).
 * Host supplies feeContextRevision; widget never hashes full formData.
 * No editable/hidden native inputs — RJSF onChange is the only data path.
 */
export function FeeFieldWidget(props: Dg20FieldProps) {
  const { formData, disabled, readonly, onChange, schema, rawErrors, idSchema, name } = props

  const id = idSchema.$id
  const chrome = useFieldChrome({
    idSchema,
    name,
    label: schema.title,
    required: false,
    rawErrors,
    schema,
  })

  const extensions = parseDg20Extensions(schema)
  const ruleResolution = resolveFeeRuleId(extensions.feeRuleId)
  const revisionResolution = resolveFeeContextRevision(chrome.runtime.feeContextRevision)
  // Stable primitives only — never put resolution objects in effect deps.
  const configOk = ruleResolution.ok
  const revisionOk = revisionResolution.ok
  const feeRuleId = configOk ? ruleResolution.feeRuleId : undefined
  const contextRevision = revisionOk ? revisionResolution.contextRevision : undefined
  const adapter = chrome.runtime.services?.feeComputation
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)
  const locale = chrome.runtime.locale
  const fieldId = chrome.instanceFieldId

  const incoming = assessFeeFieldIncomingValue(formData, feeRuleId, contextRevision)
  const incomingKind = incoming.kind
  const currentQuote = incoming.kind === 'current' ? incoming.value : undefined
  const malformedIncoming = incoming.kind === 'malformed'

  const [uiState, setUiState] = useState<UiState>(() =>
    baseUiState(configOk, revisionOk, Boolean(adapter)),
  )
  const [retryNonce, setRetryNonce] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const lastExternalRef = useRef(formData)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // External matching quote arriving mid-request wins.
  useEffect(() => {
    if (formData === lastExternalRef.current) {
      return
    }
    lastExternalRef.current = formData
    const assessed = assessFeeFieldIncomingValue(formData, feeRuleId, contextRevision)
    if (assessed.kind === 'current') {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setUiState(baseUiState(configOk, revisionOk, Boolean(adapter)))
    }
  }, [formData, feeRuleId, contextRevision, adapter, configOk, revisionOk])

  // Primary compute effect — locale intentionally omitted; deps are stable primitives.
  useEffect(() => {
    const adapterPresent = Boolean(adapter)

    if (incomingKind === 'current') {
      setUiState(baseUiState(configOk, revisionOk, adapterPresent))
      return
    }

    if (!configOk || !revisionOk || !adapterPresent || !adapter) {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setUiState(baseUiState(configOk, revisionOk, adapterPresent))
      return
    }

    if (isDisabled || isReadOnly) {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setUiState('idle')
      return
    }

    // Primitive guards preserve narrowing without depending on resolution objects.
    if (typeof feeRuleId !== 'string' || typeof contextRevision !== 'string') {
      return
    }

    const requestedRule = feeRuleId
    const requestedRevision = contextRevision
    const activeAdapter = adapter

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    setUiState('calculating')

    void (async () => {
      // Defer one microtask so StrictMode setup→cleanup→setup can cancel the first invoke.
      await Promise.resolve()
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      try {
        const result = await activeAdapter.computeFee({
          fieldId,
          feeRuleId: requestedRule,
          contextRevision: requestedRevision,
          signal: controller.signal,
        })
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        const accepted = acceptFeeComputationResult(result, {
          feeRuleId: requestedRule,
          contextRevision: requestedRevision,
        })
        if (!accepted) {
          setUiState('failed')
          return
        }
        const emitted = emitFeeFieldValue(accepted)
        if (!emitted) {
          setUiState('failed')
          return
        }
        lastExternalRef.current = emitted
        onChangeRef.current(emitted)
        setUiState('idle')
      } catch {
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        setUiState('failed')
      }
    })()

    return () => {
      controller.abort()
      if (requestSeq.current === seq) {
        requestSeq.current += 1
      }
    }
  }, [
    incomingKind,
    feeRuleId,
    contextRevision,
    adapter,
    configOk,
    revisionOk,
    isDisabled,
    isReadOnly,
    fieldId,
    retryNonce,
  ])

  function handleRetry() {
    if (isDisabled || isReadOnly || currentQuote || !adapter) {
      return
    }
    setRetryNonce((n) => n + 1)
  }

  const amountId = `${id}__fee-amount`
  const statusId = `${id}__fee-status`
  const currencyHintId = `${id}__fee-currency`
  const labelId = `${id}__label`

  const politeStatus =
    uiState === 'calculating'
      ? chrome.message('feeCalculating')
      : uiState === 'unavailable-adapter'
        ? chrome.message('feeComputationUnavailable')
        : uiState === 'unavailable-revision'
          ? chrome.message('feeContextUnavailable')
          : currentQuote
            ? chrome.message('feeComputed')
            : ''

  const alertMessages = [
    ...chrome.errorMessages,
    ...(uiState === 'invalid-config' ? [chrome.message('feeConfigInvalid')] : []),
    ...(malformedIncoming ? [chrome.message('feeInvalidValue')] : []),
    ...(uiState === 'failed' ? [chrome.message('feeComputationFailed')] : []),
  ]
  const uniqueAlerts = [...new Set(alertMessages)]
  const hasError = uniqueAlerts.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy =
    [chrome.helpId, currencyHintId, politeStatus ? statusId : undefined, errorId]
      .filter(Boolean)
      .join(' ') || undefined

  const showRetry =
    uiState === 'failed' && !isDisabled && !isReadOnly && !currentQuote && Boolean(adapter)

  const displayAmount =
    currentQuote !== undefined ? formatFeeAmountInr(currentQuote.amountMinor, locale) : null

  return (
    <div
      className="dg20-field"
      lang={chrome.lang}
      data-dg20-widget="fee-field"
      aria-describedby={describedBy}
      aria-invalid={hasError || undefined}
    >
      <div className="dg20-label" id={labelId}>
        <span>{chrome.label.text}</span>
      </div>
      {chrome.help.text ? (
        <p className="dg20-help" id={chrome.helpId}>
          {chrome.help.text}
        </p>
      ) : null}

      <p className="dg20-help" id={currencyHintId}>
        {chrome.message('amountInInr')}
      </p>

      <p
        className="dg20-mask-value"
        id={amountId}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        data-dg20-fee-amount=""
      >
        {displayAmount ?? chrome.message('feeAmountUnavailable')}
      </p>

      {showRetry ? (
        <div className="dg20-action-row">
          <button type="button" className="dg20-button" onClick={handleRetry}>
            {chrome.message('retry')}
          </button>
        </div>
      ) : null}

      {politeStatus ? (
        <p className="dg20-status" id={statusId} role="status" aria-live="polite">
          {politeStatus}
        </p>
      ) : null}
      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {uniqueAlerts.join(' ')}
        </p>
      ) : null}
    </div>
  )
}
