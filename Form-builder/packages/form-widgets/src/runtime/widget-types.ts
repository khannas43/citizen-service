import type { BilingualContent, PrefillBinding } from '@citizen/form-contract'

import type { FieldIdResolver } from './field-id.js'
import type { WidgetLocale } from './localized-text.js'
import type { WidgetMessageOverrides } from './messages.js'
import type { WidgetServicePorts } from './service-ports.js'
import { createBrowserWidgetClock } from './service-ports.js'

/**
 * Runtime context shared by DG20 RJSF widgets/fields.
 * Provided by Builder preview or citizen Renderer (Unit B) — not by i18next.
 */
export interface WidgetRuntimeContextValue {
  readonly locale: WidgetLocale
  /** FormDefinition.meta.bilingual (or a subset for stories/tests). */
  readonly bilingual: BilingualContent
  /** When true, all interactive widgets render disabled. */
  readonly disabled?: boolean
  /** When true, all interactive widgets render read-only. */
  readonly readOnly?: boolean
  /** Optional nested-schema fieldId mapper (Unit B). Default uses RJSF `name`. */
  readonly resolveFieldId?: FieldIdResolver
  /** Optional overrides for governed widget chrome messages. */
  readonly messageOverrides?: WidgetMessageOverrides
  /** Optional host-injected adapters (never HTTP inside this package). */
  readonly services?: WidgetServicePorts
  /**
   * Canonical FormDefinition.meta.prefillBindings (CAF).
   * Do not duplicate cafAttribute/confidenceMin in uiSchema or x-dg20.
   */
  readonly prefillBindings?: readonly PrefillBinding[]
  /**
   * Host-owned opaque revision that changes when fee inputs change.
   * Not part of FormDefinition / ui:options; never derived from full formData here.
   */
  readonly feeContextRevision?: string
  /**
   * Host-owned opaque revision for the exact application/document payload to sign.
   * Not part of FormDefinition / x-dg20 / ui:options.
   */
  readonly eSignContextRevision?: string
}

export const DEFAULT_BILINGUAL: BilingualContent = {
  labels: {},
  help: {},
  errors: {},
}

export const DEFAULT_WIDGET_RUNTIME: WidgetRuntimeContextValue = {
  locale: 'en',
  bilingual: DEFAULT_BILINGUAL,
  disabled: false,
  readOnly: false,
  prefillBindings: [],
  services: {
    clock: createBrowserWidgetClock(),
  },
}
