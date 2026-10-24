import type { FieldProps, WidgetProps, RJSFSchema, StrictRJSFSchema, Registry } from '@rjsf/utils'
import { createSchemaUtils, englishStringTranslator } from '@rjsf/utils'
import { getDefaultRegistry } from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { useEffect, useState, type ReactElement } from 'react'

import type { BilingualContent, PrefillBinding } from '@dg20/form-contract'

import type { WidgetServicePorts } from '../src/runtime/service-ports.js'
import type { FieldIdResolver } from '../src/runtime/field-id.js'
import { WidgetRuntimeProvider } from '../src/runtime/widget-context.js'
import { DobWidget } from '../src/widgets/DobWidget.js'
import { EmailWidget } from '../src/widgets/EmailWidget.js'
import { FullNameWidget } from '../src/widgets/FullNameWidget.js'
import { GenderWidget } from '../src/widgets/GenderWidget.js'
import { AadhaarWidget } from '../src/widgets/AadhaarWidget.js'
import { MobileOtpWidget } from '../src/widgets/MobileOtpWidget.js'
import { CafPrefillWidget } from '../src/widgets/CafPrefillWidget.js'
import { AddressBlockWidget } from '../src/widgets/AddressBlockWidget.js'
import { PincodeWidget } from '../src/widgets/PincodeWidget.js'
import { DocumentUploadWidget } from '../src/widgets/DocumentUploadWidget.js'
import { DigiLockerFetchWidget } from '../src/widgets/DigiLockerFetchWidget.js'
import { PhotoCaptureWidget } from '../src/widgets/PhotoCaptureWidget.js'
import { DropdownMasterWidget } from '../src/widgets/DropdownMasterWidget.js'
import { RadioMasterWidget } from '../src/widgets/RadioMasterWidget.js'
import { YesNoWidget } from '../src/widgets/YesNoWidget.js'
import { MultiselectWidget } from '../src/widgets/MultiselectWidget.js'
import { CascadingDropdownWidget } from '../src/widgets/CascadingDropdownWidget.js'
import { BankAccountWidget } from '../src/widgets/BankAccountWidget.js'
import { EligibilityDeclarationWidget } from '../src/widgets/EligibilityDeclarationWidget.js'
import { FeeFieldWidget } from '../src/widgets/FeeFieldWidget.js'
import { SignatureESignWidget } from '../src/widgets/SignatureESignWidget.js'
import { FamilyRepeaterWidget } from '../src/widgets/FamilyRepeaterWidget.js'
import { TextShortWidget } from '../src/widgets/TextShortWidget.js'
import { dg20Fields, dg20Widgets } from '../src/widgets/registry.js'

type WidgetHarnessProps = WidgetProps<unknown, StrictRJSFSchema, RJSFSchema>
type FieldHarnessProps = FieldProps<unknown, StrictRJSFSchema, RJSFSchema>

const noop = () => undefined

const emptyRegistry = {
  widgets: {},
  fields: {},
  templates: {},
  formContext: {},
  rootSchema: { type: 'object' as const, properties: {} },
  schemaUtils: {} as WidgetHarnessProps['registry']['schemaUtils'],
  translateString: (s: string) => s,
  globalFormOptions: {},
}

function wrap(
  bilingual: BilingualContent,
  locale: 'en' | 'gu',
  services: WidgetServicePorts | undefined,
  child: ReactElement,
  prefillBindings?: readonly PrefillBinding[],
  feeContextRevision?: string,
  eSignContextRevision?: string,
  resolveFieldId?: FieldIdResolver,
): ReactElement {
  return (
    <div className="dg20-form-widgets">
      <WidgetRuntimeProvider
        locale={locale}
        bilingual={bilingual}
        services={services}
        prefillBindings={prefillBindings}
        feeContextRevision={feeContextRevision}
        eSignContextRevision={eSignContextRevision}
        resolveFieldId={resolveFieldId}
      >
        {child}
      </WidgetRuntimeProvider>
    </div>
  )
}

