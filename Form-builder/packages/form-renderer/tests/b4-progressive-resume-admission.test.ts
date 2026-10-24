import { describe, expect, it } from 'vitest'

import {
  admitProgressiveResumeResult,
  resolveResumeContextRevision,
  resolveResumeTargetFromCheckpoint,
  RESUME_CONTEXT_REVISION_MAX_LENGTH,
} from '../src/progressive-resume.js'
import { admitFormDefinition } from '../src/definition-admission.js'
import { createProgressivePublishedDefinition } from './fixtures.js'

function progressiveSteps() {
  const admission = admitFormDefinition(createProgressivePublishedDefinition(), {
    mode: 'citizen',
  })
  if (!admission.ok || admission.plan.kind !== 'progressive') {
    throw new Error('expected progressive plan')
  }
  return admission.plan.steps
}

describe('FB-B4 resume context revision', () => {
  it('trims and accepts nonblank revisions within length cap', () => {
    expect(resolveResumeContextRevision('  rev-1  ')).toEqual({
      ok: true,
      revision: 'rev-1',
    })
    expect(resolveResumeContextRevision('')).toEqual({ ok: false, reason: 'blank' })
    expect(resolveResumeContextRevision('   ')).toEqual({ ok: false, reason: 'blank' })
    expect(resolveResumeContextRevision(undefined)).toEqual({ ok: false, reason: 'missing' })
    expect(resolveResumeContextRevision(12)).toEqual({ ok: false, reason: 'not_string' })
    expect(
      resolveResumeContextRevision('x'.repeat(RESUME_CONTEXT_REVISION_MAX_LENGTH + 1)),
    ).toEqual({ ok: false, reason: 'too_long' })
  })
})

describe('FB-B4 checkpoint and admission', () => {
  const steps = progressiveSteps()

  it('null checkpoint targets step 0', () => {
    const target = resolveResumeTargetFromCheckpoint(null, steps)
    expect(target).toEqual({
      ok: true,
      targetStepIndex: 0,
      targetStepId: 'identity',
      completedThroughIndex: -1,
    })
  })

  it('valid non-final checkpoint resumes at next step', () => {
    const target = resolveResumeTargetFromCheckpoint(
      { completedStepId: 'identity', completedStepIndex: 0 },
      steps,
    )
    expect(target).toMatchObject({
      ok: true,
      targetStepIndex: 1,
      targetStepId: 'household',
    })
  })

  it('rejects mismatched, final, and invalid checkpoints', () => {
    expect(
      resolveResumeTargetFromCheckpoint({ completedStepId: 'wrong', completedStepIndex: 0 }, steps)
        .ok,
    ).toBe(false)
    expect(
      resolveResumeTargetFromCheckpoint(
        { completedStepId: 'household', completedStepIndex: 1 },
        steps,
      ).ok,
    ).toBe(false)
    expect(resolveResumeTargetFromCheckpoint({ completedStepId: 'identity' }, steps).ok).toBe(false)
  })

  it('requires exact echo and detached snapshot', () => {
    const admitted = admitProgressiveResumeResult({
      result: {
        status: 'found',
        serviceId: 'income-certificate-sample',
        formVersion: 1,
        resumeContextRevision: 'rev-1',
        formData: { applicant_name: 'Asha Patel' },
        checkpoint: null,
      },
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-1',
      steps,
    })
    expect(admitted.ok).toBe(true)
    if (admitted.ok && admitted.kind === 'found') {
      expect(admitted.targetStepIndex).toBe(0)
      expect(admitted.formData).toEqual({ applicant_name: 'Asha Patel' })
    }

    expect(
      admitProgressiveResumeResult({
        result: {
          status: 'found',
          serviceId: 'other',
          formVersion: 1,
          resumeContextRevision: 'rev-1',
          formData: {},
          checkpoint: null,
        },
        serviceId: 'income-certificate-sample',
        formVersion: 1,
        resumeContextRevision: 'rev-1',
        steps,
      }).ok,
    ).toBe(false)
  })

  it('rejects invalid claimed completed-step data without full-form validation', () => {
    const rejected = admitProgressiveResumeResult({
      result: {
        status: 'found',
        serviceId: 'income-certificate-sample',
        formVersion: 1,
        resumeContextRevision: 'rev-1',
        // Missing required applicant_name for completed identity step.
        formData: { household_size: 3 },
        checkpoint: { completedStepId: 'identity', completedStepIndex: 0 },
      },
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-1',
      steps,
    })
    expect(rejected).toEqual({ ok: false, reason: 'completed_step_invalid' })

    const partialFutureOk = admitProgressiveResumeResult({
      result: {
        status: 'found',
        serviceId: 'income-certificate-sample',
        formVersion: 1,
        resumeContextRevision: 'rev-1',
        formData: {
          applicant_name: 'Asha Patel',
          // Future-step fields incomplete — must not full-form validate.
        },
        checkpoint: { completedStepId: 'identity', completedStepIndex: 0 },
      },
      serviceId: 'income-certificate-sample',
      formVersion: 1,
      resumeContextRevision: 'rev-1',
      steps,
    })
    expect(partialFutureOk.ok).toBe(true)
    if (partialFutureOk.ok && partialFutureOk.kind === 'found') {
      expect(partialFutureOk.targetStepIndex).toBe(1)
    }
  })

  it('rejects prototype-hostile and malformed results', () => {
    const formData: Record<string, unknown> = {}
    Object.defineProperty(formData, 'applicant_name', {
      get() {
        return 'X'
      },
      enumerable: true,
    })
    expect(
      admitProgressiveResumeResult({
        result: {
          status: 'found',
          serviceId: 'income-certificate-sample',
          formVersion: 1,
          resumeContextRevision: 'rev-1',
          formData,
          checkpoint: null,
        },
        serviceId: 'income-certificate-sample',
        formVersion: 1,
        resumeContextRevision: 'rev-1',
        steps,
      }).ok,
    ).toBe(false)

    expect(
      admitProgressiveResumeResult({
        result: null,
        serviceId: 'income-certificate-sample',
        formVersion: 1,
        resumeContextRevision: 'rev-1',
        steps,
      }).ok,
    ).toBe(false)
  })
})
