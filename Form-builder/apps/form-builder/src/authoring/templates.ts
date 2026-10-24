import type { JsonObject } from '@dg20/form-contract'
import {
  getPaletteWidget,
  PALETTE_WIDGET_COUNT,
  PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
  PHOTO_CAPTURE_MAX_BYTES,
  PHOTO_CAPTURE_MAX_DIMENSION,
  PHOTO_CAPTURE_MIN_DIMENSION,
} from '@dg20/form-widgets'

import { FEE_AMOUNT_MINOR_MAX } from './fee-esign-schema-admission.js'

import type { FamilyMemberWidgetType } from './family-member-types.js'

/**
 * Field-producing / display templates (FB-D17: 29 of 30).
 * Page-break is structural only — never enters TEMPLATES / getAuthoringTemplate.
 */
export const FIELD_ADDABLE_WIDGET_TYPES = [
  'text-short',
  'text-long',
  'number',
  'currency-inr',
  'percentage',
  'gender',
  'yesno',
  'section-header',
  'info-panel',
  'email',
  'full-name',
  'dob',
  'pincode',
  'aadhaar',
  'mobile-otp',
  'bank-account',
  'dropdown-master',
  'radio',
  'multiselect',
  'cascading-dropdown',
  'address-block',
  'photo-capture',
  'doc-upload',
  'digilocker-fetch',
  'fee-field',
  'signature-esign',
  'eligibility-declaration',
  'caf-prefill',
  'family-repeater',
] as const

export type FieldAddableWidgetType = (typeof FIELD_ADDABLE_WIDGET_TYPES)[number]

/** Progressive-step boundary actions (no field schema / provenance). */
export const STRUCTURAL_ADDABLE_WIDGET_TYPES = ['page-break'] as const

export type StructuralAddableWidgetType = (typeof STRUCTURAL_ADDABLE_WIDGET_TYPES)[number]

/** All 30 palette authoring capabilities (FB-D17: 30 of 30). */
export const ADDABLE_WIDGET_TYPES = [
  ...FIELD_ADDABLE_WIDGET_TYPES,
  ...STRUCTURAL_ADDABLE_WIDGET_TYPES,
] as const

export type AddableWidgetType = (typeof ADDABLE_WIDGET_TYPES)[number]

/** Widgets that require a pre-add configuration dialog (FB-D9 / FB-D10 / FB-D12–D16). */
export const CONFIGURED_ADDABLE_WIDGET_TYPES = [
  'dropdown-master',
  'radio',
  'multiselect',
  'cascading-dropdown',
  'doc-upload',
  'digilocker-fetch',
  'fee-field',
  'eligibility-declaration',
  'caf-prefill',
  'family-repeater',
] as const

export type ConfiguredAddableWidgetType = (typeof CONFIGURED_ADDABLE_WIDGET_TYPES)[number]
const CONFIGURED_ADDABLE_SET = new Set<string>(CONFIGURED_ADDABLE_WIDGET_TYPES)

export function isConfiguredAddableWidgetType(
  widgetType: string,
): widgetType is ConfiguredAddableWidgetType {
  return CONFIGURED_ADDABLE_SET.has(widgetType)
}

export const FIELD_ADDABLE_COUNT = FIELD_ADDABLE_WIDGET_TYPES.length
export const STRUCTURAL_ADDABLE_COUNT = STRUCTURAL_ADDABLE_WIDGET_TYPES.length
export const ADDABLE_COUNT = ADDABLE_WIDGET_TYPES.length
export const PENDING_COUNT = PALETTE_WIDGET_COUNT - ADDABLE_COUNT

const FIELD_ADDABLE_SET = new Set<string>(FIELD_ADDABLE_WIDGET_TYPES)
const STRUCTURAL_ADDABLE_SET = new Set<string>(STRUCTURAL_ADDABLE_WIDGET_TYPES)
const ADDABLE_SET = new Set<string>(ADDABLE_WIDGET_TYPES)

