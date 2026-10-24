/**
 * Recursively freeze a JSON-safe value without invoking accessors.
 * Own data properties only; getters/setters are skipped.
 */
export function deepFreezeJsonSafe(value: unknown): void {
  if (value === null || typeof value !== 'object') {
    return
  }
  if (Object.isFrozen(value)) {
    return
  }

  for (const name of Object.getOwnPropertyNames(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, name)
    if (!desc || 'get' in desc || 'set' in desc || !('value' in desc)) {
      continue
    }
    deepFreezeJsonSafe(desc.value)
  }
  Object.freeze(value)
}
