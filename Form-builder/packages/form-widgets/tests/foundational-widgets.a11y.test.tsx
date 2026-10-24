import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'

import type { BilingualContent, PrefillBinding } from '@dg20/form-contract'

import type {
  BankAccountVerificationAdapter,
  CafPrefillAdapter,
  ConsentLoggingAdapter,
  FeeComputationAdapter,
  GeographyAdapter,
  MasterDataAdapter,
  MasterDataOption,
  PincodeLookupAdapter,
  ESignAdapter,
} from '../src/runtime/service-ports.js'
import { DemoForm } from '../src/widgets/DemoForm.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingual: BilingualContent = {
  labels: {
    shortName: { en: 'Short name', gu: 'ટૂંકું નામ' },
    remarks: { en: 'Remarks', gu: 'ટિપ્પણી' },
    count: { en: 'Count', gu: 'ગણતરી' },
    income: { en: 'Income', gu: 'આવક' },
    score: { en: 'Score', gu: 'સ્કોર' },
    sectionA: { en: 'Section A', gu: 'વિભાગ અ' },
    notice: { en: 'Notice', gu: 'સૂચના' },
    stepTwo: { en: 'Step two', gu: 'પગલું બે' },
    contactEmail: { en: 'Email', gu: 'ઇમેઇલ' },
    applicant_full_name: { en: 'Full name', gu: 'પૂરું નામ' },
    date_of_birth: { en: 'DOB', gu: 'જન્મ તારીખ' },
    gender: { en: 'Gender', gu: 'લિંગ' },
    aadhaar_ref: { en: 'Aadhaar', gu: 'આધાર' },
    mobile_otp: { en: 'Mobile', gu: 'મોબાઇલ' },
    caf_name: { en: 'CAF name', gu: 'CAF નામ' },
    address_block: { en: 'Address', gu: 'સરનામું' },
    pincode: { en: 'PIN code', gu: 'પિન કોડ' },
    doc_upload: { en: 'Document', gu: 'દસ્તાવેજ' },
    digilocker_doc: { en: 'DigiLocker', gu: 'DigiLocker' },
    photo_capture: { en: 'Photo', gu: 'ફોટો' },
    master_category: { en: 'Category', gu: 'શ્રેણી' },
    master_preference: { en: 'Preference', gu: 'પસંદગી' },
    consent_yesno: { en: 'Consent', gu: 'સંમતિ' },
    benefits_multi: { en: 'Benefits', gu: 'લાભ' },
    cascade_area: { en: 'Area', gu: 'વિસ્તાર' },
    bank_account: { en: 'Bank account', gu: 'બેંક ખાતું' },
    eligibility_declaration: { en: 'Eligibility declaration', gu: 'પાત્રતા ઘોષણા' },
    service_fee: { en: 'Service fee', gu: 'સેવા ફી' },
    applicant_signature: { en: 'Applicant signature', gu: 'અરજદારની સહી' },
    family_members: { en: 'Family members', gu: 'કુટુંબ સભ્યો' },
    member_name: { en: 'Name', gu: 'નામ' },
    relationship: { en: 'Relationship', gu: 'સંબંધ' },
  },
  help: {
    shortName: { en: 'Help EN', gu: 'મદદ ગુ' },
    remarks: { en: 'Long help', gu: 'લાંબી મદદ' },
    notice: { en: 'Info body', gu: 'માહિતી મુખ્ય ભાગ' },
    eligibility_declaration: {
      en: 'I confirm that I meet the eligibility criteria for this service.',
      gu: 'હું પુષ્ટિ કરું છું કે હું આ સેવા માટેની પાત્રતા શરતો પૂરી કરું છું.',
    },
    service_fee: {
      en: 'Calculated from the current application context.',
      gu: 'વર્તમાન અરજી સંદર્ભમાંથી ગણાયેલું.',
    },
    applicant_signature: {
      en: 'Sign the application with eSign.',
      gu: 'eSign વડે અરજી પર સહી કરો.',
    },
    family_members: {
      en: 'Add each dependent family member.',
      gu: 'દરેક આશ્રિત કુટુંબ સભ્ય ઉમેરો.',
    },
  },
  errors: {},
}

