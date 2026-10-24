import { describe, expect, it } from 'vitest'

import {
  CITIZEN_ALLOWED_LOCATION,
  CITIZEN_REQUIRED_LOCATIONS,
  OFFICER_ALLOWED_LOCATIONS,
  OFFICER_BUILDER_LOCATIONS,
  OFFICER_EXPECTED_PROXY_PASS_COUNT,
  OFFICER_GOVERNANCE_LOCATIONS,
  OFFICER_REQUIRED_LOCATIONS,
  assertExistingRoutesPreserved,
  assertLocalReject,
  assertLocationTemplateContract,
  assertProxyResponse,
  assertUpstreamDidNotReceive,
  assertUpstreamObservation,
} from './e5.3a-nginx-proxy-assert.mjs'

const sharedProxy = `
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header If-Match $http_if_match;
    proxy_pass_header ETag;
    add_header Cache-Control "no-store" always;
`

const citizenTemplate = `
${CITIZEN_ALLOWED_LOCATION} {
    if ($request_method != GET) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/published/latest;
${sharedProxy}
}
location = /form-definition-service { return 403; }
location /form-definition-service/ { return 403; }
`

const officerTemplate = `
${OFFICER_GOVERNANCE_LOCATIONS[0]} {
    if ($request_method != GET) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/governance/queue;
${sharedProxy}
}
${OFFICER_GOVERNANCE_LOCATIONS[1]} {
    if ($request_method != GET) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/governance/detail;
${sharedProxy}
}
${OFFICER_GOVERNANCE_LOCATIONS[2]} {
    if ($request_method != POST) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/governance/lifecycle-transitions;
${sharedProxy}
}
${OFFICER_BUILDER_LOCATIONS[0]} {
    if ($request_method != POST) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/validation;
${sharedProxy}
}
${OFFICER_BUILDER_LOCATIONS[1]}
    if ($request_method !~ ^(GET|POST|PUT)$) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions;
${sharedProxy}
}
${OFFICER_BUILDER_LOCATIONS[2]} {
    if ($request_method != GET) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/versions;
${sharedProxy}
}
${OFFICER_BUILDER_LOCATIONS[3]} {
    if ($request_method != POST) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/builder/drafts/from-version;
${sharedProxy}
}
${OFFICER_BUILDER_LOCATIONS[4]} {
    if ($request_method != POST) { return 405; }
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/builder/lifecycle-transitions;
${sharedProxy}
}
location = /form-definition-service { return 403; }
location /form-definition-service/ { return 403; }
`

describe('FB-E5.3A.1 / E5.4.3B nginx least-privilege proxy assertions', () => {
  it('accepts compliant citizen and officer templates', () => {
    expect(assertLocationTemplateContract(citizenTemplate, 'citizen').failures).toEqual([])
    expect(assertLocationTemplateContract(officerTemplate, 'officer').failures).toEqual([])
    expect(OFFICER_ALLOWED_LOCATIONS).toHaveLength(OFFICER_EXPECTED_PROXY_PASS_COUNT)
  })

  it('rejects broad prefix proxy and CORS', () => {
    const broad = `
location /form-definition-service/ {
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/;
${sharedProxy}
}
`
    expect(assertLocationTemplateContract(broad, 'citizen').ok).toBe(false)
    expect(
      assertLocationTemplateContract(
        `${citizenTemplate}\nadd_header Access-Control-Allow-Origin *;`,
        'citizen',
      ).ok,
    ).toBe(false)
  })

  it('rejects citizen template that proxies governance or Builder paths', () => {
    expect(assertLocationTemplateContract(officerTemplate, 'citizen').ok).toBe(false)
  })

  it('rejects officer template that proxies technical clone', () => {
    const bad = `${officerTemplate}
location = /form-definition-service/api/v1/form-definitions/drafts/from-version {
    proxy_pass \${FORM_DEFINITION_SERVICE_UPSTREAM}/form-definition-service/api/v1/form-definitions/drafts/from-version;
${sharedProxy}
}
`
    expect(assertLocationTemplateContract(bad, 'officer').ok).toBe(false)
  })

  it('requires officer/citizen existing route markers', () => {
    const officer = OFFICER_REQUIRED_LOCATIONS.map((m) => m).join('\n')
    const citizen = CITIZEN_REQUIRED_LOCATIONS.map((m) => m).join('\n')
    expect(assertExistingRoutesPreserved(officer, OFFICER_REQUIRED_LOCATIONS).ok).toBe(true)
    expect(assertExistingRoutesPreserved(citizen, CITIZEN_REQUIRED_LOCATIONS).ok).toBe(true)
    expect(assertExistingRoutesPreserved('location / {\n}', OFFICER_REQUIRED_LOCATIONS).ok).toBe(
      false,
    )
  })

  it('asserts proxy response cache and status rules', () => {
    const headers = new Headers({
      'cache-control': 'no-store',
      etag: '"e53a-mock-etag-1"',
    })
    expect(
      assertProxyResponse(
        { status: 200, headers, corsPresent: false },
        { expectStatus: 200, expectEtag: '"e53a-mock-etag-1"' },
      ).ok,
    ).toBe(true)
    expect(
      assertProxyResponse(
        {
          status: 200,
          headers: new Headers({ 'cache-control': 'public, max-age=3600' }),
          corsPresent: false,
        },
        { expectStatus: 200 },
      ).ok,
    ).toBe(false)
  })

  it('asserts local reject without requiring ETag', () => {
    expect(
      assertLocalReject({ status: 403, headers: new Headers(), corsPresent: false }, 403).ok,
    ).toBe(true)
    expect(
      assertLocalReject({ status: 200, headers: new Headers(), corsPresent: false }, 403).ok,
    ).toBe(false)
  })

  it('asserts upstream observation path preservation', () => {
    const ok = assertUpstreamObservation(
      {
        method: 'GET',
        url: '/form-definition-service/api/v1/form-definitions/published/latest?serviceId=a',
        hasAuthorization: true,
      },
      { method: 'GET', urlIncludes: 'serviceId=a', expectAuth: true },
    )
    expect(ok.ok).toBe(true)
    const bad = assertUpstreamObservation(
      { method: 'GET', url: '/api/v1/x', hasAuthorization: false },
      { method: 'GET', urlIncludes: 'x', expectAuth: true },
    )
    expect(bad.ok).toBe(false)
  })

  it('asserts denied paths never reached upstream', () => {
    expect(
      assertUpstreamDidNotReceive(
        [
          {
            method: 'GET',
            url: '/form-definition-service/api/v1/form-definitions/governance/queue',
          },
        ],
        ['/actuator/'],
      ).ok,
    ).toBe(true)
    expect(
      assertUpstreamDidNotReceive(
        [{ method: 'GET', url: '/form-definition-service/actuator/health' }],
        ['/actuator/'],
      ).ok,
    ).toBe(false)
  })
})
