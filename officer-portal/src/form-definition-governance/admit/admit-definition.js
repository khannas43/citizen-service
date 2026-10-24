import { admitServiceId, admitVersionNumber } from './admit-coordinates.js'
import { admitStrongEtag } from './admit-strong-etag.js'
import { cloneJsonSafe } from './clone-json-safe.js'
import {
  arraysEqualExact,
  exactKeySet,
  getDataOwn,
  isDenseDataArray,
  isPlainDataObject,
  ownStringKeys,
} from './safe-object.js'

const DETAIL_STATUSES = new Set(['submitted', 'approved'])
const TRANSITION_STATUSES = new Set(['approved', 'published'])

const DEFINITION_REQUIRED = [
  'serviceId',
  'version',
  'status',
  'jsonSchema',
  'uiSchema',
  'meta',
  'audit',
]

function admitLocalizedPair(raw) {
  if (!isPlainDataObject(raw)) {
    return { ok: false }
  }
  const keys = ownStringKeys(raw)
  if (!exactKeySet(keys, ['en', 'gu'])) {
    return { ok: false }
  }
  const en = getDataOwn(raw, 'en')
  const gu = getDataOwn(raw, 'gu')
  if (!en.ok || !gu.ok || typeof en.value !== 'string' || typeof gu.value !== 'string') {
    return { ok: false }
  }
  return { ok: true, value: { en: en.value, gu: gu.value } }
}

function admitStringMapOfLocalized(raw) {
  if (!isPlainDataObject(raw)) {
    return { ok: false }
  }
  const keys = ownStringKeys(raw)
  if (keys === null) {
    return { ok: false }
  }
  const out = Object.create(null)
  for (const key of keys) {
    const entry = getDataOwn(raw, key)
    if (!entry.ok) {
      return { ok: false }
    }
    const pair = admitLocalizedPair(entry.value)
    if (!pair.ok) {
      return { ok: false }
    }
    out[key] = pair.value
  }
  return { ok: true, value: out }
}

function admitStringArray(raw) {
  if (!isDenseDataArray(raw)) {
    return { ok: false }
  }
  const out = []
  for (let index = 0; index < raw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, index)
    if (!descriptor || !('value' in descriptor) || descriptor.get || descriptor.set) {
      return { ok: false }
    }
    if (typeof descriptor.value !== 'string' || descriptor.value.length === 0) {
      return { ok: false }
    }
    out.push(descriptor.value)
  }
  return { ok: true, value: out }
}

function admitPaletteProvenance(raw) {
  if (!isDenseDataArray(raw)) {
    return { ok: false }
  }
  const out = []
  for (let index = 0; index < raw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, index)
    if (!descriptor || !('value' in descriptor) || !isPlainDataObject(descriptor.value)) {
      return { ok: false }
    }
    const item = descriptor.value
    const keys = ownStringKeys(item)
    if (!exactKeySet(keys, ['fieldId', 'widgetType'])) {
      return { ok: false }
    }
    const fieldId = getDataOwn(item, 'fieldId')
    const widgetType = getDataOwn(item, 'widgetType')
    if (
      !fieldId.ok ||
      !widgetType.ok ||
      typeof fieldId.value !== 'string' ||
      typeof widgetType.value !== 'string' ||
      fieldId.value.length === 0 ||
      widgetType.value.length === 0
    ) {
      return { ok: false }
    }
    out.push({ fieldId: fieldId.value, widgetType: widgetType.value })
  }
  return { ok: true, value: out }
}

function admitPrefillBindings(raw) {
  if (!isDenseDataArray(raw)) {
    return { ok: false }
  }
  const out = []
  for (let index = 0; index < raw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, index)
    if (!descriptor || !('value' in descriptor) || !isPlainDataObject(descriptor.value)) {
      return { ok: false }
    }
    const item = descriptor.value
    const keys = ownStringKeys(item)
    if (!exactKeySet(keys, ['fieldId', 'cafAttribute', 'confidenceMin'])) {
      return { ok: false }
    }
    const fieldId = getDataOwn(item, 'fieldId')
    const cafAttribute = getDataOwn(item, 'cafAttribute')
    const confidenceMin = getDataOwn(item, 'confidenceMin')
    if (
      !fieldId.ok ||
      !cafAttribute.ok ||
      !confidenceMin.ok ||
      typeof fieldId.value !== 'string' ||
      typeof cafAttribute.value !== 'string' ||
      typeof confidenceMin.value !== 'number' ||
      !Number.isFinite(confidenceMin.value)
    ) {
      return { ok: false }
    }
    out.push({
      fieldId: fieldId.value,
      cafAttribute: cafAttribute.value,
      confidenceMin: confidenceMin.value,
    })
  }
  return { ok: true, value: out }
}