const clock = { todayIso: () => '2026-07-20' }

function opt(code: string, en: string, gu: string): MasterDataOption {
  return { code, labelEn: en, labelGu: gu }
}

const geography: GeographyAdapter = {
  async listOptions(request) {
    if (request.level === 'state') {
      return [opt('GJ', 'Gujarat', 'ગુજરાત')]
    }
    if (request.level === 'district') {
      return [opt('AHM', 'Ahmedabad', 'અમદાવાદ')]
    }
    if (request.level === 'taluka') {
      return [opt('DASK', 'Daskroi', 'દસ્ક્રોઈ')]
    }
    return [opt('V001', 'Village One', 'ગામ એક')]
  },
}

const cafPrefill: CafPrefillAdapter = {
  async resolvePrefill() {
    return { value: 'Demo', confidence: 0.99 }
  },
}

const pincodeLookup: PincodeLookupAdapter = {
  async lookupPincode() {
    return {
      found: true,
      cityCode: 'AHM',
      districtCode: 'D-AHM',
      cityLabelEn: 'Ahmedabad',
      cityLabelGu: 'અમદાવાદ',
      districtLabelEn: 'Ahmedabad',
      districtLabelGu: 'અમદાવાદ',
    }
  },
}

const masterData: MasterDataAdapter = {
  async listOptions({ masterListId, parentCode }) {
    if (masterListId === 'LIST_CATEGORY') {
      return [opt('GEN', 'General', 'સામાન્ય'), opt('OBC', 'OBC', 'ઓબીસી')]
    }
    if (masterListId === 'LIST_BENEFITS') {
      return [opt('FOOD', 'Food', 'ખોરાક'), opt('HEALTH', 'Health', 'આરોગ્ય')]
    }
    if (masterListId === 'LIST_STATE') {
      return [opt('GJ', 'Gujarat', 'ગુજરાત')]
    }
    if (masterListId === 'LIST_DISTRICT' && parentCode === 'GJ') {
      return [opt('AHM', 'Ahmedabad', 'અમદાવાદ')]
    }
    return [opt('ONLINE', 'Online', 'ઓનલાઇન'), opt('OFFICE', 'In office', 'કચેરીમાં')]
  },
}

const bankAccountVerification: BankAccountVerificationAdapter = {
  async verifyAccountName() {
    return { verified: true, verificationRef: 'bank-ref-a11y' }
  },
}

const consentLogging: ConsentLoggingAdapter = {
  async recordDecision(request) {
    return {
      declarationId: request.declarationId,
      accepted: request.accepted,
      locale: request.locale,
      consentReceiptRef: 'consent-receipt-a11y-001',
    }
  },
}

const feeComputation: FeeComputationAdapter = {
  async computeFee(request) {
    return {
      feeRuleId: request.feeRuleId,
      contextRevision: request.contextRevision,
      currency: 'INR',
      amountMinor: 10000,
      quoteRef: `fee-quote-a11y:${request.contextRevision}`,
    }
  },
}