export function renderTextShortHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly required?: boolean
  readonly rawErrors?: string[]
  readonly maxLength?: number
  readonly name?: string
  readonly id?: string
  readonly onChange?: (value: unknown) => void
}): ReactElement {
  const name = options.name ?? 'shortName'
  const id = options.id ?? `root_${name}`
  const props: WidgetHarnessProps = {
    id,
    name,
    label: 'Short name',
    value: options.value,
    required: options.required ?? false,
    disabled: false,
    readonly: false,
    autofocus: false,
    placeholder: '',
    onChange: options.onChange ?? noop,
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema: {
      type: 'string',
      maxLength: options.maxLength ?? 10,
      title: 'Short name',
    },
    rawErrors: options.rawErrors,
    idSchema: { $id: id },
    registry: emptyRegistry,
  }

  return wrap(options.bilingual, options.locale ?? 'en', undefined, <TextShortWidget {...props} />)
}

function StatefulEmailWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialValue: unknown
  readonly verifyEmail: boolean
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
}): ReactElement {
  const [value, setValue] = useState(options.initialValue)
  const id = `root_${options.name}`
  const props: WidgetHarnessProps = {
    id,
    name: options.name,
    label: 'Email',
    value,
    required: false,
    disabled: false,
    readonly: false,
    autofocus: false,
    placeholder: '',
    onChange: (next) => {
      setValue(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema: {
      type: 'string',
      format: 'email',
      title: 'Email',
      ...(options.verifyEmail ? { 'x-dg20': { verifyEmail: true } } : {}),
    },
    idSchema: { $id: id },
    registry: emptyRegistry,
  }

  return wrap(options.bilingual, options.locale, options.services, <EmailWidget {...props} />)
}

export function renderEmailHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly verifyEmail?: boolean
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
}): ReactElement {
  return (
    <StatefulEmailWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialValue={options.value}
      verifyEmail={options.verifyEmail ?? false}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'contactEmail'}
    />
  )
}

function StatefulDobWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialValue: unknown
  readonly minAge?: number
  readonly maxAge?: number
  readonly services?: WidgetServicePorts
  readonly rawErrors?: string[]
  readonly onChange?: (value: unknown) => void
  readonly name: string
}): ReactElement {
  const [value, setValue] = useState(options.initialValue)
  const id = `root_${options.name}`
  const xDg20: { minAge?: number; maxAge?: number } = {}
  if (options.minAge !== undefined) {
    xDg20.minAge = options.minAge
  }
  if (options.maxAge !== undefined) {
    xDg20.maxAge = options.maxAge
  }
  const props: WidgetHarnessProps = {
    id,
    name: options.name,
    label: 'DOB',
    value,
    required: false,
    disabled: false,
    readonly: false,
    autofocus: false,
    placeholder: '',
    onChange: (next) => {
      setValue(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema: {
      type: 'string',
      format: 'date',
      title: 'DOB',
      ...(Object.keys(xDg20).length > 0 ? { 'x-dg20': xDg20 } : {}),
    },
    rawErrors: options.rawErrors,
    idSchema: { $id: id },
    registry: emptyRegistry,
  }

  return wrap(options.bilingual, options.locale, options.services, <DobWidget {...props} />)
}

export function renderDobHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly minAge?: number
  readonly maxAge?: number
  readonly services?: WidgetServicePorts
  readonly rawErrors?: string[]
  readonly onChange?: (value: unknown) => void
  readonly name?: string
}): ReactElement {
  return (
    <StatefulDobWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialValue={options.value}
      minAge={options.minAge}
      maxAge={options.maxAge}
      services={options.services}
      rawErrors={options.rawErrors}
      onChange={options.onChange}
      name={options.name ?? 'date_of_birth'}
    />
  )
}

function StatefulGenderWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialValue: unknown
  readonly readonly: boolean
  readonly onChange?: (value: unknown) => void
  readonly name: string
}): ReactElement {
  const [value, setValue] = useState(options.initialValue)
  const id = `root_${options.name}`
  const props: WidgetHarnessProps = {
    id,
    name: options.name,
    label: 'Gender',
    value,
    required: false,
    disabled: false,
    readonly: options.readonly,
    autofocus: false,
    placeholder: '',
    onChange: (next) => {
      setValue(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema: {
      type: 'string',
      title: 'Gender',
    },
    idSchema: { $id: id },
    registry: emptyRegistry,
  }

  return wrap(options.bilingual, options.locale, undefined, <GenderWidget {...props} />)
}

export function renderGenderHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly readonly?: boolean
  readonly onChange?: (value: unknown) => void
  readonly name?: string
}): ReactElement {
  return (
    <StatefulGenderWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialValue={options.value}
      readonly={options.readonly ?? false}
      onChange={options.onChange}
      name={options.name ?? 'gender'}
    />
  )
}

function StatefulFullNameWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: false,
    readonly: false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Full name',
      properties: {
        en: { type: 'string' },
        gu: { type: 'string' },
      },
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(options.bilingual, options.locale, options.services, <FullNameWidget {...props} />)
}

export function renderFullNameHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
}): ReactElement {
  return (
    <StatefulFullNameWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'applicant_full_name'}
    />
  )
}

function StatefulAadhaarWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Aadhaar',
      properties: {
        referenceToken: { type: 'string' },
        identifierKind: { type: 'string', enum: ['AADHAAR', 'VID'] },
        lastFour: { type: 'string', pattern: '^[0-9]{4}$' },
      },
      required: ['referenceToken', 'identifierKind', 'lastFour'],
      additionalProperties: false,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(options.bilingual, options.locale, options.services, <AadhaarWidget {...props} />)
}

export function renderAadhaarHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  return (
    <StatefulAadhaarWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'aadhaar_ref'}
      readonly={options.readonly}
      disabled={options.disabled}
    />
  )
}

function StatefulMobileOtpWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly otpChannels?: unknown
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const xDg20 =
    options.otpChannels !== undefined ? { 'x-dg20': { otpChannels: options.otpChannels } } : {}
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Mobile',
      properties: {
        mobileNumber: { type: 'string' },
        verified: { type: 'boolean' },
        verificationRef: { type: 'string' },
      },
      required: ['mobileNumber', 'verified'],
      additionalProperties: false,
      ...xDg20,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(options.bilingual, options.locale, options.services, <MobileOtpWidget {...props} />)
}

export function renderMobileOtpHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly otpChannels?: unknown
}): ReactElement {
  return (
    <StatefulMobileOtpWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'mobile_otp'}
      readonly={options.readonly}
      disabled={options.disabled}
      otpChannels={options.otpChannels}
    />
  )
}

function StatefulCafPrefillWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly prefillBindings?: readonly PrefillBinding[]
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'CAF field',
      properties: {
        value: { type: 'string' },
        source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
      },
      required: ['value', 'source'],
      additionalProperties: false,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <CafPrefillWidget {...props} />,
    options.prefillBindings,
  )
}

export function renderCafPrefillHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly prefillBindings?: readonly PrefillBinding[]
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  return (
    <StatefulCafPrefillWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      prefillBindings={options.prefillBindings}
      onChange={options.onChange}
      name={options.name ?? 'caf_field'}
      readonly={options.readonly}
      disabled={options.disabled}
    />
  )
}

function StatefulAddressBlockWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly defaultStateCode?: string
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const xDg20 =
    options.defaultStateCode !== undefined
      ? { 'x-dg20': { defaultStateCode: options.defaultStateCode } }
      : {}
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Address',
      properties: {
        stateCode: { type: 'string' },
        districtCode: { type: 'string' },
        talukaCode: { type: 'string' },
        villageCode: { type: 'string' },
      },
      additionalProperties: false,
      ...xDg20,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <AddressBlockWidget {...props} />,
  )
}