function admitIntegrationBindings(raw) {
  if (!isDenseDataArray(raw)) {
    return { ok: false }
  }
  const out = []
  for (let index = 0; index < raw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, index)
    if (!descriptor || !('value' in descriptor) || !isPlainDataObject(descriptor.value)) {
      return { ok: false }
    }
    const item = descriptor.value
    const keys = ownStringKeys(item)
    if (!exactKeySet(keys, ['fieldId', 'adapterId', 'param', 'direction'])) {
      return { ok: false }
    }
    const fieldId = getDataOwn(item, 'fieldId')
    const adapterId = getDataOwn(item, 'adapterId')
    const param = getDataOwn(item, 'param')
    const direction = getDataOwn(item, 'direction')
    if (
      !fieldId.ok ||
      !adapterId.ok ||
      !param.ok ||
      !direction.ok ||
      typeof fieldId.value !== 'string' ||
      typeof adapterId.value !== 'string' ||
      typeof param.value !== 'string' ||
      (direction.value !== 'in' && direction.value !== 'out')
    ) {
      return { ok: false }
    }
    out.push({
      fieldId: fieldId.value,
      adapterId: adapterId.value,
      param: param.value,
      direction: direction.value,
    })
  }
  return { ok: true, value: out }
}

function admitWorkflowBindings(raw) {
  if (!isDenseDataArray(raw)) {
    return { ok: false }
  }
  const out = []
  for (let index = 0; index < raw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, index)
    if (!descriptor || !('value' in descriptor) || !isPlainDataObject(descriptor.value)) {
      return { ok: false }
    }
    const item = descriptor.value
    const keys = ownStringKeys(item)
    if (!exactKeySet(keys, ['fieldId', 'stage'])) {
      return { ok: false }
    }
    const fieldId = getDataOwn(item, 'fieldId')
    const stage = getDataOwn(item, 'stage')
    if (
      !fieldId.ok ||
      !stage.ok ||
      typeof fieldId.value !== 'string' ||
      typeof stage.value !== 'string'
    ) {
      return { ok: false }
    }
    out.push({ fieldId: fieldId.value, stage: stage.value })
  }
  return { ok: true, value: out }
}

function admitProgressiveSteps(raw) {
  if (!isDenseDataArray(raw)) {
    return { ok: false }
  }
  const out = []
  for (let index = 0; index < raw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, index)
    if (!descriptor || !('value' in descriptor) || !isPlainDataObject(descriptor.value)) {
      return { ok: false }
    }
    const item = descriptor.value
    const keys = ownStringKeys(item)
    if (!exactKeySet(keys, ['stepId', 'labelEn', 'labelGu', 'fieldIds'])) {
      return { ok: false }
    }
    const stepId = getDataOwn(item, 'stepId')
    const labelEn = getDataOwn(item, 'labelEn')
    const labelGu = getDataOwn(item, 'labelGu')
    const fieldIds = getDataOwn(item, 'fieldIds')
    if (
      !stepId.ok ||
      !labelEn.ok ||
      !labelGu.ok ||
      !fieldIds.ok ||
      typeof stepId.value !== 'string' ||
      typeof labelEn.value !== 'string' ||
      typeof labelGu.value !== 'string'
    ) {
      return { ok: false }
    }
    const ids = admitStringArray(fieldIds.value)
    if (!ids.ok) {
      return { ok: false }
    }
    out.push({
      stepId: stepId.value,
      labelEn: labelEn.value,
      labelGu: labelGu.value,
      fieldIds: ids.value,
    })
  }
  return { ok: true, value: out }
}

