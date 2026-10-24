/**
 * Schema-aware nested field identity (FB-B3).
 *
 * Never derive identity by splitting RJSF/HTML IDs, idPrefix, or idSeparator output.
 * Paths are built from RJSF `name` plus NestedFieldIdentityScope array segments only.
 *
 * Path grammar (segment-escaped):
 * - Property segment: escape `\`, `.`, `[`, `]` in the exact property name, then join with `.`
 * - Array template (definition): append `[]` after the repeater property segment
 * - Array index (instance): append `[` + decimal index + `]` after the repeater property segment
 * - Repeater row scopes extend the repeater's already-resolved FieldIdentity via
 *   `appendArrayTemplateToResolvedPath` / `appendArrayIndexToResolvedPath` (no re-escape)
 *
 * Examples:
 * - Top-level `applicant_name` → both IDs `applicant_name`
 * - `family_members[].member_name` / `family_members[0].member_name`
 * - Nested: `households[].members[].name` / `households[1].members[2].name`
 * - Name with a dot: property `a.b` escapes to `a\.b` in the path
 * - Resolver rename: `dependants[]` / `householdMembers[0]` from resolved chrome ids
 */

export interface FieldIdentity {
  /** Stable FormDefinition metadata / binding key (uses `[]` for arrays). */
  readonly definitionFieldId: string
  /** Row-specific runtime identity for service adapters (uses `[n]` for arrays). */
  readonly instanceFieldId: string
}

export interface FieldIdResolverInput {
  /** Exact RJSF property / widget `name` for this node (not an HTML id). */
  readonly name: string
  /** RJSF idSchema — available for hosts; must not be parsed for identity. */
  readonly idSchema?: { readonly $id?: string }
}

/**
 * Optional runtime resolver. May return a legacy string or structured FieldIdentity.
 * Default requires no Unit B host code for top-level fields.
 */
export type FieldIdResolverResult = string | FieldIdentity
export type FieldIdResolver = (input: FieldIdResolverInput) => FieldIdResolverResult

/** Escape a single property name for unambiguous path joining. */
export function escapeFieldPathSegment(name: string): string {
  let out = ''
  for (const ch of name) {
    if (ch === '\\' || ch === '.' || ch === '[' || ch === ']') {
      out += `\\${ch}`
    } else {
      out += ch
    }
  }
  return out
}

export function joinFieldPath(prefix: string | null | undefined, segment: string): string {
  if (prefix === undefined || prefix === null || prefix.length === 0) {
    return segment
  }
  return `${prefix}.${segment}`
}

export function appendArrayTemplate(
  prefix: string | null | undefined,
  propertyName: string,
): string {
  return joinFieldPath(prefix, `${escapeFieldPathSegment(propertyName)}[]`)
}

export function appendArrayIndex(
  prefix: string | null | undefined,
  propertyName: string,
  index: number,
): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('appendArrayIndex requires a non-negative integer index')
  }
  return joinFieldPath(prefix, `${escapeFieldPathSegment(propertyName)}[${index}]`)
}

export function appendProperty(prefix: string | null | undefined, propertyName: string): string {
  return joinFieldPath(prefix, escapeFieldPathSegment(propertyName))
}

/**
 * Append `[]` to an already-resolved field path (FB-B3.1).
 * Does **not** escape or reinterpret the path — use for repeater chrome identities.
 */
export function appendArrayTemplateToResolvedPath(resolvedPath: string): string {
  return `${resolvedPath}[]`
}

/**
 * Append `[index]` to an already-resolved field path (FB-B3.1).
 * Does **not** escape or reinterpret the path — use for repeater chrome identities.
 */
export function appendArrayIndexToResolvedPath(resolvedPath: string, index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('appendArrayIndexToResolvedPath requires a non-negative integer index')
  }
  return `${resolvedPath}[${index}]`
}

export function normalizeFieldIdResolverResult(result: FieldIdResolverResult): FieldIdentity {
  if (typeof result === 'string') {
    return { definitionFieldId: result, instanceFieldId: result }
  }
  return {
    definitionFieldId: result.definitionFieldId,
    instanceFieldId: result.instanceFieldId,
  }
}

/** Default: the RJSF `name` is both definition and instance identity (top-level). */
export function defaultFieldIdResolver(input: FieldIdResolverInput): string {
  return input.name
}

/**
 * Resolves structured field identity.
 *
 * When a nested scope is present, paths are composed from scope prefixes + escaped `name`.
 * Host `resolveFieldId` still receives the leaf RJSF `name` and may override the leaf;
 * scope prefixes are always applied around the normalized leaf identity.
 */
export function resolveFieldIdentity(input: {
  readonly name: string
  readonly idSchema?: { readonly $id?: string }
  readonly resolver?: FieldIdResolver
  readonly definitionPrefix?: string | null
  readonly instancePrefix?: string | null
}): FieldIdentity {
  const resolve = input.resolver ?? defaultFieldIdResolver
  const leaf = normalizeFieldIdResolverResult(
    resolve({ name: input.name, idSchema: input.idSchema }),
  )

  const hasScope =
    (typeof input.definitionPrefix === 'string' && input.definitionPrefix.length > 0) ||
    (typeof input.instancePrefix === 'string' && input.instancePrefix.length > 0)

  if (!hasScope) {
    return leaf
  }

  // Under a repeater scope the leaf name is the child property; escape and append.
  // Host string results that equal the RJSF name are the common case.
  const definitionLeaf = escapeFieldPathSegment(leaf.definitionFieldId)
  const instanceLeaf = escapeFieldPathSegment(leaf.instanceFieldId)

  return {
    definitionFieldId: joinFieldPath(input.definitionPrefix, definitionLeaf),
    instanceFieldId: joinFieldPath(input.instancePrefix, instanceLeaf),
  }
}

/**
 * Compatibility helper — returns **definitionFieldId** (FormDefinition metadata key).
 * Prefer `resolveFieldIdentity` / `useFieldChrome().instanceFieldId` for adapters.
 */
export function resolveCanonicalFieldId(
  name: string,
  idSchema: { readonly $id?: string } | undefined,
  resolver: FieldIdResolver | undefined,
  scope?: { readonly definitionPrefix?: string | null; readonly instancePrefix?: string | null },
): string {
  return resolveFieldIdentity({
    name,
    idSchema,
    resolver,
    definitionPrefix: scope?.definitionPrefix,
    instancePrefix: scope?.instancePrefix,
  }).definitionFieldId
}
