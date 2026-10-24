import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** Stored bilingual full-name value (EN + GU transliteration pair). */
export interface FullNameValue {
  readonly en: string
  readonly gu: string
}

function asFullNameValue(value: unknown): FullNameValue {
  if (typeof value === 'object' && value !== null) {
    const record = value as { en?: unknown; gu?: unknown }
    return {
      en: typeof record.en === 'string' ? record.en : '',
      gu: typeof record.gu === 'string' ? record.gu : '',
    }
  }
  return { en: '', gu: '' }
}

function emitValue(en: string, gu: string): FullNameValue | undefined {
  if (en.length === 0 && gu.length === 0) {
    return undefined
  }
  return { en, gu }
}

function samePair(a: FullNameValue, b: FullNameValue): boolean {
  return a.en === b.en && a.gu === b.gu
}

/**
 * Full name as EN + GU pair. Registered as an RJSF field (object schemas).
 * Transliteration is explicit and never silent-overwrite.
 *
 * FB-D5.1.1: local snapshot state drives the inputs and sibling emissions so rapid
 * controlled typing cannot lose the other language when host formData lags.
 */
export function FullNameWidget(props: Dg20FieldProps) {
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

  const current = asFullNameValue(formData)
  const currentEn = current.en
  const currentGu = current.gu
  const adapter = chrome.runtime.services?.nameTransliteration
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'unavailable' | 'error' | 'suggestion'>('idle')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [enText, setEnText] = useState(currentEn)
  const [guText, setGuText] = useState(currentGu)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const enSnapshot = useRef(currentEn)
  const guSnapshot = useRef(currentGu)
  const pendingEcho = useRef<FullNameValue | null>(null)
  const currentRef = useRef(current)
  currentRef.current = current
  const statusId = `${id}__name-status`
  const enId = `${id}__en`
  const guId = `${id}__gu`

  useEffect(() => {
    const host = { en: currentEn, gu: currentGu }
    const pending = pendingEcho.current
    if (pending !== null) {
      if (samePair(pending, host)) {
        pendingEcho.current = null
        enSnapshot.current = currentEn
        guSnapshot.current = currentGu
        return
      }
      // Host has not echoed the latest local emission yet — keep snapshots/UI.
      return
    }
    if (currentEn === enSnapshot.current && currentGu === guSnapshot.current) {
      return
    }
    // Authoritative external formData (no in-flight local emission).
    enSnapshot.current = currentEn
    guSnapshot.current = currentGu
    setEnText(currentEn)
    setGuText(currentGu)
  }, [currentEn, currentGu])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const latest = currentRef.current
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingEcho.current = null
    enSnapshot.current = latest.en
    guSnapshot.current = latest.gu
    setEnText(latest.en)
    setGuText(latest.gu)
    setBusy(false)
    setSuggestion(null)
    setStatus((previous) => (previous === 'unavailable' ? previous : 'idle'))
  }, [chrome.instanceFieldId])

  function cancelActiveTransliteration() {
    const hadActiveRequest = abortRef.current !== null
    abortRef.current?.abort()
    abortRef.current = null
    if (hadActiveRequest) {
      requestSeq.current += 1
    }
    if (!hadActiveRequest && !busy && suggestion === null && status !== 'error') {
      return
    }
    setBusy(false)
    setSuggestion(null)
    setStatus((previous) => (previous === 'unavailable' ? previous : 'idle'))
  }

  function update(en: string, gu: string) {
    enSnapshot.current = en
    guSnapshot.current = gu
    setEnText(en)
    setGuText(gu)
    const emitted = emitValue(en, gu)
    pendingEcho.current = { en, gu }
    onChange(emitted)
  }

  function handleEn(event: ChangeEvent<HTMLInputElement>) {
    cancelActiveTransliteration()
    // Use gu snapshot — `current` can lag behind rapid controlled emissions (FB-D5.1.1).
    update(event.target.value, guSnapshot.current)
  }

  function handleGu(event: ChangeEvent<HTMLInputElement>) {
    cancelActiveTransliteration()
    update(enSnapshot.current, event.target.value)
  }

  async function requestTransliteration() {
    const latestEn = enSnapshot.current
    if (!adapter || isDisabled || isReadOnly || latestEn.trim().length === 0) {
      if (!adapter) {
        setStatus('unavailable')
      }
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const requestedEn = latestEn
    setBusy(true)
    setStatus('idle')
    setSuggestion(null)

    try {
      const result = await adapter.transliterateEnglishToGujarati({
        fieldId: chrome.instanceFieldId,
        englishName: requestedEn,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      if (enSnapshot.current !== requestedEn) {
        return
      }
      const suggested = result.gujaratiSuggested
      if (guSnapshot.current.trim().length === 0) {
        update(enSnapshot.current, suggested)
        setStatus('idle')
      } else {
        setSuggestion(suggested)
        setStatus('suggestion')
      }
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      setStatus('error')
    } finally {
      if (seq === requestSeq.current) {
        setBusy(false)
      }
    }
  }

  function applySuggestion() {
    if (suggestion === null) {
      return
    }
    update(enSnapshot.current, suggestion)
    setSuggestion(null)
    setStatus('idle')
  }

  const showBusyStatus = busy
  const showUnavailable = !adapter
  const showError = status === 'error'
  const showSuggestion = status === 'suggestion' && suggestion !== null
  const statusDescribed =
    showBusyStatus || showUnavailable || showError || showSuggestion ? statusId : undefined

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="full-name"
      aria-describedby={
        [chrome.describedBy, statusDescribed].filter(Boolean).join(' ') || undefined
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

      <div className="dg20-name-grid">
        <div className="dg20-name-part" lang="en">
          <label className="dg20-sublabel" htmlFor={enId}>
            {chrome.message('fullNameEnglish')}
          </label>
          <input
            id={enId}
            name={`${name}.en`}
            type="text"
            className="dg20-control"
            value={enText}
            required={Boolean(required)}
            disabled={isDisabled}
            readOnly={isReadOnly}
            autoComplete="name"
            onChange={handleEn}
          />
        </div>
        <div className="dg20-name-part" lang="gu">
          <label className="dg20-sublabel" htmlFor={guId}>
            {chrome.message('fullNameGujarati')}
          </label>
          <input
            id={guId}
            name={`${name}.gu`}
            type="text"
            className="dg20-control"
            value={guText}
            required={Boolean(required)}
            disabled={isDisabled}
            readOnly={isReadOnly}
            onChange={handleGu}
          />
        </div>
      </div>

      <div className="dg20-action-row">
        <button
          type="button"
          className="dg20-button"
          disabled={isDisabled || isReadOnly || busy || enText.trim().length === 0 || !adapter}
          onClick={() => {
            void requestTransliteration()
          }}
        >
          {chrome.message('transliterateToGujarati')}
        </button>
        {showBusyStatus ? (
          <p className="dg20-status" id={statusId} role="status" aria-live="polite">
            {chrome.message('transliterationInProgress')}
          </p>
        ) : null}
        {showUnavailable && !showBusyStatus ? (
          <p className="dg20-status" id={statusId} role="status">
            {chrome.message('adapterUnavailable')}
          </p>
        ) : null}
        {showError && !showBusyStatus ? (
          <p className="dg20-status" id={statusId} role="status" aria-live="polite">
            {chrome.message('operationFailed')}
          </p>
        ) : null}
        {showSuggestion && !showBusyStatus ? (
          <div className="dg20-suggestion" id={statusId} role="status" aria-live="polite">
            <p className="dg20-help">{suggestion}</p>
            <button type="button" className="dg20-button" onClick={applySuggestion}>
              {chrome.message('applyTransliteration')}
            </button>
            <button
              type="button"
              className="dg20-button dg20-button-secondary"
              onClick={() => {
                setSuggestion(null)
                setStatus('idle')
              }}
            >
              {chrome.message('dismissSuggestion')}
            </button>
          </div>
        ) : null}
      </div>

      {chrome.hasError ? (
        <p className="dg20-error" id={chrome.errorId} role="alert">
          {chrome.errorMessages.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}
