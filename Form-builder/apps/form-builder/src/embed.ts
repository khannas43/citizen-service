/**
 * Stable Form Builder embed entry for host SPAs (FB-E5.4.3A).
 *
 * Side-effect-free regarding mount/storage/env: importing this module must not
 * mount React, read Vite actor variables, touch browser storage, or execute
 * main.tsx. Hosts load styles via `@dg20/form-builder-app/styles/embed.css`.
 *
 * Hosts inject authentication via {@link BuilderShellProps.accessTokenProvider}.
 * Do not pass production {@link BuilderShellProps.lifecycleActorId}.
 */

export { BuilderShell, type BuilderShellProps } from './shell/BuilderShell.js'
export type { AccessTokenProvider } from './auth/index.js'