function admitMeta(raw) {
  if (!isPlainDataObject(raw)) {
    return { ok: false }
  }
  const keys = ownStringKeys(raw)
  if (
    !exactKeySet(keys, [
      'paletteProvenance',
      'bilingual',
      'prefillBindings',
      'integrationBindings',
      'workflowBindings',
      'progressiveSteps',
    ])
  ) {
    return { ok: false }
  }
  const paletteRaw = getDataOwn(raw, 'paletteProvenance')
  const bilingualRaw = getDataOwn(raw, 'bilingual')
  const prefillRaw = getDataOwn(raw, 'prefillBindings')
  const integrationRaw = getDataOwn(raw, 'integrationBindings')
  const workflowRaw = getDataOwn(raw, 'workflowBindings')
  const progressiveRaw = getDataOwn(raw, 'progressiveSteps')
  if (
    !paletteRaw.ok ||
    !bilingualRaw.ok ||
    !prefillRaw.ok ||
    !integrationRaw.ok ||
    !workflowRaw.ok ||
    !progressiveRaw.ok ||
    !isPlainDataObject(bilingualRaw.value)
  ) {
    return { ok: false }
  }
  const bilingualKeys = ownStringKeys(bilingualRaw.value)
  if (!exactKeySet(bilingualKeys, ['labels', 'help', 'errors'])) {
    return { ok: false }
  }
  const labelsRaw = getDataOwn(bilingualRaw.value, 'labels')
  const helpRaw = getDataOwn(bilingualRaw.value, 'help')
  const errorsRaw = getDataOwn(bilingualRaw.value, 'errors')
  if (!labelsRaw.ok || !helpRaw.ok || !errorsRaw.ok) {
    return { ok: false }
  }
  const paletteProvenance = admitPaletteProvenance(paletteRaw.value)
  const labels = admitStringMapOfLocalized(labelsRaw.value)
  const help = admitStringMapOfLocalized(helpRaw.value)
  const errors = admitStringMapOfLocalized(errorsRaw.value)
  const prefillBindings = admitPrefillBindings(prefillRaw.value)
  const integrationBindings = admitIntegrationBindings(integrationRaw.value)
  const workflowBindings = admitWorkflowBindings(workflowRaw.value)
  const progressiveSteps = admitProgressiveSteps(progressiveRaw.value)
  if (
    !paletteProvenance.ok ||
    !labels.ok ||
    !help.ok ||
    !errors.ok ||
    !prefillBindings.ok ||
    !integrationBindings.ok ||
    !workflowBindings.ok ||
    !progressiveSteps.ok
  ) {
    return { ok: false }
  }
  return {
    ok: true,
    value: {
      paletteProvenance: paletteProvenance.value,
      bilingual: {
        labels: labels.value,
        help: help.value,
        errors: errors.value,
      },
      prefillBindings: prefillBindings.value,
      integrationBindings: integrationBindings.value,
      workflowBindings: workflowBindings.value,
      progressiveSteps: progressiveSteps.value,
    },
  }
}

function admitNonblankUnpaddedString(raw) {
  if (typeof raw !== 'string') return { ok: false }
  if (raw.length === 0 || raw.trim().length === 0) return { ok: false }
  if (raw !== raw.trim()) return { ok: false }
  return { ok: true, value: raw }
}

function auditKeysForStatus(status) {
  if (status === 'submitted') {
    return ['createdBy', 'createdAt', 'submittedBy']
  }
  if (status === 'approved') {
    return ['createdBy', 'createdAt', 'submittedBy', 'approvedBy']
  }
  if (status === 'published') {
    return ['createdBy', 'createdAt', 'submittedBy', 'approvedBy', 'publishedAt']
  }
  return null
}

function admitAudit(raw, status) {
  if (!isPlainDataObject(raw)) {
    return { ok: false }
  }
  const required = auditKeysForStatus(status)
  if (!required) {
    return { ok: false }
  }
  const keys = ownStringKeys(raw)
  if (!exactKeySet(keys, required)) {
    return { ok: false }
  }
  const audit = {}
  for (const key of required) {
    const entry = getDataOwn(raw, key)
    if (!entry.ok) {
      return { ok: false }
    }
    const admitted = admitNonblankUnpaddedString(entry.value)
    if (!admitted.ok) {
      return { ok: false }
    }
    audit[key] = admitted.value
  }
  return { ok: true, value: audit }
}

function admitUiOrder(uiSchema) {
  if (!isPlainDataObject(uiSchema)) {
    return { ok: false }
  }
  const orderRaw = getDataOwn(uiSchema, 'ui:order')
  if (!orderRaw.ok) {
    return { ok: true, value: [] }
  }
  return admitStringArray(orderRaw.value)
}

/**
 * Admit a governance detail/transition Form Definition body + ETag header.
 * Clones the body before inspection so nested schema/meta never retain adapter refs.
 * @param {{ body: unknown, etagHeader: unknown, expectedServiceId: string, expectedVersion: number, allowedStatuses: Set<string>, expectedStatus?: string }} args
 */
