import type { BuilderLocale, BuilderMessageKey } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import type { VersionListItem } from '../versions/index.js'

export interface VersionHistoryPanelProps {
  readonly locale: BuilderLocale
  readonly serviceIdInput: string
  readonly items: readonly VersionListItem[]
  readonly listBusy: boolean
  readonly canLoadMore: boolean
  readonly canRetry: boolean
  readonly failureKind?: string
  readonly missingActorGuidance: boolean
  readonly onServiceIdChange: (value: string) => void
  readonly onLoad: () => void
  readonly onLoadMore: () => void
  readonly onRetry: () => void
  readonly onClose: () => void
  readonly onOpenDraft: (version: number) => void
  readonly onCreateDraft: (version: number) => void
}

const statusKeys: Record<VersionListItem['status'], BuilderMessageKey> = {
  draft: 'statusDraft',
  submitted: 'statusSubmitted',
  approved: 'statusApproved',
  published: 'statusPublished',
  retired: 'statusRetired',
}

export function VersionHistoryPanel({
  locale,
  serviceIdInput,
  items,
  listBusy,
  canLoadMore,
  canRetry,
  failureKind,
  missingActorGuidance,
  onServiceIdChange,
  onLoad,
  onLoadMore,
  onRetry,
  onClose,
  onOpenDraft,
  onCreateDraft,
}: VersionHistoryPanelProps) {
  const failureMessage =
    failureKind === 'stale_revision'
      ? builderMessage(locale, 'cloneStale')
      : failureKind === 'source_not_cloneable'
        ? builderMessage(locale, 'cloneSourceNotCloneable')
        : failureKind === 'invalid_actor'
          ? builderMessage(locale, 'cloneBlockedActor')
          : builderMessage(locale, 'versionHistoryFailed')

  return (
    <section
      className="dg20-builder-version-history"
      aria-labelledby="dg20-version-history-heading"
      data-testid="version-history-panel"
    >
      <div className="dg20-builder-version-history__heading">
        <h2 id="dg20-version-history-heading">{builderMessage(locale, 'versionHistoryHeading')}</h2>
        <button type="button" className="dg20-builder-field-action-btn" onClick={onClose}>
          {builderMessage(locale, 'versionHistoryClose')}
        </button>
      </div>
      <div className="dg20-builder-version-history__controls">
        <label>
          {builderMessage(locale, 'persistServiceIdLabel')}
          <input
            value={serviceIdInput}
            onChange={(event) => onServiceIdChange(event.target.value)}
            aria-label={builderMessage(locale, 'persistServiceIdLabel')}
            data-testid="version-history-service-id"
          />
        </label>
        <button
          type="button"
          className="dg20-builder-field-action-btn"
          disabled={listBusy}
          onClick={onLoad}
        >
          {listBusy
            ? builderMessage(locale, 'versionHistoryLoading')
            : builderMessage(locale, 'versionHistoryLoad')}
        </button>
      </div>
      <p className="dg20-builder-version-history__note">{builderMessage(locale, 'versionsNote')}</p>
      {failureKind && (
        <div role="alert" className="dg20-builder-persist__alert">
          <p>{failureMessage}</p>
          {canRetry && (
            <button type="button" className="dg20-builder-field-action-btn" onClick={onRetry}>
              {builderMessage(locale, 'versionHistoryRetry')}
            </button>
          )}
        </div>
      )}
      {!listBusy && !failureKind && items.length === 0 && (
        <p>{builderMessage(locale, 'versionHistoryEmpty')}</p>
      )}
      {items.length > 0 && (
        <ul className="dg20-builder-version-history__list">
          {items.map((item) => (
            <li
              key={item.version}
              className="dg20-builder-version-history__row"
              data-testid={`version-row-${item.version}`}
            >
              <span data-testid={`version-label-${item.version}`}>v{item.version}</span>
              <span className="dg20-builder-status-badge" data-status={item.status}>
                {builderMessage(locale, statusKeys[item.status])}
              </span>
              {item.status === 'draft' && (
                <button
                  type="button"
                  className="dg20-builder-field-action-btn"
                  onClick={() => onOpenDraft(item.version)}
                >
                  {builderMessage(locale, 'versionHistoryOpenDraft')}
                </button>
              )}
              {(item.status === 'published' || item.status === 'retired') && (
                <span>
                  <button
                    type="button"
                    className="dg20-builder-field-action-btn"
                    disabled={missingActorGuidance}
                    onClick={() => onCreateDraft(item.version)}
                  >
                    {builderMessage(locale, 'versionHistoryCreateDraft')}
                  </button>
                  {missingActorGuidance && (
                    <small>{builderMessage(locale, 'cloneBlockedActor')}</small>
                  )}
                </span>
              )}
              {(item.status === 'submitted' || item.status === 'approved') && (
                <small>{builderMessage(locale, 'versionHistoryNotCloneable')}</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {canLoadMore && (
        <button type="button" className="dg20-builder-field-action-btn" onClick={onLoadMore}>
          {builderMessage(locale, 'versionHistoryLoadMore')}
        </button>
      )}
    </section>
  )
}
