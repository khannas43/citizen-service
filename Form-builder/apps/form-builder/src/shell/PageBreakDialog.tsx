import { useEffect, useId, useRef } from 'react'
import { getPaletteWidget } from '@citizen/form-widgets'

import type {
  PageBreakAddFocusControl,
  PageBreakBoundaryOption,
  PendingStructuralAdd,
  PendingStructuralAddFocusRequest,
  PendingStructuralAddPatch,
} from '../authoring/index.js'
import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

export interface PageBreakDialogProps {
  readonly locale: BuilderLocale
  readonly pending: PendingStructuralAdd
  readonly options: readonly PageBreakBoundaryOption[]
  readonly focusRequest: PendingStructuralAddFocusRequest | null
  readonly onPatch: (patch: PendingStructuralAddPatch) => void
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function listFocusable(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') {
      return false
    }
    if (el === document.activeElement) {
      return true
    }
    return (
      el.tabIndex >= 0 ||
      el.tagName === 'INPUT' ||
      el.tagName === 'BUTTON' ||
      el.tagName === 'SELECT'
    )
  })
}

/**
 * Accessible page-break → progressive-step boundary dialog (FB-D17).
 */
export function PageBreakDialog({
  locale,
  pending,
  options,
  focusRequest,
  onPatch,
  onConfirm,
  onCancel,
}: PageBreakDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const afterFieldIdInputId = useId()
  const nextStepLabelEnInputId = useId()
  const nextStepLabelGuInputId = useId()
  const afterFieldErrorId = useId()
  const labelEnErrorId = useId()
  const labelGuErrorId = useId()

  const dialogRef = useRef<HTMLDivElement>(null)
  const controlRefs = useRef<
    Partial<Record<PageBreakAddFocusControl, HTMLInputElement | HTMLSelectElement | null>>
  >({})
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  const palette = getPaletteWidget(pending.widgetType)
  const widgetLabel =
    locale === 'gu'
      ? (palette?.labelGu ?? pending.widgetType)
      : (palette?.labelEn ?? pending.widgetType)

  const invalid = pending.showValidation
  const focusRequestId = focusRequest?.requestId ?? null
  const focusControl = focusRequest?.control ?? null

  useEffect(() => {
    if (focusRequestId === null || focusControl === null) {
      return
    }
    const timer = window.setTimeout(() => {
      controlRefs.current[focusControl]?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [focusRequestId, focusControl])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancelRef.current()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const dialog = dialogRef.current
      if (dialog === null) {
        return
      }
      const focusable = listFocusable(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || active === null || !dialog.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || active === null || !dialog.contains(active)) {
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
        data-testid="page-break-dialog"
      >
        <h2 id={titleId} className="dg20-builder-configured-add__title">
          {builderMessage(locale, 'pageBreakDialogTitle', { label: widgetLabel })}
        </h2>
        <p id={descriptionId} className="dg20-builder-configured-add__body">
          {builderMessage(locale, 'pageBreakDialogGuidance')}
        </p>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={afterFieldIdInputId}>
            {builderMessage(locale, 'pageBreakAfterField')}
          </label>
          <select
            ref={(el) => {
              controlRefs.current.afterFieldId = el
            }}
            id={afterFieldIdInputId}
            className="dg20-builder-search-input"
            value={pending.afterFieldId}
            aria-invalid={(invalid && focusControl === 'afterFieldId') || undefined}
            aria-describedby={
              invalid && focusControl === 'afterFieldId'
                ? `${descriptionId} ${afterFieldErrorId}`
                : descriptionId
            }
            data-testid="page-break-after-field"
            onChange={(event) => onPatch({ afterFieldId: event.target.value })}
          >
            {options.map((option) => {
              const label = locale === 'gu' ? option.labelGu : option.labelEn
              return (
                <option key={option.afterFieldId} value={option.afterFieldId}>
                  {label} ({option.afterFieldId})
                </option>
              )
            })}
          </select>
          {invalid && focusControl === 'afterFieldId' && (
            <p id={afterFieldErrorId} className="dg20-builder-editor__error" role="alert">
              {builderMessage(locale, 'pageBreakAfterFieldInvalid')}
            </p>
          )}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={nextStepLabelEnInputId}>
            {builderMessage(locale, 'pageBreakNextStepLabelEn')}
          </label>
          <input
            ref={(el) => {
              controlRefs.current.nextStepLabelEn = el
            }}
            id={nextStepLabelEnInputId}
            className="dg20-builder-search-input"
            type="text"
            value={pending.nextStepLabelEn}
            aria-invalid={(invalid && focusControl === 'nextStepLabelEn') || undefined}
            aria-describedby={
              invalid && focusControl === 'nextStepLabelEn'
                ? `${descriptionId} ${labelEnErrorId}`
                : descriptionId
            }
            data-testid="page-break-label-en"
            onChange={(event) => onPatch({ nextStepLabelEn: event.target.value })}
          />
          {invalid && focusControl === 'nextStepLabelEn' && (
            <p id={labelEnErrorId} className="dg20-builder-editor__error" role="alert">
              {builderMessage(locale, 'editorErrorLabelEnRequired')}
            </p>
          )}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={nextStepLabelGuInputId}>
            {builderMessage(locale, 'pageBreakNextStepLabelGu')}
          </label>
          <input
            ref={(el) => {
              controlRefs.current.nextStepLabelGu = el
            }}
            id={nextStepLabelGuInputId}
            className="dg20-builder-search-input"
            type="text"
            value={pending.nextStepLabelGu}
            aria-invalid={(invalid && focusControl === 'nextStepLabelGu') || undefined}
            aria-describedby={
              invalid && focusControl === 'nextStepLabelGu'
                ? `${descriptionId} ${labelGuErrorId}`
                : descriptionId
            }
            data-testid="page-break-label-gu"
            onChange={(event) => onPatch({ nextStepLabelGu: event.target.value })}
          />
          {invalid && focusControl === 'nextStepLabelGu' && (
            <p id={labelGuErrorId} className="dg20-builder-editor__error" role="alert">
              {builderMessage(locale, 'editorErrorLabelGuRequired')}
            </p>
          )}
        </div>

        <div className="dg20-builder-configured-add__actions">
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="page-break-confirm"
            onClick={onConfirm}
          >
            {builderMessage(locale, 'pageBreakConfirm')}
          </button>
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="page-break-cancel"
            onClick={onCancel}
          >
            {builderMessage(locale, 'pageBreakCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