export function isFieldAddableWidgetType(widgetType: string): widgetType is FieldAddableWidgetType {
  return FIELD_ADDABLE_SET.has(widgetType)
}

export function isStructuralAddableWidgetType(
  widgetType: string,
): widgetType is StructuralAddableWidgetType {
  return STRUCTURAL_ADDABLE_SET.has(widgetType)
}

export function isAddableWidgetType(widgetType: string): widgetType is AddableWidgetType {
  return ADDABLE_SET.has(widgetType)
}

/** Typed input for configured-add templates (discriminated by widgetType). */
export type ConfiguredAddTemplateInput =
  | {
      readonly widgetType: 'dropdown-master' | 'radio'
      readonly masterListId: string
    }
  | {
      readonly widgetType: 'multiselect'
      readonly masterListId: string
      readonly minItems?: number
      readonly maxItems?: number
    }
  | {
      readonly widgetType: 'cascading-dropdown'
      readonly parentMasterListId: string
      readonly childMasterListId: string
    }
  | {
      readonly widgetType: 'doc-upload'
      readonly allowedMimeTypes: readonly string[]
      readonly maxFileSizeBytes: number
    }
  | {
      readonly widgetType: 'digilocker-fetch'
      readonly digiLockerDocumentTypeCode: string
    }
  | {
      readonly widgetType: 'fee-field'
      readonly feeRuleId: string
    }
  | {
      readonly widgetType: 'eligibility-declaration'
      readonly declarationId: string
      readonly declarationTextEn: string
      readonly declarationTextGu: string
    }
  | {
      readonly widgetType: 'caf-prefill'
      readonly cafAttribute: string
      readonly confidenceMin: number
    }
  | {
      readonly widgetType: 'family-repeater'
      readonly minItems?: number
      readonly maxItems: number
      readonly initialMember: {
        readonly widgetType: FamilyMemberWidgetType
        /** Allocated by addField when omitted. */
        readonly propertyName?: string
        readonly labelEn: string
        readonly labelGu: string
        readonly required: boolean
      }
    }

/** @deprecated Prefer {@link ADDABLE_WIDGET_TYPES}. */
export const D1_ADDABLE_WIDGET_TYPES = ADDABLE_WIDGET_TYPES
/** @deprecated Prefer {@link AddableWidgetType}. */
export type D1AddableWidgetType = AddableWidgetType
/** @deprecated Prefer {@link ADDABLE_COUNT}. */
export const D1_ADDABLE_COUNT = ADDABLE_COUNT
/** @deprecated Prefer {@link PENDING_COUNT}. */
export const D1_PENDING_COUNT = PENDING_COUNT
/** @deprecated Prefer {@link isAddableWidgetType}. */
export const isD1AddableWidgetType = isAddableWidgetType

export type UiBindingKind = 'widget' | 'field'

export interface ImmediateAuthoringFieldTemplate {
  readonly widgetType: FieldAddableWidgetType
  readonly uiBinding: UiBindingKind
  readonly producesData: boolean
  readonly addMode: 'immediate'
  readonly buildSchema: () => JsonObject
  readonly buildUiSchemaEntry: () => JsonObject
}

export interface ConfiguredAuthoringFieldTemplate {
  readonly widgetType: ConfiguredAddableWidgetType
  readonly uiBinding: UiBindingKind
  readonly producesData: boolean
  readonly addMode: 'configured'
  readonly buildSchema: (input: ConfiguredAddTemplateInput) => JsonObject
  readonly buildUiSchemaEntry: () => JsonObject
}

export type AuthoringFieldTemplate =
  ImmediateAuthoringFieldTemplate | ConfiguredAuthoringFieldTemplate

