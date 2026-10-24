import { useRef, type DragEvent, type KeyboardEvent } from 'react'
import type { CanvasReorderTarget } from '../authoring/index.js'
import type { CanvasFieldRow } from '../canvas/project-canvas.js'
import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

const DRAG_TOKEN = 'dg20-canvas-reorder'

export interface CanvasPaneProps {
  readonly locale: BuilderLocale
  readonly rows: readonly CanvasFieldRow[]
  readonly selectedFieldId: string | null
  readonly dirtyFieldIds?: ReadonlySet<string>
  readonly readOnly: boolean
  readonly gesture: {
    readonly fieldId: string
    readonly proposedBeforeFieldId: string | null
    readonly mode: 'pointer' | 'keyboard'
  } | null
  readonly reorderTargets: readonly CanvasReorderTarget[]
  readonly onSelectField: (fieldId: string) => void
  readonly onBeginReorder: (fieldId: string, mode: 'pointer' | 'keyboard') => void
  readonly onProposeReorder: (beforeFieldId: string | null) => void
  readonly onCommitReorder: () => void
  readonly onCancelReorder: () => void
}

function categoryLabel(locale: BuilderLocale, category: CanvasFieldRow['category']): string {
  if (category === 'data') return builderMessage(locale, 'categoryData')
  if (category === 'display') return builderMessage(locale, 'categoryDisplay')
  return builderMessage(locale, 'categoryLayout')
}

