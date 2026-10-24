import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  appendQueuePage,
  createAdmittingFormDefinitionGovernanceAdapter,
  createHttpFormDefinitionGovernanceAdapter,
  GOVERNANCE_ERROR_CODES,
  GovernanceAdapterError,
  isAbortError,
  projectGovernanceReview,
  queueItemKey,
  USER_MESSAGES,
} from '../form-definition-governance'
import './FormDefinitionGovernance.css'

function statusLabel(status) {
  if (status === 'submitted') return 'Submitted'
  if (status === 'approved') return 'Approved'
  if (status === 'published') return 'Published'
  return status
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  warning,
}) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    previouslyFocused.current = document.activeElement
    const node = dialogRef.current
    const focusable = node?.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable?.[0]
    first?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busy) onCancel()
        return
      }
      if (event.key !== 'Tab' || !focusable || focusable.length === 0) return
      const list = [...focusable]
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const prev = previouslyFocused.current
      if (prev && typeof prev.focus === 'function') {
        prev.focus()
      }
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div className="fdg-modal-overlay" role="presentation">
      <div
        className="fdg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        ref={dialogRef}
      >
        <h2 id={titleId} className="fdg-modal-title">
          {title}
        </h2>
        <p id={descId} className="fdg-modal-copy">
          {description}
        </p>
        {warning ? <p className="fdg-modal-warning">{warning}</p> : null}
        <div className="fdg-modal-actions">
          <button
            type="button"
            className="fdg-btn fdg-btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="fdg-btn fdg-btn-primary"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy ? 'true' : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function messageForError(error) {
  if (error instanceof GovernanceAdapterError) {
    return USER_MESSAGES[error.code] ?? USER_MESSAGES.failed
  }
  return USER_MESSAGES.failed
}

