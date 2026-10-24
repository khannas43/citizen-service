/**
 * FB-D10 / FB-D12 / FB-D13 / FB-D14 configured-add pending draft helpers —
 * discriminated union factories and Confirm validation with first-invalid focus control.
 */

import {
  isExactDigiLockerDocumentTypeCode,
  parseAllowedMimeTypesText,
  parseMaxFileSizeBytesDraft,
} from './doc-digilocker-policy.js'
import {
  isExactDeclarationId,
  isExactDeclarationText,
} from './eligibility-declaration-schema-admission.js'
import { isExactFeeRuleId } from './fee-esign-schema-admission.js'
import { parseRequiredJsonDecimal } from './json-decimal.js'
import {
  assessMultiselectEffectiveBounds,
  parseMultiselectBoundsDrafts,
} from './multiselect-bounds.js'
import { isExactMasterListId } from './master-list-schema-admission.js'
import {
  FAMILY_MEMBER_WIDGET_TYPES,
  isFamilyMemberWidgetType,
  type FamilyMemberWidgetType,
} from './family-member-types.js'
import type { ConfiguredAddTemplateInput, ConfiguredAddableWidgetType } from './templates.js'
import { parseOptionalNonnegativeSafeIntegerString } from './age-integer.js'
import { FAMILY_REPEATER_GLOBAL_MAX_ROWS } from '@dg20/form-widgets'

export type ConfiguredAddFocusControl =
  | 'masterListId'
  | 'minItems'
  | 'maxItems'
  | 'parentMasterListId'
  | 'childMasterListId'
  | 'allowedMimeTypesText'
  | 'maxFileSizeBytes'
  | 'digiLockerDocumentTypeCode'
  | 'feeRuleId'
  | 'declarationId'
  | 'declarationTextEn'
  | 'declarationTextGu'
  | 'cafAttribute'
  | 'confidenceMin'
  | 'initialMemberWidgetType'
  | 'initialMemberLabelEn'
  | 'initialMemberLabelGu'

export type PendingConfiguredAdd =
  | {
      readonly widgetType: 'dropdown-master' | 'radio'
      readonly masterListId: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'multiselect'
      readonly masterListId: string
      readonly minItems: string
      readonly maxItems: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'cascading-dropdown'
      readonly parentMasterListId: string
      readonly childMasterListId: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'doc-upload'
      readonly allowedMimeTypesText: string
      readonly maxFileSizeBytes: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'digilocker-fetch'
      readonly digiLockerDocumentTypeCode: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'fee-field'
      readonly feeRuleId: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'eligibility-declaration'
      readonly declarationId: string
      readonly declarationTextEn: string
      readonly declarationTextGu: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'caf-prefill'
      readonly cafAttribute: string
      readonly confidenceMin: string
      readonly showValidation: boolean
    }
  | {
      readonly widgetType: 'family-repeater'
      readonly minItems: string
      readonly maxItems: string
      readonly initialMemberWidgetType: '' | FamilyMemberWidgetType
      readonly initialMemberLabelEn: string
      readonly initialMemberLabelGu: string
      readonly initialMemberRequired: boolean
      readonly showValidation: boolean
    }

export type PendingConfiguredAddPatch = Readonly<
  Partial<{
    masterListId: string
    minItems: string
    maxItems: string
    parentMasterListId: string
    childMasterListId: string
    allowedMimeTypesText: string
    maxFileSizeBytes: string
    digiLockerDocumentTypeCode: string
    feeRuleId: string
    declarationId: string
    declarationTextEn: string
    declarationTextGu: string
    cafAttribute: string
    confidenceMin: string
    initialMemberWidgetType: '' | FamilyMemberWidgetType
    initialMemberLabelEn: string
    initialMemberLabelGu: string
    initialMemberRequired: boolean
  }>
>

