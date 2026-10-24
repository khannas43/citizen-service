import type { RemoveBlockingReason } from '../authoring/index.js'
import {
  isEditableWidgetType,
  type FamilyMemberWidgetType,
  type FamilyRepeaterDraftContent,
  type FamilyRepeaterDraftEntry,
  type FieldConfigurationDraft,
} from '../authoring/index.js'
import type { CanvasFieldRow } from '../canvas/project-canvas.js'
import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import { FamilyRepeaterEditor } from './FamilyRepeaterEditor.js'
import { PropertyEditor } from './PropertyEditor.js'

export interface FieldInspectorProps {
  readonly locale: BuilderLocale
  readonly row: CanvasFieldRow | null
  readonly readOnly?: boolean
  readonly canMoveUp: boolean
  readonly canMoveDown: boolean
  readonly canRemove: boolean
  readonly removeBlockingReason: RemoveBlockingReason | null
  /** Committed-or-draft configuration for editable widgets; null when unsupported/empty. */
  readonly editorDraft: FieldConfigurationDraft | null
  readonly familyRepeaterEntry: FamilyRepeaterDraftEntry | null
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
  /** Overall field dirty (Property or Bilingual) — inspector header chip. */
  readonly overallFieldDirty: boolean
  /** Property-surface dirty only — PropertyEditor status and Apply/Cancel. */
  readonly propertyDirty: boolean
  /** True when only Bilingual work remains pending (informational). */
  readonly bilingualOnlyPending: boolean
  readonly previewWarning: boolean
  readonly onMoveUp: () => void
  readonly onMoveDown: () => void
  readonly onRemove: () => void
  readonly onPatchDraft: (patch: Readonly<Record<string, string | boolean | number>>) => void
  readonly onApplyDraft: () => void
  readonly onCancelDraft: () => void
  readonly onPatchFamilyRepeater: (
    patch: Readonly<
      Partial<
        Pick<
          FamilyRepeaterDraftContent,
          'labelEn' | 'labelGu' | 'helpEn' | 'helpGu' | 'minItems' | 'maxItems'
        >
      > & {
        readonly memberPropertyName?: string
        readonly memberPatch?: Readonly<Record<string, string | boolean | number>>
      }
    >,
  ) => void
  readonly onApplyFamilyRepeater: () => void
  readonly onCancelFamilyRepeater: () => void
  readonly onAddFamilyMember: (input: {
    readonly widgetType: FamilyMemberWidgetType
    readonly labelEn: string
    readonly labelGu: string
    readonly required: boolean
  }) => void
  readonly onRemoveFamilyMember: (propertyName: string) => void
  readonly onMoveFamilyMember: (propertyName: string, direction: 'earlier' | 'later') => void
}

function categoryLabel(locale: BuilderLocale, category: CanvasFieldRow['category']): string {
  if (category === 'data') return builderMessage(locale, 'categoryData')
  if (category === 'display') return builderMessage(locale, 'categoryDisplay')
  return builderMessage(locale, 'categoryLayout')
}