function dataWidget(
  widgetType: Exclude<FieldAddableWidgetType, ConfiguredAddableWidgetType>,
  buildSchema: () => JsonObject,
): ImmediateAuthoringFieldTemplate {
  return {
    widgetType,
    uiBinding: 'widget',
    producesData: true,
    addMode: 'immediate',
    buildSchema,
    buildUiSchemaEntry: () => ({ 'ui:widget': widgetType }),
  }
}

/** Data-producing custom field (`ui:field`) — e.g. full-name, pincode. */
function dataField(
  widgetType: Exclude<FieldAddableWidgetType, ConfiguredAddableWidgetType>,
  buildSchema: () => JsonObject,
): ImmediateAuthoringFieldTemplate {
  return {
    widgetType,
    uiBinding: 'field',
    producesData: true,
    addMode: 'immediate',
    buildSchema,
    buildUiSchemaEntry: () => ({ 'ui:field': widgetType }),
  }
}

function displayField(
  widgetType: Exclude<FieldAddableWidgetType, ConfiguredAddableWidgetType>,
): ImmediateAuthoringFieldTemplate {
  return {
    widgetType,
    uiBinding: 'field',
    producesData: false,
    addMode: 'immediate',
    buildSchema: () => ({
      type: 'object',
      properties: {},
      additionalProperties: false,
    }),
    buildUiSchemaEntry: () => ({ 'ui:field': widgetType }),
  }
}

function configuredMasterListWidget(
  widgetType: 'dropdown-master' | 'radio',
): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType,
    uiBinding: 'widget',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== widgetType) {
        throw new Error(`Configured template mismatch for ${widgetType}`)
      }
      return {
        type: 'string',
        'x-dg20': { masterListId: input.masterListId },
      }
    },
    buildUiSchemaEntry: () => ({ 'ui:widget': widgetType }),
  }
}

function configuredMultiselectWidget(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'multiselect',
    uiBinding: 'widget',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'multiselect') {
        throw new Error('Configured template mismatch for multiselect')
      }
      const schema: Record<string, unknown> = {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
        'x-dg20': { masterListId: input.masterListId },
      }
      if (input.minItems !== undefined) {
        schema.minItems = input.minItems
      }
      if (input.maxItems !== undefined) {
        schema.maxItems = input.maxItems
      }
      return schema as ReturnType<ConfiguredAuthoringFieldTemplate['buildSchema']>
    },
    buildUiSchemaEntry: () => ({ 'ui:widget': 'multiselect' }),
  }
}

function configuredCascadingDropdownField(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'cascading-dropdown',
    uiBinding: 'field',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'cascading-dropdown') {
        throw new Error('Configured template mismatch for cascading-dropdown')
      }
      return {
        type: 'object',
        properties: {
          parentCode: { type: 'string', minLength: 1 },
          childCode: { type: 'string', minLength: 1 },
        },
        required: ['parentCode'],
        additionalProperties: false,
        'x-dg20': {
          parentMasterListId: input.parentMasterListId,
          childMasterListId: input.childMasterListId,
        },
      }
    },
    buildUiSchemaEntry: () => ({ 'ui:field': 'cascading-dropdown' }),
  }
}

function configuredDocUploadField(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'doc-upload',
    uiBinding: 'field',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'doc-upload') {
        throw new Error('Configured template mismatch for doc-upload')
      }
      const allowedMimeTypes = [...input.allowedMimeTypes]
      return {
        type: 'object',
        properties: {
          objectRef: { type: 'string', minLength: 1 },
          fileName: { type: 'string', minLength: 1 },
          mimeType: { type: 'string', enum: allowedMimeTypes },
          sizeBytes: {
            type: 'integer',
            minimum: 1,
            maximum: input.maxFileSizeBytes,
          },
          scanStatus: { type: 'string', enum: ['CLEAN'] },
        },
        required: ['objectRef', 'fileName', 'mimeType', 'sizeBytes', 'scanStatus'],
        additionalProperties: false,
        'x-dg20': {
          allowedMimeTypes,
          maxFileSizeBytes: input.maxFileSizeBytes,
        },
      }
    },
    buildUiSchemaEntry: () => ({ 'ui:field': 'doc-upload' }),
  }
}