export default function FormDefinitionGovernance({ adapter: adapterProp } = {}) {
  const [view, setView] = useState('queue')
  const [queueItems, setQueueItems] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [queueStatus, setQueueStatus] = useState('loading')
  const [queueError, setQueueError] = useState(null)
  const [queueBusy, setQueueBusy] = useState(false)

  const [selectedKey, setSelectedKey] = useState(null)
  const [detailStatus, setDetailStatus] = useState('idle')
  const [detailError, setDetailError] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [review, setReview] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')

  const [confirm, setConfirm] = useState(null)
  const [mutationBusy, setMutationBusy] = useState(false)

  const queueItemsRef = useRef([])
  const etagRef = useRef(null)
  const queueSeq = useRef(0)
  const detailSeq = useRef(0)
  const mutationSeq = useRef(0)
  const selectedKeyRef = useRef(null)
  const queueAbort = useRef(null)
  const detailAbort = useRef(null)
  const mutationAbort = useRef(null)
  const mountedRef = useRef(true)

  const bumpMutationGeneration = useCallback(() => {
    mutationAbort.current?.abort()
    mutationSeq.current += 1
  }, [])

  const invalidateMutation = useCallback(() => {
    bumpMutationGeneration()
    setMutationBusy(false)
  }, [bumpMutationGeneration])

  const adapterRef = useRef(
    createAdmittingFormDefinitionGovernanceAdapter(
      adapterProp ?? createHttpFormDefinitionGovernanceAdapter(),
    ),
  )
  useEffect(() => {
    bumpMutationGeneration()
    const timer = setTimeout(() => {
      setMutationBusy(false)
    }, 0)
    adapterRef.current = createAdmittingFormDefinitionGovernanceAdapter(
      adapterProp ?? createHttpFormDefinitionGovernanceAdapter(),
    )
    return () => clearTimeout(timer)
  }, [adapterProp, bumpMutationGeneration])

  const loadQueue = useCallback(async ({ append = false, cursor = null } = {}) => {
    queueAbort.current?.abort()
    const controller = new AbortController()
    queueAbort.current = controller
    const seq = ++queueSeq.current
    setQueueBusy(true)
    if (!append) {
      setQueueStatus('loading')
      setQueueError(null)
    }
    try {
      const page = await adapterRef.current.listQueue({
        afterServiceId: cursor?.serviceId,
        afterVersion: cursor?.version,
        limit: 50,
        signal: controller.signal,
      })
      if (!mountedRef.current || seq !== queueSeq.current || controller.signal.aborted) return
      if (append) {
        const appended = appendQueuePage(queueItemsRef.current, page.items, cursor)
        if (!appended.ok) {
          setQueueStatus(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
          setQueueError(USER_MESSAGES.response_rejected)
          return
        }
        queueItemsRef.current = appended.items
        setQueueItems(appended.items)
      } else {
        queueItemsRef.current = page.items
        setQueueItems(page.items)
      }
      setNextCursor(page.nextCursor)
      setQueueStatus('ready')
      setQueueError(null)
    } catch (error) {
      if (
        !mountedRef.current ||
        isAbortError(error) ||
        controller.signal.aborted ||
        seq !== queueSeq.current
      ) {
        return
      }
      const code =
        error instanceof GovernanceAdapterError ? error.code : GOVERNANCE_ERROR_CODES.FAILED
      setQueueStatus(code)
      setQueueError(messageForError(error))
    } finally {
      if (mountedRef.current && seq === queueSeq.current) {
        setQueueBusy(false)
      }
    }
  }, [])

  const loadDetail = useCallback(
    async (item) => {
      invalidateMutation()
      detailAbort.current?.abort()
      const controller = new AbortController()
      detailAbort.current = controller
      const seq = ++detailSeq.current
      const key = queueItemKey(item)
      selectedKeyRef.current = key
      setSelectedKey(key)
      setView('detail')
      setDetailStatus('loading')
      setDetailError(null)
      setSnapshot(null)
      setReview(null)
      setConfirm(null)
      setSuccessMessage('')
      etagRef.current = null
      try {
        const next = await adapterRef.current.loadDetail({
          serviceId: item.serviceId,
          version: item.version,
          signal: controller.signal,
        })
        if (
          !mountedRef.current ||
          seq !== detailSeq.current ||
          controller.signal.aborted ||
          selectedKeyRef.current !== key
        ) {
          return
        }
        etagRef.current = next.etag
        const projected = projectGovernanceReview(next)
        if (!projected.ok) {
          setDetailStatus('unsafe')
          setDetailError(USER_MESSAGES.definition_unsafe)
          setSnapshot(null)
          setReview(null)
          etagRef.current = null
          return
        }
        setSnapshot(next)
        setReview(projected.review)
        setDetailStatus('ready')
        setDetailError(null)
      } catch (error) {
        if (
          !mountedRef.current ||
          isAbortError(error) ||
          controller.signal.aborted ||
          seq !== detailSeq.current ||
          selectedKeyRef.current !== key
        ) {
          return
        }
        const code =
          error instanceof GovernanceAdapterError ? error.code : GOVERNANCE_ERROR_CODES.FAILED
        setDetailStatus(code)
        setDetailError(messageForError(error))
        etagRef.current = null
      }
    },
    [invalidateMutation],
  )

  useEffect(() => {
    mountedRef.current = true
    const timer = setTimeout(() => {
      void loadQueue({ append: false })
    }, 0)
    return () => {
      mountedRef.current = false
      clearTimeout(timer)
      queueAbort.current?.abort()
      detailAbort.current?.abort()
      mutationAbort.current?.abort()
      queueSeq.current += 1
      detailSeq.current += 1
      mutationSeq.current += 1
    }
  }, [loadQueue, adapterProp])

  function backToQueue() {
    invalidateMutation()
    detailAbort.current?.abort()
    detailSeq.current += 1
    selectedKeyRef.current = null
    setView('queue')
    setSelectedKey(null)
    setSnapshot(null)
    setReview(null)
    setDetailStatus('idle')
    setDetailError(null)
    setConfirm(null)
    etagRef.current = null
  }

  async function runTransition(targetStatus) {
    if (mutationBusy || !snapshot) return
    const etag = etagRef.current
    if (!etag) {
      setDetailStatus(GOVERNANCE_ERROR_CODES.STALE_REVISION)
      setDetailError(USER_MESSAGES.stale_revision)
      return
    }
    const coordsKey = selectedKeyRef.current
    const expectedServiceId = snapshot.definition.serviceId
    const expectedVersion = snapshot.definition.version
    if (!coordsKey || coordsKey !== queueItemKey(snapshot.definition)) {
      return
    }

    mutationAbort.current?.abort()
    const controller = new AbortController()
    mutationAbort.current = controller
    const seq = ++mutationSeq.current
    setMutationBusy(true)
    setSuccessMessage('')
    try {
      const next = await adapterRef.current.transition({
        serviceId: expectedServiceId,
        version: expectedVersion,
        etag,
        targetStatus,
        signal: controller.signal,
      })
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        seq !== mutationSeq.current ||
        selectedKeyRef.current !== coordsKey
      ) {
        return
      }
      etagRef.current = next.etag
      const projected = projectGovernanceReview(next)
      if (!projected.ok) {
        setDetailStatus('unsafe')
        setDetailError(USER_MESSAGES.definition_unsafe)
        setSnapshot(null)
        setReview(null)
        etagRef.current = null
        return
      }
      setSnapshot(next)
      setReview(projected.review)
      setDetailStatus('ready')
      setDetailError(null)
      setConfirm(null)

      const key = queueItemKey(next.definition)
      if (next.definition.status === 'published') {
        setQueueItems((prev) => {
          const nextItems = prev.filter((item) => queueItemKey(item) !== key)
          queueItemsRef.current = nextItems
          return nextItems
        })
        setSuccessMessage('Definition published on the technical local lifecycle path.')
      } else if (next.definition.status === 'approved') {
        setQueueItems((prev) => {
          const nextItems = prev.map((item) =>
            queueItemKey(item) === key ? { ...item, status: 'approved' } : item,
          )
          queueItemsRef.current = nextItems
          return nextItems
        })
        setSuccessMessage('Definition approved. Publish remains a separate action.')
      }
    } catch (error) {
      if (
        !mountedRef.current ||
        isAbortError(error) ||
        controller.signal.aborted ||
        seq !== mutationSeq.current ||
        selectedKeyRef.current !== coordsKey
      ) {
        return
      }
      if (
        error instanceof GovernanceAdapterError &&
        error.code === GOVERNANCE_ERROR_CODES.STALE_REVISION
      ) {
        etagRef.current = null
        setDetailStatus(GOVERNANCE_ERROR_CODES.STALE_REVISION)
        setDetailError(USER_MESSAGES.stale_revision)
        setConfirm(null)
        return
      }
      const code =
        error instanceof GovernanceAdapterError ? error.code : GOVERNANCE_ERROR_CODES.FAILED
      setDetailStatus(code)
      setDetailError(messageForError(error))
      setConfirm(null)
    } finally {
      if (mountedRef.current && seq === mutationSeq.current) {
        setMutationBusy(false)
      }
    }
  }

  const definition = snapshot?.definition

  return (
    <section className="fdg-page" aria-labelledby="fdg-heading">
      <header className="fdg-header">
        <h1 id="fdg-heading" className="fdg-title">
          Form Definitions
        </h1>
        <p className="fdg-notice" role="note">
          {USER_MESSAGES.technical_notice}
        </p>
      </header>

      <div className="fdg-live" aria-live="polite">
        {successMessage}
      </div>

      {view === 'queue' ? (
        <div className="fdg-queue" aria-busy={queueBusy || queueStatus === 'loading' ? 'true' : 'false'}>
          <div className="fdg-toolbar">
            <button
              type="button"
              className="fdg-btn fdg-btn-secondary"
              onClick={() => void loadQueue({ append: false })}
              disabled={queueBusy}
            >
              Refresh
            </button>
            {nextCursor ? (
              <button
                type="button"
                className="fdg-btn fdg-btn-secondary"
                onClick={() => void loadQueue({ append: true, cursor: nextCursor })}
                disabled={queueBusy}
              >
                Load More
              </button>
            ) : null}
          </div>

          {queueStatus === 'loading' ? (
            <p className="fdg-state">Loading governance queue…</p>
          ) : null}

          {queueStatus === 'ready' && queueItems.length === 0 ? (
            <p className="fdg-state">{USER_MESSAGES.empty_queue}</p>
          ) : null}

          {queueStatus === GOVERNANCE_ERROR_CODES.UNAUTHENTICATED ||
          queueStatus === GOVERNANCE_ERROR_CODES.FORBIDDEN ||
          queueStatus === GOVERNANCE_ERROR_CODES.FAILED ||
          queueStatus === GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED ||
          queueStatus === GOVERNANCE_ERROR_CODES.INVALID_REQUEST ? (
            <div className="fdg-alert" role="alert">
              <p>{queueError}</p>
              {queueStatus !== GOVERNANCE_ERROR_CODES.UNAUTHENTICATED &&
              queueStatus !== GOVERNANCE_ERROR_CODES.FORBIDDEN ? (
                <button
                  type="button"
                  className="fdg-btn fdg-btn-primary"
                  onClick={() => void loadQueue({ append: false })}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {queueStatus === 'ready' && queueItems.length > 0 ? (
            <div className="fdg-table-wrap">
              <table className="fdg-table">
                <caption className="fdg-sr-only">
                  Submitted and approved Form Definitions awaiting governance review
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Service ID</th>
                    <th scope="col">Version</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueItems.map((item) => (
                    <tr key={queueItemKey(item)}>
                      <td>
                        <code className="fdg-code">{item.serviceId}</code>
                      </td>
                      <td>{item.version}</td>
                      <td>
                        <span className={`fdg-status fdg-status-${item.status}`}>
                          <span className="fdg-status-text" aria-hidden="true">
                            ●
                          </span>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="fdg-btn fdg-btn-primary"
                          onClick={() => void loadDetail(item)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="fdg-detail" aria-busy={detailStatus === 'loading' ? 'true' : 'false'}>
          <div className="fdg-toolbar">
            <button type="button" className="fdg-btn fdg-btn-secondary" onClick={backToQueue}>
              Back to Queue
            </button>
            {selectedKey ? (
              <button
                type="button"
                className="fdg-btn fdg-btn-secondary"
                onClick={() => {
                  const [serviceId, versionText] = selectedKey.split('\0')
                  void loadDetail({ serviceId, version: Number(versionText) })
                }}
                disabled={detailStatus === 'loading' || mutationBusy}
              >
                Reload Detail
              </button>
            ) : null}
          </div>

          {detailStatus === 'loading' ? <p className="fdg-state">Loading governed detail…</p> : null}

          {detailError ? (
            <div className="fdg-alert" role="alert">
              <p>{detailError}</p>
              {detailStatus === GOVERNANCE_ERROR_CODES.STALE_REVISION ||
              detailStatus === GOVERNANCE_ERROR_CODES.FAILED ||
              detailStatus === GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED ||
              detailStatus === GOVERNANCE_ERROR_CODES.LIFECYCLE_CONFLICT ? (
                <button
                  type="button"
                  className="fdg-btn fdg-btn-primary"
                  onClick={() => {
                    const [serviceId, versionText] = selectedKey.split('\0')
                    void loadDetail({ serviceId, version: Number(versionText) })
                  }}
                >
                  Reload Detail
                </button>
              ) : null}
              {detailStatus === GOVERNANCE_ERROR_CODES.NOT_FOUND ? (
                <button type="button" className="fdg-btn fdg-btn-primary" onClick={backToQueue}>
                  Return to Queue
                </button>
              ) : null}
            </div>
          ) : null}

          {detailStatus === 'ready' && review ? (
            <article className="fdg-review" aria-labelledby="fdg-review-heading">
              <h2 id="fdg-review-heading" className="fdg-subtitle">
                Governed definition review
              </h2>
              <dl className="fdg-meta-grid">
                <div>
                  <dt>Service ID</dt>
                  <dd>
                    <code className="fdg-code">{review.serviceId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{review.version}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`fdg-status fdg-status-${review.status}`}>
                      <span className="fdg-status-text" aria-hidden="true">
                        ●
                      </span>
                      {statusLabel(review.status)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Ordered field count</dt>
                  <dd>{review.fieldCount}</dd>
                </div>
              </dl>

              <h3 className="fdg-section-title">Ordered fields</h3>
              {review.fields.length === 0 ? (
                <p className="fdg-state">No ordered fields declared.</p>
              ) : (
                <ul className="fdg-field-list">
                  {review.fields.map((field) => (
                    <li key={field.fieldId}>
                      <strong>{field.fieldId}</strong>
                      <span>
                        EN: {field.labelEn || '—'} / GU: {field.labelGu || '—'}
                      </span>
                      <span>Widget: {field.widgetType}</span>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="fdg-section-title">Progressive steps</h3>
              {review.progressiveSteps.length === 0 ? (
                <p className="fdg-state">No progressive steps.</p>
              ) : (
                <ul className="fdg-field-list">
                  {review.progressiveSteps.map((step) => (
                    <li key={step.stepId}>
                      <strong>
                        {step.labelEn} / {step.labelGu}
                      </strong>
                      <span>Fields: {step.fieldIds.join(', ') || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="fdg-section-title">Bilingual completeness</h3>
              <p className="fdg-state">
                {review.bilingualSummary.labeledBoth} of {review.bilingualSummary.orderedFieldCount}{' '}
                ordered fields have both EN and GU labels (EN: {review.bilingualSummary.labeledEn},
                GU: {review.bilingualSummary.labeledGu}).
              </p>

              <h3 className="fdg-section-title">Binding counts</h3>
              <ul className="fdg-binding-list">
                <li>Prefill: {review.bindingCounts.prefill}</li>
                <li>Integration: {review.bindingCounts.integration}</li>
                <li>Workflow: {review.bindingCounts.workflow}</li>
              </ul>

              <h3 className="fdg-section-title">Audit fields</h3>
              <ul className="fdg-binding-list">
                {review.auditFields.map((field) => (
                  <li key={field.name}>
                    {field.name}: {field.present ? 'present' : 'absent'}
                  </li>
                ))}
              </ul>

              <div className="fdg-actions">
                {definition?.status === 'submitted' ? (
                  <button
                    type="button"
                    className="fdg-btn fdg-btn-primary"
                    disabled={mutationBusy}
                    onClick={() =>
                      setConfirm({
                        kind: 'approve',
                        title: 'Approve Form Definition',
                        description:
                          'Confirm submitted → approved. Approve does not publish. The Form Definition Service remains authoritative.',
                        confirmLabel: 'Confirm Approve',
                      })
                    }
                  >
                    Approve
                  </button>
                ) : null}
                {definition?.status === 'approved' ? (
                  <button
                    type="button"
                    className="fdg-btn fdg-btn-primary"
                    disabled={mutationBusy}
                    onClick={() =>
                      setConfirm({
                        kind: 'publish',
                        title: 'Publish Form Definition',
                        description:
                          'Confirm approved → published on the technical local lifecycle path.',
                        warning:
                          'This is not DST acknowledgement. Production must use the externally governed DST contract.',
                        confirmLabel: 'Confirm Publish',
                      })
                    }
                  >
                    Publish
                  </button>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        warning={confirm?.warning}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        busy={mutationBusy}
        onCancel={() => {
          if (!mutationBusy) setConfirm(null)
        }}
        onConfirm={() => {
          if (!confirm) return
          void runTransition(confirm.kind === 'approve' ? 'approved' : 'published')
        }}
      />
    </section>
  )
}