export function FieldInspector({
  locale,
  row,
  readOnly = false,
  canMoveUp,
  canMoveDown,
  canRemove,
  removeBlockingReason,
  editorDraft,
  familyRepeaterEntry,
  showValidation,
  showStaleGuidance,
  overallFieldDirty,
  propertyDirty,
  bilingualOnlyPending,
  previewWarning,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPatchDraft,
  onApplyDraft,
  onCancelDraft,
  onPatchFamilyRepeater,
  onApplyFamilyRepeater,
  onCancelFamilyRepeater,
  onAddFamilyMember,
  onRemoveFamilyMember,
  onMoveFamilyMember,
}: FieldInspectorProps) {
  const supported = row !== null && isEditableWidgetType(row.widgetType)
  const isFamilyRepeater = row?.widgetType === 'family-repeater'

  return (
    <section className="dg20-builder-inspector" aria-labelledby="dg20-builder-inspector-heading">
      <div className="dg20-builder-inspector__header">
        <h2 id="dg20-builder-inspector-heading" className="dg20-builder-pane__title">
          {builderMessage(locale, 'inspectorHeading')}
        </h2>
        {row !== null && overallFieldDirty && (
          <span className="dg20-builder-chip dg20-builder-chip--dirty">
            {builderMessage(locale, 'editorUnsavedChanges')}
          </span>
        )}
      </div>

      {readOnly ? (
        <p
          className="dg20-builder-inspector__guidance"
          role="status"
          data-testid="submit-readonly-guidance"
        >
          {builderMessage(locale, 'submitReadOnlyGuidance')}
        </p>
      ) : null}

      {row !== null && bilingualOnlyPending && !readOnly && (
        <p className="dg20-builder-inspector__bilingual-pending" role="status">
          {builderMessage(locale, 'inspectorBilingualPending')}
        </p>
      )}

      {row === null ? (
        <p className="dg20-builder-inspector__empty">{builderMessage(locale, 'inspectorEmpty')}</p>
      ) : (
        <>
          <div className="dg20-builder-inspector__actions">
            <button
              type="button"
              className="dg20-builder-field-action-btn"
              onClick={onMoveUp}
              disabled={readOnly || !canMoveUp}
            >
              {builderMessage(locale, 'moveUp')}
            </button>
            <button
              type="button"
              className="dg20-builder-field-action-btn"
              onClick={onMoveDown}
              disabled={readOnly || !canMoveDown}
            >
              {builderMessage(locale, 'moveDown')}
            </button>
            <button
              type="button"
              className="dg20-builder-field-action-btn dg20-builder-field-action-btn--danger"
              onClick={onRemove}
              disabled={readOnly || !canRemove}
            >
              {builderMessage(locale, 'removeField')}
            </button>
          </div>
          {!readOnly && !canRemove && removeBlockingReason !== null && (
            <p className="dg20-builder-inspector__guidance" role="note">
              {builderMessage(
                locale,
                removeBlockingReason === 'final_step_field'
                  ? 'cannotRemoveLastStepFieldGuidance'
                  : 'cannotRemoveLastGuidance',
              )}
            </p>
          )}

          <dl className="dg20-builder-inspector__dl">
            <div>
              <dt>{builderMessage(locale, 'inspectorFieldId')}</dt>
              <dd>
                <code>{row.fieldId}</code>
              </dd>
            </div>
            <div>
              <dt>{builderMessage(locale, 'inspectorWidgetType')}</dt>
              <dd>
                <code>{row.widgetType}</code>
              </dd>
            </div>
            <div>
              <dt>{builderMessage(locale, 'inspectorGroup')}</dt>
              <dd>{locale === 'gu' ? row.groupLabelGu : row.groupLabelEn}</dd>
            </div>
            <div>
              <dt>{builderMessage(locale, 'inspectorCategory')}</dt>
              <dd>{categoryLabel(locale, row.category)}</dd>
            </div>
          </dl>

          {readOnly ? null : supported && isFamilyRepeater && familyRepeaterEntry !== null ? (
            <FamilyRepeaterEditor
              locale={locale}
              fieldId={row.fieldId}
              entry={familyRepeaterEntry}
              dirty={propertyDirty}
              onPatch={onPatchFamilyRepeater}
              onApply={onApplyFamilyRepeater}
              onCancel={onCancelFamilyRepeater}
              onAddMember={onAddFamilyMember}
              onRemoveMember={onRemoveFamilyMember}
              onMoveMember={onMoveFamilyMember}
            />
          ) : !readOnly && supported && editorDraft !== null ? (
            <PropertyEditor
              locale={locale}
              fieldId={row.fieldId}
              draft={editorDraft}
              showValidation={showValidation}
              showStaleGuidance={showStaleGuidance}
              dirty={propertyDirty}
              previewWarning={previewWarning}
              onPatch={onPatchDraft}
              onApply={onApplyDraft}
              onCancel={onCancelDraft}
            />
          ) : row.widgetType === 'page-break' ? (
            <p className="dg20-builder-inspector__unavailable" role="status">
              {builderMessage(locale, 'editorLegacyPageBreakGuidance')}
            </p>
          ) : !readOnly ? (
            <p className="dg20-builder-inspector__unavailable" role="status">
              {builderMessage(locale, 'editorUnavailable')}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
