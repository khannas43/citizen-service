import type { FormDefinition } from '@dg20/form-contract'

import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import type { PersistenceBinding } from '../persistence/index.js'

export interface BuilderHeaderProps {
  readonly locale: BuilderLocale
  readonly onLocaleChange: (locale: BuilderLocale) => void
  readonly definition: FormDefinition
  readonly binding: PersistenceBinding
  readonly definitionDirty: boolean
  readonly onOpenVersionHistory: () => void
}

export function BuilderHeader({
  locale,
  onLocaleChange,
  definition,
  binding,
  definitionDirty,
  onOpenVersionHistory,
}: BuilderHeaderProps) {
  const statusLabel =
    definition.status === 'draft'
      ? builderMessage(locale, 'statusDraft')
      : definition.status === 'submitted'
        ? builderMessage(locale, 'statusSubmitted')
        : definition.status === 'approved'
          ? builderMessage(locale, 'statusApproved')
          : definition.status === 'published'
            ? builderMessage(locale, 'statusPublished')
            : builderMessage(locale, 'statusRetired')

  return (
    <header className="dg20-builder-header" role="banner">
      <div className="dg20-builder-header__brand">
        <h1 className="dg20-builder-header__title">{builderMessage(locale, 'appTitle')}</h1>
        <span className="dg20-builder-header__preview-badge">
          {builderMessage(locale, 'localPreviewBadge')}
        </span>
      </div>

      <div className="dg20-builder-header__context">
        <div className="dg20-builder-header__service">
          <span className="dg20-builder-header__meta">
            <span>
              {builderMessage(locale, 'serviceLabel')}: <code>{definition.serviceId}</code>
            </span>
            <span>
              {builderMessage(locale, 'versionLabel')}: <code>{definition.version}</code>
            </span>
            <span className="dg20-builder-status-badge" data-status={definition.status}>
              {statusLabel}
            </span>
            <span
              className="dg20-builder-persist-badge"
              data-binding={binding.kind}
              data-testid="persist-binding-badge"
            >
              {definition.status === 'submitted'
                ? builderMessage(locale, 'persistStoredSubmittedBadge')
                : binding.kind === 'local'
                  ? builderMessage(locale, 'persistLocalDraftBadge')
                  : builderMessage(locale, 'persistStoredDraftBadge')}
            </span>
            <span
              className="dg20-builder-persist-dirty"
              data-dirty={definitionDirty ? 'true' : 'false'}
              data-testid="persist-dirty-badge"
            >
              {definitionDirty
                ? builderMessage(locale, 'persistUnsavedChanges')
                : builderMessage(locale, 'persistSavedClean')}
            </span>
          </span>
        </div>
        <p className="dg20-builder-header__note">{builderMessage(locale, 'notSavedNote')}</p>
      </div>

      <div className="dg20-builder-header__actions">
        <button
          type="button"
          className="dg20-builder-action-btn"
          onClick={onOpenVersionHistory}
          data-testid="version-history-open"
        >
          {builderMessage(locale, 'versionHistoryOpen')}
        </button>
        <div
          className="dg20-builder-header__locale"
          role="group"
          aria-label={builderMessage(locale, 'ariaBuilderLocale')}
        >
          <button
            type="button"
            className="dg20-builder-locale-btn"
            aria-pressed={locale === 'en'}
            onClick={() => onLocaleChange('en')}
          >
            {builderMessage(locale, 'localeEn')}
          </button>
          <button
            type="button"
            className="dg20-builder-locale-btn"
            aria-pressed={locale === 'gu'}
            onClick={() => onLocaleChange('gu')}
          >
            {builderMessage(locale, 'localeGu')}
          </button>
        </div>
      </div>
    </header>
  )
}
