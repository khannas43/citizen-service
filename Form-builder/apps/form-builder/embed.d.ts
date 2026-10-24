/**
 * Public TypeScript surface for `@dg20/form-builder-app/embed` (FB-E5.4.3A).
 * Hand-maintained to keep the host API narrow — does not expose acceptance adapters.
 */
import type { ComponentType } from 'react'

/** Request-time token source. Return the raw credential (no `Bearer ` prefix). */
export type AccessTokenProvider = () => string | null | Promise<string | null>

export interface BuilderShellProps {
  readonly accessTokenProvider?: AccessTokenProvider | null
  /** Non-production technical actor only — officer production host must omit. */
  readonly lifecycleActorId?: string | null
  /** Optional initial definition for harnesses; production hosts omit. */
  readonly initialDefinition?: unknown
  readonly validationAdapter?: unknown
  readonly persistenceAdapter?: unknown
  readonly lifecycleAdapter?: unknown
  readonly versionManagementAdapter?: unknown
}

export declare const BuilderShell: ComponentType<BuilderShellProps>
