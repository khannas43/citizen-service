import type { FormDefinition } from '@citizen/form-contract'

import type { FieldConfiguration } from './property-config-types.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Detect whether an existing preview formData value would become invalid under
 * the accepted configuration's tighter constraints. Never clears or coerces
 * the preview value — the embedded Renderer remains the validation authority.
 */
export function previewValueMayBeInvalid(
  definition: FormDefinition,
  fieldId: string,
  configuration: FieldConfiguration,
  previewFormData: Readonly<Record<string, unknown>>,
): boolean {
  if (!(fieldId in previewFormData)) {
    return false
  }
  const value = previewFormData[fieldId]
  if (value === undefined || value === null) {
    return false
  }

  switch (configuration.widgetType) {
    case 'text-short': {
      if (typeof value !== 'string') return true
      const maxLength = Number(configuration.maxLength)
      if (Number.isSafeInteger(maxLength) && value.length > maxLength) return true
      if (configuration.pattern.length > 0) {
        try {
          if (!new RegExp(configuration.pattern).test(value)) return true
        } catch {
          return false
        }
      }
      return false
    }
    case 'text-long': {
      if (typeof value !== 'string') return true
      const maxLength = Number(configuration.maxLength)
      return Number.isSafeInteger(maxLength) && value.length > maxLength
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return true
      const min = configuration.minimum === '' ? undefined : Number(configuration.minimum)
      const max = configuration.maximum === '' ? undefined : Number(configuration.maximum)
      const step = configuration.step === '' ? undefined : Number(configuration.step)
      if (min !== undefined && Number.isFinite(min) && value < min) return true
      if (max !== undefined && Number.isFinite(max) && value > max) return true
      if (step !== undefined && Number.isFinite(step) && step > 0) {
        const base = min !== undefined && Number.isFinite(min) ? min : 0
        const units = (value - base) / step
        if (!Number.isFinite(units) || Math.abs(units - Math.round(units)) > 1e-9) return true
      }
      return false
    }
    case 'currency-inr': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return true
      const min = configuration.minimum === '' ? 0 : Number(configuration.minimum)
      const max = configuration.maximum === '' ? undefined : Number(configuration.maximum)
      if (Number.isFinite(min) && value < min) return true
      if (max !== undefined && Number.isFinite(max) && value > max) return true
      const cents = Math.round(value * 100)
      if (Math.abs(value * 100 - cents) > 1e-9) return true
      return false
    }
    case 'percentage': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return true
      return value < 0 || value > 100
    }
    case 'gender': {
      return value !== 'M' && value !== 'F' && value !== 'OTHER'
    }
    case 'yesno': {
      return typeof value !== 'boolean'
    }
    case 'section-header':
    case 'info-panel':
      return false
    case 'email': {
      return typeof value !== 'string'
    }
    case 'dob': {
      return typeof value !== 'string'
    }
    case 'full-name': {
      if (!isPlainObject(value)) return true
      return typeof value['en'] !== 'string' || typeof value['gu'] !== 'string'
    }
    case 'pincode': {
      if (!isPlainObject(value)) return true
      return typeof value['pincode'] !== 'string'
    }
    case 'aadhaar': {
      if (!isPlainObject(value)) return true
      return (
        typeof value['referenceToken'] !== 'string' ||
        typeof value['identifierKind'] !== 'string' ||
        typeof value['lastFour'] !== 'string'
      )
    }
    case 'mobile-otp': {
      if (!isPlainObject(value)) return true
      return typeof value['mobileNumber'] !== 'string' || typeof value['verified'] !== 'boolean'
    }
    case 'bank-account': {
      if (!isPlainObject(value)) return true
      return typeof value['verified'] !== 'boolean'
    }
    case 'dropdown-master':
    case 'radio': {
      return typeof value !== 'string'
    }
    case 'multiselect': {
      return !Array.isArray(value)
    }
    case 'cascading-dropdown': {
      if (!isPlainObject(value)) return true
      return typeof value['parentCode'] !== 'string' || typeof value['childCode'] !== 'string'
    }
    case 'address-block': {
      if (!isPlainObject(value)) return true
      return typeof value['stateCode'] !== 'string'
    }
    case 'photo-capture': {
      if (!isPlainObject(value)) return true
      return (
        typeof value['objectRef'] !== 'string' ||
        typeof value['mimeType'] !== 'string' ||
        typeof value['sizeBytes'] !== 'number' ||
        typeof value['width'] !== 'number' ||
        typeof value['height'] !== 'number' ||
        typeof value['scanStatus'] !== 'string'
      )
    }
    case 'doc-upload': {
      if (!isPlainObject(value)) return true
      return (
        typeof value['objectRef'] !== 'string' ||
        typeof value['fileName'] !== 'string' ||
        typeof value['mimeType'] !== 'string' ||
        typeof value['sizeBytes'] !== 'number' ||
        typeof value['scanStatus'] !== 'string'
      )
    }
    case 'digilocker-fetch': {
      if (!isPlainObject(value)) return true
      return (
        typeof value['issuerSignedRef'] !== 'string' ||
        typeof value['documentTypeCode'] !== 'string'
      )
    }
    case 'fee-field': {
      if (!isPlainObject(value)) return true
      return (
        typeof value['feeRuleId'] !== 'string' ||
        typeof value['contextRevision'] !== 'string' ||
        typeof value['currency'] !== 'string' ||
        typeof value['amountMinor'] !== 'number' ||
        typeof value['quoteRef'] !== 'string'
      )
    }
    case 'signature-esign': {
      if (!isPlainObject(value)) return true
      return (
        typeof value['contextRevision'] !== 'string' ||
        typeof value['signedArtefactRef'] !== 'string'
      )
    }
    case 'eligibility-declaration': {
      if (!isPlainObject(value)) return true
      return (
        typeof value['declarationId'] !== 'string' ||
        typeof value['accepted'] !== 'boolean' ||
        typeof value['locale'] !== 'string' ||
        typeof value['consentReceiptRef'] !== 'string'
      )
    }
    case 'caf-prefill': {
      if (!isPlainObject(value)) return true
      return typeof value['value'] !== 'string' || typeof value['source'] !== 'string'
    }
    case 'family-repeater': {
      // Family-repeater preview values are row arrays; structure Apply remounts via member key.
      return Array.isArray(value) === false && value !== undefined
    }
    default: {
      const _exhaustive: never = configuration
      void _exhaustive
      void definition
      return false
    }
  }
}

/** True when the field schema object still contains an unrelated preserved key. */
export function schemaHasOwnKey(definition: FormDefinition, fieldId: string, key: string): boolean {
  const properties = definition.jsonSchema['properties']
  if (!isPlainObject(properties)) return false
  const schema = properties[fieldId]
  if (!isPlainObject(schema)) return false
  return Object.prototype.hasOwnProperty.call(schema, key)
}
