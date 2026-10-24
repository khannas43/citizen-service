import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * Nested field-identity scope for Family Repeater (and nested repeaters).
 * Composes without recreating WidgetRuntimeProvider.
 */
export interface NestedFieldIdentityScopeValue {
  /** Definition path prefix ending at the current array template, e.g. `family_members[]`. */
  readonly definitionPrefix: string
  /** Instance path prefix ending at the current row index, e.g. `family_members[0]`. */
  readonly instancePrefix: string
}

const NestedFieldIdentityContext = createContext<NestedFieldIdentityScopeValue | null>(null)

export function useNestedFieldIdentityScope(): NestedFieldIdentityScopeValue | null {
  return useContext(NestedFieldIdentityContext)
}

export interface NestedFieldIdentityScopeProps {
  readonly definitionPrefix: string
  readonly instancePrefix: string
  readonly children: ReactNode
}

/**
 * Provides row (or nested-array) identity prefixes to descendants.
 * Must wrap each nested SchemaField tree inside a repeater row.
 */
export function NestedFieldIdentityScope({
  definitionPrefix,
  instancePrefix,
  children,
}: NestedFieldIdentityScopeProps) {
  const value = useMemo(
    () => ({ definitionPrefix, instancePrefix }),
    [definitionPrefix, instancePrefix],
  )
  return (
    <NestedFieldIdentityContext.Provider value={value}>
      {children}
    </NestedFieldIdentityContext.Provider>
  )
}