export function renderAddressBlockHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly defaultStateCode?: string
}): ReactElement {
  return (
    <StatefulAddressBlockWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'address_block'}
      readonly={options.readonly}
      disabled={options.disabled}
      defaultStateCode={options.defaultStateCode}
    />
  )
}

function StatefulPincodeWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)

  // Sync when parent replaces the PIN (external/CAF). Keep enrichment when only codes are added.
  useEffect(() => {
    setFormData((prev) => {
      const next = options.initialFormData
      if (next === undefined) {
        return prev
      }
      const prevPin =
        typeof prev === 'object' &&
        prev !== null &&
        'pincode' in prev &&
        typeof (prev as { pincode?: unknown }).pincode === 'string'
          ? (prev as { pincode: string }).pincode
          : undefined
      const nextPin =
        typeof next === 'object' &&
        next !== null &&
        'pincode' in next &&
        typeof (next as { pincode?: unknown }).pincode === 'string'
          ? (next as { pincode: string }).pincode
          : undefined
      if (nextPin !== prevPin) {
        return next
      }
      return prev
    })
  }, [options.initialFormData])

  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'PIN code',
      properties: {
        pincode: { type: 'string' },
        cityCode: { type: 'string' },
        districtCode: { type: 'string' },
      },
      required: ['pincode'],
      additionalProperties: false,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(options.bilingual, options.locale, options.services, <PincodeWidget {...props} />)
}

export function renderPincodeHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  return (
    <StatefulPincodeWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'pincode'}
      readonly={options.readonly}
      disabled={options.disabled}
    />
  )
}

function StatefulDocumentUploadWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly allowedMimeTypes?: readonly string[]
  readonly maxFileSizeBytes?: number
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const xDg20 = {
    'x-dg20': {
      allowedMimeTypes: options.allowedMimeTypes ?? ['application/pdf'],
      maxFileSizeBytes: options.maxFileSizeBytes ?? 1024 * 1024,
    },
  }
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Document',
      properties: {
        objectRef: { type: 'string' },
        fileName: { type: 'string' },
        mimeType: { type: 'string' },
        sizeBytes: { type: 'number' },
        scanStatus: { type: 'string', enum: ['CLEAN'] },
      },
      additionalProperties: false,
      ...xDg20,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <DocumentUploadWidget {...props} />,
  )
}

export function renderDocumentUploadHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly allowedMimeTypes?: readonly string[]
  readonly maxFileSizeBytes?: number
}): ReactElement {
  return (
    <StatefulDocumentUploadWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'doc_upload'}
      readonly={options.readonly}
      disabled={options.disabled}
      allowedMimeTypes={options.allowedMimeTypes}
      maxFileSizeBytes={options.maxFileSizeBytes}
    />
  )
}

function StatefulDigiLockerFetchWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly digiLockerDocumentTypeCode?: string
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const xDg20 =
    options.digiLockerDocumentTypeCode !== undefined
      ? { 'x-dg20': { digiLockerDocumentTypeCode: options.digiLockerDocumentTypeCode } }
      : { 'x-dg20': { digiLockerDocumentTypeCode: 'AADHAAR' } }
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'DigiLocker',
      properties: {
        issuerSignedRef: { type: 'string' },
        documentTypeCode: { type: 'string' },
      },
      additionalProperties: false,
      ...xDg20,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <DigiLockerFetchWidget {...props} />,
  )
}

export function renderDigiLockerFetchHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly digiLockerDocumentTypeCode?: string
}): ReactElement {
  return (
    <StatefulDigiLockerFetchWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'digilocker_doc'}
      readonly={options.readonly}
      disabled={options.disabled}
      digiLockerDocumentTypeCode={options.digiLockerDocumentTypeCode}
    />
  )
}

function StatefulPhotoCaptureWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Photo',
      properties: {
        objectRef: { type: 'string' },
        mimeType: { type: 'string' },
        sizeBytes: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        scanStatus: { type: 'string', enum: ['CLEAN'] },
      },
      additionalProperties: false,
    },
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <PhotoCaptureWidget {...props} />,
  )
}

