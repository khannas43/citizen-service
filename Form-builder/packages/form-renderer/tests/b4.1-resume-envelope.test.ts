import { describe, expect, it } from 'vitest'

import {
  admitProgressiveResumeResult,
  resolveResumeTargetFromCheckpoint,
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

const baseEcho = {
  serviceId: 'income-certificate-sample',
  formVersion: 1,
  resumeContextRevision: 'rev-1',
} as const

describe('FB-B4.1 envelope and checkpoint hardening', () => {
  const steps = progressiveSteps()

  it('never invokes outer result accessor getters', () => {
    let touched = false
    const result: Record<string, unknown> = {
      status: 'not_found',
      ...baseEcho,
    }
    Object.defineProperty(result, 'status', {
      enumerable: true,
      get() {
        touched = true
        return 'not_found'
      },
    })
    const admitted = admitProgressiveResumeResult({
      result,
      ...baseEcho,
      steps,
    })
    expect(touched).toBe(false)
    expect(admitted.ok).toBe(false)
  })

  it('never invokes checkpoint accessor getters', () => {
    let touched = false
    const checkpoint: Record<string, unknown> = {
      completedStepId: 'identity',
      completedStepIndex: 0,
    }
    Object.defineProperty(checkpoint, 'completedStepId', {
      enumerable: true,
      get() {
        touched = true
        return 'identity'
      },
    })
    const target = resolveResumeTargetFromCheckpoint(checkpoint, steps)
    expect(touched).toBe(false)
    expect(target.ok).toBe(false)

    const admitted = admitProgressiveResumeResult({
      result: {
        status: 'found',
        ...baseEcho,
        formData: { applicant_name: 'Asha Patel' },
        checkpoint,
      },
      ...baseEcho,
      steps,
    })
    expect(touched).toBe(false)
    expect(admitted.ok).toBe(false)
  })

  it('rejects custom-prototype result and checkpoint', () => {
    const protoResult = Object.assign(Object.create({ hostile: true }), {
      status: 'not_found',
      ...baseEcho,
    })
    expect(
      admitProgressiveResumeResult({
        result: protoResult,
        ...baseEcho,
        steps,
      }).ok,
    ).toBe(false)

    const protoCheckpoint = Object.assign(Object.create({ hostile: true }), {
      completedStepId: 'identity',
      completedStepIndex: 0,
    })
    expect(resolveResumeTargetFromCheckpoint(protoCheckpoint, steps).ok).toBe(false)
  })

  it('rejects result/checkpoint symbol and non-enumerable properties', () => {
    const withSymbol: Record<string | symbol, unknown> = {
      status: 'not_found',
      ...baseEcho,
    }
    Object.defineProperty(withSymbol, Symbol('x'), {
      enumerable: true,
      value: 1,
    })
    const symbolResult = admitProgressiveResumeResult({
      result: withSymbol,
      ...baseEcho,
      steps,
    })
    expect(symbolResult.ok).toBe(false)

    const withHidden: Record<string, unknown> = {
      status: 'not_found',
      ...baseEcho,
    }
    Object.defineProperty(withHidden, 'secret', {
      enumerable: false,
      value: 1,
    })
    expect(
      admitProgressiveResumeResult({
        result: withHidden,
        ...baseEcho,
        steps,
      }),
    ).toEqual({ ok: false, reason: 'unexpected_property' })

    const checkpointHidden: Record<string, unknown> = {
      completedStepId: 'identity',
      completedStepIndex: 0,
    }
    Object.defineProperty(checkpointHidden, 'secret', {
      enumerable: false,
      value: 1,
    })
    expect(resolveResumeTargetFromCheckpoint(checkpointHidden, steps)).toEqual({
      ok: false,
      reason: 'unexpected_property',
    })

    const checkpointSymbol: Record<string | symbol, unknown> = {
      completedStepId: 'identity',
      completedStepIndex: 0,
    }
    Object.defineProperty(checkpointSymbol, Symbol('x'), {
      enumerable: true,
      value: 1,
    })
    expect(resolveResumeTargetFromCheckpoint(checkpointSymbol, steps).ok).toBe(false)
  })

  it('rejects unexpected enumerable envelope and checkpoint keys', () => {
    expect(
      admitProgressiveResumeResult({
        result: {
          status: 'not_found',
          ...baseEcho,
          extra: true,
        },
        ...baseEcho,
        steps,
      }),
    ).toEqual({ ok: false, reason: 'unexpected_property' })

    expect(
      admitProgressiveResumeResult({
        result: {
          status: 'found',
          ...baseEcho,
          formData: { applicant_name: 'Asha Patel' },
          checkpoint: null,
          extra: true,
        },
        ...baseEcho,
        steps,
      }),
    ).toEqual({ ok: false, reason: 'unexpected_property' })

    expect(
      resolveResumeTargetFromCheckpoint(
        {
          completedStepId: 'identity',
          completedStepIndex: 0,
          extra: true,
        },
        steps,
      ),
    ).toEqual({ ok: false, reason: 'unexpected_property' })
  })

  it('hostile Proxy inspection never throws', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('get trap')
        },
        ownKeys() {
          throw new Error('ownKeys trap')
        },
        getOwnPropertyDescriptor() {
          throw new Error('descriptor trap')
        },
        getPrototypeOf() {
          throw new Error('proto trap')
        },
      },
    )
    expect(() =>
      admitProgressiveResumeResult({
        result: hostile,
        ...baseEcho,
        steps,
      }),
    ).not.toThrow()
    expect(
      admitProgressiveResumeResult({
        result: hostile,
        ...baseEcho,
        steps,
      }).ok,
    ).toBe(false)

    expect(() => resolveResumeTargetFromCheckpoint(hostile, steps)).not.toThrow()
    expect(resolveResumeTargetFromCheckpoint(hostile, steps).ok).toBe(false)
  })

  it('preserves valid found and not_found admission', () => {
    const notFound = admitProgressiveResumeResult({
      result: {
        status: 'not_found',
        ...baseEcho,
      },
      ...baseEcho,
      steps,
    })
    expect(notFound).toEqual({ ok: true, kind: 'not_found' })

    const found = admitProgressiveResumeResult({
      result: {
        status: 'found',
        ...baseEcho,
        formData: { applicant_name: 'Asha Patel' },
        checkpoint: { completedStepId: 'identity', completedStepIndex: 0 },
      },
      ...baseEcho,
      steps,
    })
    expect(found.ok).toBe(true)
    if (found.ok && found.kind === 'found') {
      expect(found.targetStepIndex).toBe(1)
      expect(found.formData).toEqual({ applicant_name: 'Asha Patel' })
      expect(Object.getPrototypeOf(found.formData)).toBe(null)
    }
  })
})
