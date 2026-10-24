import { createContext, useContext, useMemo, type ReactNode } from 'react'

import type { BilingualContent, PrefillBinding } from '@dg20/form-contract'

import type { FieldIdResolver } from './field-id.js'
import type { WidgetLocale } from './localized-text.js'
import type { WidgetMessageOverrides } from './messages.js'
import { createBrowserWidgetClock, type WidgetServicePorts } from './service-ports.js'
import { DEFAULT_WIDGET_RUNTIME, type WidgetRuntimeContextValue } from './widget-types.js'

const WidgetRuntimeContext = createContext<WidgetRuntimeContextValue>(DEFAULT_WIDGET_RUNTIME)

export interface WidgetRuntimeProviderProps {
  readonly locale?: WidgetLocale
  readonly bilingual?: BilingualContent
  readonly disabled?: boolean
  readonly readOnly?: boolean
  readonly resolveFieldId?: FieldIdResolver
  readonly messageOverrides?: WidgetMessageOverrides
  readonly services?: WidgetServicePorts
  /** Canonical FormDefinition.meta.prefillBindings for CAF widgets. */
  readonly prefillBindings?: readonly PrefillBinding[]
  /**
   * Host-owned opaque fee context revision (Unit B). Changes when fee inputs change.
   * Not FormDefinition / ui:options configuration.
   */
  readonly feeContextRevision?: string
  /**
   * Host-owned opaque eSign context revision (Unit B). Changes when signed content changes.
   * Not FormDefinition / x-dg20 / ui:options configuration.
   */
  readonly eSignContextRevision?: string
  readonly children: ReactNode
}

export function WidgetRuntimeProvider({
  locale = 'en',
  bilingual = DEFAULT_WIDGET_RUNTIME.bilingual,
  disabled = false,
  readOnly = false,
  resolveFieldId,
  messageOverrides,
  services,
  prefillBindings = [],
  feeContextRevision,
  eSignContextRevision,
  children,
}: WidgetRuntimeProviderProps) {
  const value = useMemo<WidgetRuntimeContextValue>(() => {
    const mergedServices: WidgetServicePorts = {
      clock: services?.clock ?? createBrowserWidgetClock(),
      emailVerification: services?.emailVerification,
      nameTransliteration: services?.nameTransliteration,
      identityTokenization: services?.identityTokenization,
      mobileOtp: services?.mobileOtp,
      cafPrefill: services?.cafPrefill,
      geography: services?.geography,
      pincodeLookup: services?.pincodeLookup,
      fileStorage: services?.fileStorage,
      digiLocker: services?.digiLocker,
      masterData: services?.masterData,
      bankAccountVerification: services?.bankAccountVerification,
      consentLogging: services?.consentLogging,
      feeComputation: services?.feeComputation,
      eSign: services?.eSign,
    }
    return {
      locale,
      bilingual,
      disabled,
      readOnly,
      resolveFieldId,
      messageOverrides,
      services: mergedServices,
      prefillBindings,
      feeContextRevision,
      eSignContextRevision,
    }
  }, [
    locale,
    bilingual,
    disabled,
    readOnly,
    resolveFieldId,
    messageOverrides,
    services,
    prefillBindings,
    feeContextRevision,
    eSignContextRevision,
  ])

  return <WidgetRuntimeContext.Provider value={value}>{children}</WidgetRuntimeContext.Provider>
}

export function useWidgetRuntime(): WidgetRuntimeContextValue {
  return useContext(WidgetRuntimeContext)
}