export function renderPhotoCaptureHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
}): ReactElement {
  return (
    <StatefulPhotoCaptureWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'photo_capture'}
      readonly={options.readonly}
      disabled={options.disabled}
    />
  )
}

function StatefulDropdownMasterWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialValue: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly masterListId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  const [value, setValue] = useState(options.initialValue)
  useEffect(() => {
    setValue(options.initialValue)
  }, [options.initialValue])
  const id = `root_${options.name}`
  const props: WidgetHarnessProps = {
    id,
    name: options.name,
    value,
    required: options.required ?? false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setValue(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema: {
      type: 'string',
      title: 'Category',
      'x-dg20': {
        masterListId: options.masterListId,
      },
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    registry: emptyRegistry,
    idSchema: { $id: id },
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <DropdownMasterWidget {...props} />,
  )
}

export function renderDropdownMasterHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly masterListId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulDropdownMasterWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialValue={options.value}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'category'}
      readonly={options.readonly}
      disabled={options.disabled}
      required={options.required}
      masterListId={options.masterListId ?? 'LIST_CATEGORY'}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulRadioMasterWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialValue: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly masterListId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  const [value, setValue] = useState(options.initialValue)
  useEffect(() => {
    setValue(options.initialValue)
  }, [options.initialValue])
  const id = `root_${options.name}`
  const props: WidgetHarnessProps = {
    id,
    name: options.name,
    value,
    required: options.required ?? false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setValue(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema: {
      type: 'string',
      title: 'Preference',
      'x-dg20': {
        masterListId: options.masterListId,
      },
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    registry: emptyRegistry,
    idSchema: { $id: id },
  }

  return wrap(options.bilingual, options.locale, options.services, <RadioMasterWidget {...props} />)
}

export function renderRadioMasterHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly masterListId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulRadioMasterWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialValue={options.value}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'preference'}
      readonly={options.readonly}
      disabled={options.disabled}
      required={options.required}
      masterListId={options.masterListId ?? 'LIST_PREF'}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulYesNoWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialValue: unknown
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly rawErrors?: string[]
}): ReactElement {
  const [value, setValue] = useState(options.initialValue)
  useEffect(() => {
    setValue(options.initialValue)
  }, [options.initialValue])
  const id = `root_${options.name}`
  const props: WidgetHarnessProps = {
    id,
    name: options.name,
    value,
    required: options.required ?? false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setValue(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema: {
      type: 'boolean',
      title: 'Consent',
      enum: ['YES', 'NO'],
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    registry: emptyRegistry,
    idSchema: { $id: id },
  }

  return wrap(options.bilingual, options.locale, undefined, <YesNoWidget {...props} />)
}

export function renderYesNoHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulYesNoWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialValue={options.value}
      onChange={options.onChange}
      name={options.name ?? 'consent'}
      readonly={options.readonly}
      disabled={options.disabled}
      required={options.required}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulMultiselectWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialValue: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly masterListId?: string
  readonly minItems?: number
  readonly maxItems?: number
  readonly rawErrors?: string[]
}): ReactElement {
  const [value, setValue] = useState(options.initialValue)
  useEffect(() => {
    setValue(options.initialValue)
  }, [options.initialValue])
  const id = `root_${options.name}`
  const schema: Record<string, unknown> = {
    type: 'array',
    title: 'Benefits',
    items: { type: 'string' },
    'x-dg20': {
      masterListId: options.masterListId,
    },
  }
  if (options.minItems !== undefined) {
    schema.minItems = options.minItems
  }
  if (options.maxItems !== undefined) {
    schema.maxItems = options.maxItems
  }
  const props: WidgetHarnessProps = {
    id,
    name: options.name,
    value,
    required: options.required ?? false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setValue(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    options: {},
    schema,
    rawErrors: options.rawErrors,
    uiSchema: {},
    registry: emptyRegistry,
    idSchema: { $id: id },
  }

  return wrap(options.bilingual, options.locale, options.services, <MultiselectWidget {...props} />)
}

export function renderMultiselectHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly value?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly masterListId?: string
  readonly minItems?: number
  readonly maxItems?: number
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulMultiselectWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialValue={options.value}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'benefits'}
      readonly={options.readonly}
      disabled={options.disabled}
      required={options.required}
      masterListId={options.masterListId ?? 'LIST_BENEFITS'}
      minItems={options.minItems}
      maxItems={options.maxItems}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulCascadingDropdownWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly parentMasterListId?: string
  readonly childMasterListId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  useEffect(() => {
    setFormData(options.initialFormData)
  }, [options.initialFormData])
  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: options.required ?? false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Location cascade',
      properties: {
        parentCode: { type: 'string' },
        childCode: { type: 'string' },
      },
      additionalProperties: false,
      'x-dg20': {
        parentMasterListId: options.parentMasterListId,
        childMasterListId: options.childMasterListId,
      },
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <CascadingDropdownWidget {...props} />,
  )
}

