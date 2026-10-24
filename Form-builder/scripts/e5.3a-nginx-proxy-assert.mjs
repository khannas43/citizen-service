/**
 * FB-E5.3A / E5.3A.1 — pure assertion helpers for portal nginx FDS proxy verification.
 */

export const FDS_LOCATION = '/form-definition-service/'

export const CITIZEN_ALLOWED_LOCATION =
  'location = /form-definition-service/api/v1/form-definitions/published/latest'

/** Officer governance allowlist locations (FB-E5.3A.1). */
export const OFFICER_GOVERNANCE_LOCATIONS = Object.freeze([
  'location = /form-definition-service/api/v1/form-definitions/governance/queue',
  'location = /form-definition-service/api/v1/form-definitions/governance/detail',
  'location = /form-definition-service/api/v1/form-definitions/governance/lifecycle-transitions',
])

/** Officer authenticated Builder allowlist locations (FB-E5.4.3B). */
export const OFFICER_BUILDER_LOCATIONS = Object.freeze([
  'location = /form-definition-service/api/v1/form-definitions/validation',
  'location = /form-definition-service/api/v1/form-definitions {',
  'location = /form-definition-service/api/v1/form-definitions/versions',
  'location = /form-definition-service/api/v1/form-definitions/builder/drafts/from-version',
  'location = /form-definition-service/api/v1/form-definitions/builder/lifecycle-transitions',
])

/** Full officer FDS allowlist (governance + Builder). */
export const OFFICER_ALLOWED_LOCATIONS = Object.freeze([
  ...OFFICER_GOVERNANCE_LOCATIONS,
  ...OFFICER_BUILDER_LOCATIONS,
])

/** Expected officer proxy_pass count: 3 governance + 5 Builder path entries (draft CRUD share one). */
export const OFFICER_EXPECTED_PROXY_PASS_COUNT = 8

export const OFFICER_REQUIRED_LOCATIONS = Object.freeze([
  'location = /index.html',
  'location /assets/',
  'location / {',
  'location /realms/',
  'location /caste-certificate-service/',
  'location /marriage-certificate-service/',
  'location /pension-service/',
  'location /family-member-service/',
  'location /scheme-application-service/',
  'location /family-registry-service/',
  'location /scheme-engine-service/',
  'location /grievance-service/',
  'location /notifications-service/',
  'location /chatbot-service/',
  'location /ai-intelligence-service/',
  'include /etc/nginx/form-definition-service/*.conf;',
])

export const CITIZEN_REQUIRED_LOCATIONS = Object.freeze([
  'location / {',
  'location /realms/',
  'location /auth-service/',
  'location /caste-certificate-service/',
  'location /marriage-certificate-service/',
  'location /pension-service/',
  'location /family-member-service/',
  'location /scheme-application-service/',
  'location /family-registry-service/',
  'location /scheme-engine-service/',
  'location /chatbot-service/',
  'location /grievance-service/',
  'location /notifications-service/',
  'location /ai-intelligence-service/',
  'include /etc/nginx/form-definition-service/*.conf;',
])

/**
 * @param {string} nginxConf
 * @param {readonly string[]} required
 */
export function assertExistingRoutesPreserved(nginxConf, required) {
  const failures = []
  const text = String(nginxConf || '')
  for (const marker of required) {
    if (!text.includes(marker)) {
      failures.push(`missing required nginx marker: ${marker}`)
    }
  }
  if (/proxy_pass\s+http:\/\/form-definition-service/.test(text)) {
    failures.push('main nginx.conf must not hard-code FDS upstream (use template)')
  }
  if (/governance-technical/.test(text)) {
    failures.push('nginx.conf must not reference governance-technical')
  }
  if (/actorId/.test(text)) {
    failures.push('nginx.conf must not reference actorId')
  }
  return { ok: failures.length === 0, failures }
}

/**
 * Active (non-comment) lines only.
 * @param {string} text
 */
