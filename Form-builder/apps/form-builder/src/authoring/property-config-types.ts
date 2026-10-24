import type { AddableWidgetType, D1AddableWidgetType } from './templates.js'

/** Shared bilingual + required surface for data widgets that support required. */
export interface CommonEditableStrings {
  readonly labelEn: string
  readonly labelGu: string
  /** Empty string means “no help text” in drafts / accepted optional help. */
  readonly helpEn: string
  readonly helpGu: string
}

export interface CommonDataEditable extends CommonEditableStrings {
  readonly required: boolean
}

export interface TextShortConfiguration extends CommonDataEditable {
  readonly widgetType: 'text-short'
  /** Decimal digits as typed; validated to a positive safe integer on Apply. */
  readonly maxLength: string
  /** Empty string means pattern is absent. */
  readonly pattern: string
}

export interface TextLongConfiguration extends CommonDataEditable {
  readonly widgetType: 'text-long'
  /** Decimal digits as typed; validated to a positive safe integer on Apply. */
  readonly maxLength: string
}

export interface NumberConfiguration extends CommonDataEditable {
  readonly widgetType: 'number'
  /** Empty string means constraint absent. */
  readonly minimum: string
  readonly maximum: string
  readonly step: string
}

export interface CurrencyInrConfiguration extends CommonDataEditable {
  readonly widgetType: 'currency-inr'
  /** Empty string means use baked nonnegative minimum of 0. */
  readonly minimum: string
  readonly maximum: string
}

export interface PercentageConfiguration extends CommonDataEditable {
  readonly widgetType: 'percentage'
}

export interface GenderConfiguration extends CommonDataEditable {
  readonly widgetType: 'gender'
}

export interface YesNoConfiguration extends CommonDataEditable {
  readonly widgetType: 'yesno'
}

export interface SectionHeaderConfiguration extends CommonEditableStrings {
  readonly widgetType: 'section-header'
}

export interface InfoPanelConfiguration extends CommonEditableStrings {
  readonly widgetType: 'info-panel'
}

export interface EmailConfiguration extends CommonDataEditable {
  readonly widgetType: 'email'
  /** When true, persists `x-dg20.verifyEmail: true`; false removes the key. */
  readonly verifyEmail: boolean
}

export interface FullNameConfiguration extends CommonDataEditable {
  readonly widgetType: 'full-name'
}

export interface DobConfiguration extends CommonDataEditable {
  readonly widgetType: 'dob'
  /** Empty string means minAge absent. Canonical nonnegative integer string when set. */
  readonly minAge: string
  /** Empty string means maxAge absent. Canonical nonnegative integer string when set. */
  readonly maxAge: string
}

export interface PincodeConfiguration extends CommonDataEditable {
  readonly widgetType: 'pincode'
}

export interface AadhaarConfiguration extends CommonDataEditable {
  readonly widgetType: 'aadhaar'
}

export interface MobileOtpConfiguration extends CommonDataEditable {
  readonly widgetType: 'mobile-otp'
}

export interface BankAccountConfiguration extends CommonDataEditable {
  readonly widgetType: 'bank-account'
}

export interface AddressBlockConfiguration extends CommonDataEditable {
  readonly widgetType: 'address-block'
  /**
   * Empty string means x-dg20 absent. Otherwise exact nonblank unpadded state code.
   * Never trimmed silently.
   */
  readonly defaultStateCode: string
}

export interface PhotoCaptureConfiguration extends CommonDataEditable {
  readonly widgetType: 'photo-capture'
}

export interface DropdownMasterConfiguration extends CommonDataEditable {
  readonly widgetType: 'dropdown-master'
  /** Exact nonblank unpadded master-data list id. Never trimmed silently. */
  readonly masterListId: string
}

export interface RadioConfiguration extends CommonDataEditable {
  readonly widgetType: 'radio'
  /** Exact nonblank unpadded master-data list id. Never trimmed silently. */
  readonly masterListId: string
}

export interface MultiselectConfiguration extends CommonDataEditable {
  readonly widgetType: 'multiselect'
  readonly masterListId: string
  /** Empty string means bound absent. Canonical nonnegative integer draft when set. */
  readonly minItems: string
  readonly maxItems: string
}

export interface CascadingDropdownConfiguration extends CommonDataEditable {
  readonly widgetType: 'cascading-dropdown'
  readonly parentMasterListId: string
  readonly childMasterListId: string
}

export interface DocUploadConfiguration extends CommonDataEditable {
  readonly widgetType: 'doc-upload'
  /** One MIME type per line. Validated on Apply — never silently trimmed/deduped. */
  readonly allowedMimeTypesText: string
  /** Canonical positive decimal draft ≤ DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES. */
  readonly maxFileSizeBytes: string
}

export interface DigiLockerFetchConfiguration extends CommonDataEditable {
  readonly widgetType: 'digilocker-fetch'
  /** Exact nonblank unpadded document type code. Never trimmed or HTTP-checked. */
  readonly digiLockerDocumentTypeCode: string
}

export interface FeeFieldConfiguration extends CommonEditableStrings {
  readonly widgetType: 'fee-field'
  /** Exact nonblank unpadded fee rule id. Never trimmed or HTTP-resolved. */
  readonly feeRuleId: string
}

