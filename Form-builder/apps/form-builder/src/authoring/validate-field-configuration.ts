import {
  type ConfigurationIssue,
  type ConfigurationValidationResult,
  type FieldConfiguration,
  type FieldConfigurationDraft,
} from './property-config-types.js'
import { parseOptionalNonnegativeSafeIntegerString } from './age-integer.js'
import {
  isExactDigiLockerDocumentTypeCode,
  parseAllowedMimeTypesText,
  parseMaxFileSizeBytesDraft,
} from './doc-digilocker-policy.js'
import { isExactFeeRuleId } from './fee-esign-schema-admission.js'
import { isExactDeclarationId } from './eligibility-declaration-schema-admission.js'
import { parseOptionalJsonDecimal } from './json-decimal.js'
import { isExactMasterListId } from './master-list-schema-admission.js'
import {
  assessMultiselectEffectiveBounds,
  parseMultiselectBoundsDrafts,
} from './multiselect-bounds.js'

function isCleanNonBlank(value: string): boolean {
  return value.length > 0 && value === value.trim()
}

function isPadded(value: string): boolean {
  return value.length > 0 && value !== value.trim()
}

function push(
  issues: ConfigurationIssue[],
  code: ConfigurationIssue['code'],
  control: string,
): void {
  issues.push({ code, control })
}

function validateCommonLabels(draft: FieldConfigurationDraft, issues: ConfigurationIssue[]): void {
  if (!isCleanNonBlank(draft.labelEn)) {
    push(issues, isPadded(draft.labelEn) ? 'label_en_padded' : 'label_en_required', 'labelEn')
  }
  if (!isCleanNonBlank(draft.labelGu)) {
    push(issues, isPadded(draft.labelGu) ? 'label_gu_padded' : 'label_gu_required', 'labelGu')
  }
}

/**
 * Validate optional help pair rules:
 * - both blank → OK (remove on apply), except when help is mandatory
 * - both nonblank/unpadded → OK
 * - one blank → incomplete
 * - either padded → padded error
 */
function validateHelpPair(
  helpEn: string,
  helpGu: string,
  issues: ConfigurationIssue[],
  options: { readonly mandatory: boolean },
): void {
  const enBlank = helpEn.length === 0
  const guBlank = helpGu.length === 0

  if (isPadded(helpEn)) {
    push(issues, 'help_en_padded', 'helpEn')
  }
  if (isPadded(helpGu)) {
    push(issues, 'help_gu_padded', 'helpGu')
  }

  if (options.mandatory) {
    if (enBlank || guBlank || isPadded(helpEn) || isPadded(helpGu)) {
      if (enBlank || guBlank) {
        push(issues, 'help_required', enBlank ? 'helpEn' : 'helpGu')
      }
    }
    return
  }

  if (enBlank !== guBlank) {
    push(issues, 'help_pair_incomplete', enBlank ? 'helpEn' : 'helpGu')
  }
}

function parsePositiveSafeInteger(raw: string): number | undefined {
  if (raw.length === 0 || raw !== raw.trim()) {
    return undefined
  }
  if (!/^\d+$/.test(raw)) {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    return undefined
  }
  return value
}

