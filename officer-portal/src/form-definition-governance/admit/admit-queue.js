import { admitServiceId, admitVersionNumber } from './admit-coordinates.js'
import { cloneJsonSafe } from './clone-json-safe.js'
import {
  exactKeySet,
  getDataOwn,
  isDenseDataArray,
  isPlainDataObject,
  ownStringKeys,
} from './safe-object.js'

const QUEUE_STATUSES = new Set(['submitted', 'approved'])

export function compareQueueKey(a, b) {
  const byService = a.serviceId < b.serviceId ? -1 : a.serviceId > b.serviceId ? 1 : 0
  if (byService !== 0) {
    return byService
  }
  return a.version - b.version
}

function admitQueueItem(raw) {
  if (!isPlainDataObject(raw)) {
    return { ok: false }
  }
  const keys = ownStringKeys(raw)
  if (!exactKeySet(keys, ['serviceId', 'version', 'status'])) {
    return { ok: false }
  }
  const serviceIdRaw = getDataOwn(raw, 'serviceId')
  const versionRaw = getDataOwn(raw, 'version')
  const statusRaw = getDataOwn(raw, 'status')
  if (!serviceIdRaw.ok || !versionRaw.ok || !statusRaw.ok) {
    return { ok: false }
  }
  const serviceId = admitServiceId(serviceIdRaw.value)
  const version = admitVersionNumber(versionRaw.value)
  if (!serviceId.ok || !version.ok) {
    return { ok: false }
  }
  if (typeof statusRaw.value !== 'string' || !QUEUE_STATUSES.has(statusRaw.value)) {
    return { ok: false }
  }
  return {
    ok: true,
    item: {
      serviceId: serviceId.serviceId,
      version: version.version,
      status: statusRaw.value,
    },
  }
}

function admitCursor(raw) {
  if (!isPlainDataObject(raw)) {
    return { ok: false }
  }
  const keys = ownStringKeys(raw)
  if (!exactKeySet(keys, ['serviceId', 'version'])) {
    return { ok: false }
  }
  const serviceIdRaw = getDataOwn(raw, 'serviceId')
  const versionRaw = getDataOwn(raw, 'version')
  if (!serviceIdRaw.ok || !versionRaw.ok) {
    return { ok: false }
  }
  const serviceId = admitServiceId(serviceIdRaw.value)
  const version = admitVersionNumber(versionRaw.value)
  if (!serviceId.ok || !version.ok) {
    return { ok: false }
  }
  return {
    ok: true,
    cursor: {
      serviceId: serviceId.serviceId,
      version: version.version,
    },
  }
}

function admitItemsArray(itemsRaw) {
  if (!isDenseDataArray(itemsRaw)) {
    return { ok: false }
  }
  const items = []
  const seen = new Set()
  for (let index = 0; index < itemsRaw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(itemsRaw, index)
    if (!descriptor || !('value' in descriptor)) {
      return { ok: false }
    }
    const admitted = admitQueueItem(descriptor.value)
    if (!admitted.ok) {
      return { ok: false }
    }
    const key = `${admitted.item.serviceId}\0${admitted.item.version}`
    if (seen.has(key)) {
      return { ok: false }
    }
    seen.add(key)
    if (index > 0 && compareQueueKey(items[index - 1], admitted.item) >= 0) {
      return { ok: false }
    }
    items.push(admitted.item)
  }
  return { ok: true, items }
}

function finalizeCursor(items, nextCursorValue, cursorRequired) {
  if (nextCursorValue === undefined) {
    if (cursorRequired) return { ok: false }
    return { ok: true, nextCursor: null }
  }
  if (nextCursorValue === null) {
    return { ok: true, nextCursor: null }
  }
  const cursor = admitCursor(nextCursorValue)
  if (!cursor.ok) {
    return { ok: false }
  }
  if (items.length === 0) {
    return { ok: false }
  }
  const last = items[items.length - 1]
  if (
    cursor.cursor.serviceId !== last.serviceId ||
    cursor.cursor.version !== last.version
  ) {
    return { ok: false }
  }
  return { ok: true, nextCursor: cursor.cursor }
}