export interface SignatureEsignConfiguration extends CommonDataEditable {
  readonly widgetType: 'signature-esign'
}

export interface EligibilityDeclarationConfiguration extends CommonEditableStrings {
  readonly widgetType: 'eligibility-declaration'
  /** Exact nonblank unpadded declaration id. Never trimmed or HTTP-resolved. */
  readonly declarationId: string
}

/** Labels/help only — CAF attribute/confidence live in meta.prefillBindings (FB-D15). */
export interface CafPrefillConfiguration extends CommonEditableStrings {
  readonly widgetType: 'caf-prefill'
}

/** Root labels/help/bounds only — members live in familyRepeaterDrafts (FB-D16). */
export interface FamilyRepeaterConfiguration extends CommonEditableStrings {
  readonly widgetType: 'family-repeater'
  readonly minItems: string
  readonly maxItems: string
}

/**
 * Accepted (validated) field configuration — discriminated by `widgetType`.
 * Never an arbitrary property bag.
 */
export type FieldConfiguration =
  | TextShortConfiguration
  | TextLongConfiguration
  | NumberConfiguration
  | CurrencyInrConfiguration
  | PercentageConfiguration
  | GenderConfiguration
  | YesNoConfiguration
  | SectionHeaderConfiguration
  | InfoPanelConfiguration
  | EmailConfiguration
  | FullNameConfiguration
  | DobConfiguration
  | PincodeConfiguration
  | AadhaarConfiguration
  | MobileOtpConfiguration
  | BankAccountConfiguration
  | AddressBlockConfiguration
  | PhotoCaptureConfiguration
  | DropdownMasterConfiguration
  | RadioConfiguration
  | MultiselectConfiguration
  | CascadingDropdownConfiguration
  | DocUploadConfiguration
  | DigiLockerFetchConfiguration
  | FeeFieldConfiguration
  | SignatureEsignConfiguration
  | EligibilityDeclarationConfiguration
  | CafPrefillConfiguration
  | FamilyRepeaterConfiguration

/**
 * UI editor draft — same discriminated shapes as {@link FieldConfiguration},
 * but values may be temporarily incomplete/invalid until Apply.
 */
export type FieldConfigurationDraft = FieldConfiguration

export type EditableWidgetType = FieldConfiguration['widgetType']

export function isEditableWidgetType(widgetType: string): widgetType is EditableWidgetType {
  return (
    widgetType === 'text-short' ||
    widgetType === 'text-long' ||
    widgetType === 'number' ||
    widgetType === 'currency-inr' ||
    widgetType === 'percentage' ||
    widgetType === 'gender' ||
    widgetType === 'yesno' ||
    widgetType === 'section-header' ||
    widgetType === 'info-panel' ||
    widgetType === 'email' ||
    widgetType === 'full-name' ||
    widgetType === 'dob' ||
    widgetType === 'pincode' ||
    widgetType === 'aadhaar' ||
    widgetType === 'mobile-otp' ||
    widgetType === 'bank-account' ||
    widgetType === 'address-block' ||
    widgetType === 'photo-capture' ||
    widgetType === 'dropdown-master' ||
    widgetType === 'radio' ||
    widgetType === 'multiselect' ||
    widgetType === 'cascading-dropdown' ||
    widgetType === 'doc-upload' ||
    widgetType === 'digilocker-fetch' ||
    widgetType === 'fee-field' ||
    widgetType === 'signature-esign' ||
    widgetType === 'eligibility-declaration' ||
    widgetType === 'caf-prefill' ||
    widgetType === 'family-repeater'
  )
}

/** Machine-readable draft validation issue codes (mapped to Builder messages in UI). */
export type ConfigurationIssueCode =
  | 'label_en_required'
  | 'label_gu_required'
  | 'label_en_padded'
  | 'label_gu_padded'
  | 'help_pair_incomplete'
  | 'help_en_padded'
  | 'help_gu_padded'
  | 'help_required'
  | 'max_length_invalid'
  | 'pattern_invalid'
  | 'minimum_invalid'
  | 'maximum_invalid'
  | 'step_invalid'
  | 'range_invalid'
  | 'currency_minimum_negative'
  | 'min_age_invalid'
  | 'max_age_invalid'
  | 'age_range_invalid'
  | 'master_list_id_invalid'
  | 'min_items_invalid'
  | 'max_items_invalid'
  | 'items_range_invalid'
  | 'required_min_items_invalid'
  | 'parent_master_list_id_invalid'
  | 'child_master_list_id_invalid'
  | 'default_state_code_invalid'
  | 'allowed_mime_types_invalid'
  | 'max_file_size_bytes_invalid'
  | 'digilocker_document_type_code_invalid'
  | 'fee_rule_id_invalid'
  | 'declaration_id_invalid'

export interface ConfigurationIssue {
  readonly code: ConfigurationIssueCode
  /** Stable control id suffix used for focus + aria-describedby (e.g. `labelEn`). */
  readonly control: string
}

export type ConfigurationValidationResult =
  | { readonly ok: true; readonly configuration: FieldConfiguration }
  | { readonly ok: false; readonly issues: readonly ConfigurationIssue[] }

export type { AddableWidgetType, D1AddableWidgetType }
