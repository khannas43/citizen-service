import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FormRenderer } from '@dg20/form-renderer'
import '@dg20/form-widgets/styles/tokens.css'
import '@dg20/form-widgets/styles/widgets.css'
import '@dg20/form-renderer/styles/renderer.css'
import {
  admitServiceId,
  createAdmittingPublishedFormDefinitionAdapter,
  createHttpPublishedFormDefinitionAdapter,
  isAbortError,
  PublishedFormError,
  PUBLISHED_FORM_ERROR_CODES,
  PublishedFormErrorBoundary,
  submitWithDetachedFormData,
} from '../published-form'
import './PublishedFormApplication.css'

function messageKeyForError(error) {
  if (!(error instanceof PublishedFormError)) return 'publishedForm.unavailable'
  if (error.code === PUBLISHED_FORM_ERROR_CODES.NOT_FOUND) return 'publishedForm.notFound'
  if (error.code === PUBLISHED_FORM_ERROR_CODES.UNSAFE) return 'publishedForm.unsafe'
  if (error.code === PUBLISHED_FORM_ERROR_CODES.INVALID_SERVICE_ID) {
    return 'publishedForm.invalidServiceId'
  }
  return 'publishedForm.unavailable'
}

/**
 * Authenticated published Form Definition application screen (FB-E3 / E3.1).
 * Optional props are for tests / future host injection only.
 */