export function createEmptyPendingConfiguredAdd(
  widgetType: ConfiguredAddableWidgetType,
): PendingConfiguredAdd {
  switch (widgetType) {
    case 'dropdown-master':
    case 'radio':
      return { widgetType, masterListId: '', showValidation: false }
    case 'multiselect':
      return {
        widgetType: 'multiselect',
        masterListId: '',
        minItems: '',
        maxItems: '',
        showValidation: false,
      }
    case 'cascading-dropdown':
      return {
        widgetType: 'cascading-dropdown',
        parentMasterListId: '',
        childMasterListId: '',
        showValidation: false,
      }
    case 'doc-upload':
      return {
        widgetType: 'doc-upload',
        allowedMimeTypesText: '',
        maxFileSizeBytes: '',
        showValidation: false,
      }
    case 'digilocker-fetch':
      return {
        widgetType: 'digilocker-fetch',
        digiLockerDocumentTypeCode: '',
        showValidation: false,
      }
    case 'fee-field':
      return {
        widgetType: 'fee-field',
        feeRuleId: '',
        showValidation: false,
      }
    case 'eligibility-declaration':
      return {
        widgetType: 'eligibility-declaration',
        declarationId: '',
        declarationTextEn: '',
        declarationTextGu: '',
        showValidation: false,
      }
    case 'caf-prefill':
      return {
        widgetType: 'caf-prefill',
        cafAttribute: '',
        confidenceMin: '',
        showValidation: false,
      }
    case 'family-repeater':
      return {
        widgetType: 'family-repeater',
        minItems: '',
        maxItems: '',
        initialMemberWidgetType: '',
        initialMemberLabelEn: '',
        initialMemberLabelGu: '',
        initialMemberRequired: false,
        showValidation: false,
      }
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      throw new Error('unreachable')
    }
  }
}

export function firstFocusControlForWidget(
  widgetType: ConfiguredAddableWidgetType,
): ConfiguredAddFocusControl {
  switch (widgetType) {
    case 'dropdown-master':
    case 'radio':
    case 'multiselect':
      return 'masterListId'
    case 'cascading-dropdown':
      return 'parentMasterListId'
    case 'doc-upload':
      return 'allowedMimeTypesText'
    case 'digilocker-fetch':
      return 'digiLockerDocumentTypeCode'
    case 'fee-field':
      return 'feeRuleId'
    case 'eligibility-declaration':
      return 'declarationId'
    case 'caf-prefill':
      return 'cafAttribute'
    case 'family-repeater':
      return 'maxItems'
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      return 'masterListId'
    }
  }
}

export function patchPendingConfiguredAdd(
  pending: PendingConfiguredAdd,
  patch: PendingConfiguredAddPatch,
): PendingConfiguredAdd {
  switch (pending.widgetType) {
    case 'dropdown-master':
    case 'radio':
      return {
        ...pending,
        masterListId: patch.masterListId !== undefined ? patch.masterListId : pending.masterListId,
        showValidation: false,
      }
    case 'multiselect':
      return {
        ...pending,
        masterListId: patch.masterListId !== undefined ? patch.masterListId : pending.masterListId,
        minItems: patch.minItems !== undefined ? patch.minItems : pending.minItems,
        maxItems: patch.maxItems !== undefined ? patch.maxItems : pending.maxItems,
        showValidation: false,
      }
    case 'cascading-dropdown':
      return {
        ...pending,
        parentMasterListId:
          patch.parentMasterListId !== undefined
            ? patch.parentMasterListId
            : pending.parentMasterListId,
        childMasterListId:
          patch.childMasterListId !== undefined
            ? patch.childMasterListId
            : pending.childMasterListId,
        showValidation: false,
      }
    case 'doc-upload':
      return {
        ...pending,
        allowedMimeTypesText:
          patch.allowedMimeTypesText !== undefined
            ? patch.allowedMimeTypesText
            : pending.allowedMimeTypesText,
        maxFileSizeBytes:
          patch.maxFileSizeBytes !== undefined ? patch.maxFileSizeBytes : pending.maxFileSizeBytes,
        showValidation: false,
      }
    case 'digilocker-fetch':
      return {
        ...pending,
        digiLockerDocumentTypeCode:
          patch.digiLockerDocumentTypeCode !== undefined
            ? patch.digiLockerDocumentTypeCode
            : pending.digiLockerDocumentTypeCode,
        showValidation: false,
      }
    case 'fee-field':
      return {
        ...pending,
        feeRuleId: patch.feeRuleId !== undefined ? patch.feeRuleId : pending.feeRuleId,
        showValidation: false,
      }
    case 'eligibility-declaration':
      return {
        ...pending,
        declarationId:
          patch.declarationId !== undefined ? patch.declarationId : pending.declarationId,
        declarationTextEn:
          patch.declarationTextEn !== undefined
            ? patch.declarationTextEn
            : pending.declarationTextEn,
        declarationTextGu:
          patch.declarationTextGu !== undefined
            ? patch.declarationTextGu
            : pending.declarationTextGu,
        showValidation: false,
      }
    case 'caf-prefill':
      return {
        ...pending,
        cafAttribute: patch.cafAttribute !== undefined ? patch.cafAttribute : pending.cafAttribute,
        confidenceMin:
          patch.confidenceMin !== undefined ? patch.confidenceMin : pending.confidenceMin,
        showValidation: false,
      }
    case 'family-repeater':
      return {
        ...pending,
        minItems: patch.minItems !== undefined ? patch.minItems : pending.minItems,
        maxItems: patch.maxItems !== undefined ? patch.maxItems : pending.maxItems,
        initialMemberWidgetType:
          patch.initialMemberWidgetType !== undefined
            ? patch.initialMemberWidgetType
            : pending.initialMemberWidgetType,
        initialMemberLabelEn:
          patch.initialMemberLabelEn !== undefined
            ? patch.initialMemberLabelEn
            : pending.initialMemberLabelEn,
        initialMemberLabelGu:
          patch.initialMemberLabelGu !== undefined
            ? patch.initialMemberLabelGu
            : pending.initialMemberLabelGu,
        initialMemberRequired:
          patch.initialMemberRequired !== undefined
            ? patch.initialMemberRequired
            : pending.initialMemberRequired,
        showValidation: false,
      }
    default: {
      const _exhaustive: never = pending
      void _exhaustive
      return pending
    }
  }
}