function configuredDigiLockerFetchField(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'digilocker-fetch',
    uiBinding: 'field',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'digilocker-fetch') {
        throw new Error('Configured template mismatch for digilocker-fetch')
      }
      return {
        type: 'object',
        properties: {
          issuerSignedRef: { type: 'string', minLength: 1 },
          documentTypeCode: {
            type: 'string',
            const: input.digiLockerDocumentTypeCode,
          },
        },
        required: ['issuerSignedRef', 'documentTypeCode'],
        additionalProperties: false,
        'x-dg20': {
          digiLockerDocumentTypeCode: input.digiLockerDocumentTypeCode,
        },
      }
    },
    buildUiSchemaEntry: () => ({ 'ui:field': 'digilocker-fetch' }),
  }
}

function configuredFeeField(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'fee-field',
    uiBinding: 'field',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'fee-field') {
        throw new Error('Configured template mismatch for fee-field')
      }
      return {
        type: 'object',
        properties: {
          feeRuleId: { type: 'string', const: input.feeRuleId },
          contextRevision: { type: 'string', minLength: 1 },
          currency: { type: 'string', const: 'INR' },
          amountMinor: {
            type: 'integer',
            minimum: 0,
            maximum: FEE_AMOUNT_MINOR_MAX,
          },
          quoteRef: { type: 'string', minLength: 1 },
        },
        required: ['feeRuleId', 'contextRevision', 'currency', 'amountMinor', 'quoteRef'],
        additionalProperties: false,
        'x-dg20': { feeRuleId: input.feeRuleId },
      }
    },
    buildUiSchemaEntry: () => ({ 'ui:field': 'fee-field' }),
  }
}

function configuredEligibilityDeclaration(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'eligibility-declaration',
    uiBinding: 'field',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'eligibility-declaration') {
        throw new Error('Configured template mismatch for eligibility-declaration')
      }
      return {
        type: 'object',
        properties: {
          declarationId: { type: 'string', const: input.declarationId },
          accepted: { type: 'boolean' },
          locale: { type: 'string', enum: ['en', 'gu'] },
          consentReceiptRef: { type: 'string', minLength: 1 },
        },
        required: ['declarationId', 'accepted', 'locale', 'consentReceiptRef'],
        additionalProperties: false,
        'x-dg20': { declarationId: input.declarationId },
      }
    },
    buildUiSchemaEntry: () => ({ 'ui:field': 'eligibility-declaration' }),
  }
}

function configuredCafPrefill(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'caf-prefill',
    uiBinding: 'field',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'caf-prefill') {
        throw new Error('Configured template mismatch for caf-prefill')
      }
      return {
        type: 'object',
        properties: {
          value: { type: 'string', minLength: 1 },
          source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
        },
        required: ['value', 'source'],
        additionalProperties: false,
      }
    },
    buildUiSchemaEntry: () => ({ 'ui:field': 'caf-prefill' }),
  }
}

/**
 * Family-repeater configured template. Prefer {@link addField} special-case construction
 * which allocates the member property id and builds uiSchema.items.
 * When `initialMember.propertyName` is provided, buildSchema returns a valid root schema.
 */
