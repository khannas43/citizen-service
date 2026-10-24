import type { JsonObject } from '@dg20/form-contract'
import type { RJSFSchema } from '@rjsf/utils'

import {
  createAutosaveSnapshot,
  type AutosaveSnapshotFailureReason,
} from './progressive-autosave.js'
import { pickStepFormData, type ProgressiveStepPlan } from './progressive-steps.js'
import { getDg20FormValidator } from './validator-2020.js'

/**
 * Host-injected progressive resume / saved-progress loading (FB-B4 / B4.1).
 * Renderer owns lifecycle, admission, and UI only —
 * hosts own identity, auth, HTTP, storage, encryption, expiry, and audit.
 */

/** Documented length cap for opaque host resume context revisions. */
export const RESUME_CONTEXT_REVISION_MAX_LENGTH = 256

/** Session-key token when no resume adapter is present. */
export const RESUME_SESSION_TOKEN_NONE = '-' as const

/**
 * Stable non-sensitive session-key token when an adapter is present but the
 * revision is missing/invalid. Never embeds raw over-length revision text.
 */
export const RESUME_SESSION_TOKEN_INVALID = 'invalid' as const

const NOT_FOUND_ENVELOPE_KEYS = [
  'status',
  'serviceId',
  'formVersion',
  'resumeContextRevision',
] as const

const FOUND_ENVELOPE_KEYS = [
  'status',
  'serviceId',
  'formVersion',
  'resumeContextRevision',
  'formData',
  'checkpoint',
] as const

const CHECKPOINT_KEYS = ['completedStepId', 'completedStepIndex'] as const

export interface ProgressiveResumeRequest {
  readonly serviceId: string
  readonly formVersion: number
  /** Host-owned opaque revision — never a citizen ID, token, or credential. */
  readonly resumeContextRevision: string
  readonly signal: AbortSignal
}

/**
 * null → resume at step 0.
 * Non-null identifies the last successfully completed non-final step;
 * the renderer resumes at completedStepIndex + 1.
 */
export type ProgressiveResumeCheckpoint = null | {
  readonly completedStepId: string
  readonly completedStepIndex: number
}

export type ProgressiveResumeResult =
  | {
      readonly status: 'not_found'
      readonly serviceId: string
      readonly formVersion: number
      readonly resumeContextRevision: string
    }
  | {
      readonly status: 'found'
      readonly serviceId: string
      readonly formVersion: number
      readonly resumeContextRevision: string
      readonly formData: JsonObject
      readonly checkpoint: ProgressiveResumeCheckpoint
    }

export interface ProgressiveResumeAdapter {
  loadProgress(request: ProgressiveResumeRequest): Promise<ProgressiveResumeResult>
}

/** Public resume statuses — never includes awaiting_host. */
export type ProgressiveResumeStatus = 'loading' | 'loaded' | 'not_found' | 'failed' | 'discarded'

/**
 * Narrow status callback payload. Never includes formData, resumeContextRevision,
 * adapter errors, stacks, AbortSignal, or credentials.
 */
export interface ProgressiveResumeStatusData {
  readonly status: ProgressiveResumeStatus
  readonly serviceId: string
  readonly formVersion: number
  readonly stepId?: string
  readonly stepIndex?: number
}

export type ResumeContextRevisionResolution =
  | { readonly ok: true; readonly revision: string }
  | { readonly ok: false; readonly reason: 'missing' | 'blank' | 'too_long' | 'not_string' }

/**
 * Trim once; require a finite nonblank string within RESUME_CONTEXT_REVISION_MAX_LENGTH.
 */
export function resolveResumeContextRevision(value: unknown): ResumeContextRevisionResolution {
  if (value === undefined || value === null) {
    return { ok: false, reason: 'missing' }
  }
  if (typeof value !== 'string') {
    return { ok: false, reason: 'not_string' }
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { ok: false, reason: 'blank' }
  }
  if (trimmed.length > RESUME_CONTEXT_REVISION_MAX_LENGTH) {
    return { ok: false, reason: 'too_long' }
  }
  return { ok: true, revision: trimmed }
}

