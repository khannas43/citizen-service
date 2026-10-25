import { BuilderShell } from '@citizen/form-builder-app/embed'
import '@citizen/form-builder-app/styles/embed.css'
import { provideOfficerBuilderAccessToken } from './provide-officer-builder-access-token.js'
import './OfficerFormBuilder.css'

/**
 * Officer-owned Form Builder host wrapper (FB-E5.4.3A).
 * Injects request-time accessTokenProvider only — never lifecycleActorId / technical actor.
 */
export default function OfficerFormBuilder() {
  return (
    <div className="officer-form-builder" data-testid="officer-form-builder">
      <BuilderShell accessTokenProvider={provideOfficerBuilderAccessToken} />
    </div>
  )
}