/**
 * Admit governance queue HTTP body (items required; nextCursor optional).
 * Clones before inspection.
 */
export function admitGovernanceQueue(raw) {
  const cloned = cloneJsonSafe(raw)
  if (!cloned.ok || !isPlainDataObject(cloned.value)) {
    return { ok: false }
  }
  const keys = ownStringKeys(cloned.value)
  if (!exactKeySet(keys, ['items'], ['nextCursor'])) {
    return { ok: false }
  }
  const itemsRaw = getDataOwn(cloned.value, 'items')
  if (!itemsRaw.ok) {
    return { ok: false }
  }
  const itemsAdmit = admitItemsArray(itemsRaw.value)
  if (!itemsAdmit.ok) {
    return { ok: false }
  }
  let nextCursorValue
  if (keys.includes('nextCursor')) {
    const cursorRaw = getDataOwn(cloned.value, 'nextCursor')
    if (!cursorRaw.ok) {
      return { ok: false }
    }
    nextCursorValue = cursorRaw.value
  }
  const cursorAdmit = finalizeCursor(itemsAdmit.items, nextCursorValue, false)
  if (!cursorAdmit.ok) {
    return { ok: false }
  }
  return {
    ok: true,
    page: { items: itemsAdmit.items, nextCursor: cursorAdmit.nextCursor },
  }
}

/**
 * Admit injected adapter queue envelope: exact items + nextCursor (null allowed).
 */
export function admitAdapterQueueEnvelope(raw) {
  const cloned = cloneJsonSafe(raw)
  if (!cloned.ok || !isPlainDataObject(cloned.value)) {
    return { ok: false }
  }
  const keys = ownStringKeys(cloned.value)
  if (!exactKeySet(keys, ['items', 'nextCursor'])) {
    return { ok: false }
  }
  const itemsRaw = getDataOwn(cloned.value, 'items')
  const cursorRaw = getDataOwn(cloned.value, 'nextCursor')
  if (!itemsRaw.ok || !cursorRaw.ok) {
    return { ok: false }
  }
  const itemsAdmit = admitItemsArray(itemsRaw.value)
  if (!itemsAdmit.ok) {
    return { ok: false }
  }
  const cursorAdmit = finalizeCursor(itemsAdmit.items, cursorRaw.value, true)
  if (!cursorAdmit.ok) {
    return { ok: false }
  }
  return {
    ok: true,
    page: { items: itemsAdmit.items, nextCursor: cursorAdmit.nextCursor },
  }
}

export function queueItemKey(item) {
  return `${item.serviceId}\0${item.version}`
}

/**
 * Append a Load More page. Rejects replayed/overlapping pages (no silent dedupe).
 * Every incoming key must be strictly greater than the requested cursor.
 */
export function appendQueuePage(existing, incoming, requestedCursor) {
  if (
    !requestedCursor ||
    typeof requestedCursor.serviceId !== 'string' ||
    !Number.isSafeInteger(requestedCursor.version)
  ) {
    return { ok: false }
  }
  if (!Array.isArray(existing) || !Array.isArray(incoming)) {
    return { ok: false }
  }
  const existingKeys = new Set(existing.map(queueItemKey))
  for (let index = 0; index < incoming.length; index += 1) {
    const item = incoming[index]
    if (compareQueueKey(item, requestedCursor) <= 0) {
      return { ok: false }
    }
    const key = queueItemKey(item)
    if (existingKeys.has(key)) {
      return { ok: false }
    }
    if (index > 0 && compareQueueKey(incoming[index - 1], item) >= 0) {
      return { ok: false }
    }
    existingKeys.add(key)
  }
  if (existing.length > 0 && incoming.length > 0) {
    if (compareQueueKey(existing[existing.length - 1], incoming[0]) >= 0) {
      return { ok: false }
    }
  }
  return { ok: true, items: [...existing, ...incoming] }
}