/**
 * Canonical resume session identity fragment for React remount keys.
 * Never embeds raw/over-length revision text.
 */
export function resumeSessionTokenForKey(
  resumeAdapter: ProgressiveResumeAdapter | undefined,
  resumeContextRevision: unknown,
): string {
  if (!resumeAdapter) {
    return RESUME_SESSION_TOKEN_NONE
  }
  const resolved = resolveResumeContextRevision(resumeContextRevision)
  return resolved.ok ? resolved.revision : RESUME_SESSION_TOKEN_INVALID
}

export type ProgressiveResumeAdmissionFailureReason =
  | 'not_object'
  | 'invalid_status'
  | 'echo_mismatch'
  | 'snapshot_failed'
  | 'unexpected_property'
  | 'invalid_checkpoint'
  | 'checkpoint_step_mismatch'
  | 'checkpoint_final_step'
  | 'completed_step_invalid'
  | 'inspection_failed'

export type ProgressiveResumeAdmissionResult =
  | {
      readonly ok: true
      readonly kind: 'not_found'
    }
  | {
      readonly ok: true
      readonly kind: 'found'
      readonly formData: JsonObject
      readonly targetStepIndex: number
      readonly targetStepId: string
    }
  | {
      readonly ok: false
      readonly reason: ProgressiveResumeAdmissionFailureReason
    }

type ResumeTargetResolution =
  | {
      readonly ok: true
      readonly targetStepIndex: number
      readonly targetStepId: string
      /** Inclusive index of last completed step, or -1 when checkpoint is null. */
      readonly completedThroughIndex: number
    }
  | {
      readonly ok: false
      readonly reason:
        | 'invalid_checkpoint'
        | 'checkpoint_step_mismatch'
        | 'checkpoint_final_step'
        | 'unexpected_property'
        | 'snapshot_failed'
        | 'inspection_failed'
    }

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record)
  if (keys.length !== allowed.length) {
    return false
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      return false
    }
  }
  return true
}

function mapSnapshotFailure(
  reason: AutosaveSnapshotFailureReason,
): ProgressiveResumeAdmissionFailureReason {
  if (reason === 'unexpected_property') {
    return 'unexpected_property'
  }
  if (reason === 'inspection_failed') {
    return 'inspection_failed'
  }
  return 'snapshot_failed'
}

/**
 * Resolves resume target from a checkpoint.
 * Non-null checkpoints are inspected only after createAutosaveSnapshot.
 */
export function resolveResumeTargetFromCheckpoint(
  checkpoint: unknown,
  steps: readonly ProgressiveStepPlan[],
): ResumeTargetResolution {
  try {
    if (steps.length === 0) {
      return { ok: false, reason: 'invalid_checkpoint' }
    }

    if (checkpoint === null) {
      return {
        ok: true,
        targetStepIndex: 0,
        targetStepId: steps[0]!.stepId,
        completedThroughIndex: -1,
      }
    }

    const snap = createAutosaveSnapshot(checkpoint)
    if (!snap.ok) {
      if (snap.reason === 'unexpected_property') {
        return { ok: false, reason: 'unexpected_property' }
      }
      if (snap.reason === 'inspection_failed') {
        return { ok: false, reason: 'inspection_failed' }
      }
      return { ok: false, reason: 'snapshot_failed' }
    }
    const detached = snap.snapshot as Record<string, unknown>
    if (!exactKeys(detached, CHECKPOINT_KEYS)) {
      return { ok: false, reason: 'unexpected_property' }
    }

    const completedStepId = detached.completedStepId
    const completedStepIndex = detached.completedStepIndex
    if (typeof completedStepId !== 'string' || completedStepId.trim().length === 0) {
      return { ok: false, reason: 'invalid_checkpoint' }
    }
    if (
      typeof completedStepIndex !== 'number' ||
      !Number.isInteger(completedStepIndex) ||
      completedStepIndex < 0
    ) {
      return { ok: false, reason: 'invalid_checkpoint' }
    }

    // Completed step must be non-final so target = index + 1 exists.
    if (completedStepIndex >= steps.length - 1) {
      return { ok: false, reason: 'checkpoint_final_step' }
    }

    const step = steps[completedStepIndex]
    if (!step || step.stepId !== completedStepId) {
      return { ok: false, reason: 'checkpoint_step_mismatch' }
    }

    const targetStepIndex = completedStepIndex + 1
    const targetStep = steps[targetStepIndex]
    if (!targetStep) {
      return { ok: false, reason: 'checkpoint_final_step' }
    }

    return {
      ok: true,
      targetStepIndex,
      targetStepId: targetStep.stepId,
      completedThroughIndex: completedStepIndex,
    }
  } catch {
    return { ok: false, reason: 'inspection_failed' }
  }
}