export default function PublishedFormApplication({
  adapter: adapterProp,
  widgetServices,
  submissionAdapter,
} = {}) {
  const { serviceId: routeServiceId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading')
  const [errorKey, setErrorKey] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [formData, setFormData] = useState({})
  const [submitStatus, setSubmitStatus] = useState(null)
  const [boundaryKey, setBoundaryKey] = useState(0)

  const loadSeq = useRef(0)
  const submitSeq = useRef(0)
  const loadAbort = useRef(null)
  const submitAbort = useRef(null)
  const submitBusyRef = useRef(false)
  const mountedRef = useRef(true)
  const pinnedServiceIdRef = useRef(null)
  const pinnedVersionRef = useRef(null)
  const adapterRef = useRef(null)
  const submissionAdapterRef = useRef(submissionAdapter)

  if (adapterRef.current === null) {
    adapterRef.current = createAdmittingPublishedFormDefinitionAdapter(
      adapterProp ?? createHttpPublishedFormDefinitionAdapter(),
    )
  }

  useEffect(() => {
    adapterRef.current = createAdmittingPublishedFormDefinitionAdapter(
      adapterProp ?? createHttpPublishedFormDefinitionAdapter(),
    )
  }, [adapterProp])

  const locale = i18n.language?.startsWith('gu') ? 'gu' : 'en'

  const invalidateSubmission = useCallback(() => {
    submitAbort.current?.abort()
    submitSeq.current += 1
    submitBusyRef.current = false
  }, [])

  // Submission-adapter identity is isolated from published-definition loading (FB-E3.1.1).
  useEffect(() => {
    submissionAdapterRef.current = submissionAdapter
    invalidateSubmission()
    const timer = setTimeout(() => {
      setSubmitStatus(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [submissionAdapter, invalidateSubmission])

  const loadDefinition = useCallback((serviceId) => {
    const admitted = admitServiceId(serviceId)
    if (!admitted.ok) {
      loadAbort.current?.abort()
      loadSeq.current += 1
      invalidateSubmission()
      pinnedServiceIdRef.current = null
      pinnedVersionRef.current = null
      setSnapshot(null)
      setFormData({})
      setSubmitStatus(null)
      setStatus('invalid')
      setErrorKey('publishedForm.invalidServiceId')
      return
    }

    loadAbort.current?.abort()
    invalidateSubmission()
    const controller = new AbortController()
    loadAbort.current = controller
    const seq = ++loadSeq.current
    pinnedServiceIdRef.current = admitted.serviceId
    pinnedVersionRef.current = null
    setStatus('loading')
    setErrorKey(null)
    setSnapshot(null)
    setFormData({})
    setSubmitStatus(null)

    const run = async () => {
      try {
        const next = await adapterRef.current.loadLatestPublished({
          serviceId: admitted.serviceId,
          signal: controller.signal,
        })
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          seq !== loadSeq.current ||
          pinnedServiceIdRef.current !== admitted.serviceId
        ) {
          return
        }
        pinnedVersionRef.current = next.version
        setSnapshot(next)
        setStatus('ready')
        setErrorKey(null)
      } catch (error) {
        if (
          !mountedRef.current ||
          isAbortError(error) ||
          controller.signal.aborted ||
          seq !== loadSeq.current ||
          pinnedServiceIdRef.current !== admitted.serviceId
        ) {
          return
        }
        pinnedVersionRef.current = null
        setSnapshot(null)
        setStatus('error')
        setErrorKey(messageKeyForError(error))
      }
    }

    // Microtask deferral: StrictMode's discarded first effect aborts before invocation.
    queueMicrotask(() => {
      if (seq === loadSeq.current && !controller.signal.aborted) {
        void run()
      }
    })
  }, [invalidateSubmission])

  useEffect(() => {
    mountedRef.current = true
    // Defer so StrictMode cleanup can abort the discarded first mount before any load.
    const timer = setTimeout(() => {
      loadDefinition(routeServiceId)
    }, 0)
    return () => {
      mountedRef.current = false
      clearTimeout(timer)
      loadAbort.current?.abort()
      loadSeq.current += 1
      invalidateSubmission()
    }
  }, [routeServiceId, loadDefinition, adapterProp, invalidateSubmission])

  async function handleSubmit(data) {
    const activeSubmissionAdapter = submissionAdapterRef.current
    if (!activeSubmissionAdapter || !snapshot) return
    // Synchronous busy guard — do not abort-and-restart; double submit is a no-op.
    if (submitBusyRef.current) return

    submitBusyRef.current = true
    const controller = new AbortController()
    submitAbort.current = controller
    const seq = ++submitSeq.current
    const pinnedServiceId = snapshot.serviceId
    const pinnedVersion = snapshot.version
    setSubmitStatus('submitting')

    try {
      await submitWithDetachedFormData(activeSubmissionAdapter, {
        serviceId: pinnedServiceId,
        formVersion: pinnedVersion,
        formData: data.formData,
        signal: controller.signal,
      })
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        seq !== submitSeq.current ||
        pinnedServiceIdRef.current !== pinnedServiceId ||
        pinnedVersionRef.current !== pinnedVersion
      ) {
        return
      }
      setSubmitStatus('success')
    } catch (error) {
      if (
        !mountedRef.current ||
        isAbortError(error) ||
        controller.signal.aborted ||
        seq !== submitSeq.current
      ) {
        return
      }
      setSubmitStatus('failure')
    } finally {
      if (seq === submitSeq.current) {
        submitBusyRef.current = false
      }
    }
  }

  const submitting = submitStatus === 'submitting'

  return (
    <section className="pf-page" aria-labelledby="pf-heading">
      <header className="pf-header">
        <button type="button" className="btn-ghost small" onClick={() => navigate('/apply')}>
          ← {t('publishedForm.backToServices')}
        </button>
        <h1 id="pf-heading" className="pf-title">
          {t('publishedForm.title')}
        </h1>
        <p className="pf-notice" role="note">
          {t('publishedForm.technicalNotice')}
        </p>
      </header>

      <div className="pf-body" aria-busy={status === 'loading' ? 'true' : 'false'}>
        {status === 'loading' ? (
          <p className="pf-state" role="status">
            {t('publishedForm.loading')}
          </p>
        ) : null}

        {status === 'error' || status === 'invalid' ? (
          <div className="pf-alert" role="alert">
            <p>{t(errorKey)}</p>
            {status === 'error' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => loadDefinition(routeServiceId)}
              >
                {t('publishedForm.retry')}
              </button>
            ) : (
              <Link className="btn-primary pf-link-btn" to="/apply">
                {t('publishedForm.backToServices')}
              </Link>
            )}
          </div>
        ) : null}

        {status === 'ready' && snapshot ? (
          <>
            <p className="pf-meta muted small">
              {t('publishedForm.pinnedMeta', {
                serviceId: snapshot.serviceId,
                version: snapshot.version,
              })}
            </p>
            <PublishedFormErrorBoundary
              key={`${snapshot.serviceId}:${snapshot.version}:${boundaryKey}`}
              onReset={() => {
                setBoundaryKey((k) => k + 1)
                loadDefinition(routeServiceId)
              }}
            >
              <FormRenderer
                definition={snapshot.definition}
                mode="citizen"
                locale={locale}
                showLocaleToggle={false}
                formData={formData}
                onChange={(data) => setFormData(data.formData)}
                onSubmit={submissionAdapter ? handleSubmit : undefined}
                services={widgetServices}
                disabled={submitting}
              />
            </PublishedFormErrorBoundary>
            {!submissionAdapter ? (
              <p className="pf-submit-guidance" role="status">
                {t('publishedForm.submissionUnavailable')}
              </p>
            ) : null}
            {submitStatus === 'success' ? (
              <p className="pf-submit-success" role="status" data-testid="pf-submit-success">
                {t('publishedForm.submissionSuccess')}
              </p>
            ) : null}
            {submitStatus === 'failure' ? (
              <p className="pf-alert" role="alert" data-testid="pf-submit-failure">
                {t('publishedForm.submissionFailure')}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
