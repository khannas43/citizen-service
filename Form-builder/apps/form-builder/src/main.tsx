import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { BuilderShell } from './shell/BuilderShell.js'
import { admitHostLifecycleActorId } from './lifecycle/index.js'

import '@dg20/form-widgets/styles/tokens.css'
import '@dg20/form-widgets/styles/widgets.css'
import '@dg20/form-renderer/styles/renderer.css'
import './styles/builder-document.css'
import './styles/builder.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Missing #root element')
}
const technicalActorRaw = import.meta.env.VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID
const admittedActor = admitHostLifecycleActorId(technicalActorRaw)
const lifecycleActorId = admittedActor.ok ? admittedActor.actorId : null

createRoot(rootElement).render(
  <StrictMode>
    <BuilderShell lifecycleActorId={lifecycleActorId} />
  </StrictMode>,
)
