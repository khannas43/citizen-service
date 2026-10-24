import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from 'react'

import { tryNormalizeDigitRun } from '../runtime/aadhaar-identifier.js'
import { isSafeChallengeId, isSafeVerificationRef } from '../runtime/opaque-reference.js'
import { isGovernedOtpLength, type OtpChannel } from '../runtime/service-ports.js'
import { parseDg20Extensions, resolveOtpChannels } from '../runtime/x-dg20.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** Stored mobile OTP verification value. OTP and challengeId are never stored. */
export interface MobileOtpValue {
  readonly mobileNumber: string
  readonly verified: boolean
  readonly verificationRef?: string
}

function asMobileOtpValue(value: unknown): MobileOtpValue | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as {
    mobileNumber?: unknown
    verified?: unknown
    verificationRef?: unknown
  }
  if (typeof record.mobileNumber !== 'string') {
    return undefined
  }
  if (typeof record.verified !== 'boolean') {
    return undefined
  }
  if (record.verificationRef !== undefined && typeof record.verificationRef !== 'string') {
    return undefined
  }
  if (record.verified) {
    if (typeof record.verificationRef !== 'string' || record.verificationRef.trim().length === 0) {
      return {
        mobileNumber: record.mobileNumber,
        verified: false,
      }
    }
    return {
      mobileNumber: record.mobileNumber,
      verified: true,
      verificationRef: record.verificationRef,
    }
  }
  return {
    mobileNumber: record.mobileNumber,
    verified: false,
  }
}

function isExactMobile(digits: string): boolean {
  return /^[0-9]{10}$/.test(digits)
}

function maskMobile(mobile: string): string {
  if (mobile.length < 4) {
    return '••••'
  }
  return `••••••${mobile.slice(-4)}`
}

function emitUnverified(mobile: string): MobileOtpValue | undefined {
  if (mobile.length === 0) {
    return undefined
  }
  return { mobileNumber: mobile, verified: false }
}

type SendState = 'idle' | 'sending' | 'sent' | 'error'
type VerifyState = 'idle' | 'verifying' | 'error'

/**
 * Mobile number with SMS OTP verification.
 * Challenge ID and OTP exist only in transient component / DOM state.
 */