export function CanvasPane({
  locale,
  rows,
  selectedFieldId,
  dirtyFieldIds,
  readOnly,
  gesture,
  reorderTargets,
  onSelectField,
  onBeginReorder,
  onProposeReorder,
  onCommitReorder,
  onCancelReorder,
}: CanvasPaneProps) {
  const dropCommittedRef = useRef(false)
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (gesture !== null) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = rows[index + 1]
      if (next) onSelectField(next.fieldId)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const prev = rows[index - 1]
      if (prev) onSelectField(prev.fieldId)
    } else if (event.key === 'Home') {
      event.preventDefault()
      const first = rows[0]
      if (first) onSelectField(first.fieldId)
    } else if (event.key === 'End') {
      event.preventDefault()
      const last = rows[rows.length - 1]
      if (last) onSelectField(last.fieldId)
    }
  }
  const targetIds = new Set(reorderTargets.map((target) => target.beforeFieldId))
  const scopeFieldIds = reorderTargets
    .map((target) => target.beforeFieldId)
    .filter((id): id is string => id !== null)
  const lastScopeFieldId = scopeFieldIds[scopeFieldIds.length - 1] ?? null
  const sanitizedId = (fieldId: string) => fieldId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
  const instructionsId = 'dg20-canvas-reorder-instructions'
  const showTarget = (beforeFieldId: string | null) =>
    gesture !== null && targetIds.has(beforeFieldId)
  const inScope = (fieldId: string) => scopeFieldIds.includes(fieldId)
  const onDragOver = (event: DragEvent<HTMLButtonElement>, beforeFieldId: string | null) => {
    if (!showTarget(beforeFieldId)) {
      if (gesture !== null) {
        event.dataTransfer.dropEffect = 'none'
      }
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    onProposeReorder(beforeFieldId)
  }
  const onDrop = (event: DragEvent<HTMLButtonElement>, beforeFieldId: string | null) => {
    if (!showTarget(beforeFieldId)) return
    event.preventDefault()
    dropCommittedRef.current = true
    onProposeReorder(beforeFieldId)
    onCommitReorder()
  }

  return (
    <section className="dg20-builder-canvas" aria-labelledby="dg20-builder-canvas-heading">
      <h2 id="dg20-builder-canvas-heading" className="dg20-builder-pane__title">
        {builderMessage(locale, 'canvasHeading')}
      </h2>
      <p id={instructionsId} className="dg20-builder-visually-hidden">
        {builderMessage(locale, 'canvasReorderInstructions')}
      </p>
      <p className="dg20-builder-canvas__mobile-reorder-note">
        {builderMessage(locale, 'canvasReorderMobileGuidance')}
      </p>
      <ol className="dg20-builder-canvas__list">
        {rows.map((row, index) => {
          const selected = row.fieldId === selectedFieldId
          const dirty = dirtyFieldIds?.has(row.fieldId) ?? false
          const blockedOutOfScope = gesture !== null && !inScope(row.fieldId)
          return (
            <li
              key={row.fieldId}
              className={
                blockedOutOfScope
                  ? 'dg20-builder-canvas__item dg20-builder-canvas__item--reorder-blocked'
                  : 'dg20-builder-canvas__item'
              }
            >
              {showTarget(row.fieldId) && (
                <button
                  type="button"
                  className={
                    gesture?.proposedBeforeFieldId === row.fieldId
                      ? 'dg20-builder-canvas__insertion-marker dg20-builder-canvas__insertion-marker--active'
                      : 'dg20-builder-canvas__insertion-marker'
                  }
                  data-testid={`canvas-reorder-target-${sanitizedId(row.fieldId)}`}
                  onDragOver={(event) => onDragOver(event, row.fieldId)}
                  onDrop={(event) => onDrop(event, row.fieldId)}
                  onClick={() => onProposeReorder(row.fieldId)}
                >
                  {gesture?.proposedBeforeFieldId === row.fieldId
                    ? builderMessage(locale, 'canvasReorderProposedMarker')
                    : builderMessage(locale, 'canvasReorderTargetBefore', {
                        label: locale === 'gu' ? row.labelGu : row.labelEn,
                      })}
                </button>
              )}
              <button
                type="button"
                className={
                  selected
                    ? 'dg20-builder-canvas__row dg20-builder-canvas__row--selected'
                    : 'dg20-builder-canvas__row'
                }
                aria-current={selected ? 'true' : undefined}
                data-field-id={row.fieldId}
                onClick={() => onSelectField(row.fieldId)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="dg20-builder-canvas__order" aria-hidden="true">
                  {row.order}
                </span>
                <span className="dg20-builder-canvas__body">
                  <span className="dg20-builder-canvas__label">
                    {locale === 'gu' ? row.labelGu : row.labelEn}
                    {dirty && (
                      <span className="dg20-builder-chip dg20-builder-chip--dirty">
                        {builderMessage(locale, 'editorUnsavedChanges')}
                      </span>
                    )}
                  </span>
                  <span className="dg20-builder-canvas__meta">
                    <span className="dg20-builder-palette__item-type">{row.widgetType}</span>
                    <span className="dg20-builder-chip">
                      {row.required
                        ? builderMessage(locale, 'required')
                        : builderMessage(locale, 'optional')}
                    </span>
                    <span className="dg20-builder-chip">{categoryLabel(locale, row.category)}</span>
                    {row.memberCount !== null && (
                      <span className="dg20-builder-chip">
                        {builderMessage(locale, 'canvasFamilyMemberCount', {
                          count: row.memberCount,
                        })}
                      </span>
                    )}
                    {row.stepId !== null && (
                      <span className="dg20-builder-chip dg20-builder-step-chip">
                        {builderMessage(locale, 'canvasStepChip', {
                          label: (locale === 'gu' ? row.stepLabelGu : row.stepLabelEn) ?? '',
                        })}
                      </span>
                    )}
                    {blockedOutOfScope && (
                      <span className="dg20-builder-chip dg20-builder-chip--blocked">
                        {builderMessage(locale, 'canvasReorderCrossStepBlocked')}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="dg20-builder-canvas__reorder-handle"
                aria-label={builderMessage(locale, 'canvasReorderHandleAria', {
                  label: locale === 'gu' ? row.labelGu : row.labelEn,
                })}
                aria-describedby={instructionsId}
                aria-pressed={gesture?.mode === 'keyboard' && gesture.fieldId === row.fieldId}
                draggable={!readOnly && (gesture === null || gesture.fieldId === row.fieldId)}
                disabled={readOnly}
                data-testid={`canvas-reorder-handle-${sanitizedId(row.fieldId)}`}
                data-reorder-field-id={row.fieldId}
                onDragStart={(event) => {
                  if (readOnly) {
                    event.preventDefault()
                    return
                  }
                  dropCommittedRef.current = false
                  event.dataTransfer.setData('text/plain', DRAG_TOKEN)
                  event.dataTransfer.effectAllowed = 'move'
                  onBeginReorder(row.fieldId, 'pointer')
                }}
                onDragEnd={() => {
                  if (dropCommittedRef.current) {
                    dropCommittedRef.current = false
                    return
                  }
                  if (gesture?.fieldId === row.fieldId) onCancelReorder()
                }}
                onKeyDown={(event) => {
                  if (readOnly) return
                  const active = gesture?.fieldId === row.fieldId
                  if (event.key === 'Escape' && active) {
                    event.preventDefault()
                    onCancelReorder()
                    return
                  }
                  if (event.key === 'Tab' && active) {
                    onCancelReorder()
                    return
                  }
                  if ((event.key === ' ' || event.key === 'Enter') && !gesture) {
                    event.preventDefault()
                    onBeginReorder(row.fieldId, 'keyboard')
                    return
                  }
                  if ((event.key === ' ' || event.key === 'Enter') && active) {
                    event.preventDefault()
                    onCommitReorder()
                    return
                  }
                  if (!active) return
                  const targets = reorderTargets.map((target) => target.beforeFieldId)
                  const current = targets.indexOf(gesture!.proposedBeforeFieldId)
                  let next = current
                  if (event.key === 'ArrowUp') next = Math.max(0, current - 1)
                  else if (event.key === 'ArrowDown')
                    next = Math.min(targets.length - 1, current + 1)
                  else if (event.key === 'Home') next = 0
                  else if (event.key === 'End') next = targets.length - 1
                  else return
                  event.preventDefault()
                  event.stopPropagation()
                  onProposeReorder(targets[next]!)
                }}
              >
                <span aria-hidden="true">⠿</span>
              </button>
              {showTarget(null) && lastScopeFieldId === row.fieldId && (
                <button
                  type="button"
                  className={
                    gesture?.proposedBeforeFieldId === null
                      ? 'dg20-builder-canvas__insertion-marker dg20-builder-canvas__insertion-marker--active'
                      : 'dg20-builder-canvas__insertion-marker'
                  }
                  data-testid="canvas-reorder-target-end"
                  onDragOver={(event) => onDragOver(event, null)}
                  onDrop={(event) => onDrop(event, null)}
                  onClick={() => onProposeReorder(null)}
                >
                  {gesture?.proposedBeforeFieldId === null
                    ? builderMessage(locale, 'canvasReorderProposedMarker')
                    : builderMessage(locale, 'canvasReorderTargetEnd')}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
