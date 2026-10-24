/**
 * Acceptance-only harness surface (FB-D22).
 * Not part of any public package export.
 */

export {
  UNIT_D_ACCEPTANCE_ACTOR,
  UNIT_D_ACCEPTANCE_DEFINITION,
  UNIT_D_ACCEPTANCE_FIELD_IDS,
  UNIT_D_ACCEPTANCE_SERVICE_ID,
  UNIT_D_ACCEPTANCE_VERSION,
  UNIT_D_ACCEPTANCE_WIDGET_TYPES,
} from './unit-d-acceptance-definition.js'
export {
  UNIT_E_ACCEPTANCE_ACTOR,
  UNIT_E_ACCEPTANCE_DEFINITION,
  UNIT_E_ACCEPTANCE_FIXTURE_SHA256,
  UNIT_E_ACCEPTANCE_SERVICE_ID,
  UNIT_E_ACCEPTANCE_VERSION,
  assertUnitEFixtureNotDrifted,
  loadUnitEContractManifest,
  unitERepresentativeSha256,
} from './unit-e-representative-definition.js'
export {
  createAcceptanceLifecycleAdapter,
  createAcceptancePersistenceAdapter,
  createAcceptancePersistenceStore,
  createAcceptanceValidationAdapter,
  createAcceptanceVersionAdapter,
  seedPublishedSource,
  type AcceptanceCallLog,
  type AcceptanceLifecycleControls,
  type AcceptancePersistenceControls,
  type AcceptancePersistenceStore,
  type AcceptanceValidationControls,
  type AcceptanceVersionControls,
} from './in-memory-adapters.js'