export type ConfirmConfiguredAddResult =
  | {
      readonly ok: true
      readonly configured: ConfiguredAddTemplateInput
    }
  | {
      readonly ok: false
      readonly firstInvalidControl: ConfiguredAddFocusControl
    }

/**
 * Validate pending configured-add for Confirm. Required defaults false for new fields,
 * so multiselect may omit minItems at add time (FB-D10.1 explicit min only when required).
 */
export function validatePendingConfiguredAdd(
  pending: PendingConfiguredAdd,
): ConfirmConfiguredAddResult {
  switch (pending.widgetType) {
    case 'dropdown-master':
    case 'radio': {
      if (!isExactMasterListId(pending.masterListId)) {
        return { ok: false, firstInvalidControl: 'masterListId' }
      }
      return {
        ok: true,
        configured: {
          widgetType: pending.widgetType,
          masterListId: pending.masterListId,
        },
      }
    }
    case 'multiselect': {
      if (!isExactMasterListId(pending.masterListId)) {
        return { ok: false, firstInvalidControl: 'masterListId' }
      }
      const bounds = parseMultiselectBoundsDrafts(pending.minItems, pending.maxItems)
      if (!bounds.ok) {
        return { ok: false, firstInvalidControl: bounds.firstInvalidControl }
      }
      const effective = assessMultiselectEffectiveBounds({
        minItems: bounds.minItems,
        maxItems: bounds.maxItems,
        required: false,
      })
      if (!effective.ok) {
        return { ok: false, firstInvalidControl: effective.firstInvalidControl }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'multiselect',
          masterListId: pending.masterListId,
          minItems: bounds.minItems,
          maxItems: bounds.maxItems,
        },
      }
    }
    case 'cascading-dropdown': {
      if (!isExactMasterListId(pending.parentMasterListId)) {
        return { ok: false, firstInvalidControl: 'parentMasterListId' }
      }
      if (!isExactMasterListId(pending.childMasterListId)) {
        return { ok: false, firstInvalidControl: 'childMasterListId' }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'cascading-dropdown',
          parentMasterListId: pending.parentMasterListId,
          childMasterListId: pending.childMasterListId,
        },
      }
    }
    case 'doc-upload': {
      const mime = parseAllowedMimeTypesText(pending.allowedMimeTypesText)
      if (!mime.ok) {
        return { ok: false, firstInvalidControl: 'allowedMimeTypesText' }
      }
      const size = parseMaxFileSizeBytesDraft(pending.maxFileSizeBytes)
      if (!size.ok) {
        return { ok: false, firstInvalidControl: 'maxFileSizeBytes' }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'doc-upload',
          allowedMimeTypes: mime.allowedMimeTypes,
          maxFileSizeBytes: size.maxFileSizeBytes,
        },
      }
    }
    case 'digilocker-fetch': {
      if (!isExactDigiLockerDocumentTypeCode(pending.digiLockerDocumentTypeCode)) {
        return { ok: false, firstInvalidControl: 'digiLockerDocumentTypeCode' }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'digilocker-fetch',
          digiLockerDocumentTypeCode: pending.digiLockerDocumentTypeCode,
        },
      }
    }
    case 'fee-field': {
      if (!isExactFeeRuleId(pending.feeRuleId)) {
        return { ok: false, firstInvalidControl: 'feeRuleId' }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'fee-field',
          feeRuleId: pending.feeRuleId,
        },
      }
    }
    case 'eligibility-declaration': {
      if (!isExactDeclarationId(pending.declarationId)) {
        return { ok: false, firstInvalidControl: 'declarationId' }
      }
      if (!isExactDeclarationText(pending.declarationTextEn)) {
        return { ok: false, firstInvalidControl: 'declarationTextEn' }
      }
      if (!isExactDeclarationText(pending.declarationTextGu)) {
        return { ok: false, firstInvalidControl: 'declarationTextGu' }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'eligibility-declaration',
          declarationId: pending.declarationId,
          declarationTextEn: pending.declarationTextEn,
          declarationTextGu: pending.declarationTextGu,
        },
      }
    }
    case 'caf-prefill': {
      if (!isExactMasterListId(pending.cafAttribute)) {
        return { ok: false, firstInvalidControl: 'cafAttribute' }
      }
      const confidence = parseRequiredJsonDecimal(pending.confidenceMin)
      if (!confidence.ok || confidence.value < 0 || confidence.value > 1) {
        return { ok: false, firstInvalidControl: 'confidenceMin' }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'caf-prefill',
          cafAttribute: pending.cafAttribute,
          confidenceMin: confidence.value,
        },
      }
    }
    case 'family-repeater': {
      const maxParsed = parseOptionalNonnegativeSafeIntegerString(pending.maxItems)
      if (
        !maxParsed.ok ||
        maxParsed.value === undefined ||
        maxParsed.value < 1 ||
        maxParsed.value > FAMILY_REPEATER_GLOBAL_MAX_ROWS
      ) {
        return { ok: false, firstInvalidControl: 'maxItems' }
      }
      const minParsed = parseOptionalNonnegativeSafeIntegerString(pending.minItems)
      if (!minParsed.ok) {
        return { ok: false, firstInvalidControl: 'minItems' }
      }
      if (minParsed.value !== undefined && minParsed.value > maxParsed.value) {
        return { ok: false, firstInvalidControl: 'minItems' }
      }
      if (
        pending.initialMemberWidgetType === '' ||
        !isFamilyMemberWidgetType(pending.initialMemberWidgetType)
      ) {
        return { ok: false, firstInvalidControl: 'initialMemberWidgetType' }
      }
      // Exhaustiveness guard for the const array (keeps type narrow).
      void FAMILY_MEMBER_WIDGET_TYPES
      if (
        pending.initialMemberLabelEn.length === 0 ||
        pending.initialMemberLabelEn !== pending.initialMemberLabelEn.trim()
      ) {
        return { ok: false, firstInvalidControl: 'initialMemberLabelEn' }
      }
      if (
        pending.initialMemberLabelGu.length === 0 ||
        pending.initialMemberLabelGu !== pending.initialMemberLabelGu.trim()
      ) {
        return { ok: false, firstInvalidControl: 'initialMemberLabelGu' }
      }
      return {
        ok: true,
        configured: {
          widgetType: 'family-repeater',
          minItems: minParsed.value,
          maxItems: maxParsed.value,
          initialMember: {
            widgetType: pending.initialMemberWidgetType,
            labelEn: pending.initialMemberLabelEn,
            labelGu: pending.initialMemberLabelGu,
            required: pending.initialMemberRequired,
          },
        },
      }
    }
    default: {
      const _exhaustive: never = pending
      void _exhaustive
      return { ok: false, firstInvalidControl: 'masterListId' }
    }
  }
}