export function renderCascadingDropdownHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly parentMasterListId?: string
  readonly childMasterListId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulCascadingDropdownWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'cascade_location'}
      readonly={options.readonly}
      disabled={options.disabled}
      required={options.required}
      parentMasterListId={options.parentMasterListId ?? 'LIST_PARENT'}
      childMasterListId={options.childMasterListId ?? 'LIST_CHILD'}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulBankAccountWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly rawErrors?: string[]
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  useEffect(() => {
    setFormData(options.initialFormData)
  }, [options.initialFormData])
  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: options.required ?? false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Bank account',
      properties: {
        accountNumber: { type: 'string' },
        ifsc: { type: 'string' },
        accountHolderName: { type: 'string' },
        verified: { type: 'boolean' },
        verificationRef: { type: 'string' },
      },
      additionalProperties: false,
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(options.bilingual, options.locale, options.services, <BankAccountWidget {...props} />)
}

export function renderBankAccountHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly required?: boolean
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulBankAccountWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'bank_account'}
      readonly={options.readonly}
      disabled={options.disabled}
      required={options.required}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulEligibilityDeclarationWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly declarationId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  useEffect(() => {
    setFormData(options.initialFormData)
  }, [options.initialFormData])
  const id = `root_${options.name}`
  const declarationId = options.declarationId ?? 'DECL_ELIG_V1'
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Eligibility declaration',
      description: 'Fallback declaration text',
      properties: {
        declarationId: { type: 'string' },
        accepted: { type: 'boolean' },
        locale: { type: 'string' },
        consentReceiptRef: { type: 'string' },
      },
      additionalProperties: false,
      'x-dg20': {
        declarationId,
      },
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <EligibilityDeclarationWidget {...props} />,
  )
}

export function renderEligibilityDeclarationHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly declarationId?: string
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulEligibilityDeclarationWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'eligibility_declaration'}
      readonly={options.readonly}
      disabled={options.disabled}
      declarationId={options.declarationId}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulFeeFieldWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly feeRuleId?: string
  readonly feeContextRevision?: string
  readonly rawErrors?: string[]
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  useEffect(() => {
    setFormData(options.initialFormData)
  }, [options.initialFormData])
  const id = `root_${options.name}`
  const feeRuleId = options.feeRuleId ?? 'FEE_RULE_SERVICE_V1'
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'Service fee',
      properties: {
        feeRuleId: { type: 'string' },
        contextRevision: { type: 'string' },
        currency: { type: 'string' },
        amountMinor: { type: 'integer' },
        quoteRef: { type: 'string' },
      },
      additionalProperties: false,
      'x-dg20': {
        feeRuleId,
      },
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <FeeFieldWidget {...props} />,
    undefined,
    options.feeContextRevision,
  )
}

export function renderFeeFieldHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly feeRuleId?: string
  readonly feeContextRevision?: string
  readonly rawErrors?: string[]
}): ReactElement {
  return (
    <StatefulFeeFieldWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'service_fee'}
      readonly={options.readonly}
      disabled={options.disabled}
      feeRuleId={options.feeRuleId}
      feeContextRevision={options.feeContextRevision}
      rawErrors={options.rawErrors}
    />
  )
}

function StatefulSignatureESignWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly eSignContextRevision?: string
  readonly rawErrors?: string[]
  readonly required?: boolean
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  useEffect(() => {
    setFormData(options.initialFormData)
  }, [options.initialFormData])
  const id = `root_${options.name}`
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: options.required ?? false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: {
      type: 'object',
      title: 'eSign signature',
      properties: {
        contextRevision: { type: 'string' },
        signedArtefactRef: { type: 'string' },
      },
      additionalProperties: false,
    },
    rawErrors: options.rawErrors,
    uiSchema: {},
    idSchema: { $id: id },
    registry: emptyRegistry,
    formContext: {},
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <SignatureESignWidget {...props} />,
    undefined,
    undefined,
    options.eSignContextRevision,
  )
}

export function renderSignatureESignHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly services?: WidgetServicePorts
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly eSignContextRevision?: string
  readonly rawErrors?: string[]
  readonly required?: boolean
}): ReactElement {
  return (
    <StatefulSignatureESignWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      services={options.services}
      onChange={options.onChange}
      name={options.name ?? 'applicant_signature'}
      readonly={options.readonly}
      disabled={options.disabled}
      eSignContextRevision={options.eSignContextRevision}
      rawErrors={options.rawErrors}
      required={options.required}
    />
  )
}

const DEFAULT_FAMILY_ITEMS: RJSFSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    member_name: { type: 'string', title: 'Name', default: '' },
    relationship: { type: 'string', title: 'Relationship' },
  },
}

function mergeFamilyRepeaterSchemaUtils(
  baseUtils: Registry['schemaUtils'],
  overrides?: Partial<Registry['schemaUtils']>,
): Registry['schemaUtils'] {
  if (!overrides) {
    return baseUtils
  }
  // createSchemaUtils returns a class instance — never object-spread it (prototype methods vanish).
  return new Proxy(baseUtils, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        Object.prototype.hasOwnProperty.call(overrides, prop) &&
        overrides[prop as keyof typeof overrides] !== undefined
      ) {
        return overrides[prop as keyof typeof overrides]
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value
    },
  }) as Registry['schemaUtils']
}

function buildFamilyRepeaterRegistry(
  rootSchema: RJSFSchema,
  overrides?: {
    readonly SchemaField?: Registry['fields'][string]
    readonly omitSchemaField?: boolean
    readonly schemaUtils?: Partial<Registry['schemaUtils']>
  },
): Registry {
  const defaults = getDefaultRegistry()
  const baseUtils = createSchemaUtils(validator, rootSchema)
  const fields = { ...defaults.fields, ...dg20Fields }
  if (overrides?.omitSchemaField) {
    delete fields.SchemaField
  } else if (overrides?.SchemaField) {
    fields.SchemaField = overrides.SchemaField
  }
  return {
    ...defaults,
    fields,
    widgets: { ...defaults.widgets, ...dg20Widgets },
    schemaUtils: mergeFamilyRepeaterSchemaUtils(baseUtils, overrides?.schemaUtils),
    rootSchema,
    formContext: {},
    translateString: englishStringTranslator,
  }
}

