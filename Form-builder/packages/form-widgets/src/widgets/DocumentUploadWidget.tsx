import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  acceptCleanFileStorageResult,
  documentUploadConfigFingerprint,
  parseStoredDocumentReference,
  precheckFileAgainstPolicy,
  resolveDocumentUploadConfig,
} from '../runtime/file-storage.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** Document reference metadata only — never File/Blob/bytes. */
export interface DocumentReferenceValue {
  readonly objectRef: string
  readonly fileName: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly scanStatus: 'CLEAN'
}

type UploadState =
  | 'idle'
  | 'ready'
  | 'uploading'
  | 'unavailable'
  | 'invalid-config'
  | 'rejected'
  | 'failed'
  | 'local-mime'
  | 'local-size'

function baseState(
  configOk: boolean,
  adapterPresent: boolean,
): Extract<UploadState, 'idle' | 'unavailable' | 'invalid-config'> {
  if (!configOk) {
    return 'invalid-config'
  }
  if (!adapterPresent) {
    return 'unavailable'
  }
  return 'idle'
}

/**
 * Type/size-gated document upload via host FileStorageAdapter.
 * Emits object-store reference metadata only; never stores file bytes.
 */
export function DocumentUploadWidget(props: Dg20FieldProps) {
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

  const extensions = parseDg20Extensions(schema)
  const config = resolveDocumentUploadConfig({
    allowedMimeTypes: extensions.allowedMimeTypes,
    maxFileSizeBytes: extensions.maxFileSizeBytes,
  })
  const configFingerprint = documentUploadConfigFingerprint(config)

  const stored = config.ok
    ? parseStoredDocumentReference(formData, {
        allowedMimeTypes: config.allowedMimeTypes,
        maxFileSizeBytes: config.maxFileSizeBytes,
      })
    : undefined
  const adapter = chrome.runtime.services?.fileStorage
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const selectedFileRef = useRef<File | null>(null)

  const [hasSelection, setHasSelection] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>(() =>
    baseState(config.ok, Boolean(adapter)),
  )

  const inputId = `${id}__file`
  const statusId = `${id}__doc-status`

  function clearTransientSelection() {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    selectedFileRef.current = null
    setHasSelection(false)
    setSelectedLabel('')
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      selectedFileRef.current = null
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    clearTransientSelection()
    setUploadState(baseState(config.ok, Boolean(adapter)))
    // configFingerprint captures effective policy; config.ok is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional lifecycle key
  }, [adapter, configFingerprint, chrome.instanceFieldId])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isDisabled || isReadOnly || !config.ok) {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    const file = event.target.files?.[0]
    if (!file) {
      clearTransientSelection()
      setUploadState(baseState(true, Boolean(adapter)))
      return
    }
    const precheck = precheckFileAgainstPolicy(
      file,
      config.allowedMimeTypes,
      config.maxFileSizeBytes,
    )
    if (!precheck.ok) {
      clearTransientSelection()
      setUploadState(precheck.reason === 'mime' ? 'local-mime' : 'local-size')
      return
    }
    selectedFileRef.current = file
    setHasSelection(true)
    setSelectedLabel(file.name)
    setUploadState(adapter ? 'ready' : 'unavailable')
  }

  async function handleUpload() {
    if (isDisabled || isReadOnly || !config.ok || !adapter) {
      return
    }
    const file = selectedFileRef.current
    if (!file) {
      return
    }
    const precheck = precheckFileAgainstPolicy(
      file,
      config.allowedMimeTypes,
      config.maxFileSizeBytes,
    )
    if (!precheck.ok) {
      clearTransientSelection()
      setUploadState(precheck.reason === 'mime' ? 'local-mime' : 'local-size')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    setUploadState('uploading')

    try {
      const result = await adapter.storeFile({
        fieldId: chrome.instanceFieldId,
        purpose: 'DOCUMENT',
        file,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      clearTransientSelection()
      const accepted = acceptCleanFileStorageResult(result, {
        allowedMimeTypes: config.allowedMimeTypes,
        maxFileSizeBytes: config.maxFileSizeBytes,
        selectedFile: { type: file.type, size: file.size },
      })
      if (!accepted) {
        setUploadState(result.status === 'REJECTED' ? 'rejected' : 'failed')
        return
      }
      onChange({
        objectRef: accepted.objectRef,
        fileName: file.name,
        mimeType: accepted.mimeType,
        sizeBytes: accepted.sizeBytes,
        scanStatus: 'CLEAN',
      } satisfies DocumentReferenceValue)
      setUploadState('idle')
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      clearTransientSelection()
      setUploadState('failed')
    }
  }

  function handleRemove() {
    if (isDisabled || isReadOnly) {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    clearTransientSelection()
    onChange(undefined)
    setUploadState(baseState(config.ok, Boolean(adapter)))
  }

  const statusText =
    uploadState === 'uploading'
      ? chrome.message('docUploading')
      : uploadState === 'unavailable'
        ? chrome.message('docUploadUnavailable')
        : uploadState === 'invalid-config'
          ? chrome.message('docUploadConfigInvalid')
          : uploadState === 'rejected'
            ? chrome.message('docUploadRejected')
            : uploadState === 'failed'
              ? chrome.message('operationFailed')
              : uploadState === 'local-mime'
                ? chrome.message('docUploadMimeRejected')
                : uploadState === 'local-size'
                  ? chrome.message('docUploadSizeRejected')
                  : uploadState === 'ready'
                    ? chrome.message('docUploadReady')
                    : ''

  const displayErrors = [...chrome.errorMessages]
  const showConfigError = uploadState === 'invalid-config'
  const hasError = displayErrors.length > 0 || showConfigError
  const errorId = hasError ? `${id}__error` : undefined
  const acceptAttr = config.ok ? config.allowedMimeTypes.join(',') : undefined

  return (
    <div className="dg20-field" lang={chrome.lang} data-dg20-widget="doc-upload">
      <label className="dg20-label" htmlFor={stored || isReadOnly ? undefined : inputId}>
        <span>{chrome.label.text}</span>
        {required ? (
          <span className="dg20-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {chrome.help.text ? (
        <p className="dg20-help" id={chrome.helpId}>
          {chrome.help.text}
        </p>
      ) : null}

      {stored ? (
        <div className="dg20-help" data-dg20-doc-reference="">
          <p>{chrome.message('docUploadedLabel', { fileName: stored.fileName })}</p>
          {!isReadOnly && !isDisabled ? (
            <button
              type="button"
              className="dg20-button dg20-button-secondary"
              onClick={handleRemove}
            >
              {chrome.message('docReplaceRemove')}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {!isReadOnly ? (
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              className="dg20-control"
              accept={acceptAttr}
              disabled={isDisabled || !config.ok || !adapter || uploadState === 'uploading'}
              aria-invalid={hasError || undefined}
              aria-describedby={
                [chrome.describedBy, statusText ? statusId : undefined, errorId]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onChange={handleFileChange}
            />
          ) : null}
          {selectedLabel ? <p className="dg20-help">{selectedLabel}</p> : null}
          <div className="dg20-action-row">
            {!isReadOnly && !isDisabled && config.ok && adapter ? (
              <button
                type="button"
                className="dg20-button"
                disabled={uploadState !== 'ready' || !hasSelection}
                onClick={() => {
                  void handleUpload()
                }}
              >
                {chrome.message('docUploadAction')}
              </button>
            ) : null}
          </div>
        </>
      )}

      {statusText ? (
        <p className="dg20-status" id={statusId} role="status" aria-live="polite">
          {statusText}
        </p>
      ) : null}
      {showConfigError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {chrome.message('docUploadConfigInvalid')}
        </p>
      ) : null}
      {!showConfigError && displayErrors.length > 0 ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}
