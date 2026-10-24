import { formatStrongEtagForTests } from '../admit/admit-strong-etag.js'

export function makeDefinition({
  serviceId = 'svc-caste',
  version = 1,
  status = 'submitted',
  fieldId = 'applicantName',
  etagRevision = 1,
} = {}) {
  const definition = {
    serviceId,
    version,
    status,
    jsonSchema: {
      type: 'object',
      properties: {
        [fieldId]: { type: 'string' },
      },
      additionalProperties: false,
    },
    uiSchema: {
      'ui:order': [fieldId],
      [fieldId]: { 'ui:widget': 'text' },
    },
    meta: {
      paletteProvenance: [{ fieldId, widgetType: 'text-input' }],
      bilingual: {
        labels: { [fieldId]: { en: 'Applicant name', gu: 'અરજદારનું નામ' } },
        help: {},
        errors: {},
      },
      prefillBindings: [
        { fieldId, cafAttribute: 'fullName', confidenceMin: 0.8 },
      ],
      integrationBindings: [],
      workflowBindings: [{ fieldId, stage: 'review' }],
      progressiveSteps: [
        {
          stepId: 'step-1',
          labelEn: 'Basics',
          labelGu: 'મૂળભૂત',
          fieldIds: [fieldId],
        },
      ],
    },
    audit: {
      createdBy: 'author-1',
      createdAt: '2026-07-20T10:00:00.000Z',
      submittedBy: 'author-1',
      ...(status === 'approved' || status === 'published'
        ? { approvedBy: 'officer-1' }
        : {}),
      ...(status === 'published' ? { publishedAt: '2026-07-21T10:00:00.000Z' } : {}),
    },
  }
  return {
    definition,
    etag: formatStrongEtagForTests(etagRevision),
    fieldOrder: [fieldId],
  }
}

export function createMemoryGovernanceAdapter(options = {}) {
  const state = {
    items: options.items ?? [
      { serviceId: 'svc-a', version: 1, status: 'submitted' },
      { serviceId: 'svc-b', version: 2, status: 'approved' },
    ],
    details: options.details ?? new Map(),
    transitionCalls: [],
    listCalls: [],
    detailCalls: [],
    failQueueWith: options.failQueueWith ?? null,
    failDetailWith: options.failDetailWith ?? null,
    failTransitionWith: options.failTransitionWith ?? null,
    pageSize: options.pageSize ?? 50,
  }

  if (state.details.size === 0) {
    for (const item of state.items) {
      const snap = makeDefinition({
        serviceId: item.serviceId,
        version: item.version,
        status: item.status,
        etagRevision: item.version,
      })
      state.details.set(`${item.serviceId}\0${item.version}`, snap)
    }
  }

  return {
    state,
    adapter: {
      async listQueue({ afterServiceId, afterVersion, limit = 50, signal }) {
        state.listCalls.push({ afterServiceId, afterVersion, limit })
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        if (state.failQueueWith) {
          throw state.failQueueWith
        }
        let start = 0
        if (afterServiceId !== undefined) {
          start =
            state.items.findIndex(
              (item) =>
                item.serviceId === afterServiceId && item.version === afterVersion,
            ) + 1
          if (start === 0) start = state.items.length
        }
        const slice = state.items.slice(start, start + limit)
        const hasMore = start + limit < state.items.length
        return {
          items: slice.map((item) => ({ ...item })),
          nextCursor: hasMore
            ? {
                serviceId: slice[slice.length - 1].serviceId,
                version: slice[slice.length - 1].version,
              }
            : null,
        }
      },
      async loadDetail({ serviceId, version, signal }) {
        state.detailCalls.push({ serviceId, version })
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        if (state.failDetailWith) {
          throw state.failDetailWith
        }
        const snap = state.details.get(`${serviceId}\0${version}`)
        if (!snap) {
          const { GovernanceAdapterError, GOVERNANCE_ERROR_CODES } = await import(
            '../errors.js'
          )
          throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.NOT_FOUND)
        }
        return {
          definition: structuredClone(snap.definition),
          etag: snap.etag,
          fieldOrder: [...snap.fieldOrder],
        }
      },
      async transition({ serviceId, version, etag, targetStatus, signal }) {
        state.transitionCalls.push({
          serviceId,
          version,
          etag,
          targetStatus,
          body: { targetStatus },
        })
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        if (state.failTransitionWith) {
          throw state.failTransitionWith
        }
        const key = `${serviceId}\0${version}`
        const current = state.details.get(key)
        if (!current || current.etag !== etag) {
          const { GovernanceAdapterError, GOVERNANCE_ERROR_CODES } = await import(
            '../errors.js'
          )
          throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.STALE_REVISION)
        }
        const nextStatus = targetStatus
        const { formatStrongEtagForTests } = await import('../admit/admit-strong-etag.js')
        const next = makeDefinition({
          serviceId,
          version,
          status: nextStatus,
          etagRevision: 100 + state.transitionCalls.length,
        })
        next.etag = formatStrongEtagForTests(100 + state.transitionCalls.length)
        state.details.set(key, next)
        if (nextStatus === 'published') {
          state.items = state.items.filter(
            (item) => !(item.serviceId === serviceId && item.version === version),
          )
        } else {
          state.items = state.items.map((item) =>
            item.serviceId === serviceId && item.version === version
              ? { ...item, status: nextStatus }
              : item,
          )
        }
        return {
          definition: structuredClone(next.definition),
          etag: next.etag,
          fieldOrder: [...next.fieldOrder],
        }
      },
    },
  }
}