export function admitGovernedDefinition(args) {
  const etag = admitStrongEtag(args.etagHeader)
  if (!etag.ok) {
    return { ok: false }
  }
  const clonedBody = cloneJsonSafe(args.body)
  if (!clonedBody.ok || !isPlainDataObject(clonedBody.value)) {
    return { ok: false }
  }
  const body = clonedBody.value
  const keys = ownStringKeys(body)
  if (!exactKeySet(keys, DEFINITION_REQUIRED)) {
    return { ok: false }
  }
  const serviceIdRaw = getDataOwn(body, 'serviceId')
  const versionRaw = getDataOwn(body, 'version')
  const statusRaw = getDataOwn(body, 'status')
  if (!serviceIdRaw.ok || !versionRaw.ok || !statusRaw.ok) {
    return { ok: false }
  }
  const serviceId = admitServiceId(serviceIdRaw.value)
  const version = admitVersionNumber(versionRaw.value)
  if (!serviceId.ok || !version.ok) {
    return { ok: false }
  }
  if (
    serviceId.serviceId !== args.expectedServiceId ||
    version.version !== args.expectedVersion
  ) {
    return { ok: false }
  }
  if (typeof statusRaw.value !== 'string' || !args.allowedStatuses.has(statusRaw.value)) {
    return { ok: false }
  }
  if (args.expectedStatus && statusRaw.value !== args.expectedStatus) {
    return { ok: false }
  }
  const jsonSchema = getDataOwn(body, 'jsonSchema')
  const uiSchema = getDataOwn(body, 'uiSchema')
  const metaRaw = getDataOwn(body, 'meta')
  const auditRaw = getDataOwn(body, 'audit')
  if (!jsonSchema.ok || !uiSchema.ok || !metaRaw.ok || !auditRaw.ok) {
    return { ok: false }
  }
  if (!isPlainDataObject(jsonSchema.value) || !isPlainDataObject(uiSchema.value)) {
    return { ok: false }
  }
  const meta = admitMeta(metaRaw.value)
  const audit = admitAudit(auditRaw.value, statusRaw.value)
  const order = admitUiOrder(uiSchema.value)
  if (!meta.ok || !audit.ok || !order.ok) {
    return { ok: false }
  }

  // Body was already JSON-cloned; rebuild root so callers never hold the clone root either.
  const definition = {
    serviceId: serviceId.serviceId,
    version: version.version,
    status: statusRaw.value,
    jsonSchema: jsonSchema.value,
    uiSchema: uiSchema.value,
    meta: meta.value,
    audit: audit.value,
  }

  return {
    ok: true,
    snapshot: {
      definition,
      etag: etag.etag,
      fieldOrder: order.value,
    },
  }
}

/**
 * Admit an injected adapter detail/transition envelope after clone-before-inspection.
 * Exact keys: definition, etag, fieldOrder. fieldOrder must match recomputed ui:order.
 */
export function admitAdapterSnapshotEnvelope(rawEnvelope, args) {
  const cloned = cloneJsonSafe(rawEnvelope)
  if (!cloned.ok || !isPlainDataObject(cloned.value)) {
    return { ok: false }
  }
  const keys = ownStringKeys(cloned.value)
  if (!exactKeySet(keys, ['definition', 'etag', 'fieldOrder'])) {
    return { ok: false }
  }
  const definitionRaw = getDataOwn(cloned.value, 'definition')
  const etagRaw = getDataOwn(cloned.value, 'etag')
  const fieldOrderRaw = getDataOwn(cloned.value, 'fieldOrder')
  if (!definitionRaw.ok || !etagRaw.ok || !fieldOrderRaw.ok) {
    return { ok: false }
  }
  if (!isDenseDataArray(fieldOrderRaw.value)) {
    return { ok: false }
  }
  const suppliedOrder = []
  for (let index = 0; index < fieldOrderRaw.value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(fieldOrderRaw.value, index)
    if (!descriptor || typeof descriptor.value !== 'string') {
      return { ok: false }
    }
    suppliedOrder.push(descriptor.value)
  }
  const admitted = admitGovernedDefinition({
    body: definitionRaw.value,
    etagHeader: etagRaw.value,
    expectedServiceId: args.expectedServiceId,
    expectedVersion: args.expectedVersion,
    allowedStatuses: args.allowedStatuses,
    expectedStatus: args.expectedStatus,
  })
  if (!admitted.ok) {
    return { ok: false }
  }
  if (!arraysEqualExact(admitted.snapshot.fieldOrder, suppliedOrder)) {
    return { ok: false }
  }
  return admitted
}

export function admitDetailDefinition(args) {
  return admitGovernedDefinition({
    ...args,
    allowedStatuses: DETAIL_STATUSES,
  })
}

export function admitTransitionDefinition(args) {
  return admitGovernedDefinition({
    ...args,
    allowedStatuses: TRANSITION_STATUSES,
    expectedStatus: args.expectedStatus,
  })
}

export function admitDetailAdapterEnvelope(rawEnvelope, args) {
  return admitAdapterSnapshotEnvelope(rawEnvelope, {
    ...args,
    allowedStatuses: DETAIL_STATUSES,
  })
}

export function admitTransitionAdapterEnvelope(rawEnvelope, args) {
  return admitAdapterSnapshotEnvelope(rawEnvelope, {
    ...args,
    allowedStatuses: TRANSITION_STATUSES,
    expectedStatus: args.expectedStatus,
  })
}

/** Build transition JSON body — exact keys only; never actorId. */
export function buildTransitionBody(targetStatus) {
  if (targetStatus !== 'approved' && targetStatus !== 'published') {
    throw new TypeError('invalid targetStatus')
  }
  return { targetStatus }
}
