import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react'

import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

export type BuilderTabId = 'bindings' | 'bilingual' | 'steps'

export interface BuilderTabsProps {
  readonly locale: BuilderLocale
  readonly activeTab: BuilderTabId
  readonly onTabChange: (tab: BuilderTabId) => void
  /** Optional panel body for the bindings tab (FB-D15 workspace). */
  readonly bindingsPanel?: ReactNode
  /** Optional panel body for the bilingual tab (FB-D3 workspace). */
  readonly bilingualPanel?: ReactNode
  /** Optional panel body for the steps tab (FB-D4 workspace). */
  readonly stepsPanel?: ReactNode
}

const TABS: readonly BuilderTabId[] = ['bindings', 'bilingual', 'steps']

function tabLabel(locale: BuilderLocale, tab: BuilderTabId): string {
  if (tab === 'bindings') return builderMessage(locale, 'tabBindings')
  if (tab === 'bilingual') return builderMessage(locale, 'tabBilingual')
  return builderMessage(locale, 'tabSteps')
}

function tabBody(locale: BuilderLocale, tab: BuilderTabId): string {
  if (tab === 'bindings') return builderMessage(locale, 'tabBindingsBody')
  if (tab === 'bilingual') return builderMessage(locale, 'tabBilingualBody')
  return builderMessage(locale, 'tabStepsBody')
}

export function BuilderTabs({
  locale,
  activeTab,
  onTabChange,
  bindingsPanel,
  bilingualPanel,
  stepsPanel,
}: BuilderTabsProps) {
  const tabRefs = useRef<Partial<Record<BuilderTabId, HTMLButtonElement | null>>>({})

  const activateTab = useCallback(
    (tab: BuilderTabId) => {
      onTabChange(tab)
      // Focus follows activation synchronously so keyboard navigation does not
      // race a post-paint frame (and remains StrictMode-safe).
      tabRefs.current[tab]?.focus()
    },
    [onTabChange],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = TABS.indexOf(activeTab)
      if (currentIndex < 0) return

      let nextIndex: number | null = null
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % TABS.length
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = TABS.length - 1
      }

      if (nextIndex === null) return
      event.preventDefault()
      activateTab(TABS[nextIndex]!)
    },
    [activateTab, activeTab],
  )

  return (
    <div className="dg20-builder-tabs">
      <div
        className="dg20-builder-tabs__list"
        role="tablist"
        aria-label={builderMessage(locale, 'ariaBuilderTabs')}
        onKeyDown={onKeyDown}
      >
        {TABS.map((tab) => {
          const selected = tab === activeTab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`dg20-builder-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`dg20-builder-tabpanel-${tab}`}
              tabIndex={selected ? 0 : -1}
              ref={(el) => {
                tabRefs.current[tab] = el
              }}
              className={
                selected
                  ? 'dg20-builder-tabs__tab dg20-builder-tabs__tab--active'
                  : 'dg20-builder-tabs__tab'
              }
              onClick={() => activateTab(tab)}
            >
              {tabLabel(locale, tab)}
            </button>
          )
        })}
      </div>
      {TABS.map((tab) =>
        tab === activeTab ? (
          <div
            key={tab}
            role="tabpanel"
            id={`dg20-builder-tabpanel-${tab}`}
            aria-labelledby={`dg20-builder-tab-${tab}`}
            className="dg20-builder-tabs__panel"
            tabIndex={0}
          >
            {tab === 'bindings' && bindingsPanel ? (
              bindingsPanel
            ) : tab === 'bilingual' && bilingualPanel ? (
              bilingualPanel
            ) : tab === 'steps' && stepsPanel ? (
              stepsPanel
            ) : (
              <p>{tabBody(locale, tab)}</p>
            )}
          </div>
        ) : null,
      )}
    </div>
  )
}
