import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
  PHOTO_CAPTURE_MAX_BYTES,
  PHOTO_CAPTURE_MAX_DIMENSION,
  PHOTO_CAPTURE_MIN_DIMENSION,
  acceptCleanFileStorageResult,
  parseStoredPhotoReference,
  precheckFileAgainstPolicy,
} from '../runtime/file-storage.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** Photo reference metadata only — never File/Blob/base64/object URLs. */
export interface PhotoReferenceValue {
  readonly objectRef: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly width: number
  readonly height: number
  readonly scanStatus: 'CLEAN'
}

type CaptureState =
  | 'idle'
  | 'ready'
  | 'uploading'
  | 'unavailable'
  | 'rejected'
  | 'failed'
  | 'local-mime'
  | 'local-size'

/**
 * Camera/upload photo capture via FileStorageAdapter (purpose PHOTO).
 * Provisional policy: JPEG/PNG, ≤5 MiB, 300–4096 px — requires confirmation.
 * No preview (avoids unreleased object URLs).
 */
export function PhotoCaptureWidget(props: Dg20FieldProps) {
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

  const stored = parseStoredPhotoReference(formData)
  const adapter = chrome.runtime.services?.fileStorage
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const selectedFileRef = useRef<File | null>(null)

  const [hasSelection, setHasSelection] = useState(false)
  const [captureState, setCaptureState] = useState<CaptureState>(() =>
    !adapter ? 'unavailable' : 'idle',
  )

  const inputId = `${id}__photo`
  const statusId = `${id}__photo-status`

  function clearTransientSelection() {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    selectedFileRef.current = null
    setHasSelection(false)
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
    setCaptureState(adapter ? 'idle' : 'unavailable')
  }, [adapter, chrome.instanceFieldId])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isDisabled || isReadOnly) {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    const file = event.target.files?.[0]
    if (!file) {
      clearTransientSelection()
      setCaptureState(adapter ? 'idle' : 'unavailable')
      return
    }
    const precheck = precheckFileAgainstPolicy(
      file,
      PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
      PHOTO_CAPTURE_MAX_BYTES,
    )
    if (!precheck.ok) {
      clearTransientSelection()
      setCaptureState(precheck.reason === 'mime' ? 'local-mime' : 'local-size')
      return
    }
    selectedFileRef.current = file
    setHasSelection(true)
    setCaptureState(adapter ? 'ready' : 'unavailable')
  }

  async function handleUpload() {
    if (isDisabled || isReadOnly || !adapter) {
      return
    }
    const file = selectedFileRef.current
    if (!file) {
      return
    }
    const precheck = precheckFileAgainstPolicy(
      file,
      PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
      PHOTO_CAPTURE_MAX_BYTES,
    )
    if (!precheck.ok) {
      clearTransientSelection()
      setCaptureState(precheck.reason === 'mime' ? 'local-mime' : 'local-size')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    setCaptureState('uploading')

    try {
      const result = await adapter.storeFile({
        fieldId: chrome.instanceFieldId,
        purpose: 'PHOTO',
        file,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      clearTransientSelection()
      const accepted = acceptCleanFileStorageResult(result, {
        allowedMimeTypes: PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
        maxFileSizeBytes: PHOTO_CAPTURE_MAX_BYTES,
        selectedFile: { type: file.type, size: file.size },
        requireDimensions: true,
        minDimension: PHOTO_CAPTURE_MIN_DIMENSION,
        maxDimension: PHOTO_CAPTURE_MAX_DIMENSION,
      })
      if (!accepted || accepted.width === undefined || accepted.height === undefined) {
        setCaptureState(result.status === 'REJECTED' ? 'rejected' : 'failed')
        return
      }
      onChange({
        objectRef: accepted.objectRef,
        mimeType: accepted.mimeType,
        sizeBytes: accepted.sizeBytes,
        width: accepted.width,
        height: accepted.height,
        scanStatus: 'CLEAN',
      } satisfies PhotoReferenceValue)
      setCaptureState('idle')
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      clearTransientSelection()
      setCaptureState('failed')
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
    setCaptureState(adapter ? 'idle' : 'unavailable')
  }

  const statusText =
    captureState === 'uploading'
      ? chrome.message('photoUploading')
      : captureState === 'unavailable'
        ? chrome.message('photoCaptureUnavailable')
        : captureState === 'rejected'
          ? chrome.message('photoCaptureRejected')
          : captureState === 'failed'
            ? chrome.message('operationFailed')
            : captureState === 'local-mime'
              ? chrome.message('photoMimeRejected')
              : captureState === 'local-size'
                ? chrome.message('photoSizeRejected')
                : captureState === 'ready'
                  ? chrome.message('photoCaptureReady')
                  : ''

  const displayErrors = [...chrome.errorMessages]
  const hasError = displayErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined

  return (
    <div className="dg20-field" lang={chrome.lang} data-dg20-widget="photo-capture">
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
        <div className="dg20-help" data-dg20-photo-reference="">
          <p>
            {chrome.message('photoCapturedLabel', {
              width: stored.width,
              height: stored.height,
            })}
          </p>
          {!isReadOnly && !isDisabled ? (
            <button
              type="button"
              className="dg20-button dg20-button-secondary"
              onClick={handleRemove}
            >
              {chrome.message('photoReplaceRemove')}
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
              accept="image/jpeg,image/png"
              capture="environment"
              disabled={isDisabled || !adapter || captureState === 'uploading'}
              aria-invalid={hasError || undefined}
              aria-describedby={
                [chrome.describedBy, statusText ? statusId : undefined, errorId]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onChange={handleFileChange}
            />
          ) : null}
          <div className="dg20-action-row">
            {!isReadOnly && !isDisabled && adapter ? (
              <button
                type="button"
                className="dg20-button"
                disabled={captureState !== 'ready' || !hasSelection}
                onClick={() => {
                  void handleUpload()
                }}
              >
                {chrome.message('photoUploadAction')}
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
      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}
