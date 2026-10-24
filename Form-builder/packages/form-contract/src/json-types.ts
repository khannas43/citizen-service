/**
 * JSON-compatible value types for Form Definition boundaries.
 *
 * These mirror JSON Schema Draft 2020-12 / JSON data model constraints.
 * Do not widen to `any` or to JavaScript-only types (Date, Map, undefined).
 */

/** JSON primitive values (null included). */
export type JsonPrimitive = string | number | boolean | null

/** A JSON array of JsonValue elements. */
export type JsonArray = readonly JsonValue[]

/**
 * A JSON object with string keys.
 * Values are JsonValue; nested objects remain JSON-compatible.
 */
export type JsonObject = { readonly [key: string]: JsonValue }

/** Any JSON-serialisable value. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