function validateCompletedSteps(
  formData: JsonObject,
  steps: readonly ProgressiveStepPlan[],
  completedThroughIndex: number,
): { readonly ok: true } | { readonly ok: false } {
  for (let index = 0; index <= completedThroughIndex; index += 1) {
    const step = steps[index]
    if (!step) {
      return { ok: false }
    }
    const stepData = pickStepFormData(formData as Record<string, unknown>, step.fieldIds)
    const validator = getDg20FormValidator(step.schema)
    const result = validator.validateFormData(stepData, step.schema as RJSFSchema)
    if ((result.errors?.length ?? 0) > 0) {
      return { ok: false }
    }
  }
  return { ok: true }
}

/**
 * Admits an adapter resume result for a progressive plan.
 * The **entire** result envelope is inspected through createAutosaveSnapshot
 * before any property is read (FB-B4.1). Never silently repairs malformed results.
 */
export function admitProgressiveResumeResult(input: {
  readonly result: unknown
  readonly serviceId: string
  readonly formVersion: number
  readonly resumeContextRevision: string
  readonly steps: readonly ProgressiveStepPlan[]
}): ProgressiveResumeAdmissionResult {
  try {
    const { result, serviceId, formVersion, resumeContextRevision, steps } = input

    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      return { ok: false, reason: 'not_object' }
    }

    const envelopeSnap = createAutosaveSnapshot(result)
    if (!envelopeSnap.ok) {
      return { ok: false, reason: mapSnapshotFailure(envelopeSnap.reason) }
    }

    const detached = envelopeSnap.snapshot as Record<string, unknown>
    const status = detached.status
    if (status !== 'found' && status !== 'not_found') {
      return { ok: false, reason: 'invalid_status' }
    }

    if (status === 'not_found') {
      if (!exactKeys(detached, NOT_FOUND_ENVELOPE_KEYS)) {
        return { ok: false, reason: 'unexpected_property' }
      }
    } else if (!exactKeys(detached, FOUND_ENVELOPE_KEYS)) {
      return { ok: false, reason: 'unexpected_property' }
    }

    if (
      detached.serviceId !== serviceId ||
      detached.formVersion !== formVersion ||
      detached.resumeContextRevision !== resumeContextRevision
    ) {
      return { ok: false, reason: 'echo_mismatch' }
    }

    if (status === 'not_found') {
      return { ok: true, kind: 'not_found' }
    }

    const formData = detached.formData
    if (formData === null || typeof formData !== 'object' || Array.isArray(formData)) {
      return { ok: false, reason: 'snapshot_failed' }
    }

    const target = resolveResumeTargetFromCheckpoint(detached.checkpoint, steps)
    if (!target.ok) {
      if (
        target.reason === 'unexpected_property' ||
        target.reason === 'snapshot_failed' ||
        target.reason === 'inspection_failed'
      ) {
        return { ok: false, reason: target.reason }
      }
      return { ok: false, reason: target.reason }
    }

    if (target.completedThroughIndex >= 0) {
      const validation = validateCompletedSteps(
        formData as JsonObject,
        steps,
        target.completedThroughIndex,
      )
      if (!validation.ok) {
        return { ok: false, reason: 'completed_step_invalid' }
      }
    }

    return {
      ok: true,
      kind: 'found',
      formData: formData as JsonObject,
      targetStepIndex: target.targetStepIndex,
      targetStepId: target.targetStepId,
    }
  } catch {
    return { ok: false, reason: 'inspection_failed' }
  }
}