function StatefulFamilyRepeaterWidget(options: {
  readonly bilingual: BilingualContent
  readonly locale: 'en' | 'gu'
  readonly initialFormData: unknown
  readonly onChange?: (value: unknown) => void
  readonly name: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly minItems?: number
  readonly maxItems?: number
  readonly itemsSchema?: RJSFSchema
  readonly rawErrors?: string[]
  readonly errorSchema?: FieldHarnessProps['errorSchema']
  readonly uiSchemaItems?: Record<string, unknown>
  readonly idPrefix?: string
  readonly idSeparator?: string
  readonly SchemaField?: Registry['fields'][string]
  readonly omitSchemaField?: boolean
  readonly schemaUtils?: Partial<Registry['schemaUtils']>
  readonly services?: WidgetServicePorts
  readonly prefillBindings?: readonly PrefillBinding[]
  readonly resolveFieldId?: FieldIdResolver
}): ReactElement {
  const [formData, setFormData] = useState(options.initialFormData)
  useEffect(() => {
    setFormData(options.initialFormData)
  }, [options.initialFormData])

  const id = `root_${options.name}`
  const minItems = options.minItems ?? 0
  const maxItems = options.maxItems ?? 5
  const itemsSchema = options.itemsSchema ?? DEFAULT_FAMILY_ITEMS
  const fieldSchema: RJSFSchema = {
    type: 'array',
    title: 'Family members',
    minItems,
    maxItems,
    items: itemsSchema,
  }
  const rootSchema: RJSFSchema = {
    type: 'object',
    properties: {
      [options.name]: fieldSchema,
    },
  }
  const registry = buildFamilyRepeaterRegistry(rootSchema, {
    SchemaField: options.SchemaField,
    omitSchemaField: options.omitSchemaField,
    schemaUtils: options.schemaUtils,
  })
  const props: FieldHarnessProps = {
    name: options.name,
    formData,
    required: false,
    disabled: options.disabled ?? false,
    readonly: options.readonly ?? false,
    autofocus: false,
    onChange: (next) => {
      setFormData(next)
      options.onChange?.(next)
    },
    onBlur: noop,
    onFocus: noop,
    schema: fieldSchema,
    rawErrors: options.rawErrors,
    errorSchema: options.errorSchema,
    uiSchema: {
      'ui:field': 'family-repeater',
      items: options.uiSchemaItems ?? {
        member_name: { 'ui:widget': 'text-short' },
        relationship: { 'ui:widget': 'text-short' },
      },
    },
    idSchema: { $id: id },
    registry,
    formContext: {},
    idPrefix: options.idPrefix,
    idSeparator: options.idSeparator,
  }

  return wrap(
    options.bilingual,
    options.locale,
    options.services,
    <FamilyRepeaterWidget {...props} />,
    options.prefillBindings,
    undefined,
    undefined,
    options.resolveFieldId,
  )
}

export function renderFamilyRepeaterHarness(options: {
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly formData?: unknown
  readonly onChange?: (value: unknown) => void
  readonly name?: string
  readonly readonly?: boolean
  readonly disabled?: boolean
  readonly minItems?: number
  readonly maxItems?: number
  readonly itemsSchema?: RJSFSchema
  readonly rawErrors?: string[]
  readonly errorSchema?: FieldHarnessProps['errorSchema']
  readonly uiSchemaItems?: Record<string, unknown>
  readonly idPrefix?: string
  readonly idSeparator?: string
  readonly SchemaField?: Registry['fields'][string]
  readonly omitSchemaField?: boolean
  readonly schemaUtils?: Partial<Registry['schemaUtils']>
  readonly services?: WidgetServicePorts
  readonly prefillBindings?: readonly PrefillBinding[]
  readonly resolveFieldId?: FieldIdResolver
}): ReactElement {
  return (
    <StatefulFamilyRepeaterWidget
      bilingual={options.bilingual}
      locale={options.locale ?? 'en'}
      initialFormData={options.formData}
      onChange={options.onChange}
      name={options.name ?? 'family_members'}
      readonly={options.readonly}
      disabled={options.disabled}
      minItems={options.minItems}
      maxItems={options.maxItems}
      itemsSchema={options.itemsSchema}
      rawErrors={options.rawErrors}
      errorSchema={options.errorSchema}
      uiSchemaItems={options.uiSchemaItems}
      idPrefix={options.idPrefix}
      idSeparator={options.idSeparator}
      SchemaField={options.SchemaField}
      omitSchemaField={options.omitSchemaField}
      schemaUtils={options.schemaUtils}
      services={options.services}
      prefillBindings={options.prefillBindings}
      resolveFieldId={options.resolveFieldId}
    />
  )
}
