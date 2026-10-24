import { useId, useState, type RefObject } from 'react'

import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import type { DefinitionPersistenceViewState } from '../persistence/index.js'

export interface OpenDraftPanelProps {
  readonly locale: BuilderLocale
  readonly persistence: DefinitionPersistenceViewState
  readonly onLoad: (serviceId: string, versionText: string) => void
  readonly onConfirmDiscard: () => void
  readonly onCancelDiscard: () => void
  readonly onRetry: () => void
  readonly summaryRef: RefObject<HTMLDivElement | null>
}

export function OpenDraftPanel({
  locale,
  persistence,
  onLoad,
  onConfirmDiscard,
  onCancelDiscard,
  onRetry,
  summaryRef,
}: OpenDraftPanelProps) {
  const headingId = useId()
  const serviceIdFieldId = useId()
  const versionFieldId = useId()
  const [serviceId, setServiceId] = useState('')
  const [versionText, setVersionText] = useState('1')

  const loading = persistence.loadBusy
  const showLoadFailure =
    !persistence.showDiscardConfirmation &&
    persistence.failureSurface === 'load' &&
    (persistence.phase === 'failed' || persistence.phase === 'not_found')
  const showRetry = showLoadFailure && persistence.loadRetryable && !persistence.coordinateGuidance
  const showDiscarded = persistence.phase === 'discarded' && persistence.currentOperation === 'load'

  return (
    <section
      className="dg20-builder-open-draft"
      aria-labelledby={headingId}
      data-testid="open-draft-panel"
    >
      <h2 id={headingId} className="dg20-builder-open-draft__heading">
        {builderMessage(locale, 'persistOpenDraftHeading')}
      </h2>
      <div className="dg20-builder-open-draft__fields">
        <label className="dg20-builder-open-draft__label" htmlFor={serviceIdFieldId}>
          {builderMessage(locale, 'persistServiceIdLabel')}
          <input
            id={serviceIdFieldId}
            className="dg20-builder-open-draft__input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={serviceId}
            disabled={loading || persistence.showDiscardConfirmation}
            onChange={(event) => setServiceId(event.target.value)}
          />
        </label>
        <label className="dg20-builder-open-draft__label" htmlFor={versionFieldId}>
          {builderMessage(locale, 'persistVersionLabel')}
          <input
            id={versionFieldId}
            className="dg20-builder-open-draft__input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={versionText}
            disabled={loading || persistence.showDiscardConfirmation}
            onChange={(event) => setVersionText(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="dg20-builder-action-btn"
          disabled={!persistence.canLoad || loading || persistence.showDiscardConfirmation}
          aria-busy={loading || undefined}
          onClick={() => onLoad(serviceId, versionText)}
        >
          {loading
            ? builderMessage(locale, 'persistLoading')
            : builderMessage(locale, 'persistLoad')}
        </button>
      </div>

      {persistence.showDiscardConfirmation ? (
        <div
          ref={summaryRef}
          id="dg20-builder-persist-discard"
          className="dg20-builder-persist__alert"
          role="alert"
          tabIndex={-1}
        >
          <p className="dg20-builder-persist__alert-title">
            {builderMessage(locale, 'persistDiscardConfirmTitle')}
          </p>
          <p>{builderMessage(locale, 'persistDiscardConfirmBody')}</p>
          <div className="dg20-builder-open-draft__confirm-actions">
            <button type="button" className="dg20-builder-action-btn" onClick={onConfirmDiscard}>
              {builderMessage(locale, 'persistDiscardConfirmAction')}
            </button>
            <button
              type="button"
              className="dg20-builder-action-btn dg20-builder-action-btn--secondary"
              onClick={onCancelDiscard}
            >
              {builderMessage(locale, 'persistDiscardCancel')}
            </button>
          </div>
        </div>
      ) : null}

      {showLoadFailure ? (
        <div
          ref={summaryRef}
          id="dg20-builder-persist-load-failed"
          className="dg20-builder-persist__alert"
          role="alert"
          tabIndex={-1}
        >
          <p>
            {builderMessage(
              locale,
              persistence.coordinateGuidance
                ? 'persistInvalidCoordinates'
                : persistence.phase === 'not_found'
                  ? 'persistNotFound'
                  : 'persistFailed',
            )}
          </p>
          {showRetry ? (
            <button type="button" className="dg20-builder-action-btn" onClick={onRetry}>
              {builderMessage(locale, 'persistRetry')}
            </button>
          ) : null}
        </div>
      ) : null}

      {showDiscarded ? (
        <p
          className="dg20-builder-validation__status"
          role="status"
          aria-live="polite"
          data-testid="persist-load-discarded"
        >
          {builderMessage(locale, 'persistLoadDiscarded')}
        </p>
      ) : null}
    </section>
  )
}