function patternCompiles(pattern: string): boolean {
  if (pattern.length === 0) {
    return true
  }
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

/**
 * Validate an editor draft. Returns a typed accepted configuration on success,
 * or a list of issues (never repairs / never trims).
 */
export function validateFieldConfigurationDraft(
  draft: FieldConfigurationDraft,
): ConfigurationValidationResult {
  const issues: ConfigurationIssue[] = []
  validateCommonLabels(draft, issues)

  switch (draft.widgetType) {
    case 'text-short': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (parsePositiveSafeInteger(draft.maxLength) === undefined) {
        push(issues, 'max_length_invalid', 'maxLength')
      }
      if (typeof draft.pattern !== 'string' || !patternCompiles(draft.pattern)) {
        push(issues, 'pattern_invalid', 'pattern')
      } else if (isPadded(draft.pattern)) {
        push(issues, 'pattern_invalid', 'pattern')
      }
      break
    }
    case 'text-long': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (parsePositiveSafeInteger(draft.maxLength) === undefined) {
        push(issues, 'max_length_invalid', 'maxLength')
      }
      break
    }
    case 'number': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      const min = parseOptionalJsonDecimal(draft.minimum)
      const max = parseOptionalJsonDecimal(draft.maximum)
      const step = parseOptionalJsonDecimal(draft.step)
      if (!min.ok) push(issues, 'minimum_invalid', 'minimum')
      if (!max.ok) push(issues, 'maximum_invalid', 'maximum')
      if (!step.ok) {
        push(issues, 'step_invalid', 'step')
      } else if (step.value !== undefined && !(step.value > 0)) {
        push(issues, 'step_invalid', 'step')
      }
      if (min.ok && max.ok && min.value !== undefined && max.value !== undefined) {
        if (min.value > max.value) {
          // Associate with Maximum so Apply focuses the control that must be raised.
          push(issues, 'range_invalid', 'maximum')
        }
      }
      break
    }
    case 'currency-inr': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      const min = parseOptionalJsonDecimal(draft.minimum)
      const max = parseOptionalJsonDecimal(draft.maximum)
      if (!min.ok) {
        push(issues, 'minimum_invalid', 'minimum')
      } else if (min.value !== undefined && min.value < 0) {
        push(issues, 'currency_minimum_negative', 'minimum')
      }
      if (!max.ok) push(issues, 'maximum_invalid', 'maximum')
      // Blank minimum means the governed effective minimum is 0 (FB-D2.1).
      if (min.ok && max.ok && max.value !== undefined) {
        const effectiveMinimum = min.value === undefined ? 0 : min.value
        if (!(max.value >= effectiveMinimum)) {
          push(issues, 'range_invalid', 'maximum')
        }
      }
      break
    }
    case 'percentage':
    case 'gender':
    case 'yesno': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      break
    }
    case 'section-header': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      break
    }
    case 'info-panel': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: true })
      break
    }
    case 'email':
    case 'full-name':
    case 'pincode':
    case 'aadhaar':
    case 'mobile-otp':
    case 'bank-account':
    case 'photo-capture': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      break
    }
    case 'address-block': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (draft.defaultStateCode.length > 0 && !isExactMasterListId(draft.defaultStateCode)) {
        push(issues, 'default_state_code_invalid', 'defaultStateCode')
      }
      break
    }
    case 'dob': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      const min = parseOptionalNonnegativeSafeIntegerString(draft.minAge)
      const max = parseOptionalNonnegativeSafeIntegerString(draft.maxAge)
      if (!min.ok) push(issues, 'min_age_invalid', 'minAge')
      if (!max.ok) push(issues, 'max_age_invalid', 'maxAge')
      if (min.ok && max.ok && min.value !== undefined && max.value !== undefined) {
        if (min.value > max.value) {
          push(issues, 'age_range_invalid', 'maxAge')
        }
      }
      break
    }
    case 'dropdown-master':
    case 'radio': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (!isExactMasterListId(draft.masterListId)) {
        push(issues, 'master_list_id_invalid', 'masterListId')
      }
      break
    }
    case 'multiselect': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (!isExactMasterListId(draft.masterListId)) {
        push(issues, 'master_list_id_invalid', 'masterListId')
      }
      const bounds = parseMultiselectBoundsDrafts(draft.minItems, draft.maxItems)
      if (!bounds.ok) {
        push(issues, bounds.code, bounds.firstInvalidControl)
      } else {
        const effective = assessMultiselectEffectiveBounds({
          minItems: bounds.minItems,
          maxItems: bounds.maxItems,
          required: draft.required,
        })
        if (!effective.ok) {
          push(issues, effective.code, effective.firstInvalidControl)
        }
      }
      break
    }
    case 'cascading-dropdown': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (!isExactMasterListId(draft.parentMasterListId)) {
        push(issues, 'parent_master_list_id_invalid', 'parentMasterListId')
      }
      if (!isExactMasterListId(draft.childMasterListId)) {
        push(issues, 'child_master_list_id_invalid', 'childMasterListId')
      }
      break
    }
    case 'doc-upload': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (!parseAllowedMimeTypesText(draft.allowedMimeTypesText).ok) {
        push(issues, 'allowed_mime_types_invalid', 'allowedMimeTypesText')
      }
      if (!parseMaxFileSizeBytesDraft(draft.maxFileSizeBytes).ok) {
        push(issues, 'max_file_size_bytes_invalid', 'maxFileSizeBytes')
      }
      break
    }
    case 'digilocker-fetch': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (!isExactDigiLockerDocumentTypeCode(draft.digiLockerDocumentTypeCode)) {
        push(issues, 'digilocker_document_type_code_invalid', 'digiLockerDocumentTypeCode')
      }
      break
    }
    case 'fee-field': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      if (!isExactFeeRuleId(draft.feeRuleId)) {
        push(issues, 'fee_rule_id_invalid', 'feeRuleId')
      }
      break
    }
    case 'signature-esign': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      break
    }
    case 'eligibility-declaration': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: true })
      if (!isExactDeclarationId(draft.declarationId)) {
        push(issues, 'declaration_id_invalid', 'declarationId')
      }
      break
    }
    case 'caf-prefill': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      break
    }
    case 'family-repeater': {
      validateHelpPair(draft.helpEn, draft.helpGu, issues, { mandatory: false })
      break
    }
    default: {
      const _exhaustive: never = draft
      void _exhaustive
      break
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return { ok: true, configuration: draft as FieldConfiguration }
}
