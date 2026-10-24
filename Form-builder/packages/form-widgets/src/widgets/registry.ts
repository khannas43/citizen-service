import type { RegistryFieldsType, RegistryWidgetsType } from '@rjsf/utils'

import { TextShortWidget } from './TextShortWidget.js'
import { TextLongWidget } from './TextLongWidget.js'
import { NumberWidget } from './NumberWidget.js'
import { CurrencyInrWidget } from './CurrencyInrWidget.js'
import { PercentageWidget } from './PercentageWidget.js'
import { EmailWidget } from './EmailWidget.js'
import { FullNameWidget } from './FullNameWidget.js'
import { DobWidget } from './DobWidget.js'
import { GenderWidget } from './GenderWidget.js'
import { AadhaarWidget } from './AadhaarWidget.js'
import { MobileOtpWidget } from './MobileOtpWidget.js'
import { CafPrefillWidget } from './CafPrefillWidget.js'
import { AddressBlockWidget } from './AddressBlockWidget.js'
import { PincodeWidget } from './PincodeWidget.js'
import { DocumentUploadWidget } from './DocumentUploadWidget.js'
import { DigiLockerFetchWidget } from './DigiLockerFetchWidget.js'
import { PhotoCaptureWidget } from './PhotoCaptureWidget.js'
import { DropdownMasterWidget } from './DropdownMasterWidget.js'
import { RadioMasterWidget } from './RadioMasterWidget.js'
import { YesNoWidget } from './YesNoWidget.js'
import { MultiselectWidget } from './MultiselectWidget.js'
import { CascadingDropdownWidget } from './CascadingDropdownWidget.js'
import { BankAccountWidget } from './BankAccountWidget.js'
import { EligibilityDeclarationWidget } from './EligibilityDeclarationWidget.js'
import { FeeFieldWidget } from './FeeFieldWidget.js'
import { SignatureESignWidget } from './SignatureESignWidget.js'
import { FamilyRepeaterWidget } from './FamilyRepeaterWidget.js'
import { SectionHeaderField } from './SectionHeaderField.js'
import { InfoPanelField } from './InfoPanelField.js'
import { PageBreakField } from './PageBreakField.js'

/** RJSF widgets map keyed by palette widgetType (data-producing). */
export const dg20Widgets = {
  'text-short': TextShortWidget,
  'text-long': TextLongWidget,
  number: NumberWidget,
  'currency-inr': CurrencyInrWidget,
  percentage: PercentageWidget,
  email: EmailWidget,
  dob: DobWidget,
  gender: GenderWidget,
  'dropdown-master': DropdownMasterWidget,
  radio: RadioMasterWidget,
  yesno: YesNoWidget,
  multiselect: MultiselectWidget,
} as const satisfies RegistryWidgetsType

/** RJSF fields map for presentation/layout and object composites. */
export const dg20Fields = {
  'section-header': SectionHeaderField,
  'info-panel': InfoPanelField,
  'page-break': PageBreakField,
  'full-name': FullNameWidget,
  aadhaar: AadhaarWidget,
  'mobile-otp': MobileOtpWidget,
  'caf-prefill': CafPrefillWidget,
  'address-block': AddressBlockWidget,
  pincode: PincodeWidget,
  'doc-upload': DocumentUploadWidget,
  'digilocker-fetch': DigiLockerFetchWidget,
  'photo-capture': PhotoCaptureWidget,
  'cascading-dropdown': CascadingDropdownWidget,
  'bank-account': BankAccountWidget,
  'eligibility-declaration': EligibilityDeclarationWidget,
  'fee-field': FeeFieldWidget,
  'signature-esign': SignatureESignWidget,
  'family-repeater': FamilyRepeaterWidget,
} as const satisfies RegistryFieldsType

export {
  TextShortWidget,
  TextLongWidget,
  NumberWidget,
  CurrencyInrWidget,
  PercentageWidget,
  EmailWidget,
  FullNameWidget,
  DobWidget,
  GenderWidget,
  AadhaarWidget,
  MobileOtpWidget,
  CafPrefillWidget,
  AddressBlockWidget,
  PincodeWidget,
  DocumentUploadWidget,
  DigiLockerFetchWidget,
  PhotoCaptureWidget,
  DropdownMasterWidget,
  RadioMasterWidget,
  YesNoWidget,
  MultiselectWidget,
  CascadingDropdownWidget,
  BankAccountWidget,
  EligibilityDeclarationWidget,
  FeeFieldWidget,
  SignatureESignWidget,
  FamilyRepeaterWidget,
  SectionHeaderField,
  InfoPanelField,
  PageBreakField,
}

export type { FullNameValue } from './FullNameWidget.js'
export type { GenderCode } from './GenderWidget.js'
export { GENDER_CODES, isGenderCode } from './GenderWidget.js'
export type { AadhaarReferenceValue } from './AadhaarWidget.js'
export type { MobileOtpValue } from './MobileOtpWidget.js'
export type { CafPrefillValue, CafPrefillSource } from './CafPrefillWidget.js'
export type { AddressBlockValue } from './AddressBlockWidget.js'
export type { PincodeValue } from './PincodeWidget.js'
export type { DocumentReferenceValue } from './DocumentUploadWidget.js'
export type { DigiLockerDocumentValue } from './DigiLockerFetchWidget.js'
export type { PhotoReferenceValue } from './PhotoCaptureWidget.js'
export { isYesNoBoolean } from './YesNoWidget.js'
export type { CascadingDropdownValue } from './CascadingDropdownWidget.js'
export type { BankAccountValue } from './BankAccountWidget.js'
export type { EligibilityDeclarationValue } from './EligibilityDeclarationWidget.js'
export type { FeeFieldValue } from './FeeFieldWidget.js'
export type { SignatureESignValue } from './SignatureESignWidget.js'

/** Palette IDs implemented through FB-A12 (Unit A complete). */
export const IMPLEMENTED_WIDGET_TYPES = [
  'text-short',
  'text-long',
  'number',
  'currency-inr',
  'percentage',
  'section-header',
  'info-panel',
  'page-break',
  'email',
  'full-name',
  'dob',
  'gender',
  'aadhaar',
  'mobile-otp',
  'caf-prefill',
  'address-block',
  'pincode',
  'doc-upload',
  'digilocker-fetch',
  'photo-capture',
  'dropdown-master',
  'radio',
  'yesno',
  'multiselect',
  'cascading-dropdown',
  'bank-account',
  'eligibility-declaration',
  'fee-field',
  'signature-esign',
  'family-repeater',
] as const

export type ImplementedWidgetType = (typeof IMPLEMENTED_WIDGET_TYPES)[number]
