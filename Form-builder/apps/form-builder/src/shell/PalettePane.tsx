import { useId, useMemo, useState } from 'react'
import { isAddableWidgetType, isStructuralAddableWidgetType } from '../authoring/index.js'
import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import { countFilteredWidgets, filterPaletteGroups } from '../palette/filter-palette.js'

export interface PalettePaneProps {
  readonly locale: BuilderLocale
  readonly onAddWidget: (widgetType: string) => void
  readonly canCreatePageBreak: boolean
  readonly pageBreakDisabledReason?: string
  readonly readOnly?: boolean
}

export function PalettePane({
  locale,
  onAddWidget,
  canCreatePageBreak,
  pageBreakDisabledReason,
  readOnly = false,
}: PalettePaneProps) {
  const searchId = useId()
  const resultsLiveId = useId()
  const [search, setSearch] = useState('')

  const groups = useMemo(() => filterPaletteGroups(search), [search])
  const count = countFilteredWidgets(groups)

  return (
    <aside
      className="dg20-builder-pane dg20-builder-palette"
      aria-labelledby="dg20-builder-palette-heading"
    >
      <h2 id="dg20-builder-palette-heading" className="dg20-builder-pane__title">
        {builderMessage(locale, 'paletteHeading')}
      </h2>

      <div className="dg20-builder-palette__search">
        <label htmlFor={searchId} className="dg20-builder-label">
          {builderMessage(locale, 'paletteSearchLabel')}
        </label>
        <input
          id={searchId}
          type="search"
          className="dg20-builder-search-input"
          value={search}
          placeholder={builderMessage(locale, 'paletteSearchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
          aria-describedby={resultsLiveId}
          autoComplete="off"
        />
        <p id={resultsLiveId} className="dg20-builder-sr-live" aria-live="polite">
          {builderMessage(locale, 'paletteResultCount', { count })}
        </p>
      </div>

      {count === 0 ? (
        <p className="dg20-builder-palette__empty" role="status">
          {builderMessage(locale, 'paletteNoResults')}
        </p>
      ) : (
        <div className="dg20-builder-palette__groups">
          {groups.map(({ group, widgets }) => (
            <section
              key={group.groupId}
              className="dg20-builder-palette__group"
              aria-labelledby={`dg20-palette-group-${group.groupId}`}
            >
              <h3
                id={`dg20-palette-group-${group.groupId}`}
                className="dg20-builder-palette__group-title"
              >
                {locale === 'gu' ? group.labelGu : group.labelEn}
              </h3>
              <ul className="dg20-builder-palette__list">
                {widgets.map((widget) => {
                  const addable = isAddableWidgetType(widget.widgetType)
                  const structural = isStructuralAddableWidgetType(widget.widgetType)
                  const isPageBreak = widget.widgetType === 'page-break'
                  const pageBreakBlocked = isPageBreak && !canCreatePageBreak
                  const disabled = readOnly || !addable || pageBreakBlocked
                  const label = locale === 'gu' ? widget.labelGu : widget.labelEn
                  const itemClass = addable
                    ? 'dg20-builder-palette__item dg20-builder-palette__item--addable'
                    : 'dg20-builder-palette__item dg20-builder-palette__item--pending'

                  let ariaLabel: string
                  if (pageBreakBlocked) {
                    ariaLabel =
                      pageBreakDisabledReason ??
                      builderMessage(locale, 'pageBreakNoBoundaryGuidance')
                  } else if (structural) {
                    ariaLabel = builderMessage(locale, 'paletteCreateBoundaryAria', { label })
                  } else if (addable) {
                    ariaLabel = builderMessage(locale, 'paletteAddAria', { label })
                  } else {
                    ariaLabel = label
                  }

                  return (
                    <li key={widget.widgetType}>
                      <button
                        type="button"
                        className={itemClass}
                        aria-label={ariaLabel}
                        disabled={disabled}
                        data-widget-type={widget.widgetType}
                        onClick={!disabled ? () => onAddWidget(widget.widgetType) : undefined}
                      >
                        <span className="dg20-builder-palette__item-label">{label}</span>
                        <span className="dg20-builder-palette__item-desc">
                          {locale === 'gu' ? widget.descriptionGu : widget.descriptionEn}
                        </span>
                        <span className="dg20-builder-palette__item-meta">
                          <span className="dg20-builder-chip">{widget.category}</span>
                          <span className="dg20-builder-palette__item-type">
                            {widget.widgetType}
                          </span>
                          {!addable && (
                            <span className="dg20-builder-pending-badge">
                              {builderMessage(locale, 'palettePending')}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}