function activeLines(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

/**
 * Collect proxy_pass targets from template active text.
 * @param {string} active
 */
function proxyPassTargets(active) {
  const targets = []
  const re = /proxy_pass\s+(\S+);/g
  let match
  while ((match = re.exec(active)) !== null) {
    targets.push(match[1])
  }
  return targets
}

/**
 * Shared proxy hygiene for allowed locations.
 * @param {string} text
 * @param {string[]} failures
 */
function assertSharedProxyHygiene(text, failures) {
  if (!/proxy_http_version\s+1\.1/.test(text)) failures.push('must use HTTP/1.1')
  if (!/proxy_set_header\s+Host/.test(text)) failures.push('must forward Host')
  if (!/X-Forwarded-For/.test(text)) failures.push('must forward X-Forwarded-For')
  if (!/X-Forwarded-Proto/.test(text)) failures.push('must forward X-Forwarded-Proto')
  if (!/Authorization\s+\$http_authorization/.test(text)) {
    failures.push('must forward Authorization')
  }
  if (!/If-Match\s+\$http_if_match/.test(text)) failures.push('must forward If-Match')
  if (!/proxy_pass_header\s+ETag/.test(text)) failures.push('must pass ETag')
  if (!/Cache-Control\s+"no-store"/.test(text)) failures.push('must set Cache-Control no-store')
  if (/add_header\s+Access-Control/i.test(text)) failures.push('must not add CORS headers')
  if (/rewrite\s+/.test(text)) failures.push('must not rewrite paths')
  const active = activeLines(text)
  if (/governance-technical|actorId/i.test(active)) {
    failures.push('template must not embed actorId or governance-technical directives')
  }
  if (/proxy_set_header\s+\S+\s+".*(password|secret|token)/i.test(active)) {
    failures.push('template must not embed credential literals')
  }
  if (
    !/location\s+=\s+\/form-definition-service\s*\{/.test(active) ||
    !/location\s+\/form-definition-service\/\s*\{/.test(active)
  ) {
    failures.push('template must deny unmatched /form-definition-service prefix')
  }
  if (!/return\s+403/.test(active)) {
    failures.push('template must locally reject unmatched FDS paths with 403')
  }
}

/**
 * @param {string} templateText
 * @param {'citizen' | 'officer'} portal
 */
export function assertLocationTemplateContract(templateText, portal = 'citizen') {
  const failures = []
  const text = String(templateText || '')
  const active = activeLines(text)
  const targets = proxyPassTargets(active)

  assertSharedProxyHygiene(text, failures)

  if (portal === 'citizen') {
    if (!text.includes(CITIZEN_ALLOWED_LOCATION)) {
      failures.push(`citizen template must define ${CITIZEN_ALLOWED_LOCATION}`)
    }
    if (!/\$request_method\s*!=\s*GET/.test(active) && !/limit_except\s+GET/.test(active)) {
      failures.push('citizen published/latest must reject non-GET methods')
    }
    if (targets.length !== 1) {
      failures.push(`citizen template must have exactly one proxy_pass, found ${targets.length}`)
    }
    if (!targets.every((t) => t.includes('/published/latest'))) {
      failures.push('citizen proxy_pass must target published/latest exactly')
    }
    if (targets.some((t) => t.includes('/governance/'))) {
      failures.push('citizen must not proxy governance paths')
    }
    if (
      targets.some((t) => /\/(validation|versions|drafts|lifecycle-transitions|actuator)/.test(t))
    ) {
      failures.push('citizen must not proxy technical/actuator paths')
    }
    for (const loc of OFFICER_ALLOWED_LOCATIONS) {
      if (text.includes(loc)) {
        failures.push(`citizen must not define officer location ${loc}`)
      }
    }
  } else if (portal === 'officer') {
    for (const loc of OFFICER_ALLOWED_LOCATIONS) {
      if (!text.includes(loc)) {
        failures.push(`officer template must define ${loc}`)
      }
    }
    if (!/\$request_method\s*!=\s*GET/.test(active) && !/limit_except\s+GET/.test(active)) {
      failures.push('officer GET-only locations must reject non-GET methods')
    }
    if (!/\$request_method\s*!=\s*POST/.test(active) && !/limit_except\s+POST/.test(active)) {
      failures.push('officer POST-only locations must reject non-POST methods')
    }
    if (!/\$request_method\s*!~\s*\^\(GET\|POST\|PUT\)\$/.test(active)) {
      failures.push('officer draft coordinate location must allow only GET|POST|PUT')
    }
    if (targets.length !== OFFICER_EXPECTED_PROXY_PASS_COUNT) {
      failures.push(
        `officer template must have exactly ${OFFICER_EXPECTED_PROXY_PASS_COUNT} proxy_pass targets, found ${targets.length}`,
      )
    }
    if (targets.some((t) => t.includes('/published/latest'))) {
      failures.push('officer must not proxy published/latest')
    }
    if (targets.some((t) => t.includes('/actuator'))) {
      failures.push('officer must not proxy actuator')
    }
    // Technical identity-bearing paths (non-/builder/, non-/governance/) must stay denied.
    if (
      targets.some(
        (t) =>
          (/\/drafts\/from-version/.test(t) && !/\/builder\/drafts\/from-version/.test(t)) ||
          (/\/lifecycle-transitions/.test(t) &&
            !/\/governance\/lifecycle-transitions/.test(t) &&
            !/\/builder\/lifecycle-transitions/.test(t)),
      )
    ) {
      failures.push('officer must not proxy technical clone/lifecycle paths')
    }
    const governanceTargets = targets.filter((t) => t.includes('/governance/'))
    if (governanceTargets.length !== 3) {
      failures.push(
        `officer must retain exactly three governance proxy_pass targets, found ${governanceTargets.length}`,
      )
    }
    const builderPathTargets = targets.filter((t) => !t.includes('/governance/'))
    if (builderPathTargets.length !== 5) {
      failures.push(
        `officer must have exactly five Builder proxy_pass targets, found ${builderPathTargets.length}`,
      )
    }
    if (!builderPathTargets.some((t) => t.includes('/validation'))) {
      failures.push('officer must proxy Builder validation')
    }
    if (!builderPathTargets.some((t) => t.includes('/versions'))) {
      failures.push('officer must proxy Builder versions')
    }
    if (!builderPathTargets.some((t) => t.includes('/builder/drafts/from-version'))) {
      failures.push('officer must proxy Builder authenticated clone')
    }
    if (!builderPathTargets.some((t) => t.includes('/builder/lifecycle-transitions'))) {
      failures.push('officer must proxy Builder authenticated submit')
    }
    if (
      !builderPathTargets.some(
        (t) => /\/api\/v1\/form-definitions$/.test(t) || /\/api\/v1\/form-definitions;$/.test(t),
      )
    ) {
      failures.push(
        'officer must proxy exact /api/v1/form-definitions for draft create/get/replace',
      )
    }
    if (text.includes(CITIZEN_ALLOWED_LOCATION)) {
      failures.push('officer must not define citizen published/latest allow location')
    }
  } else {
    failures.push(`unknown portal ${portal}`)
  }

  // Broad prefix proxy (E5.3A pre-hardening) must not return.
  if (/location\s+\/form-definition-service\/\s*\{[^}]*proxy_pass/s.test(active)) {
    failures.push('must not proxy entire /form-definition-service/ prefix')
  }

  return { ok: failures.length === 0, failures }
}

/**
 * @param {{ status: number, headers: Headers, corsPresent: boolean }} response
 * @param {{ expectStatus: number, expectEtag?: string, requireNoStore?: boolean }} opts
 */
export function assertProxyResponse(response, opts) {
  const failures = []
  if (response.status !== opts.expectStatus) {
    failures.push(`expected status ${opts.expectStatus}, got ${response.status}`)
  }
  const requireNoStore = opts.requireNoStore !== false
  if (requireNoStore) {
    const cache = response.headers.get('cache-control') || ''
    if (!/no-store/i.test(cache)) {
      failures.push(`Cache-Control must include no-store, got ${JSON.stringify(cache)}`)
    }
    if (/max-age\s*=\s*[1-9]/i.test(cache)) {
      failures.push('Cache-Control must not retain upstream max-age')
    }
  }
  if (opts.expectEtag) {
    const etag = response.headers.get('etag')
    if (etag !== opts.expectEtag) {
      failures.push('ETag was not preserved from upstream')
    }
  }
  if (response.corsPresent) {
    failures.push('proxy must not invent CORS headers')
  }
  return { ok: failures.length === 0, failures }
}

/**
 * Local deny/method rejection (must not require upstream ETag).
 * @param {{ status: number, headers: Headers, corsPresent: boolean }} response
 * @param {number} expectStatus
 */
export function assertLocalReject(response, expectStatus) {
  const failures = []
  if (response.status !== expectStatus) {
    failures.push(`expected local status ${expectStatus}, got ${response.status}`)
  }
  if (response.corsPresent) {
    failures.push('proxy must not invent CORS headers')
  }
  return { ok: failures.length === 0, failures }
}

/**
 * @param {{ method: string, url: string, hasAuthorization?: boolean, hasIfMatch?: boolean, bodyBytes?: number }} recorded
 * @param {{ method: string, urlIncludes: string, expectAuth?: boolean, expectIfMatch?: boolean, minBodyBytes?: number }} opts
 */
export function assertUpstreamObservation(recorded, opts) {
  const failures = []
  if (!recorded) {
    failures.push('missing upstream observation')
    return { ok: false, failures }
  }
  if (recorded.method !== opts.method) {
    failures.push(`expected method ${opts.method}, got ${recorded.method}`)
  }
  if (!String(recorded.url || '').includes(opts.urlIncludes)) {
    failures.push(`upstream URI missing ${opts.urlIncludes}`)
  }
  if (!String(recorded.url || '').startsWith('/form-definition-service/')) {
    failures.push('upstream URI must retain /form-definition-service/ prefix')
  }
  if (opts.expectAuth === true && !recorded.hasAuthorization) {
    failures.push('Authorization was not forwarded')
  }
  if (opts.expectIfMatch === true && !recorded.hasIfMatch) {
    failures.push('If-Match was not forwarded')
  }
  if (typeof opts.minBodyBytes === 'number' && (recorded.bodyBytes || 0) < opts.minBodyBytes) {
    failures.push('POST body was not preserved')
  }
  return { ok: failures.length === 0, failures }
}

/**
 * Ensure denied paths never reached upstream.
 * @param {object[]} observed
 * @param {string[]} forbiddenSubstrings
 */
export function assertUpstreamDidNotReceive(observed, forbiddenSubstrings) {
  const failures = []
  for (const row of observed || []) {
    const url = String(row.url || '')
    for (const bad of forbiddenSubstrings) {
      if (url.includes(bad)) {
        failures.push(`upstream must not receive ${bad}`)
      }
    }
  }
  return { ok: failures.length === 0, failures }
}