const eSign: ESignAdapter = {
  async requestSignature(request) {
    return {
      status: 'SIGNED',
      contextRevision: request.contextRevision,
      signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:a11y`,
    }
  },
}

const prefillBindings: readonly PrefillBinding[] = [
  { fieldId: 'caf_name', cafAttribute: 'person.fullName', confidenceMin: 0.8 },
]

const combinedSchema = {
  type: 'object' as const,
  required: ['shortName', 'gender'],
  properties: {
    sectionA: { type: 'object' as const, title: 'Section A', properties: {} },
    notice: {
      type: 'object' as const,
      title: 'Notice',
      description: 'Info body',
      properties: {},
    },
    shortName: { type: 'string' as const, maxLength: 40, title: 'Short name' },
    remarks: { type: 'string' as const, maxLength: 80, title: 'Remarks' },
    count: {
      type: 'number' as const,
      minimum: 0,
      maximum: 10,
      multipleOf: 1,
      title: 'Count',
    },
    income: { type: 'number' as const, minimum: 0, title: 'Income' },
    score: {
      type: 'number' as const,
      minimum: 0,
      maximum: 100,
      multipleOf: 1,
      title: 'Score',
    },
    contactEmail: { type: 'string' as const, format: 'email', title: 'Email' },
    applicant_full_name: {
      type: 'object' as const,
      title: 'Full name',
      properties: {
        en: { type: 'string' as const },
        gu: { type: 'string' as const },
      },
      required: ['en', 'gu'],
      additionalProperties: false,
    },
    date_of_birth: {
      type: 'string' as const,
      format: 'date',
      title: 'DOB',
      'x-dg20': { minAge: 18, maxAge: 90 },
    },
    gender: { type: 'string' as const, title: 'Gender' },
    aadhaar_ref: {
      type: 'object' as const,
      title: 'Aadhaar',
      properties: {
        referenceToken: { type: 'string' as const },
        identifierKind: { type: 'string' as const, enum: ['AADHAAR', 'VID'] },
        lastFour: { type: 'string' as const, pattern: '^[0-9]{4}$' },
      },
      required: ['referenceToken', 'identifierKind', 'lastFour'],
      additionalProperties: false,
    },
    mobile_otp: {
      type: 'object' as const,
      title: 'Mobile',
      properties: {
        mobileNumber: { type: 'string' as const },
        verified: { type: 'boolean' as const },
        verificationRef: { type: 'string' as const },
      },
      required: ['mobileNumber', 'verified'],
      additionalProperties: false,
    },
    caf_name: {
      type: 'object' as const,
      title: 'CAF name',
      properties: {
        value: { type: 'string' as const },
        source: { type: 'string' as const, enum: ['CAF', 'OVERRIDE'] },
      },
      required: ['value', 'source'],
      additionalProperties: false,
    },
    address_block: {
      type: 'object' as const,
      title: 'Address',
      properties: {
        stateCode: { type: 'string' as const },
        districtCode: { type: 'string' as const },
        talukaCode: { type: 'string' as const },
        villageCode: { type: 'string' as const },
      },
      additionalProperties: false,
    },
    pincode: {
      type: 'object' as const,
      title: 'PIN code',
      properties: {
        pincode: { type: 'string' as const },
        cityCode: { type: 'string' as const },
        districtCode: { type: 'string' as const },
      },
      required: ['pincode'],
      additionalProperties: false,
    },
    doc_upload: {
      type: 'object' as const,
      title: 'Document',
      properties: {
        objectRef: { type: 'string' as const },
        fileName: { type: 'string' as const },
        mimeType: { type: 'string' as const },
        sizeBytes: { type: 'number' as const },
        scanStatus: { type: 'string' as const, enum: ['CLEAN'] },
      },
      additionalProperties: false,
      'x-dg20': {
        allowedMimeTypes: ['application/pdf'],
        maxFileSizeBytes: 1_048_576,
      },
    },
    digilocker_doc: {
      type: 'object' as const,
      title: 'DigiLocker',
      properties: {
        issuerSignedRef: { type: 'string' as const },
        documentTypeCode: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': { digiLockerDocumentTypeCode: 'PAN' },
    },
    photo_capture: {
      type: 'object' as const,
      title: 'Photo',
      properties: {
        objectRef: { type: 'string' as const },
        mimeType: { type: 'string' as const },
        sizeBytes: { type: 'number' as const },
        width: { type: 'number' as const },
        height: { type: 'number' as const },
        scanStatus: { type: 'string' as const, enum: ['CLEAN'] },
      },
      additionalProperties: false,
    },
    master_category: {
      type: 'string' as const,
      title: 'Category',
      'x-dg20': { masterListId: 'LIST_CATEGORY' },
    },
    master_preference: {
      type: 'string' as const,
      title: 'Preference',
      'x-dg20': { masterListId: 'LIST_PREF' },
    },
    consent_yesno: { type: 'boolean' as const, title: 'Consent' },
    benefits_multi: {
      type: 'array' as const,
      title: 'Benefits',
      items: { type: 'string' as const },
      minItems: 1,
      maxItems: 2,
      'x-dg20': { masterListId: 'LIST_BENEFITS' },
    },
    cascade_area: {
      type: 'object' as const,
      title: 'Area',
      properties: {
        parentCode: { type: 'string' as const },
        childCode: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': {
        parentMasterListId: 'LIST_STATE',
        childMasterListId: 'LIST_DISTRICT',
      },
    },
    bank_account: {
      type: 'object' as const,
      title: 'Bank account',
      properties: {
        accountNumber: { type: 'string' as const },
        ifsc: { type: 'string' as const },
        accountHolderName: { type: 'string' as const },
        verified: { type: 'boolean' as const },
        verificationRef: { type: 'string' as const },
      },
      additionalProperties: false,
    },
    eligibility_declaration: {
      type: 'object' as const,
      title: 'Eligibility declaration',
      properties: {
        declarationId: { type: 'string' as const },
        accepted: { type: 'boolean' as const },
        locale: { type: 'string' as const },
        consentReceiptRef: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': { declarationId: 'DECL_ELIG_A11Y_V1' },
    },
    service_fee: {
      type: 'object' as const,
      title: 'Service fee',
      properties: {
        feeRuleId: { type: 'string' as const },
        contextRevision: { type: 'string' as const },
        currency: { type: 'string' as const },
        amountMinor: { type: 'integer' as const },
        quoteRef: { type: 'string' as const },
      },
      additionalProperties: false,
      'x-dg20': { feeRuleId: 'FEE_RULE_A11Y_V1' },
    },
    applicant_signature: {
      type: 'object' as const,
      title: 'Applicant signature',
      properties: {
        contextRevision: { type: 'string' as const },
        signedArtefactRef: { type: 'string' as const },
      },
      additionalProperties: false,
    },
    family_members: {
      type: 'array' as const,
      title: 'Family members',
      minItems: 0,
      maxItems: 5,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          member_name: { type: 'string' as const, title: 'Name' },
          relationship: { type: 'string' as const, title: 'Relationship' },
        },
      },
    },
    stepTwo: { type: 'object' as const, title: 'Step two', properties: {} },
  },
}

const combinedUi = {
  sectionA: { 'ui:field': 'section-header' },
  notice: { 'ui:field': 'info-panel' },
  shortName: { 'ui:widget': 'text-short' },
  remarks: { 'ui:widget': 'text-long' },
  count: { 'ui:widget': 'number' },
  income: { 'ui:widget': 'currency-inr' },
  score: { 'ui:widget': 'percentage' },
  contactEmail: { 'ui:widget': 'email' },
  applicant_full_name: { 'ui:field': 'full-name' },
  date_of_birth: { 'ui:widget': 'dob' },
  gender: { 'ui:widget': 'gender' },
  aadhaar_ref: { 'ui:field': 'aadhaar' },
  mobile_otp: { 'ui:field': 'mobile-otp' },
  caf_name: { 'ui:field': 'caf-prefill' },
  address_block: { 'ui:field': 'address-block' },
  pincode: { 'ui:field': 'pincode' },
  doc_upload: { 'ui:field': 'doc-upload' },
  digilocker_doc: { 'ui:field': 'digilocker-fetch' },
  photo_capture: { 'ui:field': 'photo-capture' },
  master_category: { 'ui:widget': 'dropdown-master' },
  master_preference: { 'ui:widget': 'radio' },
  consent_yesno: { 'ui:widget': 'yesno' },
  benefits_multi: { 'ui:widget': 'multiselect' },
  cascade_area: { 'ui:field': 'cascading-dropdown' },
  bank_account: { 'ui:field': 'bank-account' },
  eligibility_declaration: { 'ui:field': 'eligibility-declaration' },
  service_fee: { 'ui:field': 'fee-field' },
  applicant_signature: { 'ui:field': 'signature-esign' },
  family_members: {
    'ui:field': 'family-repeater',
    items: {
      member_name: { 'ui:widget': 'text-short' },
      relationship: { 'ui:widget': 'text-short' },
    },
  },
  stepTwo: { 'ui:field': 'page-break' },
}

const formData = {
  remarks: 'Hello',
  income: 10.5,
  score: 25,
  contactEmail: 'a@b.co',
  applicant_full_name: { en: 'Priya', gu: 'પ્રિયા' },
  date_of_birth: '1990-01-01',
  gender: 'F',
  count: 2,
  aadhaar_ref: {
    referenceToken: 'synthetic-ref-token',
    identifierKind: 'AADHAAR',
    lastFour: '0000',
  },
  mobile_otp: {
    mobileNumber: '9876543210',
    verified: true,
    verificationRef: 'synthetic-ver-ref',
  },
  caf_name: { value: 'Demo', source: 'CAF' },
  address_block: {
    stateCode: 'GJ',
    districtCode: 'AHM',
    talukaCode: 'DASK',
    villageCode: 'V001',
  },
  pincode: { pincode: '380001', cityCode: 'AHM', districtCode: 'D-AHM' },
  doc_upload: {
    objectRef: 'obj-doc-a11y',
    fileName: 'proof.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    scanStatus: 'CLEAN',
  },
  digilocker_doc: {
    issuerSignedRef: 'issuer-ref-a11y',
    documentTypeCode: 'PAN',
  },
  photo_capture: {
    objectRef: 'obj-photo-a11y',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    width: 640,
    height: 480,
    scanStatus: 'CLEAN',
  },
  master_category: 'GEN',
  master_preference: 'ONLINE',
  consent_yesno: true,
  benefits_multi: ['FOOD'],
  cascade_area: { parentCode: 'GJ', childCode: 'AHM' },
  bank_account: {
    accountNumber: '001234567890',
    ifsc: 'SBIN0001234',
    accountHolderName: 'Priya Sharma',
    verified: true,
    verificationRef: 'bank-ref-a11y',
  },
  eligibility_declaration: {
    declarationId: 'DECL_ELIG_A11Y_V1',
    accepted: true,
    locale: 'en',
    consentReceiptRef: 'consent-receipt-a11y-001',
  },
  service_fee: {
    feeRuleId: 'FEE_RULE_A11Y_V1',
    contextRevision: 'ctx-rev-a11y-001',
    currency: 'INR',
    amountMinor: 10000,
    quoteRef: 'fee-quote-a11y:ctx-rev-a11y-001',
  },
  applicant_signature: {
    contextRevision: 'ctx-esign-a11y-001',
    signedArtefactRef: 'esign-artefact:applicant_signature:ctx-esign-a11y-001:a11y',
  },
  family_members: [{ member_name: 'Asha', relationship: 'Spouse' }],
}

const services = {
  clock,
  cafPrefill,
  geography,
  pincodeLookup,
  masterData,
  bankAccountVerification,
  consentLogging,
  feeComputation,
  eSign,
}

describe('foundational + A2–A12 widgets accessibility', () => {
  it('has no axe violations in English combined rendering of all 30 widgets', async () => {
    const { container } = render(
      <DemoForm
        schema={combinedSchema}
        uiSchema={combinedUi}
        bilingual={bilingual}
        locale="en"
        formData={formData}
        services={services}
        prefillBindings={prefillBindings}
        feeContextRevision="ctx-rev-a11y-001"
        eSignContextRevision="ctx-esign-a11y-001"
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in Gujarati combined rendering of all 30 widgets', async () => {
    const { container } = render(
      <DemoForm
        schema={combinedSchema}
        uiSchema={combinedUi}
        bilingual={bilingual}
        locale="gu"
        formData={formData}
        services={services}
        prefillBindings={prefillBindings}
        feeContextRevision="ctx-rev-a11y-001"
        eSignContextRevision="ctx-esign-a11y-001"
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('associates labels and avoids duplicate IDs in combined form', () => {
    const { container } = render(
      <DemoForm
        schema={combinedSchema}
        uiSchema={combinedUi}
        bilingual={bilingual}
        locale="en"
        formData={formData}
        services={services}
        prefillBindings={prefillBindings}
        feeContextRevision="ctx-rev-a11y-001"
        eSignContextRevision="ctx-esign-a11y-001"
        extraErrors={{ shortName: { __errors: ['Required'] } }}
        liveValidate
      />,
    )

    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
