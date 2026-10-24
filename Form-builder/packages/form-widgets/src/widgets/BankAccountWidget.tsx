import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  acceptBankVerificationResult,
  assessBankAccountIncomingValue,
  emitBankAccountValue,
  formatBankAccountMask,
  isNonBlankAccountHolderName,
  isValidBankAccountNumberDigits,
  isValidBankIfsc,
  normalizeBankIfscInput,
  parseBankAccountNumberInput,
  type BankAccountValue,
} from '../runtime/bank-account.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

export type { BankAccountValue }

type VerifyUiState =
  'idle' | 'verifying' | 'verified' | 'mismatch' | 'unavailable' | 'failed' | 'invalid-input'

/**
 * Bank account composite with provisional v1 IFSC + account-name verification.
 * Account number input has no `name` (excluded from native FormData).
 * Host owns bank-provider HTTP via BankAccountVerificationAdapter.
 */
export function BankAccountWidget(props: Dg20FieldProps) {
  const { formData, required, disabled, readonly, onChange, schema, rawErrors, idSchema, name } =
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

  const adapter = chrome.runtime.services?.bankAccountVerification
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const incoming = assessBankAccountIncomingValue(formData)
  const malformedIncoming = incoming.kind === 'malformed'
  const stored = incoming.kind === 'present' ? incoming.value : undefined

  const [accountDigits, setAccountDigits] = useState(() => stored?.accountNumber ?? '')
  const [accountRaw, setAccountRaw] = useState(() => stored?.accountNumber ?? '')
  const [ifsc, setIfsc] = useState(() => stored?.ifsc ?? '')
  const [holderName, setHolderName] = useState(() => stored?.accountHolderName ?? '')
  const [accountCharInvalid, setAccountCharInvalid] = useState(false)
  const [verifyState, setVerifyState] = useState<VerifyUiState>(() => {
    if (stored?.verified) {
      return 'verified'
    }
    if (!adapter) {
      return 'unavailable'
    }
    return 'idle'
  })

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const lastExternalRef = useRef(formData)

  // Sync from external formData changes without emitting.
  useEffect(() => {
    if (formData === lastExternalRef.current) {
      return
    }
    lastExternalRef.current = formData
    const assessed = assessBankAccountIncomingValue(formData)
    if (assessed.kind === 'malformed') {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setAccountDigits('')
      setAccountRaw('')
      setIfsc('')
      setHolderName('')
      setAccountCharInvalid(false)
      setVerifyState(adapter ? 'idle' : 'unavailable')
      return
    }
    if (assessed.kind === 'unanswered') {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setAccountDigits('')
      setAccountRaw('')
      setIfsc('')
      setHolderName('')
      setAccountCharInvalid(false)
      setVerifyState(adapter ? 'idle' : 'unavailable')
      return
    }
    const next = assessed.value
    setAccountDigits(next.accountNumber ?? '')
    setAccountRaw(next.accountNumber ?? '')
    setIfsc(next.ifsc ?? '')
    setHolderName(next.accountHolderName ?? '')
    setAccountCharInvalid(false)
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    if (next.verified) {
      setVerifyState('verified')
    } else {
      setVerifyState(adapter ? 'idle' : 'unavailable')
    }
  }, [formData, adapter, chrome.instanceFieldId])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    setVerifyState((prev) => {
      // Persisted verified presentation survives adapter removal.
      if (prev === 'verified') {
        return 'verified'
      }
      if (prev === 'verifying') {
        return adapter ? 'idle' : 'unavailable'
      }
      if (!adapter) {
        return 'unavailable'
      }
      if (prev === 'unavailable') {
        return 'idle'
      }
      return prev
    })
  }, [adapter, chrome.instanceFieldId])

  useEffect(() => {
    if ((isDisabled || isReadOnly) && verifyState === 'verifying') {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setVerifyState(adapter ? 'idle' : 'unavailable')
    }
  }, [isDisabled, isReadOnly, verifyState, adapter])

  const accountLengthInvalid =
    accountDigits.length > 0 && !isValidBankAccountNumberDigits(accountDigits)
  const ifscInvalid = ifsc.length > 0 && !isValidBankIfsc(ifsc)
  const inputsValidForVerify =
    isValidBankAccountNumberDigits(accountDigits) &&
    isValidBankIfsc(ifsc) &&
    isNonBlankAccountHolderName(holderName) &&
    !accountCharInvalid

  const canVerify =
    Boolean(adapter) &&
    !isDisabled &&
    !isReadOnly &&
    inputsValidForVerify &&
    verifyState !== 'verifying'

  function emitDraft(next: {
    readonly accountNumber: string
    readonly ifsc: string
    readonly accountHolderName: string
  }) {
    const emitted = emitBankAccountValue({
      accountNumber: next.accountNumber,
      ifsc: next.ifsc,
      accountHolderName: next.accountHolderName,
      verified: false,
    })
    lastExternalRef.current = emitted
    onChange(emitted)
  }

  function clearVerificationAndEmit(next: {
    readonly accountNumber: string
    readonly ifsc: string
    readonly accountHolderName: string
  }) {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    setVerifyState(adapter ? 'idle' : 'unavailable')
    emitDraft(next)
  }

  function handleAccountChange(event: ChangeEvent<HTMLInputElement>) {
    if (isDisabled || isReadOnly) {
      return
    }
    const raw = event.target.value
    setAccountRaw(raw)
    const parsed = parseBankAccountNumberInput(raw)
    if (!parsed.ok) {
      // Keep last valid canonical digits; show rejected attempt in the password field.
      setAccountCharInvalid(true)
      clearVerificationAndEmit({
        accountNumber: accountDigits,
        ifsc,
        accountHolderName: holderName,
      })
      return
    }
    setAccountCharInvalid(false)
    setAccountDigits(parsed.digits)
    clearVerificationAndEmit({
      accountNumber: parsed.digits,
      ifsc,
      accountHolderName: holderName,
    })
  }

  function handleIfscChange(event: ChangeEvent<HTMLInputElement>) {
    if (isDisabled || isReadOnly) {
      return
    }
    const next = normalizeBankIfscInput(event.target.value)
    setIfsc(next)
    clearVerificationAndEmit({
      accountNumber: accountDigits,
      ifsc: next,
      accountHolderName: holderName,
    })
  }

  function handleHolderChange(event: ChangeEvent<HTMLInputElement>) {
    if (isDisabled || isReadOnly) {
      return
    }
    const next = event.target.value
    setHolderName(next)
    clearVerificationAndEmit({
      accountNumber: accountDigits,
      ifsc,
      accountHolderName: next,
    })
  }

  async function handleVerify() {
    if (!canVerify || !adapter) {
      if (!inputsValidForVerify) {
        setVerifyState('invalid-input')
      }
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const requestedAccount = accountDigits
    const requestedIfsc = ifsc
    const requestedNameRaw = holderName
    const requestedNameTrimmed = holderName.trim()
    setVerifyState('verifying')

    try {
      const result = await adapter.verifyAccountName({
        fieldId: chrome.instanceFieldId,
        accountNumber: requestedAccount,
        ifsc: requestedIfsc,
        accountHolderName: requestedNameTrimmed,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      if (!result.verified) {
        setVerifyState('mismatch')
        emitDraft({
          accountNumber: requestedAccount,
          ifsc: requestedIfsc,
          accountHolderName: requestedNameRaw,
        })
        return
      }
      // Validate ref against raw and trimmed holder name (helper checks both).
      const accepted = acceptBankVerificationResult(result, {
        accountNumber: requestedAccount,
        ifsc: requestedIfsc,
        accountHolderName: requestedNameRaw,
      })
      if (!accepted) {
        setVerifyState('failed')
        emitDraft({
          accountNumber: requestedAccount,
          ifsc: requestedIfsc,
          accountHolderName: requestedNameRaw,
        })
        return
      }
      const emitted = emitBankAccountValue({
        accountNumber: requestedAccount,
        ifsc: requestedIfsc,
        accountHolderName: requestedNameRaw,
        verified: true,
        verificationRef: accepted.verificationRef,
      })
      lastExternalRef.current = emitted
      onChange(emitted)
      setVerifyState('verified')
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      setVerifyState('failed')
    }
  }

  const accountLabelId = `${id}__account-label`
  const accountId = `${id}__account`
  const ifscId = `${id}__ifsc`
  const holderId = `${id}__holder`
  const statusId = `${id}__bank-status`

  const politeStatus =
    verifyState === 'verifying'
      ? chrome.message('bankVerifying')
      : verifyState === 'verified'
        ? chrome.message('bankVerified')
        : verifyState === 'unavailable'
          ? chrome.message('bankVerificationUnavailable')
          : ''

  const alertMessages = [
    ...chrome.errorMessages,
    ...(malformedIncoming ? [chrome.message('bankInvalidValue')] : []),
    ...(accountCharInvalid || accountLengthInvalid
      ? [chrome.message('bankAccountNumberInvalid')]
      : []),
    ...(ifscInvalid ? [chrome.message('bankIfscInvalid')] : []),
    ...(verifyState === 'invalid-input' ? [chrome.message('bankInvalidInput')] : []),
    ...(verifyState === 'mismatch' ? [chrome.message('bankVerificationMismatch')] : []),
    ...(verifyState === 'failed' ? [chrome.message('bankVerificationFailed')] : []),
  ]
  const uniqueAlerts = [...new Set(alertMessages)]
  const hasError = uniqueAlerts.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy =
    [chrome.helpId, politeStatus ? statusId : undefined, errorId].filter(Boolean).join(' ') ||
    undefined

  const actionIsRetry = verifyState === 'failed' || verifyState === 'mismatch'

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="bank-account"
      aria-describedby={describedBy}
      aria-invalid={hasError || undefined}
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

      <div className="dg20-name-part">
        <span className="dg20-sublabel" id={accountLabelId}>
          {chrome.message('bankAccountNumberLabel')}
        </span>
        {isReadOnly ? (
          <p
            className="dg20-help"
            id={accountId}
            data-dg20-bank-mask=""
            aria-labelledby={accountLabelId}
          >
            {accountDigits
              ? formatBankAccountMask(accountDigits)
              : chrome.message('bankAccountNumberUnavailable')}
          </p>
        ) : (
          <input
            id={accountId}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            className="dg20-control"
            value={accountRaw}
            disabled={isDisabled}
            aria-labelledby={accountLabelId}
            aria-invalid={accountCharInvalid || accountLengthInvalid || undefined}
            aria-describedby={describedBy}
            onChange={handleAccountChange}
          />
        )}
      </div>

      <div className="dg20-name-part">
        <label className="dg20-sublabel" htmlFor={ifscId}>
          {chrome.message('bankIfscLabel')}
        </label>
        <input
          id={ifscId}
          name={`${name}__ifsc`}
          type="text"
          className="dg20-control"
          value={ifsc}
          disabled={isDisabled}
          readOnly={isReadOnly}
          spellCheck={false}
          autoCapitalize="characters"
          aria-invalid={ifscInvalid || undefined}
          onChange={handleIfscChange}
        />
      </div>

      <div className="dg20-name-part">
        <label className="dg20-sublabel" htmlFor={holderId}>
          {chrome.message('bankAccountHolderLabel')}
        </label>
        <input
          id={holderId}
          name={`${name}__holder`}
          type="text"
          className="dg20-control"
          value={holderName}
          disabled={isDisabled}
          readOnly={isReadOnly}
          aria-invalid={undefined}
          onChange={handleHolderChange}
        />
      </div>

      {!isReadOnly && !isDisabled ? (
        <div className="dg20-action-row">
          <button
            type="button"
            className="dg20-button"
            disabled={!canVerify}
            onClick={() => {
              void handleVerify()
            }}
          >
            {actionIsRetry ? chrome.message('retry') : chrome.message('bankVerifyAction')}
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
    </fieldset>
  )
}
