import { useEffect, useId, useRef } from 'react'

import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

export interface CloneVersionConfirmDialogProps {
  readonly locale: BuilderLocale
  readonly serviceId: string
  readonly sourceVersion: number
  readonly sourceStatus: 'published' | 'retired'
  readonly canConfirm: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function CloneVersionConfirmDialog({
  locale,
  serviceId,
  sourceVersion,
  sourceStatus,
  canConfirm,
  onConfirm,
  onCancel,
}: CloneVersionConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (canConfirm) {
        confirmRef.current?.focus()
      } else {
        cancelRef.current?.focus()
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [canConfirm])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current
        ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
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
        data-testid="clone-confirm-dialog"
      >
        <h2 id={titleId} className="dg20-builder-configured-add__title">
          {builderMessage(locale, 'cloneConfirmTitle')}
        </h2>
        <div id={descriptionId} className="dg20-builder-configured-add__body">
          <p>
            {serviceId} · v{sourceVersion} ·{' '}
            {builderMessage(
              locale,
              `status${sourceStatus[0]!.toUpperCase()}${sourceStatus.slice(1)}` as
                'statusPublished' | 'statusRetired',
            )}
          </p>
          <p>{builderMessage(locale, 'cloneConfirmBody')}</p>
          <p>{builderMessage(locale, 'cloneConfirmNewVersion')}</p>
          <p>{builderMessage(locale, 'cloneConfirmSourceUnchanged')}</p>
          <p>{builderMessage(locale, 'cloneConfirmNotAuth')}</p>
        </div>
        <div className="dg20-builder-configured-add__actions">
          <button
            ref={confirmRef}
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="clone-confirm-confirm"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {builderMessage(locale, 'cloneConfirmConfirm')}
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="clone-confirm-cancel"
            onClick={onCancel}
          >
            {builderMessage(locale, 'cloneConfirmCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
