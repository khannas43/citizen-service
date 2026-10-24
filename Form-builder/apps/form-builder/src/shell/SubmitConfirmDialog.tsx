import { useEffect, useId, useRef } from 'react'

import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

export interface SubmitConfirmDialogProps {
  readonly locale: BuilderLocale
  readonly serviceId: string
  readonly version: number
  readonly warningCount: number
  readonly infoCount: number
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function SubmitConfirmDialog({
  locale,
  serviceId,
  version,
  warningCount,
  infoCount,
  onConfirm,
  onCancel,
}: SubmitConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      const focusable = dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        : []
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div className="dg20-builder-configured-add-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="dg20-builder-configured-add"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="submit-confirm-dialog"
      >
        <h2 id={titleId} className="dg20-builder-configured-add__title">
          {builderMessage(locale, 'submitConfirmTitle')}
        </h2>
        <div id={descriptionId} className="dg20-builder-configured-add__body">
          <p>
            {serviceId} · v{version} · draft → submitted
          </p>
          <p>{builderMessage(locale, 'submitConfirmBody')}</p>
          <p>{builderMessage(locale, 'submitConfirmNonEditableWarning')}</p>
          <p>{builderMessage(locale, 'submitConfirmNotAuthWarning')}</p>
          {(warningCount > 0 || infoCount > 0) && (
            <p>
              {builderMessage(locale, 'submitConfirmAdvisories', {
                warnings: warningCount,
                infos: infoCount,
              })}
            </p>
          )}
        </div>
        <div className="dg20-builder-configured-add__actions">
          <button
            ref={confirmRef}
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="submit-confirm-confirm"
            onClick={onConfirm}
          >
            {builderMessage(locale, 'actionSubmitConfirm')}
          </button>
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="submit-confirm-cancel"
            onClick={onCancel}
          >
            {builderMessage(locale, 'actionSubmitCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