function configuredFamilyRepeater(): ConfiguredAuthoringFieldTemplate {
  return {
    widgetType: 'family-repeater',
    uiBinding: 'field',
    producesData: true,
    addMode: 'configured',
    buildSchema: (input) => {
      if (input.widgetType !== 'family-repeater') {
        throw new Error('Configured template mismatch for family-repeater')
      }
      const memberId = input.initialMember.propertyName
      if (memberId === undefined || memberId.length === 0) {
        throw new Error('family-repeater buildSchema requires allocated initialMember.propertyName')
      }
      const memberTemplate = TEMPLATES[input.initialMember.widgetType]
      if (!memberTemplate || memberTemplate.addMode !== 'immediate') {
        throw new Error('family-repeater initial member template is not available')
      }
      const childSchema = memberTemplate.buildSchema()
      const items: Record<string, unknown> = {
        type: 'object',
        properties: {
          [memberId]: childSchema,
        },
        additionalProperties: false,
      }
      if (input.initialMember.required) {
        items.required = [memberId]
      }
      const schema: Record<string, unknown> = {
        type: 'array',
        items,
        maxItems: input.maxItems,
      }
      if (input.minItems !== undefined) {
        schema.minItems = input.minItems
      }
      return schema as ReturnType<ConfiguredAuthoringFieldTemplate['buildSchema']>
    },
    buildUiSchemaEntry: () => ({ 'ui:field': 'family-repeater' }),
  }
}