export function MobileOtpWidget(props: Dg20FieldProps) {
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
  const channelResolution = resolveOtpChannels(extensions)
  const channels: readonly OtpChannel[] = channelResolution.ok ? channelResolution.channels : []
  const channelsInvalid = !channelResolution.ok

  const stored = asMobileOtpValue(formData)
  const mobileValue = stored?.mobileNumber ?? ''
  const verified = stored?.verified === true

  const adapter = chrome.runtime.services?.mobileOtp
  const isDisabled = Boolean(disabled || chrome.disabled || channelsInvalid)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const otpInputRef = useRef<HTMLInputElement | null>(null)
  const sendAbortRef = useRef<AbortController | null>(null)
  const verifyAbortRef = useRef<AbortController | null>(null)
  const sendSeq = useRef(0)
  const verifySeq = useRef(0)

  const [sendState, setSendState] = useState<SendState>('idle')
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [otpLength, setOtpLength] = useState<number | null>(null)
  const [otpEnteredLength, setOtpEnteredLength] = useState(0)
  const [mobileLocalInvalid, setMobileLocalInvalid] = useState(false)
  const [otpLocalInvalid, setOtpLocalInvalid] = useState(false)

  const mobileId = `${id}__mobile`
  const otpId = `${id}__otp`
  const statusId = `${id}__otp-status`

  function clearOtpDom() {
    if (otpInputRef.current) {
      otpInputRef.current.value = ''
    }
    setOtpEnteredLength(0)
    setOtpLocalInvalid(false)
  }

  function abortAll() {
    sendAbortRef.current?.abort()
    sendAbortRef.current = null
    verifyAbortRef.current?.abort()
    verifyAbortRef.current = null
    sendSeq.current += 1
    verifySeq.current += 1
  }

  useEffect(() => {
    return () => {
      sendAbortRef.current?.abort()
      verifyAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    sendAbortRef.current?.abort()
    sendAbortRef.current = null
    verifyAbortRef.current?.abort()
    verifyAbortRef.current = null
    sendSeq.current += 1
    verifySeq.current += 1
    setChallengeId(null)
    setOtpLength(null)
    if (otpInputRef.current) {
      otpInputRef.current.value = ''
    }
    setOtpEnteredLength(0)
    setOtpLocalInvalid(false)
    setSendState('idle')
    setVerifyState('idle')
  }, [adapter, chrome.instanceFieldId])

  function handleMobileChange(event: ChangeEvent<HTMLInputElement>) {
    const normalized = tryNormalizeDigitRun(event.target.value, 10)
    if (!normalized.ok) {
      setMobileLocalInvalid(true)
      return
    }
    abortAll()
    setChallengeId(null)
    setOtpLength(null)
    clearOtpDom()
    setSendState('idle')
    setVerifyState('idle')
    setMobileLocalInvalid(false)
    onChange(emitUnverified(normalized.digits))
  }

  function handleMobilePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const normalized = tryNormalizeDigitRun(event.clipboardData.getData('text'), 10)
    if (!normalized.ok) {
      setMobileLocalInvalid(true)
      return
    }
    abortAll()
    setChallengeId(null)
    setOtpLength(null)
    clearOtpDom()
    setSendState('idle')
    setVerifyState('idle')
    setMobileLocalInvalid(false)
    onChange(emitUnverified(normalized.digits))
  }

  function syncOtpLengthFromDom() {
    setOtpEnteredLength(otpInputRef.current?.value.length ?? 0)
  }

  function handleOtpInput(event: FormEvent<HTMLInputElement>) {
    const el = event.currentTarget
    const normalized = tryNormalizeDigitRun(el.value, otpLength ?? 8)
    if (!normalized.ok) {
      el.value = ''
      setOtpEnteredLength(0)
      setOtpLocalInvalid(true)
      return
    }
    if (el.value !== normalized.digits) {
      el.value = normalized.digits
    }
    setOtpLocalInvalid(false)
    setOtpEnteredLength(normalized.digits.length)
  }

  function handleOtpPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const normalized = tryNormalizeDigitRun(event.clipboardData.getData('text'), otpLength ?? 8)
    if (!normalized.ok) {
      if (otpInputRef.current) {
        otpInputRef.current.value = ''
      }
      setOtpEnteredLength(0)
      setOtpLocalInvalid(true)
      return
    }
    if (otpInputRef.current) {
      otpInputRef.current.value = normalized.digits
    }
    setOtpLocalInvalid(false)
    setOtpEnteredLength(normalized.digits.length)
  }

  async function sendOtp(isResend: boolean) {
    if (
      !adapter ||
      isDisabled ||
      isReadOnly ||
      sendState === 'sending' ||
      verifyState === 'verifying'
    ) {
      return
    }
    if (!isExactMobile(mobileValue)) {
      setMobileLocalInvalid(true)
      return
    }

    sendAbortRef.current?.abort()
    verifyAbortRef.current?.abort()
    verifyAbortRef.current = null
    verifySeq.current += 1
    if (isResend) {
      setChallengeId(null)
      clearOtpDom()
      setVerifyState('idle')
    }

    const controller = new AbortController()
    sendAbortRef.current = controller
    const seq = ++sendSeq.current
    const requestedMobile = mobileValue
    setSendState('sending')
    setMobileLocalInvalid(false)

    try {
      const result = await adapter.sendOtp({
        fieldId: chrome.instanceFieldId,
        mobileNumber: requestedMobile,
        channels,
        signal: controller.signal,
      })
      if (seq !== sendSeq.current || controller.signal.aborted) {
        return
      }
      if (
        !isSafeChallengeId(result.challengeId, requestedMobile) ||
        !isGovernedOtpLength(result.otpLength)
      ) {
        setSendState('error')
        clearOtpDom()
        return
      }
      setChallengeId(result.challengeId)
      setOtpLength(result.otpLength)
      clearOtpDom()
      setSendState('sent')
    } catch {
      if (seq !== sendSeq.current || controller.signal.aborted) {
        return
      }
      setSendState('error')
      clearOtpDom()
    }
  }

  async function verifyOtp() {
    if (
      !adapter ||
      isDisabled ||
      isReadOnly ||
      challengeId === null ||
      otpLength === null ||
      verifyState === 'verifying' ||
      sendState === 'sending'
    ) {
      return
    }
    const otp = otpInputRef.current?.value ?? ''
    if (otp.length !== otpLength || !/^[0-9]+$/.test(otp)) {
      setOtpLocalInvalid(true)
      clearOtpDom()
      return
    }

    verifyAbortRef.current?.abort()
    const controller = new AbortController()
    verifyAbortRef.current = controller
    const seq = ++verifySeq.current
    const requestedMobile = mobileValue
    const requestedChallenge = challengeId
    setVerifyState('verifying')

    try {
      const result = await adapter.verifyOtp({
        fieldId: chrome.instanceFieldId,
        mobileNumber: requestedMobile,
        challengeId: requestedChallenge,
        otp,
        signal: controller.signal,
      })
      clearOtpDom()
      if (seq !== verifySeq.current || controller.signal.aborted) {
        return
      }
      if (
        !isSafeVerificationRef(result.verificationRef, requestedMobile, requestedChallenge, otp)
      ) {
        setVerifyState('error')
        return
      }
      onChange({
        mobileNumber: requestedMobile,
        verified: true,
        verificationRef: result.verificationRef,
      } satisfies MobileOtpValue)
      setChallengeId(null)
      setOtpLength(null)
      setSendState('idle')
      setVerifyState('idle')
    } catch {
      clearOtpDom()
      if (seq !== verifySeq.current || controller.signal.aborted) {
        return
      }
      setVerifyState('error')
    }
  }

  const showOtpUi = challengeId !== null && otpLength !== null && !verified
  const canSend =
    Boolean(adapter) &&
    !isDisabled &&
    !isReadOnly &&
    isExactMobile(mobileValue) &&
    sendState !== 'sending' &&
    verifyState !== 'verifying'
  const canVerify =
    Boolean(adapter) &&
    !isDisabled &&
    !isReadOnly &&
    showOtpUi &&
    otpLength !== null &&
    otpEnteredLength === otpLength &&
    !otpLocalInvalid &&
    verifyState !== 'verifying' &&
    sendState !== 'sending'

  const statusText = channelsInvalid
    ? chrome.message('otpChannelsInvalid')
    : !adapter
      ? chrome.message('mobileOtpUnavailable')
      : sendState === 'sending'
        ? chrome.message('mobileOtpSending')
        : verifyState === 'verifying'
          ? chrome.message('mobileOtpVerifying')
          : sendState === 'error' || verifyState === 'error'
            ? chrome.message('operationFailed')
            : sendState === 'sent' && showOtpUi
              ? chrome.message('mobileOtpSent', { maskedMobile: maskMobile(mobileValue) })
              : verified
                ? chrome.message('mobileOtpVerified')
                : ''

  const validationError = mobileLocalInvalid
    ? chrome.message('mobileInvalidNumber')
    : otpLocalInvalid
      ? chrome.message('mobileOtpInvalidCharacters')
      : ''
  const displayErrors = [
    ...(channelsInvalid ? [chrome.message('otpChannelsInvalid')] : []),
    ...(validationError ? [validationError] : []),
    ...chrome.errorMessages,
  ].filter((msg, index, arr) => arr.indexOf(msg) === index)
  const hasError = displayErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined

  if (isReadOnly) {
    return (
      <fieldset
        className="dg20-field dg20-fieldset"
        lang={chrome.lang}
        disabled={isDisabled}
        data-dg20-widget="mobile-otp"
        aria-describedby={
          [chrome.describedBy, statusId, errorId].filter(Boolean).join(' ') || undefined
        }
      >
        <legend className="dg20-label">
          <span>{chrome.label.text}</span>
          {required ? (
            <span className="dg20-required" aria-hidden="true">
              *
            </span>
          ) : null}
        </legend>
        <p className="dg20-mask" id={statusId}>
          <span className="dg20-help">{chrome.message('mobileMaskedLabel')}</span>
          <span className="dg20-mask-value">{mobileValue ? maskMobile(mobileValue) : '—'}</span>
          <span className="dg20-help">
            {verified
              ? chrome.message('mobileOtpVerified')
              : chrome.message('mobileUnverifiedStatus')}
          </span>
        </p>
        {hasError ? (
          <p className="dg20-error" id={errorId} role="alert">
            {displayErrors.join(' ')}
          </p>
        ) : null}
      </fieldset>
    )
  }

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="mobile-otp"
      aria-describedby={
        [chrome.describedBy, statusText ? statusId : undefined, errorId]
          .filter(Boolean)
          .join(' ') || undefined
      }
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

      <label className="dg20-sublabel" htmlFor={mobileId}>
        {chrome.message('mobileMaskedLabel')}
      </label>
      <input
        id={mobileId}
        name={`${name}.mobileNumber`}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        className="dg20-control"
        value={mobileValue}
        maxLength={10}
        required={Boolean(required)}
        disabled={isDisabled}
        aria-invalid={hasError || undefined}
        onChange={handleMobileChange}
        onPaste={handleMobilePaste}
      />

      <div className="dg20-action-row">
        {!adapter || channelsInvalid ? (
          <p className="dg20-status" id={statusId} role="status">
            {channelsInvalid
              ? chrome.message('otpChannelsInvalid')
              : chrome.message('mobileOtpUnavailable')}
          </p>
        ) : verified ? (
          <p className="dg20-status" id={statusId} role="status">
            {chrome.message('mobileOtpVerified')}
          </p>
        ) : (
          <>
            <button
              type="button"
              className="dg20-button"
              disabled={!canSend}
              onClick={() => {
                void sendOtp(showOtpUi)
              }}
            >
              {showOtpUi ? chrome.message('mobileResendOtp') : chrome.message('mobileSendOtp')}
            </button>
            {statusText ? (
              <p className="dg20-status" id={statusId} role="status" aria-live="polite">
                {statusText}
              </p>
            ) : null}
          </>
        )}
      </div>

      {showOtpUi && adapter && !channelsInvalid ? (
        <div className="dg20-otp-block">
          <label className="dg20-sublabel" htmlFor={otpId}>
            {chrome.message('mobileOtpInvalidLength', { length: otpLength })}
          </label>
          <input
            ref={otpInputRef}
            id={otpId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="dg20-control"
            maxLength={otpLength}
            disabled={isDisabled || verifyState === 'verifying'}
            data-dg20-otp-length={otpEnteredLength}
            aria-invalid={otpLocalInvalid || undefined}
            onInput={handleOtpInput}
            onPaste={handleOtpPaste}
            onFocus={syncOtpLengthFromDom}
          />
          <button
            type="button"
            className="dg20-button"
            disabled={!canVerify}
            onClick={() => {
              void verifyOtp()
            }}
          >
            {chrome.message('mobileVerifyOtp')}
          </button>
        </div>
      ) : null}

      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}