const TEMPLATES: Record<FieldAddableWidgetType, AuthoringFieldTemplate> = {
  'text-short': dataWidget('text-short', () => ({
    type: 'string',
    maxLength: 120,
  })),
  'text-long': dataWidget('text-long', () => ({
    type: 'string',
    maxLength: 1000,
  })),
  number: dataWidget('number', () => ({
    type: 'number',
  })),
  'currency-inr': dataWidget('currency-inr', () => ({
    type: 'number',
    minimum: 0,
    multipleOf: 0.01,
  })),
  percentage: dataWidget('percentage', () => ({
    type: 'number',
    minimum: 0,
    maximum: 100,
  })),
  gender: dataWidget('gender', () => ({
    type: 'string',
    enum: ['M', 'F', 'OTHER'],
  })),
  yesno: dataWidget('yesno', () => ({
    type: 'boolean',
  })),
  'section-header': displayField('section-header'),
  'info-panel': displayField('info-panel'),
  email: dataWidget('email', () => ({
    type: 'string',
    format: 'email',
  })),
  'full-name': dataField('full-name', () => ({
    type: 'object',
    properties: {
      en: { type: 'string', minLength: 1 },
      gu: { type: 'string', minLength: 1 },
    },
    required: ['en', 'gu'],
    additionalProperties: false,
  })),
  dob: dataWidget('dob', () => ({
    type: 'string',
    format: 'date',
  })),
  pincode: dataField('pincode', () => ({
    type: 'object',
    properties: {
      pincode: {
        type: 'string',
        pattern: '^[0-9]{6}$',
      },
      cityCode: { type: 'string', minLength: 1 },
      districtCode: { type: 'string', minLength: 1 },
    },
    required: ['pincode'],
    additionalProperties: false,
  })),
  aadhaar: dataField('aadhaar', () => ({
    type: 'object',
    properties: {
      referenceToken: { type: 'string', minLength: 1 },
      identifierKind: { type: 'string', enum: ['AADHAAR', 'VID'] },
      lastFour: { type: 'string', pattern: '^[0-9]{4}$' },
    },
    required: ['referenceToken', 'identifierKind', 'lastFour'],
    additionalProperties: false,
  })),
  'mobile-otp': dataField('mobile-otp', () => ({
    type: 'object',
    properties: {
      mobileNumber: { type: 'string', pattern: '^[0-9]{10}$' },
      verified: { type: 'boolean' },
      verificationRef: { type: 'string', minLength: 1 },
    },
    required: ['mobileNumber', 'verified'],
    additionalProperties: false,
    'x-dg20': { otpChannels: ['sms'] },
  })),
  'bank-account': dataField('bank-account', () => ({
    type: 'object',
    properties: {
      accountNumber: { type: 'string', pattern: '^[0-9]{6,20}$' },
      ifsc: { type: 'string', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$' },
      accountHolderName: { type: 'string', minLength: 1 },
      verified: { type: 'boolean' },
      verificationRef: { type: 'string', minLength: 1 },
    },
    required: ['verified'],
    additionalProperties: false,
  })),
  'address-block': dataField('address-block', () => ({
    type: 'object',
    properties: {
      stateCode: { type: 'string', minLength: 1 },
      districtCode: { type: 'string', minLength: 1 },
      talukaCode: { type: 'string', minLength: 1 },
      villageCode: { type: 'string', minLength: 1 },
    },
    required: ['stateCode'],
    additionalProperties: false,
  })),
  'photo-capture': dataField('photo-capture', () => ({
    type: 'object',
    properties: {
      objectRef: { type: 'string', minLength: 1 },
      mimeType: { type: 'string', enum: [...PHOTO_CAPTURE_ALLOWED_MIME_TYPES] },
      sizeBytes: {
        type: 'integer',
        minimum: 1,
        maximum: PHOTO_CAPTURE_MAX_BYTES,
      },
      width: {
        type: 'integer',
        minimum: PHOTO_CAPTURE_MIN_DIMENSION,
        maximum: PHOTO_CAPTURE_MAX_DIMENSION,
      },
      height: {
        type: 'integer',
        minimum: PHOTO_CAPTURE_MIN_DIMENSION,
        maximum: PHOTO_CAPTURE_MAX_DIMENSION,
      },
      scanStatus: { type: 'string', enum: ['CLEAN'] },
    },
    required: ['objectRef', 'mimeType', 'sizeBytes', 'width', 'height', 'scanStatus'],
    additionalProperties: false,
  })),
  'dropdown-master': configuredMasterListWidget('dropdown-master'),
  radio: configuredMasterListWidget('radio'),
  multiselect: configuredMultiselectWidget(),
  'cascading-dropdown': configuredCascadingDropdownField(),
  'doc-upload': configuredDocUploadField(),
  'digilocker-fetch': configuredDigiLockerFetchField(),
  'fee-field': configuredFeeField(),
  'signature-esign': dataField('signature-esign', () => ({
    type: 'object',
    properties: {
      contextRevision: { type: 'string', minLength: 1 },
      signedArtefactRef: { type: 'string', minLength: 1 },
    },
    required: ['contextRevision', 'signedArtefactRef'],
    additionalProperties: false,
  })),
  'eligibility-declaration': configuredEligibilityDeclaration(),
  'caf-prefill': configuredCafPrefill(),
  'family-repeater': configuredFamilyRepeater(),
}

export function getAuthoringTemplate(widgetType: string): AuthoringFieldTemplate | undefined {
  if (!isFieldAddableWidgetType(widgetType)) {
    return undefined
  }
  return TEMPLATES[widgetType]
}

export function defaultBilingualLabel(widgetType: string): { en: string; gu: string } {
  const palette = getPaletteWidget(widgetType)
  if (!palette || palette.labelEn.trim().length === 0 || palette.labelGu.trim().length === 0) {
    throw new Error(`Missing controlled palette labels for widgetType: ${widgetType}`)
  }
  return { en: palette.labelEn, gu: palette.labelGu }
}

/**
 * Default bilingual help text to seed atomically alongside a newly added
 * field, for widget types whose template requires user-visible guidance
 * copy (currently `info-panel` only). Eligibility declaration help is
 * seeded from configured-add declaration text in {@link addField}, not here.
 * Returns `null` for widget types that do not seed help from the palette.
 */
export function defaultHelpContent(widgetType: string): { en: string; gu: string } | null {
  if (widgetType !== 'info-panel') {
    return null
  }
  const palette = getPaletteWidget(widgetType)
  if (
    !palette ||
    palette.descriptionEn.trim().length === 0 ||
    palette.descriptionGu.trim().length === 0
  ) {
    throw new Error(`Missing controlled palette description for widgetType: ${widgetType}`)
  }
  return { en: palette.descriptionEn, gu: palette.descriptionGu }
}
